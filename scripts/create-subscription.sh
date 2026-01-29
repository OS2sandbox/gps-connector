#!/usr/bin/env bash
# Create an Orion-LD subscription to forward GPSTracker data to QuantumLeap
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
HOST="${ORION_HOST:-localhost}"

echo "Creating QuantumLeap subscription for municipality: ${MUNICIPALITY}"

curl -iX POST "http://${HOST}:1026/ngsi-ld/v1/subscriptions" \
  -H 'Content-Type: application/ld+json' \
  -H "NGSILD-Tenant: ${MUNICIPALITY}" \
  -d '{
    "id": "urn:ngsi-ld:Subscription:GPSTracker:'"${MUNICIPALITY}"'",
    "type": "Subscription",
    "entities": [
      { "type": "GPSTracker" }
    ],
    "watchedAttributes": [
      "latitude", "longitude", "speed", "altitude", "direction", "satellites", "deviceTimestamp"
    ],
    "notification": {
      "format": "normalized",
      "attributes": [
        "latitude", "longitude", "speed", "altitude", "direction", "satellites", "deviceTimestamp"
      ],
      "endpoint": {
        "uri": "http://quantumleap:8668/v2/notify",
        "accept": "application/json",
        "receiverInfo": [
          { "key": "Fiware-Service", "value": "'"${MUNICIPALITY}"'" }
        ]
      }
    },
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  }'

echo ""
echo "Subscription created."
