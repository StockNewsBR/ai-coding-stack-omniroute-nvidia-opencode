# OmniRoute Super-Configuration Audit R2 (VPS, 3.8.51)

Date: 2026-10-03
Production truth: VPS `62.83.17.20` (container `aimmarketmaster-omniroute`, unit `aimmarketmaster-omniroute.service`)
Runtime: OmniRoute **3.8.51**, image digest `sha256:8bd462c9f60d8eda79329cfbb6ea7ea723505fe7721beb944f3d43835409e218`, in-container Node v26.10.0
Policy: `AIMM_AI_POLICY=FREE_ONLY`, `AIMM_PAID_AI_ENABLED=0`, `AIMM_PAID_FALLBACK=0`; server `freeAccessPolicy=strict`, `hidePaidModels=true`

## 1. Snapshot gate (step 0)

- Snapshot: `/var/backups/aimmarketmaster/omniroute-config-r2-20261003T114247Z.tar.gz` (14 files: env/secrets 600, unit, docker inspect, API state JSONs, consistent DB hot backup).
- sha256 `d3f5e2e45620d50bcf1e04d0c034478e9b26bc22adb9fd6479bd4df295fd0b64`, verified; offsite copy in `/home/dcima/vps-backups/omniroute-config-r2/`.
- DB backup made inside the container (`VACUUM INTO`), `PRAGMA quick_check` = ok. Gate: **PASS**.

## 2. Configuration before (2026-10-03 ~11:42Z)

- `credentialRedactionEnabled=false`, `comboStrategy=fallback`, `requestRetry=3`, `maxRetryIntervalSec=30`, `autoRefreshProviderQuota=false` (interval 180), `radarEnabled=false`, `call_log_pipeline_enabled=0`, custom combos **0**, configured provider connections **0**, monitored keyless providers 4, breakers 4 closed.

## 3. Upstream audit

Full classification in `reports/OMNIROUTE_UPSTREAM_3_8_51_CAPABILITY_MATRIX.md` (routing, free tier, failover, security, observability, compression, integrations, env delta).

## 4. Changes applied (before -> after, why, risk, test, rollback)

### C1. Credential redaction ON
- Before `false` -> after `true` (`PATCH /api/settings`).
- Why: security hardening (redact credentials in logs/errors).
- Risk: provider error strings get partially redacted (cosmetic).
- Test: unauthenticated/provider error paths still return actionable codes; observed redaction active.
- Rollback: `PATCH /api/settings {"credentialRedactionEnabled":false}`.
- Result: **ADOPTED**.

### C2. Six free-first custom combos
- Before `0` -> after `6` (details, ids and tests in `reports/ROUTING_PROFILES.md`).
- Why: deterministic FREE-first routing for IAMM workloads and a proven FREE->FREE failover path.
- Risk: all members are keyless free providers under strict policy; no paid member possible.
- Tests: `aimm-default` 200 (ddgw, cost 0), `aimm-failover-proof` 200 with `x-omniroute-fallback-attempts: 1`, `aimm-image` 200 (horde, cost 0).
- Rollback: `DELETE /api/combos/<id>` per profile.
- Result: **ADOPTED**.

### C3. Compression lite trial
- Before `off` -> `lite` -> **reverted to `off`** (PUT `/api/settings/compression`).
- Why/result: no token reduction on prose, +0.2s latency (`reports/COMPRESSION_BENCHMARK_IAMM.md`); rollback verified.
- Result: **TEST_ONLY / DEFER** (net config unchanged).

### Not changed (deliberate)

`autoRefreshProviderQuota` (DEFER: keyless only), `call_log_pipeline_enabled` (DEFER: privacy-first), Radar (NOT_RELEVANT), Quota Share (NOT_RELEVANT: no multi-key connections), `wsAuth`/`requireLogin`/proxy settings (already safe), auto combos (left upstream default), `providerStrategies` (empty is fine for keyless).

## 5. Routing strategy final

Strict zero-cost pre-dispatch classification + priority combos:
`aimm-fast` / `aimm-default` / `aimm-quality` / `aimm-coding` (text), `aimm-image` (image), `aimm-failover-proof` (regression).
Failure semantics: transient (timeout/network/429/5xx) fail over (default up to 3 provider attempts); auth/permission/model-unavailable fail cleanly; circuit breaker closed/open/half-open with bounded probe.

