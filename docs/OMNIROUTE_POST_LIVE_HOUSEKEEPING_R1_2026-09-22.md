# OmniRoute — Post-Live Housekeeping R1

- **Mission:** OMNIROUTE_POST_LIVE_HOUSEKEEPING_R1
- **Date:** 2026-09-22
- **Role:** Safe post-live cleanup / read-mostly
- **Scope:** Verify LIVE :20128 health, clean only proven-stale old certification evidence, produce this report. No production changes.

## Authoritative LIVE constants (unchanged)

| Constant | Value |
|---|---|
| LIVE_PORT | 20128 |
| LIVE_VERSION | 3.8.50 |
| LIVE_BUILD_SHA | 7e5a2d80b |
| FINAL_LIVE_CERTIFIED | YES |
| FINAL_RESULT | PASS |

---

## Phase 1 — LIVE safety baseline (read-only)

| Check | Result |
|---|---|
| LIVE_SERVICE_ACTIVE | active |
| LIVE_SUBSTATE | running |
| LIVE_MAIN_PID | 426 |
| LIVE_PORT_20128_LISTEN | YES (127.0.0.1:20128) |
| LIVE_HEALTH_BEFORE | PASS |
| LIVE_BUILD_SHA_BEFORE | 7e5a2d80b |
| LIVE_VERSION_CONFIRMED | 3.8.50 |

- Unit: `/home/dcima/.config/systemd/user/omniroute.service` (enabled).
- Drop-ins: `omniroute.service.d/hardening.conf` (`REQUIRE_API_KEY=true`, `ExecStartPost=omniroute-fix-orcarouter`), `omniroute.service.d/override.conf` (`OMNIROUTE_SERVER_HOST=127.0.0.1`).
- Main PID 426 cmdline: `node .../node_modules/omniroute/bin/omniroute.mjs serve --no-open --no-recovery`; children: `esbuild --service=0.28.2 --ping` (572), `omniroute (v16.3.1)` (684).
- Health: `curl -fsS http://127.0.0.1:20128/api/health` → `{"status":"ok","timestamp":"2026-09-22T12:37:20.490Z"}` (exit 0).
- BUILD_SHA verified read-only from the installed package `dist/BUILD_SHA` = `7e5a2d80b`; `dist/package.json` version = `3.8.50`; root `package.json` version = `3.8.50`.
- No unauthenticated version endpoint: `/api/version`, `/api/build`, `/api/info` → HTTP 401; `/version` → 404.

---

## Phase 2 — Old canary :22128

| Field | Value |
|---|---|
| CANARY_FOUND | NO |
| CANARY_PID | NONE |
| CANARY_IDENTITY_VERIFIED | N/A |
| CANARY_STOPPED | NO |
| CANARY_PORT_22128_AFTER | NOT_LISTENING |

`ss -ltnp | grep ':22128'` and `lsof -nP -iTCP:22128 -sTCP:LISTEN` were both empty. Nothing killed.

---

## Phase 3 — Old local mocks

| Field | Value |
|---|---|
| MOCK_CANDIDATES_FOUND | 0 |
| MOCKS_POSITIVELY_IDENTIFIED | 0 |
| MOCKS_STOPPED | 0 |
| UNRELATED_PROCESS_KILLED | NO |

- Full `/proc` scan (readlink cwd + cmdline on every PID) for tokens `omniroute-final-free-autopilot-20260921`, `mock`, `canary`, `22128` → **zero** matches (only the scanning shell itself).
- Running node/bun/python inventory: all confirmed unrelated or protected — snapfuse, networkd-dispatcher, unattended-upgrade, fcc-server (424), PRODUCTION omniroute (426) + esbuild (572) + omniroute v16.3.1 (684), `node server/dist/index.js` (1408), hindsight-api (1632), n8n, oh-my-openagent lsp-daemon, codegraph, tradingview-mcp, serena, pyright, fakechat bun, bash-language-server, opencode sessions. None is an old certification mock.

### Mock candidate table

| PID | COMMAND | CWD | PORT | IDENTITY | ACTION | REASON |
|---|---|---|---|---|---|---|
| — | — | — | — | none matched old-cert tokens | none | no positively identified old mock existed |

Protected workspaces explicitly left untouched: `/home/dcima/omniroute-image-paid-framework-r0`, `/home/dcima/omniroute-free-manager-stress-r1`, `/home/dcima/ai-coding-stack-omniroute-nvidia-opencode`.

