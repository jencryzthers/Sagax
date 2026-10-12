#!/bin/sh
# Opt-in kind integration for the Kubernetes sandbox backend.
# Creates only a local cluster named sagax-sandbox-kind, then deletes it.
# Does not create cloud resources. kind's local-path StorageClass is not
# encryption, the image is not signed or scanned, and kindnet does not prove
# that NetworkPolicy is enforced.
set -eu
name=sagax-sandbox-kind
if ! command -v docker >/dev/null 2>&1 || ! command -v kind >/dev/null 2>&1; then
  echo "docker and kind are required; integration not run" >&2
  exit 0
fi
echo "NOTE: kind local-path is not encryption at rest. REQUIRE_ENCRYPTION=false."
echo "NOTE: this cluster does not prove NetworkPolicy enforcement or etcd encryption."
echo "NOTE: the loaded image is not signed or scanned."
cleanup() { kind delete cluster --name "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
kind create cluster --name "$name"
kind export kubeconfig --name "$name"
kubectl apply -f deploy/sandbox/k8s/namespace.yaml
kubectl apply -f deploy/sandbox/k8s/rbac.yaml
kubectl apply -f deploy/sandbox/k8s/networkpolicy-provisioner.yaml
kubectl apply -f deploy/sandbox/k8s/resourcequota.yaml
docker pull debian:bookworm-slim
docker tag debian:bookworm-slim ghcr.io/pulsatrixtechnologies/sagax-sandbox:kind
kind load docker-image ghcr.io/pulsatrixtechnologies/sagax-sandbox:kind --name "$name"
export SAGAX_SANDBOX_K8S_INTEGRATION=1
export SAGAX_SANDBOX_K8S_USE_KUBECONFIG=1
export SAGAX_SANDBOX_IMAGE=ghcr.io/pulsatrixtechnologies/sagax-sandbox:kind
export SAGAX_SANDBOX_K8S_STORAGE_CLASS=local-path
export SAGAX_SANDBOX_K8S_REQUIRE_SIGNED=0
export SAGAX_SANDBOX_K8S_REQUIRE_ENCRYPTION=false
pnpm exec vitest run server/sandboxd-k8s.integration.test.ts
