#!/usr/bin/env bash
# Query time-series data from QuantumLeap
set -euo pipefail

usage() {
  echo "Usage: $0 <municipality> <imei> [limit]"
  echo "Example: $0 naestved 123456789012345 10"
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  usage
fi

MUNICIPALITY="$1"
IMEI="$2"
LIMIT="${3:-10}"
HOST="${QL_HOST:-localhost}"

echo "Querying time-series for entity urn:ngsi-ld:GPSTracker:${IMEI} (tenant: ${MUNICIPALITY}, limit: ${LIMIT})"
echo "---"

curl -sX GET "http://${HOST}:8668/v2/entities/urn:ngsi-ld:GPSTracker:${IMEI}?limit=${LIMIT}" \
  -H "Fiware-Service: ${MUNICIPALITY}" \
  -H 'Fiware-ServicePath: /' | jq .
