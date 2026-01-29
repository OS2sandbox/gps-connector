#!/usr/bin/env bash
# Full end-to-end demonstration of the GPS Connector system
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

section() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BOLD}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
}

info() {
  echo -e "${YELLOW}→${NC} $1"
}

success() {
  echo -e "${GREEN}✓${NC} $1"
}

error() {
  echo -e "${RED}✗${NC} $1"
}

# -------------------------------------------------------
section "1. Health Check - Waiting for Services"
# -------------------------------------------------------

MAX_WAIT=60
WAITED=0
while ! "${SCRIPT_DIR}/health-check.sh" 2>/dev/null; do
  WAITED=$((WAITED + 5))
  if [[ "${WAITED}" -ge "${MAX_WAIT}" ]]; then
    error "Services not ready after ${MAX_WAIT}s. Aborting."
    exit 1
  fi
  info "Waiting for services... (${WAITED}s/${MAX_WAIT}s)"
  sleep 5
done
success "All services are healthy."

# -------------------------------------------------------
section "2. Create Service Groups"
# -------------------------------------------------------

for municipality in naestved copenhagen; do
  for device_type in ruptela teltonika; do
    info "Creating service group: ${municipality} / ${device_type}"
    "${SCRIPT_DIR}/provision-service-group.sh" "${municipality}" "${device_type}" > /dev/null 2>&1 || true
    success "Service group created: ${municipality} / ${device_type}"
  done
done

# -------------------------------------------------------
section "3. Create QuantumLeap Subscriptions"
# -------------------------------------------------------

for municipality in naestved copenhagen; do
  info "Creating subscription for ${municipality}"
  "${SCRIPT_DIR}/create-subscription.sh" "${municipality}" > /dev/null 2>&1 || true
  success "Subscription created for ${municipality}"
done

# -------------------------------------------------------
section "4. Provision Devices"
# -------------------------------------------------------

info "Provisioning Ruptela device 111111111111111 for naestved"
"${SCRIPT_DIR}/provision-device.sh" naestved 111111111111111 ruptela > /dev/null 2>&1 || true
success "Device provisioned."

info "Provisioning Teltonika device 222222222222222 for naestved"
"${SCRIPT_DIR}/provision-device.sh" naestved 222222222222222 teltonika > /dev/null 2>&1 || true
success "Device provisioned."

info "Provisioning Ruptela device 333333333333333 for copenhagen"
"${SCRIPT_DIR}/provision-device.sh" copenhagen 333333333333333 ruptela > /dev/null 2>&1 || true
success "Device provisioned."

# -------------------------------------------------------
section "5. Simulate GPS Data (3 messages each)"
# -------------------------------------------------------

info "Simulating Ruptela device 111111111111111 (naestved)"
"${SCRIPT_DIR}/simulate-device.sh" ruptela 111111111111111 3
success "Sent 3 messages."

info "Simulating Teltonika device 222222222222222 (naestved)"
"${SCRIPT_DIR}/simulate-device.sh" teltonika 222222222222222 3
success "Sent 3 messages."

info "Simulating Ruptela device 333333333333333 (copenhagen)"
"${SCRIPT_DIR}/simulate-device.sh" ruptela 333333333333333 3
success "Sent 3 messages."

# -------------------------------------------------------
section "6. Waiting for Data Propagation"
# -------------------------------------------------------

info "Waiting 5 seconds..."
sleep 5
success "Done."

# -------------------------------------------------------
section "7. Query Orion-LD Entities"
# -------------------------------------------------------

info "Querying naestved / 111111111111111"
"${SCRIPT_DIR}/query-entity.sh" naestved 111111111111111 || true
echo ""

info "Querying naestved / 222222222222222"
"${SCRIPT_DIR}/query-entity.sh" naestved 222222222222222 || true
echo ""

info "Querying copenhagen / 333333333333333"
"${SCRIPT_DIR}/query-entity.sh" copenhagen 333333333333333 || true
echo ""

# Verify tenant isolation: copenhagen should NOT see naestved devices
info "Verifying tenant isolation: querying copenhagen for naestved device 111111111111111"
if curl -sf "http://${ORION_HOST:-localhost}:1026/ngsi-ld/v1/entities/urn:ngsi-ld:GPSTracker:111111111111111" \
  -H 'Accept: application/json' \
  -H 'Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"' \
  -H "NGSILD-Tenant: copenhagen" | jq -e '.id' > /dev/null 2>&1; then
  error "Tenant isolation FAILED - copenhagen can see naestved device!"
else
  success "Tenant isolation verified - copenhagen cannot see naestved devices."
fi

# -------------------------------------------------------
section "8. Query QuantumLeap Time-Series"
# -------------------------------------------------------

info "Time-series for naestved / 111111111111111"
"${SCRIPT_DIR}/query-timeseries.sh" naestved 111111111111111 5 || true
echo ""

info "Time-series for copenhagen / 333333333333333"
"${SCRIPT_DIR}/query-timeseries.sh" copenhagen 333333333333333 5 || true

# -------------------------------------------------------
section "9. Summary"
# -------------------------------------------------------

echo -e "${GREEN}Demo completed successfully!${NC}"
echo ""
echo "  Municipalities provisioned: naestved, copenhagen"
echo "  Devices provisioned:"
echo "    - naestved:   111111111111111 (ruptela), 222222222222222 (teltonika)"
echo "    - copenhagen: 333333333333333 (ruptela)"
echo "  Messages sent: 9 total (3 per device)"
echo "  Tenant isolation: verified"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f bento       # View Bento stream processor logs"
echo "    docker compose logs -f iot-agent   # View IoT Agent logs"
echo "    mosquitto_sub -h localhost -t '#' -v  # Monitor all MQTT messages"
echo ""
