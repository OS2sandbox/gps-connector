package server

import (
	"net/http"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/respond"
)

// meResponse embeds the raw claims and adds the decoded privilege URNs so
// clients do not have to base64/XML-decode the privileges claim themselves.
type meResponse struct {
	auth.Claims
	PrivilegeURNs []string `json:"privilege_urns"`
}

func handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func handleMe() http.HandlerFunc {
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
		respond.JSON(w, http.StatusOK, meResponse{Claims: c, PrivilegeURNs: privs.URNs})
	}
}
