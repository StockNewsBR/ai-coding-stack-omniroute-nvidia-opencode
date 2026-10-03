#!/usr/bin/env bash
set -euo pipefail

port="${1:-20128}"

echo "== listeners on :${port} =="
ss -ltnp 2>/dev/null | awk -v p=":${port}" 'NR==1 || index($4,p)'

pids="$(ss -ltnp 2>/dev/null | awk -v p=":${port}" 'index($4,p)' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
if [ -z "${pids}" ]; then
  echo "no listener on :${port}"
  exit 0
fi

for pid in ${pids}; do
  echo "-- pid ${pid} --"
  ps -o pid=,ppid=,user=,etime=,args= -p "${pid}" || true
  printf 'exe: %s\n' "$(readlink "/proc/${pid}/exe" 2>/dev/null || echo unknown)"
  printf 'cgroup: %s\n' "$(head -1 "/proc/${pid}/cgroup" 2>/dev/null || echo unknown)"
  printf 'systemd owner: %s\n' "$(cat "/proc/${pid}/cgroup" 2>/dev/null | grep -o '[^/]*\.service' | head -1 || echo none)"
done