## 6. Free provider inventory (summary)

A-class (verified, cost 0): `ddgw` text (6 models), `aihorde` image (146 models).
B (best-effort/key): AI Horde text (key required).
C (conditional): OpenCode free tier (OpenCode-client gated, cooldowns).
E: uncloseai (404). F: veo video (untested).
Mission-listed providers (Pollinations, NVIDIA, Gemini, Groq, Cerebras, GLM, Kilo, SiliconFlow, OpenRouter free, Kimi, Cheaper Inference, AgentRouter, etc.): **NOT_PRESENT** in this runtime catalog.
Details: `reports/FREE_PROVIDER_MATRIX.md`.

## 7. Quota / breakers / retries

- Quota telemetry states (healthy/approaching_limit/exhausted/unavailable/unknown) with unknown != exhausted. Keyless providers are neutral.
- `circuitBreakers` 4 total, 0 open; `providerBreakers` opencode closed (failureCount 0 at snapshot).
- Retries: `requestRetry=3`, `maxRetryIntervalSec=30`; proxy skip-recently-failed active by default in 3.8.51.

## 8. Security validation

- `GET /v1/models` unauthenticated = **401**; `GET /api/settings` unauthenticated = **401**; `GET /api/providers` unauthenticated = **401**.
- Listener `127.0.0.1:20128` only (no public port), UFW unchanged.
- `REQUIRE_API_KEY=true`; management session cookie required for `/api/*`.
- Credential redaction now ON. Secret files 600; no secrets printed in this mission.
- Removed env vars (`OMNIROUTE_CGPT_WEB_*`, `OPENCODE_GO_*`) not present in the VPS env file (drift check 0).

## 9. Observability

Per-response headers verified: `x-omniroute-provider`, `x-omniroute-model`, `x-omniroute-decision` (strategy/provider/latency), `x-omniroute-response-cost`, `x-omniroute-tokens-in/out`, `x-omniroute-version`, `x-omniroute-request-id`, plus combo trace / fallback-attempts headers.
`/api/monitoring/health`: status/version/uptime, providerSummary, breakers, quotaMonitor, admission, memory, cryptography.
Call-log pipeline export: DEFER (privacy).

## 10. Load / capacity test (safe)

5 parallel `ddgw/gpt-5.4-mini` chat requests: all HTTP 200, wall ~2.6s, `/healthz` 200 afterwards, container healthy. No provider abuse (small prompts only).

## 11. Config drift

- Env file has no removed 3.8.51 vars; optional new vars not adopted (documented in capability matrix).
- Settings changed only as recorded above; settings revision recorded.
- Repo examples/docs vs upstream contract: no conflicting duplicates; `scripts/omniroute-*.sh` provide preflight/post-verify.

## 12. Remote mode / OpenCode

- Canonical production endpoint remains the VPS loopback gateway; operator access via SSH tunnel/management session only; no second production-like instance on the workstation (local runtime = dev only).
- OpenCode stays v1 (1.18.34); `@omniroute/opencode-plugin-v2` remains DEFER until OpenCode 2.x is adopted.

## 13. Zero-cost proof

All executed E2E calls: `x-omniroute-response-cost: 0.0000000000`; strict policy active; paid fallback flags false. **PAID_CALLS=0, PAID_SPEND=$0**.

## 14. Rollback

1. Combos: DELETE the six ids (see `ROUTING_PROFILES.md`).
2. Settings: PATCH `credentialRedactionEnabled=false` (only adopted setting).
3. Compression: already reverted; if touched again PUT `{"enabled":false,"defaultMode":"off"}`.
4. Full config restore: snapshot tarball above (env/unit/DB) per `reports/OMNIROUTE_V3_8_51_BACKUP_MANIFEST.md`.
5. Image rollback remains available (3.8.50 digest `085c57adf499...` kept locally).

## 15. Delivery

Reports: this file, `ROUTING_PROFILES.md`, `FREE_PROVIDER_MATRIX.md`, `COMPRESSION_BENCHMARK_IAMM.md`, `UPSTREAM_WATCHLIST_3_8_52.md`, `OMNIROUTE_UPSTREAM_3_8_51_CAPABILITY_MATRIX.md`.
Commit/push/SHA parity recorded in the mission delivery block (commit hash noted after push).
