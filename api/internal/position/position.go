package position

import (
	"log"
	"net/http"
	"regexp"
	"time"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/cratedb"
)

var cvrPattern = regexp.MustCompile(`^\d{8}$`)

func HandleGet(db *cratedb.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || (!privs.Has("urn:dk:kombit:gps-connector:read") &&
			!privs.Has("urn:dk:kombit:gps-connector:ExternalApplication")) {
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
		committed, err := db.StreamPositions(r.Context(), w, c.CVR, from, to, deviceID)
		if err != nil {
			log.Printf("stream positions: %v", err)
			if !committed {
				http.Error(w, "internal error", http.StatusInternalServerError)
			}
			return
		}
	}
}
