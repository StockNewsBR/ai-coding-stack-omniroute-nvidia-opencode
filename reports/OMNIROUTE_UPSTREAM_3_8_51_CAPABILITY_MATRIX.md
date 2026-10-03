# OmniRoute 3.8.51 — Upstream Capability Matrix (R2)

Mission: OMNIROUTE_VPS_SUPER_CONFIGURATION_AUDIT_R2 — 2026-10-03
Source of truth: production VPS image `diegosouzapw/omniroute@sha256:8bd462c9f60d8eda79329cfbb6ea7ea723505fe7721beb944f3d43835409e218`
(upstream release commit `c1e30b76`, official release 2026-09-30; no 3.8.52/beta/rc used).

Classification legend: `ENABLED_ALREADY` · `ADOPT_NOW` · `TEST_ONLY` · `DEFER` · `NOT_RELEVANT` · `CONFLICT_FREE_ONLY`.

## 1. Routing

| Capability | Status | Notes |
|---|---|---|
| Adaptive explainable scoring (allocation, health, circuit, quota, latency, reliability, model preference, cost) | ENABLED_ALREADY | Active on dispatch; decision surface exposed via `x-omniroute-decision`. |
| Strict zero-cost policy (`freeAccessPolicy=strict`) | ENABLED_ALREADY | Already on since before R1. Unclassified models excluded before dispatch. |
| Auto-combos `auto/<category>:<tier>` (coding/reasoning/vision/chat/multimodal × fast/cheap/reliable/free/pro) | ENABLED_ALREADY | Built-ins exist but currently starve: pools resolve to `opencode` only (cooldown) or are empty. Fail-open semantics (constraint with no match → full pool), still gated by strict policy. |
| Custom combos (`/api/combos` CRUD) | ADOPT_NOW | **Adopted in R2**: 6 `aimm-*` free-only combos (see `ROUTING_PROFILES.md`). |
| Deterministic routing/override (`OMNIROUTE_SELF_HOSTED_PROVIDERS`, `x-omniroute-route-decision`) | TEST_ONLY | Only useful with self-hosted provider pools; none configured. |
| Route preview `POST /api/omniroute/route/preview` | NOT_RELEVANT | Schema requires caller-supplied candidate factor objects (providerId/modelId/capabilityScore/allocation/factors); not a resolver. Dispatch headers already explain routes. |
| Subscription ladder / `auto/subscription` / `auto/thrifty` | CONFLICT_FREE_ONLY | Ladders presume plan-backed (paid) capacity; not usable under FREE_ONLY. Left untouched. |
| Headroom / reset-aware strategies | TEST_ONLY | Meaningful only with credentialed quota sources (none configured). |

## 2. Free tier / quota

| Capability | Status | Notes |
|---|---|---|
| Free-tier eligibility buckets + `hardStopGuaranteed` + usage adapters | ENABLED_ALREADY | Core of strict policy; keyless providers pass only via genuine no-auth path. |
| `customModels[].isFree` | NOT_RELEVANT (for us) | No custom model registrations needed; keyless free set already classified by upstream. |
| Quota telemetry (`healthy/approaching_limit/exhausted/unavailable/unknown`) | ENABLED_ALREADY | Visible in monitoring; unknown ≠ exhausted. |
| Quota-aware routing + auto refresh (`autoRefreshProviderQuota`, 180s) | DEFER | Zero configured credentialed connections; nothing to refresh. Revisit if keys are added. |
| Quota Share (multi-key fair share) | NOT_RELEVANT | Single keyless accounts; no shared connections. |
| Local 429 cooldown (not quota exhaustion) | ENABLED_ALREADY | Confirmed: `oc/deepseek-v4-flash-free` 429 `model_cooldown` with `retry_after`, did not disable provider. |
| Expiry-first account fallback | ENABLED_ALREADY (inert) | No credential pools; keyless paths unaffected. |

## 3. Failover / retries / breakers

| Capability | Status | Notes |
|---|---|---|
| Failure classification (transient vs auth/permission/invalid/unavailable) | ENABLED_ALREADY | Verified: cooling 429 fell over FREE→FREE; 403/401 would fail clean. |
| Cross-provider failover (up to 3 attempts) | ENABLED_ALREADY | Proven with `aimm-failover-proof` (`x-omniroute-fallback-attempts: 1`). |
| Circuit breaker closed/open/half_open + probe recovery | ENABLED_ALREADY | 4 keyless providers tracked; all closed, 0 open. |
| Bounded retries / `requestRetry=3`, `maxRetryIntervalSec=30` | ENABLED_ALREADY | Upstream defaults retained. |
| Proxy pools skip recently failed (`PROXY_SKIP_RECENTLY_FAILED`) | ENABLED_ALREADY (default) | `proxyEnabled=true`; no proxy pool in use yet. |

## 4. Security

| Capability | Status | Notes |
|---|---|---|
| Management session auth + requireLogin | ENABLED_ALREADY | `/api/*` without cookie → 401. |
| `REQUIRE_API_KEY` on inference | ENABLED_ALREADY | `/v1/models` and chat → 401 without Bearer. |
| Loopback-only management/version manager, IP allow/deny on connection | ENABLED_ALREADY | Container publishes `127.0.0.1:20128` only; UFW has no 20128 rule. |
| Constant-time token comparison / OAuth route management auth / GHSA-9p9m realm isolation | ENABLED_ALREADY | Inherited from image upgrade. |
| Credential redaction in logs/errors (`credentialRedactionEnabled`) | ADOPT_NOW | **Adopted in R2**: was `false`, now `true`. Verified redaction active in provider error strings. |
| Call-log artifact pipeline (`call_log_pipeline_enabled`) | DEFER | Off by default; keeps prompts out of disk artifacts. Headers + DB call logs already give observability. Revisit only with redaction guarantees. |

