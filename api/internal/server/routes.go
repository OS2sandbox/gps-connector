package server

import (
	"net/http"

	"github.com/coreos/go-oidc/v3/oidc"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/cratedb"
	"os2/gps-connector/api/internal/device"
	"os2/gps-connector/api/internal/export"
	"os2/gps-connector/api/internal/iotagent"
	"os2/gps-connector/api/internal/orion"
	"os2/gps-connector/api/internal/pki"
	"os2/gps-connector/api/internal/position"
	"os2/gps-connector/api/internal/rabbitmq"
	"os2/gps-connector/api/internal/redis"
)

func routes(
	agent *iotagent.Agent,
	oc *orion.Client,
	rdb *redis.Client,
	verifier *oidc.IDTokenVerifier,
	db *cratedb.DB,
	exportStore *export.Store,
	caStore *pki.TenantCAStore,
	mq *rabbitmq.Client,
) *http.ServeMux {
	mux := http.NewServeMux()
	authMW := auth.Middleware(verifier)
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.Handle("GET /me", authMW(handleMe()))
	mux.Handle("POST /devices", authMW(device.HandleCreate(agent, oc, rdb, caStore, mq)))
	mux.Handle("GET /devices", authMW(device.HandleGet(oc)))
	mux.Handle("PATCH /devices", authMW(device.HandleUpdate(oc, rdb)))
	mux.Handle("DELETE /devices", authMW(device.HandleDelete(agent, oc, rdb, mq)))
	mux.Handle("POST /devices/certs/regenerate", authMW(device.HandleRegenerateCerts(rdb, caStore)))
	mux.Handle("GET /tenant/cert", authMW(device.HandleGetTenantCAInfo(caStore)))
	mux.Handle("POST /tenant/cert/regenerate", authMW(device.HandleRegenerateTenantCA(oc, rdb, caStore)))
	mux.Handle("GET /devices/certs/{batch_id}/download", authMW(device.HandleDownloadCertBatch(rdb)))
	mux.Handle("GET /positions", authMW(position.HandleGet(db)))
	mux.Handle("POST /archive", authMW(export.HandleCreate(exportStore, rdb)))
	mux.Handle("GET /archive/{id}", authMW(export.HandleGet(rdb)))
	mux.Handle("GET /archive/{id}/download", authMW(export.HandleDownload(exportStore, rdb)))
	return mux
}
