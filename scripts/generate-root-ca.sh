#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-pki/root}"
CA_CN="${CA_CN:-GPS-Connector Root CA}"
CA_DAYS="${CA_DAYS:-3650}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

if [[ -f ca.key && -f ca.crt ]]; then
  echo "Root CA already exists in $(pwd) — reusing."
  openssl x509 -in ca.crt -noout -subject -issuer -dates
  exit 0
fi

openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$CA_DAYS" \
  -subj "/CN=${CA_CN}" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -out ca.crt

chmod 600 ca.key
chmod 644 ca.crt

echo
echo "Root CA created:"
openssl x509 -in ca.crt -noout -subject -issuer -dates
