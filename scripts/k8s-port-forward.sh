#!/bin/bash

echo "=== Starting port-forwards ==="
echo "Orion-LD:            http://localhost:1026"
echo "IoT Agent:           http://localhost:14041 (north) / http://localhost:4041 (delete)"
echo "QuantumLeap:         http://localhost:8668"
echo "CrateDB UI:          http://localhost:4200"
echo "RabbitMQ Management: http://localhost:15673"
echo "Redis:               localhost:6379"
echo "MQTT TLS:            localhost:8883 (via k3d loadbalancer)"
echo ""
kubectl port-forward svc/orion-ld 1026:1026 > /dev/null 2>&1 &
kubectl port-forward svc/iot-agent 14041:4041 4041:4041 > /dev/null 2>&1 &
kubectl port-forward svc/quantumleap 8668:8668 > /dev/null 2>&1 &
kubectl port-forward svc/cratedb 4200:4200 > /dev/null 2>&1 &
kubectl port-forward svc/rabbitmq 15673:15672 > /dev/null 2>&1 &
kubectl port-forward svc/redis 6379:6379 > /dev/null 2>&1 &

echo "=== All port-forwards running in background ==="
echo "To stop: pkill -f 'kubectl port-forward'"
