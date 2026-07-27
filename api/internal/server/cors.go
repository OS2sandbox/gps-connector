package server

import (
	"net/http"
	"strings"
)

func corsMiddleware(allowedOrigins string, next http.Handler) http.Handler {
	allowed := make(map[string]struct{})
	for _, o := range strings.Split(allowedOrigins, ",") {
		if t := strings.TrimSpace(o); t != "" {
			allowed[t] = struct{}{}
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin")
		if _, ok := allowed[origin]; ok {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
