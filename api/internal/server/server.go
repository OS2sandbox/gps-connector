package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"

	"os2/gps-connector/api/internal/config"
	"os2/gps-connector/api/internal/cratedb"
	"os2/gps-connector/api/internal/export"
	"os2/gps-connector/api/internal/iotagent"
	"os2/gps-connector/api/internal/orion"
	"os2/gps-connector/api/internal/pki"
	"os2/gps-connector/api/internal/rabbitmq"
	"os2/gps-connector/api/internal/redis"
)

func Run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	provCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	provider, err := oidc.NewProvider(provCtx, cfg.OIDCIssuerURL)
	if err != nil {
		return fmt.Errorf("oidc provider: %w", err)
	}
	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.OIDCClientID})

	agent := iotagent.New(cfg.IotAgentURL)
	oc := orion.New(cfg.OrionURL)
	rdb := redis.New(cfg.RedisAddr)
	db, err := cratedb.New(cfg.CrateDSN)
	if err != nil {
		return fmt.Errorf("cratedb: %w", err)
	}
	exportStore, err := export.NewStore(cfg.MinioEndpoint, cfg.MinioUser, cfg.MinioPassword, cfg.ArchiveBucket)
	if err != nil {
		return fmt.Errorf("archive store: %w", err)
	}
	root, err := pki.LoadRootCA(cfg.RootCACertPath, cfg.RootCAKeyPath)
	if err != nil {
		return fmt.Errorf("load root CA: %w", err)
	}
	caStore, err := pki.NewTenantCAStore(cfg.K8sNamespace, root)
	if err != nil {
		return fmt.Errorf("tenant ca store: %w", err)
	}
	mq := rabbitmq.New(cfg.RabbitMQMgmtURL, cfg.RabbitMQMgmtUser, cfg.RabbitMQMgmtPass)

	srv := &http.Server{
		Addr:    cfg.Addr,
		Handler: corsMiddleware(cfg.CorsAllowedOrigins, routes(agent, oc, rdb, verifier, db, exportStore, caStore, mq)),
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)

	go func() {
		log.Printf("api listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("server error: %w", err)
	case <-ctx.Done():
		log.Println("shutting down...")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	log.Println("server has been shutdown")
	return nil
}
