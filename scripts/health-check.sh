#!/usr/bin/env bash
set -euo pipefail

OMNIROUTE_BASE="${OMNIROUTE_BASE_URL:-http://127.0.0.1:20128/v1}"
FCC_ADMIN="${FCC_ADMIN_URL:-http://127.0.0.1:8082/admin}"

printf '%-28s' 'OmniRoute TCP :20128'
if (echo >/dev/tcp/127.0.0.1/20128) >/dev/null 2>&1; then echo PASS; else echo FAIL; fi

printf '%-28s' 'FCC TCP :8082'
if (echo >/dev/tcp/127.0.0.1/8082) >/dev/null 2>&1; then echo PASS; else echo 'SKIP/FAIL'; fi

if [[ -n "${OMNIROUTE_API_KEY:-}" ]]; then
  printf '%-28s' 'OmniRoute /models'
  if curl -fsS "$OMNIROUTE_BASE/models" -H "Authorization: Bearer $OMNIROUTE_API_KEY" >/dev/null; then echo PASS; else echo FAIL; fi
else
  echo 'OMNIROUTE_API_KEY not set; skipping authenticated /models check.'
fi
