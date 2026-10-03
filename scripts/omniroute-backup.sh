#!/usr/bin/env bash
set -euo pipefail

root="${HOME}/.omniroute"
out="${1:-${HOME}/omniroute-backups}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
dir="${out}/omniroute-${ts}"
mkdir -p "${dir}/etc" "${dir}/meta"
chmod 700 "${out}" "${dir}" 2>/dev/null || true

if [ -f "${root}/storage.sqlite" ]; then
  python3 - "${root}/storage.sqlite" "${dir}/storage.sqlite.hotbackup" <<'PY'
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
s = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
d = sqlite3.connect(dst)
with d:
    s.backup(d)
print("quick_check:", d.execute("PRAGMA quick_check").fetchone()[0])
d.execute("PRAGMA journal_mode=DELETE")
d.close()
s.close()
PY
fi

for f in "${root}/.env" "${root}/server.env"; do
  [ -e "${f}" ] && cp -p "${f}" "${dir}/etc/$(basename "${f}")"
done
for f in "${HOME}/.config/opencode/omniroute.key" "${HOME}/.config/opencode/omniroute-direct.json" "${HOME}/.config/systemd/user/omniroute.service"; do
  [ -e "${f}" ] && cp -p "${f}" "${dir}/etc/$(basename "${f}")"
done
[ -e /etc/systemd/system/aimmarketmaster-omniroute.service ] && cp -p /etc/systemd/system/aimmarketmaster-omniroute.service "${dir}/etc/" 2>/dev/null || true

{
  date -u +%FT%TZ
  uname -a
  node --version 2>/dev/null || true
  omniroute --version 2>/dev/null || true
  if command -v docker >/dev/null 2>&1 && docker inspect aimmarketmaster-omniroute >/dev/null 2>&1; then
    docker inspect aimmarketmaster-omniroute --format 'image={{.Config.Image}}'
    docker inspect aimmarketmaster-omniroute --format 'app={{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(NODE_VERSION|REQUIRE_API_KEY|OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL|OMNIROUTE_EMERGENCY_FALLBACK)=' || true
  fi
} > "${dir}/meta/versions.txt" 2>&1

tar -C "${dir}" -czf "${dir}.tar.gz" .
sha256sum "${dir}.tar.gz" > "${dir}.tar.gz.sha256"
chmod 600 "${dir}.tar.gz" "${dir}.tar.gz.sha256"
rm -rf "${dir}"

echo "BACKUP_PATH=${dir}.tar.gz"
cat "${dir}.tar.gz.sha256"
