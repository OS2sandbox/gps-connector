#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-localhost}"
OUT_DIR="${2:-pki/broker}"
LEAF_DAYS="${LEAF_DAYS:-825}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f pki/root/ca.crt || ! -f pki/root/ca.key ]]; then
  echo "Root CA missing. Run ./scripts/generate-root-ca.sh first."
  exit 1
fi

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

if [[ -f server.key && -f server.crt ]]; then
  echo "Broker cert already exists in $(pwd) — reusing."
  openssl x509 -in server.crt -noout -subject -issuer -dates
  exit 0
fi

openssl genrsa -out server.key 2048
openssl req -new -key server.key -subj "/CN=${HOST}" -out server.csr

cat > server_ext.cnf <<EOF
subjectAltName=DNS:${HOST}
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF

openssl x509 -req -in server.csr \
  -CA "$REPO_ROOT/pki/root/ca.crt" \
  -CAkey "$REPO_ROOT/pki/root/ca.key" \
  -CAcreateserial \
  -out server.crt -days "$LEAF_DAYS" -sha256 -extfile server_ext.cnf

rm -f server.csr server_ext.cnf

chmod 600 server.key
chmod 644 server.crt

echo
echo "Broker cert created:"
openssl x509 -in server.crt -noout -subject -issuer -dates
echo "  Verify against root:"
openssl verify -CAfile "$REPO_ROOT/pki/root/ca.crt" server.crt
