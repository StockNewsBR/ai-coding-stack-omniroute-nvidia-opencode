# OmniRoute v3.8.51 Upgrade — Test Results

- Date: 2026-10-03 (UTC)
- Runtimes: VPS production (Docker, 3.8.51, Node v26.10.0) and local workstation (3.8.51, Node 24.21.0 LTS)
- Paid calls: **0** — paid spend: **$0**

## Repo test suite (local)

| Check | Command | Result |
|---|---|---|
| Python unit tests | `python3 -m unittest -v test_memory_gateway` (examples/hindsight-memory-gateway) | **8/8 PASS** (exit 0) |
| Chat smoke | `scripts/test-omniroute.sh ddgw/gpt-5.4-mini` with `OMNIROUTE_API_KEY` | **PASS** — content `OMNIROUTE_OK`, HTTP 200 |
| Health script | `scripts/health-check.sh` with `OMNIROUTE_API_KEY` | **PASS** — TCP :20128 PASS, FCC :8082 PASS, `/models` PASS |

Baseline note: the historical “139 tests” baseline is **not reproducible in this working tree** — the repository contains only the 8 Python tests above plus shell smoke scripts (the `scripts/free-ai-audit/` and `scripts/routelab/` directories are empty). This is an environment limitation, not a regression below a measurable baseline.

## VPS production validation (post-upgrade)

| Check | Result |
|---|---|
| Canonical contract `health` | PASS — `PRODUCTION_OMNIROUTE=HEALTHY`, AUTH PASS, MODELS_READ PASS, BINDING `127.0.0.1:20128`, PUBLIC_PORT NO, FREE_ONLY_SERVER_POLICY PASS, LOG_ROTATION PASS |
| Version | `3.8.51` (container), Node v26.10.0 |
| Single instance / port | exactly one listener `127.0.0.1:20128`; container restarts 0 |
| `/healthz` | 200 (`/ready` returns 404 — endpoint not published; contract waits on `/healthz`) |
| `/api/monitoring/health` | 200 |
| Migrations | 24 applied (163 → 186), pre-migration DB backup created; alias seed 0 applied / 5 skipped / 0 failed; VACUUM deferred to schedule |
| Cleanup timer | `0 deleted, 0 errors` (3.8.50 SQLITE_ERROR no longer reproduces) |
| `/v1/models` anonymous | 401 `AUTH_002` — auth enforced |
| `/v1/models` bearer | 200, 197 models |
| Management settings | `hidePaidModels=true`, `freeAccessPolicy=strict` |

## Local workstation validation

| Check | Result |
|---|---|
| Node / OmniRoute | Node 24.21.0 LTS, `omniroute --version` = 3.8.51 |
| Served process runtime | both supervisor and server on `/home/dcima/.nvm/versions/node/v24.21.0/bin/node` (old `/usr/bin/node` gone) |
| `/v1/models` | 401 anonymous / 200 bearer (610 models) |
| Migrations | 33 applied (through 196), no errors, no Node-version warning |
| EADDRINUSE | absent; historical cause = duplicate manual instance racing systemd `Restart=always` |

## Test matrix A–W

| Item | Result |
|---|---|
| A. process singleton / port ownership | PASS (both runtimes; `omniroute-port-owner.sh`) |
| B. startup / shutdown | PASS (clean restarts; no restart loop) |
| C. authenticated `/v1/models` | PASS |
| D. authenticated chat completion | PASS (`ddgw/gpt-5.4-mini`) |
| E. model catalog | PASS (197 VPS / 610 local) |
| F. FREE_ONLY | PASS (`hidePaidModels=true`, strict policy) |
| G. paid fallback blocked | PASS (paid flags 0; no paid connections configured) |
| H. circuit breaker | N/A this run — counters 0, none tripped (TEST_ONLY) |
| I. retry | PASS — 429 `reset_seconds` surfaced with `retry-after` |
| J. timeout | PASS — new stream/first-byte watchdog defaults active |
| K. quota | PASS — cooling-down credential surfaced, combo skipped |
| L. 429 interpretation | PASS — local cooldown ≠ quota exhaustion |
| M. fallback ordering | TEST_ONLY/DEFERRED — single keyless candidate (`opencode`) starves combos during cooldown; direct model calls fine |
| N. provider unavailable | PASS — handled as provider condition, never as paid fallback |
| O. API key required | PASS (401 without bearer) |
| P. secret redaction | PASS — no secrets in reports/logs; `credentialRedactionEnabled=true` |
| Q. DeepSeek V4.1 | PASS — `oc/deepseek-v4-flash-free` exposed with 1,000,000 ctx; upstream v4.1 regex/registry fixes inherited |
| R. OpenCode integration | PASS — OpenCode 1.18.34 against the gateway (OpenAI-compatible provider), free chat verified |
| S. OpenCode v2 | DEFER — plugin-v2 requires OpenCode 2.x |
| T. `customModels.isFree` | N/A — no custom models configured (semantics audited) |
| U. health / readiness | PASS (`/healthz` 200; `/ready` not published) |
| V. image free-first | PASS — `aihorde/Deliberate`, cost 0 |
| W. zero paid calls | PASS — spend $0 |

## Real E2E evidence

- Text: `POST /v1/chat/completions` `ddgw/gpt-5.4-mini` → 200, `x-omniroute-provider: ddgw`, `x-omniroute-decision: strategy=single; provider=ddgw; latency_ms=1204`, `x-omniroute-response-cost: 0.0000000000`, `x-omniroute-version: 3.8.51`.
- Image: `POST /v1/images/generations` `aihorde/Deliberate` → 200, b64 WebP, `x-omniroute-provider: horde`, `x-omniroute-response-cost: 0.0000000000`.
- Failover free→free: not demonstrable while only one keyless candidate exists (see item M); classified as deferred non-blocker with logs proving correct skip/cooldown behavior.
