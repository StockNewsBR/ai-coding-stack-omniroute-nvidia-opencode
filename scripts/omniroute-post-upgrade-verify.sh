#!/usr/bin/env bash
set -euo pipefail

base="${OMNIROUTE_BASE_URL:-http://127.0.0.1:20128}"
key="${OMNIROUTE_API_KEY:-}"
if [ -z "${key}" ] && [ -f "${HOME}/.config/opencode/omniroute.key" ]; then
  key="$(cat "${HOME}/.config/opencode/omniroute.key")"
fi
model="${1:-ddgw/gpt-5.4-mini}"
fail=0

echo "-- version --"
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx aimmarketmaster-omniroute; then
  docker exec aimmarketmaster-omniroute node -e "console.log(require('/app/package.json').version)" || fail=1
else
  omniroute --version || fail=1
fi

echo "-- listeners --"
ss -ltnp 2>/dev/null | awk 'NR==1 || /:20128/'
n="$(ss -ltnH 2>/dev/null | awk '/:20128/' | wc -l)"
echo "listener_count=${n}"
[ "${n}" = "1" ] || fail=1
if ss -ltnH 2>/dev/null | awk '/:20128/ && $4 !~ /^127\.0\.0\.1:/' | grep -q .; then
  echo "NON-LOOPBACK BIND DETECTED"
  fail=1
fi

echo "-- healthz --"
curl -sS -o /dev/null -w 'healthz=%{http_code}\n' "${base}/healthz" || fail=1

if [ -n "${key}" ]; then
  echo "-- models --"
  curl -sS -o /dev/null -w 'noauth=%{http_code}\n' "${base}/v1/models" || true
  curl -sS -H "Authorization: Bearer ${key}" -o /dev/null -w 'authed=%{http_code}\n' "${base}/v1/models" || fail=1
  echo "-- free chat (${model}) --"
  curl -sS -H "Authorization: Bearer ${key}" -H 'Content-Type: application/json' \
    -d "{\"model\":\"${model}\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply only with OK\"}],\"max_tokens\":8}" \
    -D /tmp/omni-verify-headers -o /tmp/omni-verify-body "${base}/v1/chat/completions" || fail=1
  grep -i '^x-omniroute-\(provider\|response-cost\|version\)' /tmp/omni-verify-headers || true
  rm -f /tmp/omni-verify-headers /tmp/omni-verify-body
else
  echo "OMNIROUTE_API_KEY not set and no key file found; skipped authenticated checks"
fi

if [ "${fail}" = "0" ]; then
  echo "POST_UPGRADE_VERIFY=PASS"
else
  echo "POST_UPGRADE_VERIFY=FAIL"
  exit 1
fi
