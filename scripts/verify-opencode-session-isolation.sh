#!/usr/bin/env bash
set -u

printf '%s\n' '=== OpenCode process isolation ==='
mapfile -t pids < <(pgrep -x opencode 2>/dev/null || true)

if ((${#pids[@]} == 0)); then
  echo 'No processes named exactly "opencode" are running.'
else
  declare -A db_to_pids=()
  for pid in "${pids[@]}"; do
    cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    db=$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | sed -n 's/^OPENCODE_DB=//p' | head -n1)
    printf '\nPID: %s\nCMD: %s\nOPENCODE_DB: %s\n' "$pid" "${cmd:-<unavailable>}" "${db:-<not explicitly set>}"
    if [[ -n "$db" ]]; then
      db_to_pids["$db"]="${db_to_pids[$db]:-} $pid"
    fi
  done

  printf '\n%s\n' '=== Duplicate explicit DB check ==='
  duplicates=0
  for db in "${!db_to_pids[@]}"; do
    read -r -a owners <<< "${db_to_pids[$db]}"
    if ((${#owners[@]} > 1)); then
      printf 'WARNING: DB shared by multiple OpenCode PIDs: %s ->%s\n' "$db" "${db_to_pids[$db]}"
      duplicates=1
    fi
  done
  if ((duplicates == 0)); then
    echo 'No duplicate explicit OPENCODE_DB values detected among running OpenCode processes.'
  fi
fi

printf '\n%s\n' '=== tmux sessions ==='
if command -v tmux >/dev/null 2>&1; then
  tmux list-sessions -F 'session=#{session_name} attached=#{session_attached} windows=#{session_windows}' 2>/dev/null || echo 'No tmux server/sessions found.'
  printf '\n%s\n' '=== tmux clients ==='
  tmux list-clients -F 'client=#{client_name} session=#{session_name} tty=#{client_tty}' 2>/dev/null || echo 'No attached tmux clients found.'
else
  echo 'tmux is not installed or not on PATH.'
fi

printf '\n%s\n' 'Acceptance rule:'
echo '  same project/config is OK; each concurrent OpenCode terminal should have a unique tmux session and unique OPENCODE_DB; each HUD must read its own process DB.'
