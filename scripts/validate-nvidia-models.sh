#!/usr/bin/env bash
set -u
: "${NVIDIA_API_KEY:?Set NVIDIA_API_KEY first}"

models=(
  'z-ai/glm-5.2'
  'nvidia/nemotron-3-ultra-550b-a55b'
  'nvidia/nemotron-3-super-120b-a12b'
)

printf '| Model | Result |\n|---|---|\n'
for model in "${models[@]}"; do
  code=$(curl -sS -o /tmp/nim-check.$$ -w '%{http_code}' \
    https://integrate.api.nvidia.com/v1/chat/completions \
    -H "Authorization: Bearer $NVIDIA_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply OK\"}],\"max_tokens\":8}" || true)
  if [[ "$code" == 2* ]]; then result='PASS'; else result="FAIL ($code)"; fi
  printf '| `%s` | %s |\n' "$model" "$result"
done
rm -f /tmp/nim-check.$$