---

## Phase 4 — Old lock

| Field | Value |
|---|---|
| LOCK_FOUND | YES |
| LOCK_STALE | YES |
| LOCK_OWNER_PID | 133984 |
| LOCK_REMOVED | YES |

- Path: `/home/dcima/.locks/omniroute-final-free-autopilot.lock` — regular file, mode 0644, owner `dcima`, size 108, Birth/Modify `2026-09-21 16:54:34 -03`.
- Content: `PID=133984`, `STARTED=2026-09-21T16:54:34-03:00`, `SESSION=omniroute-final-free-autopilot-20260921`, `HOST=DayTrader`.
- PID 133984 is **DEAD** (`ps -p 133984` not alive; `/proc/133984` absent). No `lsof`/`fuser` holders on the lock.
- Applied rule 1 (stale + owner dead) → removed with `rm -v`. `/home/dcima/.locks/` now empty.

---

## Phase 5 — Parallel work safety (read-only)

| Field | Value |
|---|---|
| IMAGE_R0_WORKSPACE_PRESENT | YES |
| STRESS_R1_WORKSPACE_PRESENT | YES |

- `/home/dcima/omniroute-image-paid-framework-r0` — present, branch `feature/image-paid-fallback-framework-r0`. Not modified.
- `/home/dcima/omniroute-free-manager-stress-r1` — present, branch `test/free-ai-manager-stress-r1`. Not modified.
- `/home/dcima/omniroute-final-free-autopilot-20260921` — present (old canary workspace remnant), HEAD `bd994e3c1b8dd0c887fc6d988b785a083b753e3a`. Not modified.

---

## Phase 6 — Final live health (after cleanup)

| Check | Result |
|---|---|
| ActiveState | active |
| SubState | running |
| LIVE_MAIN_PID_AFTER | 426 |
| LIVE_PORT_20128_LISTEN_AFTER | YES |
| LIVE_HEALTH_AFTER | PASS |
| LIVE_BUILD_SHA_AFTER | 7e5a2d80b |
| LIVE_SERVICE_RESTARTED | NO |

Health: `{"status":"ok","timestamp":"2026-09-22T12:38:24.986Z"}` (exit 0). MainPID 426 identical before/after.

---

## Final field summary

| Field | Value |
|---|---|
| LIVE_HEALTH_BEFORE | PASS |
| LIVE_HEALTH_AFTER | PASS |
| LIVE_BUILD_SHA_BEFORE | 7e5a2d80b |
| LIVE_BUILD_SHA_AFTER | 7e5a2d80b |
| LIVE_MAIN_PID_BEFORE | 426 |
| LIVE_MAIN_PID_AFTER | 426 |
| CANARY_FOUND | NO |
| CANARY_PID | NONE |
| CANARY_IDENTITY_VERIFIED | N/A |
| CANARY_STOPPED | NO |
| CANARY_PORT_22128_AFTER | NOT_LISTENING |
| MOCK_CANDIDATES_FOUND | 0 |
| MOCKS_POSITIVELY_IDENTIFIED | 0 |
| MOCKS_STOPPED | 0 |
| UNRELATED_PROCESS_KILLED | NO |
| LOCK_FOUND | YES |
| LOCK_STALE | YES |
| LOCK_OWNER_PID | 133984 (dead) |
| LOCK_REMOVED | YES |
| IMAGE_R0_WORKSPACE_PRESENT | YES |
| STRESS_R1_WORKSPACE_PRESENT | YES |
| PRODUCTION_CODE_CHANGED | NO |
| PRODUCTION_DB_CHANGED | NO |
| PRODUCTION_CONFIG_CHANGED | NO |
| LIVE_SERVICE_RESTARTED | NO |
| OPENCODE_CHANGED | NO |
| HARNESS_CHANGED | NO |
| HERMES_CHANGED | NO |
| IAMM_CHANGED | NO |
| STOCKNEWSBR_CHANGED | NO |
| FINAL_RESULT | PASS |

---

## Actions taken

1. Removed stale lock file `/home/dcima/.locks/omniroute-final-free-autopilot.lock` (owner PID 133984 dead; rule 1).

No other mutation: no processes killed, no production source/DB/config touched, no service restarted, no parallel workspace modified.
