#!/usr/bin/env bash
# Simulate GPS device by publishing MQTT messages
set -euo pipefail

usage() {
  echo "Usage: $0 <device_type> <imei> [count]"
  echo "Example: $0 ruptela 123456789012345"
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
TOPIC="${DEVICE_TYPE}/${IMEI}/data"

# Base coordinates: Næstved, Denmark (as integers × 10^7 for Ruptela)
BASE_LAT_INT=556130000   # ~55.613
BASE_LON_INT=117600000   # ~11.760
# As decimal string for Teltonika
BASE_LAT_DEC="55.613"
BASE_LON_DEC="11.760"

publish_ruptela() {
  local lat lon speed dir alt sat
  lat=$((BASE_LAT_INT + RANDOM % 100000))
  lon=$((BASE_LON_INT + RANDOM % 100000))
  speed=$((RANDOM % 120))
  dir=$(( (RANDOM % 36000) ))
  alt=$((30 + RANDOM % 50))
  sat=$((8 + RANDOM % 10))

  mosquitto_pub -h "${MQTT_HOST}" -t "${TOPIC}" -m '{
    "ts": '"$(date +%s)"',
    "trigger": 8,
    "prio": 0,
    "imei": "'"${IMEI}"'",
    "ext": 0,
    "pos": {
      "lat": '"${lat}"',
      "lon": '"${lon}"',
      "alt": '"${alt}"',
      "dir": '"${dir}"',
      "spd": '"${speed}"',
      "sat": '"${sat}"',
      "hdop": 7
    },
    "data": {
      "251": "1",
      "28": "1",
      "173": "1",
      "418": "1",
      "29": "3755",
      "30": "E87",
      "22": "4D6",
      "23": "3",
      "65": "1276",
      "150": "5CFE",
      "1233": "0"
    }
  }'
}

publish_teltonika() {
  local lat lon speed ang alt sat ts_ms
  # Add small random offset to base coordinates (4th-6th decimal places)
  lat="${BASE_LAT_DEC}$(printf '%03d' $((RANDOM % 1000)))"
  lon="${BASE_LON_DEC}$(printf '%03d' $((RANDOM % 1000)))"
  speed=$((RANDOM % 120))
  ang=$((RANDOM % 360))
  alt=$((30 + RANDOM % 50))
  sat=$((8 + RANDOM % 10))
  ts_ms="$(date +%s)000"

  mosquitto_pub -h "${MQTT_HOST}" -t "${TOPIC}" -m '{
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
        "240": 0,
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
    ruptela)
      publish_ruptela
      ;;
    teltonika)
      publish_teltonika
      ;;
    *)
      echo "Error: Unknown device type '${DEVICE_TYPE}'. Supported: ruptela, teltonika"
      exit 1
      ;;
  esac

  if [[ "${i}" -lt "${COUNT}" ]]; then
    sleep 1
  fi
done

echo "Done."
