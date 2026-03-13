#!/usr/bin/env bash
# Provision a service group for a municipality and device type
set -euo pipefail

usage() {
  echo "Usage: $0 <municipality> <device_type>"
  echo "Example: $0 naestved teltonika"
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  usage
fi

MUNICIPALITY="$1"
DEVICE_TYPE="$2"
HOST="${IOT_AGENT_HOST:-localhost}"

APIKEY="${MUNICIPALITY}-${DEVICE_TYPE}"

echo "Creating service group: municipality=${MUNICIPALITY}, device_type=${DEVICE_TYPE}, apikey=${APIKEY}"

curl -iX POST "http://${HOST}:14041/iot/services" \
  -H 'Content-Type: application/json' \
  -H "Fiware-Service: ${MUNICIPALITY}" \
  -H 'Fiware-ServicePath: /' \
  -d '{
    "services": [{
      "apikey": "'"${APIKEY}"'",
      "cbroker": "http://orion:1026",
      "resource": "/iot/json",
      "entity_type": "GPSTracker"
    }]
  }'

echo ""
echo "Service group created successfully."
