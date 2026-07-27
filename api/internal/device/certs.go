package device

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/orion"
	"os2/gps-connector/api/internal/pki"
	"os2/gps-connector/api/internal/redis"
	"os2/gps-connector/api/internal/respond"
)

func HandleRegenerateTenantCA(oc *orion.Client, rdb *redis.Client, caStore *pki.TenantCAStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:write") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		tenant := c.CVR

		ca, err := caStore.Regenerate(r.Context(), tenant)
		if err != nil {
			log.Printf("regenerate tenant CA for %s: %v", tenant, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		devices, err := oc.QueryDevices(tenant)
		if err != nil {
			log.Printf("query devices for %s: %v", tenant, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		results := make([]Result, 0, len(devices))
		bundles := make(map[string]string)
		for _, d := range devices {
			bundle, err := pki.GenerateDeviceCert(ca, caStore.Root, d.IMEI)
			if err != nil {
				log.Printf("gen device cert for %s: %v", d.IMEI, err)
				results = append(results, Result{
					IMEI: d.IMEI, Status: "error",
					Error: "cert generation failed",
				})
				continue
			}
			bundles[d.IMEI] = string(bundle)
			results = append(results, Result{IMEI: d.IMEI, Status: "regenerated"})
		}

		var info *pki.CertDownloadInfo
		if len(bundles) > 0 {
			info, err = pki.StoreCertBatch(r.Context(), rdb, tenant, bundles)
			if err != nil {
				log.Printf("store cert batch: %v", err)
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
		}

		until := time.Until(ca.Cert.NotAfter)
		respond.JSON(w, http.StatusOK, regenerateTenantCAResponse{
			CA: tenantCAInfo{
				Subject:         ca.Cert.Subject.String(),
				Issuer:          ca.Cert.Issuer.String(),
				Serial:          fmt.Sprintf("%x", ca.Cert.SerialNumber),
				NotBefore:       ca.Cert.NotBefore,
				NotAfter:        ca.Cert.NotAfter,
				DaysUntilExpiry: int(until.Hours() / 24),
				NeedsRotation:   until < 30*24*time.Hour,
			},
			Results:      results,
			CertDownload: info,
		})
	}
}

func HandleGetTenantCAInfo(caStore *pki.TenantCAStore) http.HandlerFunc {
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

		ca, err := caStore.Get(r.Context(), c.CVR)
		if err != nil {
			log.Printf("get tenant CA for %s: %v", c.CVR, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if ca == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		until := time.Until(ca.Cert.NotAfter)
		respond.JSON(w, http.StatusOK, tenantCAInfo{
			Subject:         ca.Cert.Subject.String(),
			Issuer:          ca.Cert.Issuer.String(),
			Serial:          fmt.Sprintf("%x", ca.Cert.SerialNumber),
			NotBefore:       ca.Cert.NotBefore,
			NotAfter:        ca.Cert.NotAfter,
			DaysUntilExpiry: int(until.Hours() / 24),
			NeedsRotation:   until < 30*24*time.Hour,
		})
	}
}

func HandleRegenerateCerts(rdb *redis.Client, caStore *pki.TenantCAStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:write") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		tenant := c.CVR

		var req regenerateCertsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if len(req.IMEIs) == 0 {
			http.Error(w, "imeis array is empty", http.StatusBadRequest)
			return
		}
		seen := make(map[string]struct{})
		for i, imei := range req.IMEIs {
			if len(imei) != 15 {
				http.Error(w, fmt.Sprintf("imeis[%d]: imei must be 15 digits", i), http.StatusBadRequest)
				return
			}
			if _, dup := seen[imei]; dup {
				http.Error(w, fmt.Sprintf("imeis[%d]: duplicate imei %s", i, imei), http.StatusBadRequest)
				return
			}
			seen[imei] = struct{}{}
		}

		ca, err := caStore.GetOrCreate(r.Context(), tenant)
		if err != nil {
			log.Printf("ensure tenant CA for %s: %v", tenant, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		results := make([]Result, 0, len(req.IMEIs))
		bundles := make(map[string]string)

		for _, imei := range req.IMEIs {
			existingTenant, exists, err := getDeviceTenant(r.Context(), rdb, imei)
			if err != nil {
				results = append(results, Result{
					IMEI: imei, Status: "error",
					Error: "redis error: " + err.Error(),
				})
				continue
			}
			if !exists || existingTenant != tenant {
				if exists {
					log.Printf("tenant %s tried to regenerate cert for imei %s belonging to another tenant", tenant, imei)
				}
				results = append(results, Result{IMEI: imei, Status: "not_found"})
				continue
			}
			bundle, err := pki.GenerateDeviceCert(ca, caStore.Root, imei)
			if err != nil {
				log.Printf("gen device cert for %s: %v", imei, err)
				results = append(results, Result{
					IMEI: imei, Status: "error",
					Error: "cert generation failed",
				})
				continue
			}
			bundles[imei] = string(bundle)
			results = append(results, Result{IMEI: imei, Status: "regenerated"})
		}

		var info *pki.CertDownloadInfo
		if len(bundles) > 0 {
			info, err = pki.StoreCertBatch(r.Context(), rdb, tenant, bundles)
			if err != nil {
				log.Printf("store cert batch: %v", err)
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
		}

		status := http.StatusOK
		for _, res := range results {
			if res.Status != "regenerated" {
				status = http.StatusMultiStatus
				break
			}
		}
		respond.JSON(w, status, regenerateCertsResponse{
			Results:      results,
			CertDownload: info,
		})
	}
}

func HandleDownloadCertBatch(rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:write") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		batchID := r.PathValue("batch_id")
		if batchID == "" {
			http.Error(w, "missing batch id", http.StatusBadRequest)
			return
		}
		batch, err := pki.GetCertBatch(r.Context(), rdb, c.CVR, batchID)
		if err != nil {
			log.Printf("get cert batch %s: %v", batchID, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if batch == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		filename := fmt.Sprintf("device-certs-%s-%s.zip", batch.Tenant, batch.CreatedAt.Format("2006-01-02"))
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
		if err := pki.WriteCertBatchZip(w, batch); err != nil {
			log.Printf("write cert batch zip %s: %v", batchID, err)
		}
	}
}
