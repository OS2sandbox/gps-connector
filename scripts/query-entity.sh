#!/usr/bin/env bash
# Query an entity from Orion-LD
set -euo pipefail

usage() {
  echo "Usage: $0 <municipality> <imei>"
  echo "Example: $0 naestved 123456789012345"
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  usage
fi

MUNICIPALITY="$1"
IMEI="$2"
HOST="${ORION_HOST:-localhost}"

echo "Querying entity urn:ngsi-ld:GPSTracker:${IMEI} for tenant ${MUNICIPALITY}"
echo "---"

curl -sX GET "http://${HOST}:1026/ngsi-ld/v1/entities/urn:ngsi-ld:GPSTracker:${IMEI}" \
  -H 'Accept: application/json' \
  -H 'Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"' \
  -H "NGSILD-Tenant: ${MUNICIPALITY}" | jq .
