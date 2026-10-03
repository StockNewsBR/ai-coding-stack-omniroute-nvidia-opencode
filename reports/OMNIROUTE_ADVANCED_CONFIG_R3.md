# OmniRoute Advanced Configuration Discovery R3 (VPS 3.8.51)

Date: 2026-10-03. Snapshot gate before mutation: `/var/backups/aimmarketmaster/omniroute-config-r3-20261003T124243Z.tar.gz`, sha256 `7510a0618509ea6e115ac19f60a711030114e2b313f47b32aa9fb9fe4236004c`, 16 files, DB `VACUUM INTO` quick_check ok, offsite copy verified under `/home/dcima/vps-backups/omniroute-config-r3/`.

Policy invariants throughout: `hidePaidModels=true`, `freeAccessPolicy=strict`, `REQUIRE_API_KEY=true`, paid fallback env flags `false`, loopback-only `127.0.0.1:20128`, `PAID_CALLS=0`, `PAID_SPEND=$0`.

## 1. Model exposure (priority #1)

| State | Allowlist | Denylist | `/v1/models` |
|---|---|---|---|
| Before | `[]` | `[]` | 199 models (auto 38, ddgw 6, oc 2, unc 1, veo 4, aihorde 142) |
| After | `["auto/*","duckduckgo-web/*","aihorde/*"]` | `[]` | 196 models (auto 38, ddgw 6, veo 4, **oc 0, unc 0**, aihorde 142) |

- Applied via `PATCH /api/settings` (HTTP 200) and verified; `aimm-default` still HTTP 200 via `ddgw`, cost `0.0000000000`.
- Semantics learned: the allowlist provider segment matches the **providerId** (`duckduckgo-web`), not the API alias (`ddgw`); denylist entries had no observable effect on `/v1/models` in our test; **video models bypass model-visibility filtering** (veo stayed visible).
- Kept because it removes the client-restricted (`oc`) and broken (`unc`) models from the catalog with no routing regression. Rollback: `PATCH /api/settings {"modelVisibilityAllowlist":[],"modelVisibilityDenylist":[]}`.
- Explicit unknown model dispatch is still cleanly rejected (`401 invalid_api_key`), and FREE-only gates remain the effective policy (`hidePaidModels` + `freeAccessPolicy=strict`).

## 2. Webhooks

`/api/webhooks` endpoints exist (GET/POST, `/api/webhooks/{id}`), but no webhook keys are configured and there is no safe internal receiver on the VPS. Decision: **DEFER** (no public receiver; no secrets/prompts in any payload if later enabled).

## 3. MCP

`mcpEnabled=false` (disabled). Upstream exposes a large tool surface (~110 tools / 33 scopes); no least-privilege read-only profile has been proven isolated. Decision: **DEFER** — do not enable, do not expose publicly.

## 4. A2A

`a2aEnabled=false` (disabled); upstream A2A skills (smart-routing, quota-management, provider-discovery, cost-analysis, health-report, list-capabilities) exist but are not enabled. Decision: **DEFER / TEST_ONLY**, local-only if ever enabled.

## 5. Cache

No response/semantic cache is enabled (`/api/cache-config` -> 404 in this build). IAMM produces creative/social content and tenant isolation is unproven. Decision: **KEEP OFF**.

## 6. Quota Share

Engine exists but requires multiple credentialed keys sharing a connection; the VPS has zero configured connections (all keyless). Decision: **NOT APPLICABLE / DEFER** (revisit only if credentialed connections are added).

## 7. Provider health ranking / breakers

Adaptive scoring uses allocation, health, circuit, quota, latency, reliability, model preference and cost factors. Circuit breakers: 4 closed / 0 open. Combo order uses measured data from R2/R3 E2E (ddgw/gpt-5.4-mini 0.82-0.96 s; gpt-5.6-luna heavier), not guessed weights.

## 8. Vision

`ddgw/gpt-5.4-mini` rejects an image payload: HTTP 400 `DuckDuckGo AI Chat error: ERR_BAD_REQUEST`. No no-auth vision route exists (`auto/vision` pool empty). Decision: **TEST_ONLY / NOT AVAILABLE**; no `aimm-vision` combo created.

## 9. Routing error semantics (observed)

429 -> failover to next FREE candidate (`x-omniroute-fallback-attempts: 1`, cost 0); 401 keyless horde text; 403 OpenCode client restriction (non-retryable); 404 unknown/uncloseai model; 5xx bridge/browser errors surfaced with provider-specific codes; unknown provider id rejected cleanly (`401 invalid_api_key`).

## 10. Backup CLI / cloud sync

Native database endpoints exist (`/api/settings/database`, `refresh-stats`, `vacuum`, `export-json`). Canonical backup remains our `tar.gz` + sha256 + offsite copy; no third-party cloud upload.

## 11. Agent skills inventory

`/app/skills` ships OmniRoute CLI/agent skill docs (e.g. `cli-a2a`, `cli-backup-sync`, `cli-batches`, `cli-chat`, `cli-compression`, `cli-contexts`, `cli-cost-usage`, `cli-health`, `cli-keys`, `cli-mcp`, `cli-models`, `cli-resilience`, `cli-routing`, `omni-auth`, `omni-api-keys`, ...). Decision: **READ_ONLY** inventory, no installs; community skills require source review, secret scan and human approval (none installed).

## 12. Upstream 3.8.52

Unchanged since R2: `release/v3.8.52` head `23a11484862b3bb589a55e85b00e4ac53ffeb234`, no release tag. **Do not install.** See `reports/UPSTREAM_3_8_52_WATCHLIST_R3.md`.

## Changes summary

| Change | Before | After | Result |
|---|---|---|---|
| `modelVisibilityAllowlist` | `[]` | `["auto/*","duckduckgo-web/*","aihorde/*"]` | Applied + verified; 199 -> 196 models; oc/unc hidden; routing unaffected |

All other features audited and left unchanged (deferred/not-applicable as documented above). Zero paid calls.