## 5. Observability

| Capability | Status | Notes |
|---|---|---|
| `x-omniroute-*` decision/latency/cost/version headers | ENABLED_ALREADY | Confirmed on chat and image routes; cost `0.0000000000`. |
| `/api/monitoring/health` (breakers, admission, quota, WAL) | ENABLED_ALREADY | Used in R2 audits. |
| Continuous call-log export | DEFER | See call-log pipeline above. |
| Radar (rate-limit surfacing) | NOT_RELEVANT | Admin dashboard feature; no operational need on headless VPS. |

## 6. Compression

| Capability | Status | Notes |
|---|---|---|
| Caveman (lite→ultra), RTK, Omniglyph, stacked pipeline | TEST_ONLY | Benchmarked `lite` vs `off`: **0 token savings** on prose payload, +~0.2s latency → reverted to `off`. See `COMPRESSION_BENCHMARK_IAMM.md`. |
| `rtk` for tool/terminal output | DEFER | Potentially useful for coding agents later; not enabled for IAMM text workloads. |

## 7. Integrations / ecosystem

| Capability | Status | Notes |
|---|---|---|
| `@omniroute/opencode-plugin-v2` | DEFER | Requires OpenCode 2.x (`@opencode/plugin >=2.0.12`); local OpenCode is 1.18.34. Migration notes prepared. |
| CLI setup commands / Remote Mode | TEST_ONLY | Operationally relevant only for connecting local tools to the VPS gateway; loopback + SSH tunnel is the canonical operator path today. |
| MCP / A2A | NOT_RELEVANT | Both disabled (`mcpEnabled=false`, `a2aEnabled=false`); no requirement. |
| Video/audio bridge (Veo free) | TEST_ONLY | 4 video models present (`veoaifree-web/*`, `veo-free/*`); not exercised. |
| AgentRouter / Cheaper Inference / Kimi / others | NOT_PRESENT / CONFLICT_FREE_ONLY | Not in the 3.8.51 system catalog on this instance; AgentRouter credits are trial/credit (not FREE_FOREVER); Cheaper Inference is paid. Excluded from FREE routing by policy. |

## 8. Env contract delta (3.8.50 → 3.8.51)

- **New (commented, unset by us):** `OMNIROUTE_PLUGINS_DIR`, `OMNIROUTE_SKIP_NATIVE_DEP_CHECK`, `APP_BIND_HOST`/`QDRANT_BIND_HOST`/`BIFROST_BIND_HOST`, `DEEP_HEALTH_CHECK_ENABLED`, `OMNIROUTE_CHAT_MAX_INFLIGHT_BYTES`, `OMNIROUTE_CHAT_ADMISSION_QUEUE_MS`, `OMNIROUTE_DISABLE_CONVERSATION_TRACKING`, `OMNIROUTE_TRUSTED_PROXIES`, `PROXY_SKIP_RECENTLY_FAILED`, `SELECTOR_CONTROL_ALLOWLIST`, stall/watchdog/response timeout vars, `OMNIROUTE_SELF_HOSTED_PROVIDERS[_FILE|_API_KEY|_STRATEGY]`, `OPENCODE_FREE_TIER_*` contract vars.
- **Removed:** `OMNIROUTE_CGPT_WEB_IMAGE_TIMEOUT_MS`, `OMNIROUTE_CGPT_WEB_IMAGE_CACHE_MAX_MB`, `OMNIROUTE_CGPT_WEB_PRO_TIMEOUT_MS`, `OMNIROUTE_CGPT_WEB_PRO_POLL_INTERVAL_MS`, `OPENCODE_GO_WORKSPACE_ID`, `OPENCODE_GO_AUTH_COOKIE`, `OMNIROUTE_OPENCODE_GO_*`. Drift check on VPS env: **0 removed-var references**.
- **Default changes:** `CREDENTIAL_HEALTH_CHECK_INTERVAL` 300000→3600000 ms; `OPENCODE_SYNTHESIZE_CLI_HEADERS` default on; `OMNIROUTE_OPENCODE_QUOTA_URL` → `https://opencode.ai/zen/go/v1/usage`.
- **DB migrations:** VPS applied 163–186 (24 migrations, pre-migration snapshot taken by the app); local workstation applied through 196.

## 9. Decision summary

- **ADOPT_NOW:** credential redaction on; `aimm-*` free-only routing profiles.
- **ENABLED_ALREADY:** strict zero-cost policy, failure classification, failover, breakers, quota telemetry, decision headers, auth hardening inherited with 3.8.51.
- **TEST_ONLY:** compression (reverted), video bridge, CLI/Remote Mode, deterministic routing.
- **DEFER:** OpenCode plugin-v2, quota auto-refresh, call-log pipeline, RTK for coding agents, `customModels.isFree` (unused).
- **NOT_RELEVANT:** Radar, MCP/A2A, Quota Share, route preview, subscription/thrifty ladders.
- **CONFLICT_FREE_ONLY:** paid/credit-backed supporter routes (Cheaper Inference, AgentRouter credits, plan ladders) — remain disabled.
