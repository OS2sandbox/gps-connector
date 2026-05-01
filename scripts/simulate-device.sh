#!/usr/bin/env bash
# Simulate GPS device by publishing MQTT messages
set -euo pipefail

usage() {
  echo "Usage: $0 <device_type> <imei> [count]"
  echo "Example: $0 teltonika 123456789012345"
  echo "         $0 teltonika 987654321098765 10"
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  usage
fi

DEVICE_TYPE="$1"
IMEI="$2"
COUNT="${3:-1}"
MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-8883}"
# If MQTT_BUNDLE is set (e.g. a per-device .pem from /devices/certs/<id>/download),
# it provides cafile, cert and key in one file.
if [[ -n "${MQTT_BUNDLE:-}" ]]; then
  MQTT_CAFILE="${MQTT_BUNDLE}"
  MQTT_CERT="${MQTT_BUNDLE}"
  MQTT_KEY="${MQTT_BUNDLE}"
else
  MQTT_CAFILE="${MQTT_CAFILE:-mosq_certs/ca.crt}"
  MQTT_CERT="${MQTT_CERT:-mosq_certs/client.crt}"
  MQTT_KEY="${MQTT_KEY:-mosq_certs/client.key}"
fi
TOPIC="${DEVICE_TYPE}/${IMEI}/data"

# Base coordinates: As decimal string for Teltonika
BASE_LAT_DEC="55.613"
BASE_LON_DEC="11.760"

publish_teltonika() {
  local lat lon speed ang alt sat ts_ms
  # LAT/LON/SP/ANG/TS_MS env vars override the random values (used by route wrappers).
  lat="${LAT:-${BASE_LAT_DEC}$(printf '%03d' $((RANDOM % 1000)))}"
  lon="${LON:-${BASE_LON_DEC}$(printf '%03d' $((RANDOM % 1000)))}"
  speed="${SP:-$((RANDOM % 120))}"
  ang="${ANG:-$((RANDOM % 360))}"
  alt=$((30 + RANDOM % 50))
  sat=$((8 + RANDOM % 10))
  ts_ms="${TS_MS:-$(date +%s)000}"

 mosquitto_pub -h "${MQTT_HOST}" -p "${MQTT_PORT}" -t "${TOPIC}" \
  ${MQTT_CAFILE:+--cafile "${MQTT_CAFILE}"} \
  ${MQTT_CERT:+--cert "${MQTT_CERT}"} \
  ${MQTT_KEY:+--key "${MQTT_KEY}"} \
  ${MQTT_INSECURE:+--insecure} \
  -k 60 \
  -q 1 \
  -m '{
    "state": {
      "reported": {
        "ts": '"${ts_ms}"',
        "pr": 0,
        "latlng": "'"${lat}"','"${lon}"'",
        "alt": '"${alt}"',
        "ang": '"${ang}"',
        "sat": '"${sat}"',
        "sp": '"${speed}"',
        "evt": 240,
        "239": 1,
        "240": 1,
        "21": 3,
        "200": 0,
        "69": 2,
        "181": 0,
        "182": 0,
        "66": 20597,
        "67": 0,
        "68": 0,
        "241": 23801,
        "16": 563688
      }
    }
  }'
}

echo "Simulating ${DEVICE_TYPE} device ${IMEI} - sending ${COUNT} message(s) to topic ${TOPIC}"

for i in $(seq 1 "${COUNT}"); do
  echo "  Sending message ${i}/${COUNT}..."
  case "${DEVICE_TYPE}" in
    teltonika)
      publish_teltonika
      ;;
    *)
      echo "Error: Unknown device type '${DEVICE_TYPE}'. Supported: teltonika"
      exit 1
      ;;
  esac

  if [[ "${i}" -lt "${COUNT}" ]]; then
    sleep 1
  fi
done

echo "Done."
