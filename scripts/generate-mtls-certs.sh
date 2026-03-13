#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./generate-mtls-certs.sh localhost [client_cn] [out_dir]
#   ./generate-mtls-certs.sh 4.tcp.eu.ngrok.io [client_cn] [out_dir]
#
# Examples:
#   ./generate-mtls-certs.sh localhost
#   ./generate-mtls-certs.sh 4.tcp.eu.ngrok.io FMC003-test mosq_certs

MQTT_HOST="${1:-}"
CLIENT_CN="${2:-FMC003-test}"
OUT_DIR="${3:-mosq_certs}"

CA_CN="${CA_CN:-Droids-Test-RootCA}"
CA_DAYS="${CA_DAYS:-3650}"
LEAF_DAYS="${LEAF_DAYS:-825}"

if [[ -z "$MQTT_HOST" ]]; then
  echo "Missing host."
  echo "Usage: $0 <host> [client_cn] [out_dir]"
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl not found in PATH. Install OpenSSL (or run in WSL/Ubuntu) and try again."
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

echo "Writing certs to: $(pwd)"
echo "host:       $MQTT_HOST"
echo "client CN:  $CLIENT_CN"
echo

# Clean previous generated files (so each run is fresh)
rm -f \
  ca.key ca.crt ca.srl \
  server.key server.csr server.crt server_ext.cnf \
  client.key client.csr client.crt client_ext.cnf \
  root.pem \
  certificate.pem.crt private.pem.key \
  client.pem.crt client.pem.key

# 1) New CA (root / "parent")
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$CA_DAYS" \
  -subj "/CN=${CA_CN}" -out ca.crt

# 2) New server cert for RabbitMQ (SAN matches ONLY the host)
openssl genrsa -out server.key 2048
openssl req -new -key server.key -subj "/CN=${MQTT_HOST}" -out server.csr

cat > server_ext.cnf <<EOF
subjectAltName=DNS:${MQTT_HOST}
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days "$LEAF_DAYS" -sha256 -extfile server_ext.cnf

# 3) New client cert for FMC003
openssl genrsa -out client.key 2048
openssl req -new -key client.key -subj "/CN=${CLIENT_CN}" -out client.csr

cat > client_ext.cnf <<EOF
extendedKeyUsage=clientAuth
keyUsage=digitalSignature
EOF

openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days "$LEAF_DAYS" -sha256 -extfile client_ext.cnf

# 4) Teltonika root file
cp ca.crt root.pem
cp client.crt client.pem.crt
cp client.key client.pem.key
cp client.crt certificate.pem.crt
cp client.key private.pem.key

echo
echo "Verification:"
echo "  Server SAN:"
openssl x509 -in server.crt -noout -text | awk '
  /Subject Alternative Name/ {getline; gsub(/^[[:space:]]+/, "", $0); print "    " $0; exit}
'
echo "  CA -> server verify:"
openssl verify -CAfile ca.crt server.crt

echo
echo "Files created:"
ls -1