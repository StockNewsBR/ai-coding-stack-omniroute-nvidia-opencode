# OmniRoute v3.8.50 → v3.8.51 Upstream Delta

- Source of truth: `diegosouzapw/OmniRoute` release `v3.8.51` (release published 2026-09-30; tag commit `c1e30b76`; release body 96,641 chars / 2,022 changes: 235 features, 1,454 fixes, 333 maintenance; 1,972 commits; 325 contributors).
- npm `omniroute@3.8.51` (latest; integrity `sha512-VwwSt+…`); engines: `node >=22.22.2 <23 || >=24.0.0 <27`.
- Docker Hub tag `3.8.51` resolved at pull time to digest `sha256:8bd462c9f60d8eda79329cfbb6ea7ea723505fe7721beb944f3d43835409e218` (verified inside image: app 3.8.51, Node v26.10.0). No `v3.8.51` tag.
- `release/v3.8.52` branch already exists upstream (`23a11484…`) — do NOT install (see `docs/OMNIROUTE_3_8_52_WATCHLIST.md`).
- Code delta `v3.8.50...v3.8.51`: 31 commits, mostly release engineering, plus a Claude mid-conversation system-passthrough SSE fix, an npm 11 install fix and DB install/upgrade schema convergence.

## Environment variables (`.env.example` delta)

New (all commented by default): `OMNIROUTE_PLUGINS_DIR`, `OMNIROUTE_SKIP_NATIVE_DEP_CHECK`, `APP_BIND_HOST`/`QDRANT_BIND_HOST`/`BIFROST_BIND_HOST` (default `127.0.0.1`), `NEXT_PUBLIC_PORT`, `DEEP_HEALTH_CHECK_ENABLED`, `OMNIROUTE_CHAT_MAX_INFLIGHT_BYTES` (auto byte budget, default 25% heap, clamp 8 MiB–2 GiB), `OMNIROUTE_CHAT_ADMISSION_QUEUE_MS`, `OMNIROUTE_DISABLE_CONVERSATION_TRACKING`, `OMNIROUTE_TRUSTED_PROXIES`, `PROXY_SKIP_RECENTLY_FAILED`, `SELECTOR_CONTROL_ALLOWLIST`, `PROXY_POOL_SHARED_EGRESS_ORDER`, `PROXY_WEBHOOK_REBOUND_MS`, `CLI_PRIME_AGENT_BIN`, `OMNIROUTE_CORPUS_CACHE_SIZE`, `TRAE_WEB_ORIGIN`, `MUSE_CODE_OAUTH_CLIENT_ID`, `OMNIROUTE_VISION_BRIDGE_NEGATIVE_CACHE_MS`, `CODEX_USER_AGENT`/`CODEX_CLIENT_VERSION`, `CLAUDE_CODE_CLIENT_VERSION`, `GITHUB_COPILOT_CLI_VERSION`, `COPILOT_INTEGRATION_ID`, `OMNIROUTE_LOCAL_DIRECT_HEADERS_TIMEOUT_MS`, `OMNIROUTE_DIRECT_RESPONSE_RETRY_TIMEOUT_MS`, `TAVILY_BASE_URL`, `OBSCURA_*`, `STREAM_ACTIVE_TIMEOUT_MS`, `TLS_FIRST_BYTE_WATCHDOG_MS`, `OPENCODE_RESPONSES_STALL_ROTATION`, `OPENCODE_PARK_AND_RESUME`, `STREAM_READINESS_STALL_RETRY`, `OPENCODE_POOL_RESELECT`, `RESPONSES_FIRST_BYTE_TIMEOUT_MS`, `OPENCODE_RESPONSES_HEADERS_WAIT_MS`/`_MAX_ROTATIONS`, `FLUSH_EMPTY_RETRY_ENABLED`, `CHAT_LOG_ARRAY_TAIL_ITEMS`, `CHAT_LOG_MAX_DEPTH`, `PROXY_LOG_FIRST_CHUNK_TIMING`, `OMNIROUTE_PRESSURE_SELF_RESTART`/`_AFTER_MS`, `OMNIROUTE_PRESSURE_PSI_DISABLED`, `OMNIROUTE_READY_TIMEOUT_MS`, `CATALOG_BUILD_TIMEOUT_MS`, `OMNIROUTE_SYNCED_CATALOG_STALE_AFTER_MS`, `CLOUDFLARED_PROTOCOL`/`CONFIG`, `OMNIROUTE_SELF_HOSTED_PROVIDERS`/`_FILE`/`_API_KEY`/`_STRATEGY`/`_STRATEGY_FILE`, `OPENCODE_FREE_TIER_REQUEST_CONTRACT`, `OPENCODE_FREE_TIER_PLACEHOLDER_TOOLS`.

