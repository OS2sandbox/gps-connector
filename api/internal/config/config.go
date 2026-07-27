package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Addr               string
	MQAuthAddr         string
	IotAgentURL        string
	OrionURL           string
	RedisAddr          string
	OIDCIssuerURL      string
	OIDCClientID       string
	CrateDSN           string
	MinioEndpoint      string
	MinioUser          string
	MinioPassword      string
	ArchiveBucket      string
	RootCACertPath     string
	RootCAKeyPath      string
	K8sNamespace       string
	CorsAllowedOrigins string
}

func Load() (Config, error) {
	var missing []string
	cfg := Config{
		Addr:               requireEnv("API_ADDR", &missing),
		MQAuthAddr:         requireEnv("MQAUTH_ADDR", &missing),
		IotAgentURL:        requireEnv("IOT_AGENT_URL", &missing),
		OrionURL:           requireEnv("ORION_URL", &missing),
		RedisAddr:          requireEnv("REDIS_ADDR", &missing),
		OIDCIssuerURL:      requireEnv("OIDC_ISSUER_URL", &missing),
		OIDCClientID:       requireEnv("OIDC_CLIENT_ID", &missing),
		CrateDSN:           requireEnv("CRATE_DSN", &missing),
		MinioEndpoint:      requireEnv("MINIO_ENDPOINT", &missing),
		MinioUser:          requireEnv("MINIO_ROOT_USER", &missing),
		MinioPassword:      requireEnv("MINIO_ROOT_PASSWORD", &missing),
		ArchiveBucket:      requireEnv("ARCHIVE_BUCKET", &missing),
		RootCACertPath:     requireEnv("ROOT_CA_CERT_PATH", &missing),
		RootCAKeyPath:      requireEnv("ROOT_CA_KEY_PATH", &missing),
		K8sNamespace:       requireEnv("K8S_NAMESPACE", &missing),
		CorsAllowedOrigins: requireEnv("CORS_ALLOWED_ORIGINS", &missing),
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required env vars: %s", strings.Join(missing, ", "))
	}
	return cfg, nil
}

func requireEnv(key string, missing *[]string) string {
	v := os.Getenv(key)
	if v == "" {
		*missing = append(*missing, key)
	}
	return v
}
