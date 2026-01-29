#!/usr/bin/env bash
# Delete a device from the IoT Agent
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
HOST="${IOT_AGENT_HOST:-localhost}"
REDIS_HOST="${REDIS_HOST:-localhost}"

echo "Deleting device: municipality=${MUNICIPALITY}, imei=${IMEI}"

# Step 1: Remove IMEI from Redis (Bento will start dropping messages for this device)
echo "  Removing IMEI from Redis..."
redis-cli -h "${REDIS_HOST}" DEL "device:${IMEI}" > /dev/null
echo "  Redis key device:${IMEI} removed"

# Step 2: Delete device from IoT Agent
echo "  Deleting from IoT Agent..."
curl -iX DELETE "http://${HOST}:4041/iot/devices/${IMEI}" \
  -H "Fiware-Service: ${MUNICIPALITY}" \
  -H 'Fiware-ServicePath: /'

echo ""
echo "Device deleted."
