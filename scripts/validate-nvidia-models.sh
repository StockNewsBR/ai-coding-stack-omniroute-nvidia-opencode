#!/usr/bin/env bash
set -u
: "${NVIDIA_API_KEY:?Set NVIDIA_API_KEY first}"

# Direct NVIDIA model IDs for the current priority pool.
# DeepSeek V4 Flash Free and MiMo-V2.5 Free are validated through
# OpenCode Zen / OmniRoute instead of the direct NVIDIA endpoint.
models=(
  'z-ai/glm-5.2'
  'nvidia/nemotron-3-ultra-550b-a55b'
  'thinkingmachines/inkling'
  'nvidia/nemotron-3-super-120b-a12b'
  'nvidia/nemotron-3.5-lightning-30b-a3b'
  'stepfun-ai/step-3.7-flash'
)

attempts=3

echo '| Model | Passed | Status |'
echo '|---|---:|---|'

for model in "${models[@]}"; do
  passed=0

  for ((i=1; i<=attempts; i++)); do
    body="/tmp/nim-check.$$.${i}"

    code=$(timeout 120s curl -sS -o "$body" -w '%{http_code}' \
      https://integrate.api.nvidia.com/v1/chat/completions \
      -H "Authorization: Bearer $NVIDIA_API_KEY" \
      -H 'Content-Type: application/json' \
      -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply exactly NVIDIA_OK\"}],\"max_tokens\":16}" \
      || true)

    if [[ "$code" == 2* ]]; then
      ((passed+=1))
    fi

    rm -f "$body"
    sleep 2
  done

  case "$passed" in
    3) status='PASS' ;;
    2) status='UNSTABLE' ;;
    1) status='UNSTABLE' ;;
    *) status='FAIL' ;;
  esac

  printf '| `%s` | %d/%d | %s |\n' "$model" "$passed" "$attempts" "$status"
done

echo
echo 'Note: this is a direct NVIDIA smoke test, not a coding benchmark or a rate-limit/concurrency test.'
