#!/usr/bin/env bash
set -euo pipefail
: "${OMNIROUTE_API_KEY:?Set OMNIROUTE_API_KEY first}"
BASE="${OMNIROUTE_BASE_URL:-http://127.0.0.1:20128/v1}"
MODEL="${1:-auto}"

curl -fsS "$BASE/chat/completions" \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply only with OMNIROUTE_OK\"}],\"max_tokens\":32}"
echo
