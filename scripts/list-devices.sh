#!/usr/bin/env bash
# List all devices for a municipality
set -euo pipefail

usage() {
  echo "Usage: $0 <municipality>"
  echo "Example: $0 naestved"
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  usage
fi

MUNICIPALITY="$1"
HOST="${IOT_AGENT_HOST:-localhost}"

echo "Listing devices for municipality: ${MUNICIPALITY}"
echo "---"

curl -sX GET "http://${HOST}:14041/iot/devices" \
  -H "Fiware-Service: ${MUNICIPALITY}" \
  -H 'Fiware-ServicePath: /' | jq .
