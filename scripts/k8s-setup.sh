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

echo "=== Deploying stack ==="
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/bento/ -f k8s/cratedb/ -f k8s/iot-agent/ -f k8s/mongodb/ -f k8s/orion-ld/ -f k8s/quantumleap/ -f k8s/rabbitmq/ -f k8s/redis/ -f k8s/traefik/ -f k8s/loki/ -f k8s/alloy/ -f k8s/grafana/ -f k8s/minio/ -f k8s/archiver/

echo "=== Waiting for pods ==="
kubectl get pods -w &
WATCH_PID=$!
kubectl wait --for=condition=Ready pod --all --timeout=300s
kill $WATCH_PID 2>/dev/null || true

echo ""
echo "=== All pods ready ==="
kubectl get pods
