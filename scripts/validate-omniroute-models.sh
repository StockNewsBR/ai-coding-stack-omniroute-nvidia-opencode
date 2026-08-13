#!/usr/bin/env bash
set -u
: "${OMNIROUTE_API_KEY:?Set OMNIROUTE_API_KEY first}"
BASE="${OMNIROUTE_BASE_URL:-http://127.0.0.1:20128/v1}"

if (( $# > 0 )); then
  models=("$@")
else
  models=("auto" "auto/best-coding" "auto/coding:free")
fi

printf '| Model | Result |\n|---|---|\n'
for model in "${models[@]}"; do
  code=$(curl -sS -o /tmp/or-check.$$ -w '%{http_code}' \
    "$BASE/chat/completions" \
    -H "Authorization: Bearer $OMNIROUTE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply OK\"}],\"max_tokens\":8}" || true)
  if [[ "$code" == 2* ]]; then result='PASS'; else result="FAIL ($code)"; fi
  printf '| `%s` | %s |\n' "$model" "$result"
done
rm -f /tmp/or-check.$$
