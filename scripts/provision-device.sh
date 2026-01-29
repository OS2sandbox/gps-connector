#!/usr/bin/env bash
# Provision a GPS device for a municipality
set -euo pipefail

usage() {
  echo "Usage: $0 <municipality> <imei> <device_type>"
  echo "Example: $0 naestved 123456789012345 ruptela"
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 3 ]]; then
  usage
fi

MUNICIPALITY="$1"
IMEI="$2"
DEVICE_TYPE="$3"
HOST="${IOT_AGENT_HOST:-localhost}"
REDIS_HOST="${REDIS_HOST:-localhost}"
APIKEY="${MUNICIPALITY}-${DEVICE_TYPE}"

echo "Provisioning device: municipality=${MUNICIPALITY}, imei=${IMEI}, device_type=${DEVICE_TYPE}, apikey=${APIKEY}"

# Step 1: Register IMEI → tenant mapping in Redis (used by Bento for routing)
echo "  Registering IMEI in Redis..."
redis-cli -h "${REDIS_HOST}" SET "device:${IMEI}" "${MUNICIPALITY}" > /dev/null
echo "  Redis key device:${IMEI} = ${MUNICIPALITY}"

# Step 2: Provision device in IoT Agent
echo "  Provisioning in IoT Agent..."
curl -iX POST "http://${HOST}:4041/iot/devices" \
  -H 'Content-Type: application/json' \
  -H "Fiware-Service: ${MUNICIPALITY}" \
  -H 'Fiware-ServicePath: /' \
  -d '{
    "devices": [{
      "device_id": "'"${IMEI}"'",
      "entity_name": "urn:ngsi-ld:GPSTracker:'"${IMEI}"'",
      "entity_type": "GPSTracker",
      "apikey": "'"${APIKEY}"'",
      "transport": "MQTT",
      "attributes": [
        { "object_id": "lat", "name": "latitude", "type": "Number" },
        { "object_id": "lon", "name": "longitude", "type": "Number" },
        { "object_id": "spd", "name": "speed", "type": "Number" },
        { "object_id": "alt", "name": "altitude", "type": "Number" },
        { "object_id": "dir", "name": "direction", "type": "Number" },
        { "object_id": "sat", "name": "satellites", "type": "Integer" },
        { "object_id": "ts", "name": "deviceTimestamp", "type": "Integer" }
      ],
      "static_attributes": [
        { "name": "deviceType", "type": "Text", "value": "'"${DEVICE_TYPE}"'" }
      ]
    }]
  }'

echo ""
echo "Device provisioned successfully."
