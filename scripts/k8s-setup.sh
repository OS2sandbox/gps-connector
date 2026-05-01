#!/bin/bash
set -e

echo "=== Tearing down old cluster ==="
k3d cluster delete gps-connector-local 2>/dev/null || true

echo "=== Creating new k3d cluster ==="
k3d cluster create gps-connector-local -p "8883:8883@loadbalancer"

echo "=== Updating kubeconfig ==="
k3d kubeconfig merge gps-connector-local --kubeconfig-merge-default --kubeconfig-switch-context

echo "=== Waiting for cluster to be ready ==="
kubectl wait --for=condition=Ready node --all --timeout=60s

echo "=== Building local images ==="
docker build -t gps-archiver:latest k8s/archiver/
k3d image import gps-archiver:latest -c gps-connector-local

docker build -t gps-api:latest api/
k3d image import gps-api:latest -c gps-connector-local

echo "=== Ensuring root CA exists ==="
./scripts/generate-root-ca.sh

echo "=== Ensuring broker cert exists ==="
./scripts/generate-broker-cert.sh

echo "=== Loading root CA into cluster ==="
kubectl create secret generic gps-connector-root-ca \
  --from-file=ca.crt=pki/root/ca.crt \
  --from-file=ca.key=pki/root/ca.key \
  --dry-run=client -o yaml | kubectl apply -f -

echo "=== Loading broker TLS into cluster ==="
kubectl create secret generic rabbitmq-tls \
  --from-file=ca.crt=pki/root/ca.crt \
  --from-file=server.crt=pki/broker/server.crt \
  --from-file=server.key=pki/broker/server.key \
  --dry-run=client -o yaml | kubectl apply -f -

echo "=== Deploying stack ==="
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/bento/ -f k8s/cratedb/ -f k8s/iot-agent/ -f k8s/mongodb/ -f k8s/orion-ld/ -f k8s/quantumleap/ -f k8s/rabbitmq/ -f k8s/redis/ -f k8s/traefik/ -f k8s/loki/ -f k8s/alloy/ -f k8s/grafana/ -f k8s/minio/ -f k8s/archiver/ -f k8s/api/

echo "=== Waiting for pods ==="
kubectl get pods -w &
WATCH_PID=$!
kubectl wait --for=condition=Ready pod --all --timeout=300s
kill $WATCH_PID 2>/dev/null || true

echo ""
echo "=== All pods ready ==="
kubectl get pods