Changed defaults: `CREDENTIAL_HEALTH_CHECK_INTERVAL` 300000 → 3600000 ms; `OPENCODE_SYNTHESIZE_CLI_HEADERS` off → on; `DISABLE_SQLITE_AUTO_BACKUP` now routine-only (migration safety snapshot still mandatory); Turbopack also for production builds.

Removed: `OMNIROUTE_CGPT_WEB_IMAGE_TIMEOUT_MS`, `OMNIROUTE_CGPT_WEB_IMAGE_CACHE_MAX_MB`, `OMNIROUTE_CGPT_WEB_PRO_TIMEOUT_MS`, `OMNIROUTE_CGPT_WEB_PRO_POLL_INTERVAL_MS`, `OPENCODE_GO_WORKSPACE_ID` (+`OMNIROUTE_` alias), `OPENCODE_GO_AUTH_COOKIE` (+alias), `OMNIROUTE_OPENCODE_GO_DASHBOARD_URL`.

Revised: `OMNIROUTE_OPENCODE_QUOTA_URL` → `https://opencode.ai/zen/go/v1/usage`.

## Features relevant to FREE_ONLY / routing / security

- Eligibility-gated free-tier buckets; local-cooldown 429 no longer interpreted as quota exhaustion.
- `customModels[].isFree` respected as the first door by `isFreeModel()`; `hidePaidModels` honors it.
- Expiry-first account fallback (ranks usable accounts by hours until reset); per-kind breaker cooldown escalation and breaker close on a successful probe.
- Proxy pools skip recently refused members (`PROXY_SKIP_RECENTLY_FAILED=true` default).
- Adaptive reasoning effort (auto) and hierarchical concurrency admission (`v8_heap` inflight-byte budget).
- `auto/thrifty` + `auto/subscription` routing families (thrifty orders subscription → keyless → free → cheap → premium, hard-stops before overage, fails closed).
- DeepSeek V4.1+: `deepseek-v4` regex now matches v4.1+; registry default context 1,000,000 for the flash entry; `deepseek-v4.1-flash` registered vision-capable; native max reasoning tier only for first-party `deepseek`/`ds` namespaces (routed namespaces keep canonical behavior).
- Security: pre-request hooks isolated realm (GHSA-9p9m), IP allow/deny judged on connection, trailing-dot internal host handling, management auth enforced on OAuth routes, constant-time token comparison, loopback-only version manager, traversal refused in the Codex `/v1/responses` subpath, linear-time tool-markup scanners.

## Classification for this stack

| Item | Class | Reason |
|---|---|---|
| Security fixes above | ADOPT_NOW (inherited) | delivered by the version bump; no config change needed |
| `customModels[].isFree` semantics | ADOPT_NOW (policy) | aligns with FREE_ONLY; no custom models configured yet |
| 429 local-cooldown distinction | ADOPT_NOW (inherited) | prevents false quota-exhaustion classification |
| Cleanup-timer SQLITE_ERROR fix | ADOPT_NOW (inherited) | observed resolved post-upgrade |
| `DEEP_HEALTH_CHECK_ENABLED` | TEST_ONLY | requires auth-aware probing; default off |
| `OPENCODE_FREE_TIER_*` contract | TEST_ONLY | relevant only when OpenCode client drives the request |
| Pressure self-restart / admission queue | DEFER | defaults acceptable; revisit under load |
| `@omniroute/opencode-plugin-v2` | DEFER | requires OpenCode 2.x; local is 1.18.34 |
| Video/audio bridge, Cloudflared | DEFER | not needed by IAMM free-first routes now |
| `auto/thrifty` / `auto/subscription` | TEST_ONLY (policy layer) | includes premium tiers after free; keep disabled by free-only settings and only enable with hidePaidModels=true verified |
| Bedrock/Trae/Muse Code OAuth paths | NOT_RELEVANT | paid or unused in this stack |
| Any paid fallback feature | CONFLICTS_WITH_FREE_ONLY | remains disabled (`PAID_FALLBACK=0`, strict free policy) |

No env changes were activated blindly: only the version bump and its inherited security/behavior fixes were adopted; everything else stays default/off until explicitly tested.
