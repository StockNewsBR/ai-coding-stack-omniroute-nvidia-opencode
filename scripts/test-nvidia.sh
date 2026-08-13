#!/usr/bin/env bash
set -euo pipefail
: "${NVIDIA_API_KEY:?Set NVIDIA_API_KEY first}"
MODEL="${1:-z-ai/glm-5.2}"

curl -fsS https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $NVIDIA_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply only with NVIDIA_OK\"}],\"max_tokens\":32}"
echo
