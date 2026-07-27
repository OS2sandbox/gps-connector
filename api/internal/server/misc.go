package server

import (
	"net/http"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/respond"
)

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
		respond.JSON(w, http.StatusOK, c)
	}
}
