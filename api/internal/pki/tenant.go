package pki

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

const tenantCertValidity = 5 * 365 * 24 * time.Hour

type TenantCert struct {
	Cert    *x509.Certificate
	Key     *rsa.PrivateKey
	CertPEM []byte
	KeyPEM  []byte
}

func (t *TenantCert) Bundle(root *RootCA) []byte {
	var buf bytes.Buffer
	buf.Write(t.KeyPEM)
	buf.Write(t.CertPEM)
	pem.Encode(&buf, &pem.Block{Type: "CERTIFICATE", Bytes: root.Cert.Raw})
	return buf.Bytes()
}

type TenantCertStore struct {
	client    kubernetes.Interface
	namespace string
	Root      *RootCA
}

func NewTenantCertStore(namespace string, root *RootCA) (*TenantCertStore, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		rules := clientcmd.NewDefaultClientConfigLoadingRules()
		cfg, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			rules, &clientcmd.ConfigOverrides{},
		).ClientConfig()
		if err != nil {
			return nil, fmt.Errorf("k8s config: %w", err)
		}
	}
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("k8s client: %w", err)
	}
	return &TenantCertStore{client: client, namespace: namespace, Root: root}, nil
}

func tenantCertSecretName(cvr string) string {
	return fmt.Sprintf("tenant-cert-%s", cvr)
}

func generateTenantCert(root *RootCA, cvr string) (*TenantCert, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("gen tenant key: %w", err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, fmt.Errorf("gen serial: %w", err)
	}
	now := time.Now().UTC()
	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   cvr,
			Organization: []string{cvr},
		},
		NotBefore:   now,
		NotAfter:    now.Add(tenantCertValidity),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	derBytes, err := x509.CreateCertificate(rand.Reader, template, root.Cert, &key.PublicKey, root.Key)
	if err != nil {
		return nil, fmt.Errorf("sign tenant cert: %w", err)
	}
	cert, err := x509.ParseCertificate(derBytes)
	if err != nil {
		return nil, fmt.Errorf("parse tenant cert: %w", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("marshal tenant key: %w", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	return &TenantCert{Cert: cert, Key: key, CertPEM: certPEM, KeyPEM: keyPEM}, nil
}

func parseTenantCert(certPEM, keyPEM []byte) (*TenantCert, error) {
	certBlock, _ := pem.Decode(certPEM)
	if certBlock == nil {
		return nil, errors.New("tenant cert PEM invalid")
	}
	cert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse tenant cert: %w", err)
	}
	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return nil, errors.New("tenant key PEM invalid")
	}
	key, err := parseRSAPrivateKey(keyBlock)
	if err != nil {
		return nil, fmt.Errorf("parse tenant key: %w", err)
	}
	return &TenantCert{Cert: cert, Key: key, CertPEM: certPEM, KeyPEM: keyPEM}, nil
}

func (s *TenantCertStore) Issue(ctx context.Context, cvr string) (*TenantCert, error) {
	tc, err := generateTenantCert(s.Root, cvr)
	if err != nil {
		return nil, err
	}
	if err := s.save(ctx, cvr, tc); err != nil {
		return nil, err
	}
	return tc, nil
}

func (s *TenantCertStore) GetOrIssue(ctx context.Context, cvr string) (*TenantCert, error) {
	tc, err := s.Get(ctx, cvr)
	if err != nil {
		return nil, err
	}
	if tc != nil {
		return tc, nil
	}
	return s.Issue(ctx, cvr)
}

func (s *TenantCertStore) Get(ctx context.Context, cvr string) (*TenantCert, error) {
	sec, err := s.client.CoreV1().Secrets(s.namespace).Get(ctx, tenantCertSecretName(cvr), metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get tenant cert secret for %s: %w", cvr, err)
	}
	return parseTenantCert(sec.Data["tenant.crt"], sec.Data["tenant.key"])
}

func (s *TenantCertStore) save(ctx context.Context, cvr string, tc *TenantCert) error {
	name := tenantCertSecretName(cvr)
	secrets := s.client.CoreV1().Secrets(s.namespace)
	sec := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: s.namespace,
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"tenant.crt": tc.CertPEM,
			"tenant.key": tc.KeyPEM,
		},
	}
	if _, err := secrets.Update(ctx, sec, metav1.UpdateOptions{}); err != nil {
		if apierrors.IsNotFound(err) {
			if _, err := secrets.Create(ctx, sec, metav1.CreateOptions{}); err != nil {
				return fmt.Errorf("create tenant cert secret for %s: %w", cvr, err)
			}
		} else {
			return fmt.Errorf("update tenant cert secret for %s: %w", cvr, err)
		}
	}
	return nil
}
