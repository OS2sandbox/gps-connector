package device

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/pki"
	"os2/gps-connector/api/internal/respond"
)

func HandleGetOrCreateTenantCert(certStore *pki.TenantCertStore) http.HandlerFunc {
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

		tc, err := certStore.GetOrIssue(r.Context(), tenant)
		if err != nil {
			log.Printf("get-or-issue tenant cert for %s: %v", tenant, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeBundle(w, tc, certStore.Root, tenant)
	}
}

func HandleRotateTenantCert(certStore *pki.TenantCertStore) http.HandlerFunc {
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

		tc, err := certStore.Issue(r.Context(), tenant)
		if err != nil {
			log.Printf("rotate tenant cert for %s: %v", tenant, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeBundle(w, tc, certStore.Root, tenant)
	}
}

func HandleGetTenantCertInfo(certStore *pki.TenantCertStore) http.HandlerFunc {
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

		tc, err := certStore.Get(r.Context(), c.CVR)
		if err != nil {
			log.Printf("get tenant cert for %s: %v", c.CVR, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if tc == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		until := time.Until(tc.Cert.NotAfter)
		respond.JSON(w, http.StatusOK, tenantCertInfo{
			Subject:         tc.Cert.Subject.String(),
			Issuer:          tc.Cert.Issuer.String(),
			Serial:          fmt.Sprintf("%x", tc.Cert.SerialNumber),
			NotBefore:       tc.Cert.NotBefore,
			NotAfter:        tc.Cert.NotAfter,
			DaysUntilExpiry: int(until.Hours() / 24),
			NeedsRotation:   until < 30*24*time.Hour,
		})
	}
}

func writeBundle(w http.ResponseWriter, tc *pki.TenantCert, root *pki.RootCA, tenant string) {
	bundle := tc.Bundle(root)
	filename := fmt.Sprintf("tenant-%s.pem", tenant)
	w.Header().Set("Content-Type", "application/x-pem-file")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
	w.WriteHeader(http.StatusOK)
	w.Write(bundle)
}
