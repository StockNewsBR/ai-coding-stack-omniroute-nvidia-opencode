# OmniRoute v3.8.50 → v3.8.51 Safe Upgrade — Mission R1

- Date: 2026-10-03 (UTC)
- Policy: `AIMM_AI_POLICY=FREE_ONLY`, `PAID_AI_ENABLED=0`, `PAID_FALLBACK=0`, paid text never, paid image off by default
- Version policy: production = official releases only; target = 3.8.51; never `@latest`, never beta/rc/nightly; explicit version/digest pinned

## Scope and order

1. Production VPS first (canonical runtime).
2. Local workstation second (dev/test runtime).
3. Repository docs, reports, scripts third.

## Before / after

| Runtime | OmniRoute before | OmniRoute after | Node before | Node after |
|---|---|---|---|---|
| VPS (Docker `aimmarketmaster-omniroute`) | 3.8.50, image digest `sha256:085c57adf499…` | 3.8.51, image digest `sha256:8bd462c9f60d8eda79329cfbb6ea7ea723505fe7721beb944f3d43835409e218` | v26.7.0 (in container) | v26.10.0 (in container) |
| Local workstation (pnpm + npm global) | 3.8.50 under Node 22.22.1 (`/usr/bin/node`) | 3.8.51 under Node 24.21.0 LTS | 22.22.1 | 24.21.0 |

## Gates

| Gate | Result |
|---|---|
| BACKUP_VERIFIED | YES (VPS + local; sha256 checked, offsite copies) |
| RESTORE_PATH_KNOWN | YES (see backup manifest report) |
| ROLLBACK_READY | YES (old image digest kept; unit + DB restore documented) |
| PRE_UPGRADE_VERSION_CAPTURED | YES (3.8.50 both runtimes) |
| SINGLE_RUNTIME | PASS (one container VPS; one user service local) |
| PAID_CALLS_EXECUTED | 0 |
| PAID_SPEND | $0 |

## VPS procedure (canonical)

1. Backup pre-upgrade (see `OMNIROUTE_V3_8_51_BACKUP_MANIFEST.md`).
2. `docker pull diegosouzapw/omniroute:3.8.51` (additive; running container untouched) and verify inside the image: app version 3.8.51, Node v26.10.0; pull-time digest `sha256:8bd462c9…` confirmed against Docker Hub.
3. Patch the two pinned lines of `/opt/aimarketmaster/current/ops/production/omniroute-bootstrap.sh` (image digest + version). Pre-patch script archived.
4. Run `omniroute-bootstrap.sh install` → secrets kept (`state=present`), static values unchanged, `OMNIROUTE_FREE_ONLY=PASS`, unit rewritten with the new digest.
5. `systemctl restart aimmarketmaster-omniroute.service` (canonical supervisor).
6. Validate: contract `health` command PASS; single listener `127.0.0.1:20128`; `/healthz` 200; `/api/monitoring/health` 200; authenticated `/v1/models` 200.

Policy env verified identical before and after: `REQUIRE_API_KEY=true`, `OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL=false`, `OMNIROUTE_EMERGENCY_FALLBACK=false`, `DATA_DIR=/app/data`, `HOSTNAME=127.0.0.1`, `PORT=20128`, `NODE_ENV=production`, `OMNIROUTE_MEMORY_MB=4096`.

## Local procedure

1. Backup via existing tool (`backup-omniroute-to-c`).
2. `nvm install 24` → v24.21.0; wrapper `~/.local/bin/omniroute-systemd-run` repointed to Node 24 (backup kept as `omniroute-systemd-run.bak-pre-v3851`).
3. `pnpm add -g omniroute@3.8.51` (better-sqlite3 13.0.3 compiled for Node 24) and `npm install -g omniroute@3.8.51` for parity.
4. `systemctl --user restart omniroute.service` → active, single listener, both processes on Node 24.

## Post-upgrade observations

- VPS migrations: 24 applied (163 → 186) with automatic pre-migration DB backup; model alias seed applied 0 / skipped 5 / failed 0.
- The pre-existing 3.8.50 cleanup-timer `SQLITE_ERROR` is gone on 3.8.51 (`0 deleted, 0 errors`).
- Local migrations: 33 applied (through 196) with no errors and no Node-version warning.
- EADDRINUSE on port 20128: not present on VPS; local historical root cause was a duplicate manual instance racing the systemd supervisor (not masked; resolved by supervisor-only start).

## Real E2E (free only)

| Route | Model | Provider | Result | Cost |
|---|---|---|---|---|
| Text | `ddgw/gpt-5.4-mini` | ddgw (keyless) | HTTP 200, ~1.2–1.4 s, content `OK` | `x-omniroute-response-cost: 0.0000000000` |
| Image | `aihorde/Deliberate` | horde (AI Horde) | HTTP 200, ~35 s, b64 WebP returned | `x-omniroute-response-cost: 0.0000000000` |
| Local text | `ddgw/gpt-5.4-mini` | ddgw | HTTP 200, content `OK` | `0.0000000000` |

Observability headers captured: routing decision (`strategy=single; provider=ddgw; latency_ms=1204`), request-id, session-id, tokens in/out, cache MISS, compression off, version 3.8.51.

## Deferred non-blockers (with evidence)

- `auto/*` combos currently resolve to a single keyless candidate (`opencode`) which was cooling down: `auto/best-free` returned 503 `ALL_TARGETS_SKIPPED` then 404 `no_executable_targets`. Direct keyless calls (`ddgw/*`) work. Free→free failover therefore is TEST_ONLY until a second free connection is intentionally configured.
- `@omniroute/opencode-plugin-v2` requires OpenCode 2.x; local OpenCode is 1.18.34 → DEFER.
- `oc/*` keyless models are restricted to the OpenCode client (`FreeTierError` outside it) → CONDITIONAL.

## Rollback

- VPS: restore the unit from the pre-upgrade backup and restart; image `085c57adf499…` (3.8.50) is still present locally. If the DB must be reverted, stop the service, restore `storage.sqlite.hotbackup`, remove `-wal`/`-shm`, restart.
- Local: restore `omniroute-systemd-run.bak-pre-v3851` (Node 22.22.2 path) and `pnpm add -g omniroute@3.8.50`.
