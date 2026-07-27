package export

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"time"

	"github.com/minio/minio-go/v7"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/redis"
	"os2/gps-connector/api/internal/respond"
)

var cvrPattern = regexp.MustCompile(`^\d{8}$`)

func HandleCreate(store *Store, rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:read") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		if !cvrPattern.MatchString(c.CVR) {
			http.Error(w, "invalid tenant", http.StatusInternalServerError)
			return
		}
		q := r.URL.Query()
		fromStr := q.Get("from")
		if fromStr == "" {
			http.Error(w, "from is required", http.StatusBadRequest)
			return
		}
		from, err := time.Parse(time.RFC3339, fromStr)
		if err != nil {
			http.Error(w, "from must be RFC3339", http.StatusBadRequest)
			return
		}
		to := time.Now().UTC()
		if toStr := q.Get("to"); toStr != "" {
			to, err = time.Parse(time.RFC3339, toStr)
			if err != nil {
				http.Error(w, "to must be RFC3339", http.StatusBadRequest)
				return
			}
		}
		if !to.After(from) {
			http.Error(w, "to must be after from", http.StatusBadRequest)
			return
		}
		deviceID := q.Get("device_id")

		jobID, err := generateJobID()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		now := time.Now().UTC()
		j := job{
			ID:        jobID,
			Tenant:    c.CVR,
			Status:    "pending",
			CreatedAt: now,
			ExpiresAt: now.Add(jobTTL),
			From:      from,
			To:        to,
			DeviceID:  deviceID,
		}
		if err := saveJob(r.Context(), rdb, &j); err != nil {
			log.Printf("create export %s: save: %v", jobID, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		go runJob(store, rdb, j)

		respond.JSON(w, http.StatusAccepted, map[string]any{
			"job_id":     j.ID,
			"status":     j.Status,
			"status_url": "/archive/" + j.ID,
			"expires_at": j.ExpiresAt,
		})
	}
}

func HandleGet(rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:read") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		if !cvrPattern.MatchString(c.CVR) {
			http.Error(w, "invalid tenant", http.StatusInternalServerError)
			return
		}
		jobID := r.PathValue("id")
		if jobID == "" {
			http.Error(w, "missing job id", http.StatusBadRequest)
			return
		}
		j, err := getJob(r.Context(), rdb, c.CVR, jobID)
		if err != nil {
			log.Printf("get export %s: %v", jobID, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if j == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		resp := map[string]any{
			"job_id":     j.ID,
			"status":     j.Status,
			"created_at": j.CreatedAt,
			"expires_at": j.ExpiresAt,
			"from":       j.From,
			"to":         j.To,
		}
		if j.DeviceID != "" {
			resp["device_id"] = j.DeviceID
		}
		if j.Error != "" {
			resp["error"] = j.Error
		}
		if j.Status == "ready" {
			resp["download_url"] = "/archive/" + j.ID + "/download"
			resp["row_count"] = j.RowCount
		}
		respond.JSON(w, http.StatusOK, resp)
	}
}

func HandleDownload(store *Store, rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:read") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		if !cvrPattern.MatchString(c.CVR) {
			http.Error(w, "invalid tenant", http.StatusInternalServerError)
			return
		}
		jobID := r.PathValue("id")
		if jobID == "" {
			http.Error(w, "missing job id", http.StatusBadRequest)
			return
		}
		j, err := getJob(r.Context(), rdb, c.CVR, jobID)
		if err != nil {
			log.Printf("download export %s: %v", jobID, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if j == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if j.Status != "ready" {
			http.Error(w, "export not ready", http.StatusConflict)
			return
		}

		obj, err := store.client.GetObject(r.Context(), store.bucket, j.ResultKey, minio.GetObjectOptions{})
		if err != nil {
			log.Printf("get object %s: %v", j.ResultKey, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		defer obj.Close()

		stat, err := obj.Stat()
		if err != nil {
			log.Printf("stat object %s: %v", j.ResultKey, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		filename := fmt.Sprintf("archive-%s-%s.csv", j.Tenant, j.From.Format("2006-01-02"))
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		w.Header().Set("Content-Length", fmt.Sprintf("%d", stat.Size))

		if _, err := io.Copy(w, obj); err != nil {
			log.Printf("download stream %s: %v", j.ResultKey, err)
		}
	}
}
