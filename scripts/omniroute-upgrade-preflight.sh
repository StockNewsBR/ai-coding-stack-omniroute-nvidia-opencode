#!/usr/bin/env bash
set -euo pipefail

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== OmniRoute upgrade preflight $(date -u +%FT%TZ) =="

echo "-- versions --"
node --version 2>/dev/null || true
npm --version 2>/dev/null || true
omniroute --version 2>/dev/null || true

if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx aimmarketmaster-omniroute; then
  echo "-- container --"
  docker inspect aimmarketmaster-omniroute --format 'image={{.Config.Image}} started={{.State.StartedAt}} health={{.State.Health.Status}} restarts={{.RestartCount}}'
  echo "-- policy env (non-secret) --"
  envs="$(docker inspect aimmarketmaster-omniroute --format '{{range .Config.Env}}{{println .}}{{end}}')"
  for k in REQUIRE_API_KEY HOSTNAME PORT DATA_DIR NODE_ENV OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL OMNIROUTE_EMERGENCY_FALLBACK OMNIROUTE_MEMORY_MB; do
    printf '%s\n' "$(printf '%s\n' "${envs}" | grep -E "^${k}=" || echo "${k}=(unset)")"
  done
fi

echo "-- supervisor unit hash --"
if systemctl cat aimmarketmaster-omniroute.service >/dev/null 2>&1; then
  systemctl cat aimmarketmaster-omniroute.service | sha256sum
elif systemctl --user cat omniroute.service >/dev/null 2>&1; then
  systemctl --user cat omniroute.service | sha256sum
else
  echo "no omniroute unit found"
fi

echo "-- port owner --"
bash "${self_dir}/omniroute-port-owner.sh" 20128 || true

echo "-- gates required before upgrade --"
echo "1) BACKUP_VERIFIED=YES"
echo "2) RESTORE_PATH_KNOWN=YES"
echo "3) ROLLBACK_READY=YES"
echo "4) npm view omniroute version (official release) and install explicit version or digest"
