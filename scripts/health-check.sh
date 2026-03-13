#!/usr/bin/env bash
# Health check for all GPS Connector services
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_service() {
  local name="$1"
  local cmd="$2"

  if eval "${cmd}" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} ${name}"
    return 0
  else
    echo -e "  ${RED}✗${NC} ${name}"
    return 1
  fi
}

echo "=== GPS Connector Health Check ==="
echo ""

HEALTHY=0
TOTAL=0

services=(
  "Orion-LD|curl -sf http://localhost:1026/version"
  "IoT Agent|curl -sf http://localhost:14041/iot/about"
  "QuantumLeap|curl -sf http://localhost:8668/version"
  "CrateDB|curl -sf http://localhost:4200/"
  "MongoDB|curl -sf http://localhost:27017 || docker compose exec -T mongo mongosh --eval \"db.adminCommand('ping')\" 2>/dev/null"
  "RabbitMQ|curl -sf http://localhost:15673/api/overview -u iot_pipeline:changeme 2>/dev/null"
  "NGINX|timeout 2 bash -c '</dev/tcp/localhost/8883' 2>/dev/null"
  "Redis|timeout 2 bash -c '</dev/tcp/localhost/6379' 2>/dev/null"
)

for entry in "${services[@]}"; do
  IFS='|' read -r name cmd <<< "${entry}"
  TOTAL=$((TOTAL + 1))
  if check_service "${name}" "${cmd}"; then
    HEALTHY=$((HEALTHY + 1))
  fi
done

# Check Bento by looking for running container
TOTAL=$((TOTAL + 1))
if docker compose ps bento 2>/dev/null | grep -q "Up\|running"; then
  echo -e "  ${GREEN}✓${NC} Bento"
  HEALTHY=$((HEALTHY + 1))
else
  echo -e "  ${RED}✗${NC} Bento"
fi

echo ""
echo "Result: ${HEALTHY}/$((TOTAL)) services healthy"

if [[ "${HEALTHY}" -lt "${TOTAL}" ]]; then
  exit 1
fi
