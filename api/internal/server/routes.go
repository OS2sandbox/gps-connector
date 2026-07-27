package server

import (
	"net/http"

	"github.com/coreos/go-oidc/v3/oidc"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/cratedb"
	"os2/gps-connector/api/internal/device"
	"os2/gps-connector/api/internal/export"
	"os2/gps-connector/api/internal/iotagent"
	"os2/gps-connector/api/internal/mqauth"
	"os2/gps-connector/api/internal/orion"
	"os2/gps-connector/api/internal/pki"
	"os2/gps-connector/api/internal/position"
	"os2/gps-connector/api/internal/redis"
)

func routes(
	agent *iotagent.Agent,
	oc *orion.Client,
	rdb *redis.Client,
	verifier *oidc.IDTokenVerifier,
	db *cratedb.DB,
	exportStore *export.Store,
	certStore *pki.TenantCertStore,
) *http.ServeMux {
	mux := http.NewServeMux()
	authMW := auth.Middleware(verifier)
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.Handle("GET /me", authMW(handleMe()))
	mux.Handle("POST /devices", authMW(device.HandleCreate(agent, oc, rdb)))
	mux.Handle("GET /devices", authMW(device.HandleGet(oc)))
	mux.Handle("PATCH /devices", authMW(device.HandleUpdate(oc, rdb)))
	mux.Handle("DELETE /devices", authMW(device.HandleDelete(agent, oc, rdb)))
	mux.Handle("GET /tenant/cert", authMW(device.HandleGetTenantCertInfo(certStore)))
	mux.Handle("POST /tenant/cert", authMW(device.HandleGetOrCreateTenantCert(certStore)))
	mux.Handle("POST /tenant/cert/rotate", authMW(device.HandleRotateTenantCert(certStore)))
	mux.Handle("GET /positions", authMW(position.HandleGet(db)))
	mux.Handle("POST /archive", authMW(export.HandleCreate(exportStore, rdb)))
	mux.Handle("GET /archive/{id}", authMW(export.HandleGet(rdb)))
	mux.Handle("GET /archive/{id}/download", authMW(export.HandleDownload(exportStore, rdb)))
	return mux
}

// internalRoutes is bound to MQAUTH_ADDR and must not be exposed externally.
func internalRoutes(rdb *redis.Client) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /auth/user", mqauth.HandleUser())
	mux.HandleFunc("POST /auth/vhost", mqauth.HandleVhost())
	mux.HandleFunc("POST /auth/resource", mqauth.HandleResource())
	mux.HandleFunc("POST /auth/topic", mqauth.HandleTopic(rdb))
	return mux
}
