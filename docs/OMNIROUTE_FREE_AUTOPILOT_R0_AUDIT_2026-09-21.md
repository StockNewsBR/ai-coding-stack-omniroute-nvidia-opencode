# OmniRoute Free Autopilot R0 Audit

Mission: OMNIROUTE_FREE_AUTOPILOT_R0_AUDIT_TOPOLOGY_AND_GAP_MATRIX  
Model: Codex Luna  
Audit date: 2026-09-21  
Scope: read-first / evidence-first; no architecture implementation

## Executive result

The live gateway is a healthy OmniRoute 3.8.50 packaged installation on
127.0.0.1:20128. It is started by a user systemd unit through a wrapper and
pnpm global package; it is not a development checkout.

The requested free-autopilot foundation is substantially already present:

- virtual auto routes, named combos, provider/model discovery, pricing
  metadata, provider health probes, call history, quota snapshots, cooldowns,
  circuit-breaker settings, search, image generation, A2A, eval, semantic
  cache, and routing explanation surfaces are present;
- strict zero-cost filtering is implemented in the installed package but is
  opt-in and currently disabled: freeAccessPolicy=off;
- the live runtime exposes 38 auto/* aliases, nine persisted combos, six A2A
  skills, 46 catalog keys, and 37 configured provider identities;
- auto/search:free, auto/image-gen:free, auto/vision:free, and
  auto/multimodal:free are not present in the live auto catalog;
- IAMM and StockNewsBR use different client paths but share the same local
  OmniRoute state and provider pool. No enforced tenant/client routing
  isolation was demonstrated;
- current upstream release/v3.8.51 adds stricter connection-billing/model-
  exposure controls, newer search backends, cache/resilience hardening, and
  capability fixes. It must remain LAB-only.

No client, production service, provider credential, or OmniRoute installation
was modified by this audit.

## Classification key

The feature counts in the final report count the 19 decisions in the
Requested-feature classification table, not every low-level source file.

- NATIVE_WORKING: present and evidenced in the live runtime or installed
  source.
- NATIVE_NEEDS_CONFIG: present, but disabled, empty, stale, or not wired to
  the required policy.
- NATIVE_BROKEN: present but with a current known defect or incomplete
  behavior.
- UPSTREAM_3_8_51_ONLY: not present in the installed 3.8.50 package and
  added by the inspected v3.8.51 branch.
- CONFIRMED_GAP: required behavior or alias is absent from the live
  installation/topology.
- NOT_NEEDED: outside the requested live path.

Free-state is deliberately not a boolean:

- FREE_VERIFIED: a curated/free-like route also has a historical successful
  real completion in the call log. This does not prove that every model or
  credential is billing-safe.
- SELF_HOSTED: local inference with no upstream billing.
- FREE_UNKNOWN: a free-like catalog entry exists, but current access,
  billing, or quota was not proven.
- PAID: known metered/paid service.
- CREDIT_BACKED: access depends on a grant, trial, or credit; it is not
  FREE_VERIFIED.
- UNKNOWN: no safe cost conclusion.

## Live topology

### OmniRoute installation

| Field | Evidence |
|---|---|
| OMNIROUTE_BINARY | /home/dcima/.local/bin/omniroute; the service wrapper invokes /home/dcima/.local/share/pnpm/bin/omniroute |
| OMNIROUTE_EXECSTART | /home/dcima/.local/bin/omniroute-systemd-run |
| OMNIROUTE_INSTALL_TYPE | pnpm global packaged install |
| OMNIROUTE_SOURCE_PATH | /home/dcima/.local/share/pnpm/store/v11/links/@/omniroute/3.8.50/0ac422879d19374afeb442dde854f53daaceb2e06a8048f6577d10517b623962/node_modules/omniroute |
| OMNIROUTE_VERSION | 3.8.50 |
| OMNIROUTE_BUILD_SHA | dea6bb8 |
| OMNIROUTE_GIT_HEAD | null in the package metadata; no .git directory in the installed package |
| Config directory | /home/dcima/.omniroute |
| User service | /home/dcima/.config/systemd/user/omniroute.service |
| Listener | 127.0.0.1:20128 |
| Process | node .../omniroute/bin/omniroute.mjs serve --no-open --no-recovery |
| Runtime state | supervisor PID 440; server PID 641; service active |
| API auth | required for protected API routes; credential values were not recorded |

The wrapper sets HOSTNAME=127.0.0.1. The service uses Restart=always and an
ExecStartPost helper. The installed package is a built artifact, not a safe
place for source edits.

Two other loopback listeners, 127.0.0.1:20131 and 127.0.0.1:20132, were
observed during the socket scan. Their owners were not resolved from the
available process permissions and no client reference was established. They
remain UNKNOWN and are not treated as OmniRoute endpoints.

### Connected-process graph

~~~text
OpenCode configuration
  -> OpenAI-compatible HTTP
  -> OmniRoute 127.0.0.1:20128/v1

Hermes custom provider
  -> chat_completions
  -> OmniRoute 127.0.0.1:20128

DeepSeek Harness web :3080
  -> Hermes gateway :9900
  -> OmniRoute 127.0.0.1:20128

StockNewsBR Harness A2A bridge :9901
  -> reads OmniRoute model catalog/free metadata
  -> invokes Harness/Hermes for execution
  -> Hermes gateway :9900
  -> OmniRoute 127.0.0.1:20128

IAMM API :8010
  -> direct OmniRouteAIProvider
  -> OmniRoute 127.0.0.1:20128
  -> optional Hermes control/A2A path :9900

FCC :8082
  -> separate FCC/provider path
  -> no proven OmniRoute :20128 edge
~~~

Relevant healthy local endpoints at audit time:

| Service | Endpoint | Result |
|---|---|---|
| OmniRoute | GET /api/health | HTTP 200 |
| Hermes gateway | GET /health | HTTP 200 |
| DeepSeek Harness | GET /health | HTTP 200 HTML application shell |
| StockNewsBR A2A bridge | GET /health | HTTP 200, READY |
| FCC | GET /health | HTTP 200, healthy |
| IAMM | GET /health | HTTP 200, live_locked / FREE_ONLY |
| IAMM Hermes integration | GET /health/integrations/hermes | HTTP 200, READY |

## Connected client map and compatibility baseline

No completion probe was sent by this audit. Existing completion counts below
are historical call-log evidence and are not attributed to this audit.

| Client | Topology | BASE_URL / endpoint class | Request style | Model or alias | Pinned or auto | Streaming / tools | Current status |
|---|---|---|---|---|---|---|---|
| Hermes Agent | OMNIROUTE_DOWNSTREAM | http://127.0.0.1:20128; OpenAI chat completions | chat_completions | default zai/glm-4.7-flash; named OMNIROUTE combos in presets | explicit default and named combos; auto aliases available | configured capability, not completion-smoked here | FAIL_EXISTING: gateway health PASS; historical direct zai calls 48/112 successful |
| DeepSeek Harness | OMNIROUTE_INDIRECT | Harness :3080; Hermes :9900; OmniRoute catalog :20128 | Harness web plus Hermes auxiliary/A2A | preferred zai/glm-4.7-flash; free-model catalog selection | preferred explicit model plus catalog-driven selection | service READY; inference not smoked | NOT_TESTED_WITH_REASON: health and bridge readiness only |
| OpenCode | OMNIROUTE_DOWNSTREAM | http://localhost:20128/v1; OpenAI-compatible | OpenAI-compatible chat | default auto/coding:free; small auto/best-free; explicit provider/free entries also configured | mixed: auto defaults plus explicit pinned entries | SDK/config supports streaming and tools; app not running during audit | NOT_TESTED_WITH_REASON: config present, no OpenCode process observed; historical OpenCode key traffic had substantial errors |
| FCC / NVIDIA path | OUT_OF_PATH | FCC :8082; separate FCC protocol/provider path | FCC native proxy | NVIDIA/provider path outside OmniRoute | not applicable | FCC health only | OUT_OF_PATH |
| IAMM | OMNIROUTE_DOWNSTREAM | API :8010; direct 127.0.0.1:20128 and optional Hermes :9900 | OpenAI chat through OmniRouteAIProvider | source selects explicit FREE or LOCAL candidates; IAMM runtime reports FREE_ONLY | explicit free/local selection; no paid fallback in source | completion not smoked | NOT_TESTED_WITH_REASON: IAMM and Hermes health PASS, no inference probe |
| Other OpenAI-compatible callers | UNKNOWN / possible downstream | protected /v1 routes on :20128 | OpenAI-compatible | API-key names include OmniRoute route and OpenCode variants | mixed | catalog/route validation only | NOT_TESTED_WITH_REASON |

Baseline fields:

~~~text
HERMES_BASELINE=FAIL_EXISTING
DEEPSEEK_HARNESS_BASELINE=NOT_TESTED_WITH_REASON
OPENCODE_BASELINE=NOT_TESTED_WITH_REASON
FCC_NVIDIA_BASELINE=OUT_OF_PATH
OPENAI_COMPAT_BASELINE=NOT_TESTED_WITH_REASON
~~~

The safe protocol smoke consisted of protected model/catalog reads and
malformed-body validation only:

- GET /v1/models returned HTTP 200;
- GET /v1/search and GET /v1/images/generations returned HTTP 200 with
  provider/model lists;
- POST /v1/search with an empty object returned HTTP 400 for the missing
  query;
- POST /v1/images/generations with an empty object returned HTTP 400 for the
  invalid request;
- no provider inference, search query, image generation, or paid/unknown-cost
  completion was initiated.

## Pinned routing invariant

The client configurations prove that explicit and adaptive traffic are
already mixed:

- Hermes defaults to explicit zai/glm-4.7-flash and named OmniRoute combos;
- OpenCode defaults to auto/coding:free and auto/best-free but also exposes
  explicit provider/model entries;
- IAMM source selects explicit free/local candidates after catalog
  inspection;
- Harness prefers explicit zai/glm-4.7-flash while its catalog reader can
  select a zero-priced model.

Required invariant for future work:

~~~text
PINNED_REQUEST
  -> preserve the same explicit provider/model/connection semantics

AUTO_REQUEST
  -> may use adaptive selection, free-only filtering, quota, health,
     cooldown, and quality signals
~~~

The call-log model_pinned field was not a reliable proof source in this
installation and was not used to infer the invariant. The invariant is based
on client configuration and the installed/upstream routing source.

~~~text
PINNED_MODEL_BASELINE=explicit provider/model IDs and named combos are in use
PINNED_PROVIDER_BASELINE=explicit provider prefixes/connections are in use
AUTO_ROUTE_BASELINE=38 live auto/* aliases; 9 persisted combos; freeAccessPolicy=off
~~~

## Provider matrix

The live database contains 42 provider connection rows, 40 active rows, and
37 distinct configured provider identities. The protected model catalog has
46 top-level keys. The catalog-only keys include chipotle,
cloudflare-playground, codex-app-server, combo, devin-cli-agentic,
duckduckgo-web, felo-web, theoldllm, uncloseai, veoaifree-web, and zcode.
The configured-but-not-currently-listed keys are kilocode and llm7.

Credential is only a type/status marker: API, OAuth, or PSD means that some
credential/provider-specific configuration exists. No credential value is
included.

REAL_REQUEST_PASS means at least one historical HTTP 2xx chat/completion
response for the provider. A dash means no successful real completion was
observed; it is not a claim that the provider is unusable. The 42,992
provider-test calls are health/model-admission probes, not completion proof.

| Provider (catalog models) | Conn. | Credential | Auth valid | Real request pass | Free state | Free verified | Quota snapshot | Health / cooldown | Routing eligible |
|---|---:|---|---|---|---|---|---|---|---|
| agnes (5) | 1 | API | yes | — | FREE_UNKNOWN | no | no | MIXED / CLEAR | yes |
| aihorde (211) | 1 | API | yes | — | FREE_UNKNOWN | no | no | PASS / CLEAR | yes |
| amazon-q (2) | 1 | OAuth | yes | — | UNKNOWN | no | yes | PASS / CLEAR | yes |
| antigravity (24) | 1 | OAuth | yes | — | UNKNOWN | no | yes | PASS / CLEAR | yes |
| auggie (28) | 1 | PSD | no | — | UNKNOWN | no | no | AUTH_FAIL / CLEAR | no |
| cerebras (4) | 1 | API | yes | — | FREE_UNKNOWN | no | no | PASS / CLEAR | yes |
| cheaperinference (191) | 1 | API | yes | — | UNKNOWN | no | no | MIXED / CLEAR | yes |
| cline (1670) | 1 | OAuth | no | yes | FREE_VERIFIED | yes | no | AUTH_FAIL / CLEAR | no |
| clinepass (32) | 1 | API | yes | — | UNKNOWN | no | no | PASS / CLEAR | yes |
| cloudflare-ai (120) | 1 | API | yes | yes | FREE_VERIFIED | yes | no | PASS / CLEAR | yes |
| codex (81) | 1 | OAuth | yes | — | UNKNOWN | no | yes | MIXED / CLEAR | yes |
| deepai (1) | 1 | API | no | — | UNKNOWN | no | no | AUTH_FAIL / CLEAR | no |
| deepseek (22) | 1 | API | yes | — | CREDIT_BACKED | no | yes | PASS / CLEAR | yes |
| free-ai (553) | 1 | API | yes | — | FREE_UNKNOWN | no | no | PASS / CLEAR | yes |
| freemodel-dev (14) | 1 | API | yes | — | CREDIT_BACKED | no | no | PASS / CLEAR | yes |
| gemini (62) | 1 | API | yes | — | FREE_UNKNOWN | no | no | PASS / CLEAR | yes |
| github (214) | 1 | OAuth | yes | — | FREE_UNKNOWN | no | yes | PASS / CLEAR | yes |
| github-models (2) | 1 | API | UNKNOWN | — | UNKNOWN | no | no | UNKNOWN / CLEAR | no |
| grok-cli (6) | 1 | OAuth | yes | — | UNKNOWN | no | no | PASS / CLEAR | yes |
| groq (18) | 2 | API | yes | — | FREE_UNKNOWN | no | no | PASS / CLEAR | yes |
| jules (1) | 1 | API | yes | — | UNKNOWN | no | no | MIXED / CLEAR | yes |
| kilocode (absent) | 1 | OAuth | no | — | UNKNOWN | no | no | BANNED / CLEAR | no |
| llm7 (absent) | 1 | API | UNKNOWN | — | FREE_UNKNOWN | no | no | STALE / CLEAR | no |
| lmarena (153) | 1 | API | yes | — | UNKNOWN | no | no | PASS / CLEAR | yes |
| mistral (49) | 2 | API | yes | — | FREE_UNKNOWN | no | no | MIXED / CLEAR | yes |
| nvidia (131) | 1 | API | yes | yes | CREDIT_BACKED | no | no | PASS / CLEAR | yes |
| ollama-cloud (90) | 2 | API | yes | — | FREE_UNKNOWN | no | no | PASS / CLEAR | yes |
| opencode (241) | 1 | PSD | yes | yes | FREE_VERIFIED | yes | no | PASS / CLEAR | yes |
| opencode-zen (120) | 2 | API | yes | yes | FREE_VERIFIED | yes | no | PASS / CLEAR | yes |
| openference (46) | 1 | OAuth | yes | — | UNKNOWN | no | no | MIXED / CLEAR | yes |
| openrouter (82) | 1 | API | yes | yes | FREE_VERIFIED | yes | no | PASS / CLEAR | yes |
| orcarouter (20) | 1 | API | yes | — | UNKNOWN | no | no | MIXED / CLEAR | yes |
| pollinations (414) | 1 | API | yes | — | FREE_UNKNOWN | no | no | MIXED / CLEAR | yes |
| siliconflow (117) | 1 | API | yes | — | FREE_UNKNOWN | no | no | PASS / CLEAR | yes |
| tavily-search (2) | 1 | API | yes | — | UNKNOWN | no | no | PASS / CLEAR | yes |
| zai (7) | 2 | API | yes | yes | UNKNOWN | no | no | MIXED / CLEAR | yes |
| zenmux (476) | 1 | API | yes | — | UNKNOWN | no | no | MIXED / CLEAR | yes |

Free-state observations:

- v3.8.50 contains 456 curated free-model entries with explicit
  freeType values such as keyless, recurring, one-time-initial,
  recurring-credit, and recurring-uncapped.
- NVIDIA is not FREE_VERIFIED: its current successful real completion used a
  model with positive catalog pricing, and trial/AWS/promotional credits are
  CREDIT_BACKED, not free.
- OpenCode/OpenCode Zen/OpenRouter/Cline/Cloudflare have historical
  successful free-named or known-free route responses. This proves response
  reachability, not a hard billing stop.
- A provider or model name containing free, a zero-priced catalog object, or
  a successful probe is not sufficient for strict free eligibility.

## Live feature inventory: v3.8.50

| Capability | Live/source evidence | v3.8.50 status |
|---|---|---|
| auto, auto/smart, auto/coding, auto/fast, auto/offline, auto/vision | 38 auto/* entries in /v1/models | NATIVE_WORKING |
| auto/coding:free | Present in /v1/models; policy currently off | NATIVE_NEEDS_CONFIG |
| auto/multimodal:free | Not in /v1/models | CONFIRMED_GAP |
| Provider discovery | 46 catalog keys; provider API; 37 configured identities | NATIVE_WORKING |
| Model discovery | 5,000+ model rows in the protected catalog plus catalog metadata | NATIVE_WORKING |
| Free-tier metadata | Curated 456-entry model catalog, freeType, ToS, hardStopGuaranteed | NATIVE_WORKING, not fully live-verified |
| Cost metadata | Model pricing is exposed; static provider cost/free data exists | NATIVE_WORKING |
| Provider health | /api/health, provider tests, status fields, health timestamps | NATIVE_WORKING |
| Real completion probes | Provider test endpoint and historical real chat/completion records exist | NATIVE_WORKING; R0 did not send new probes |
| Success/failure history | call_logs contains 43,897 records at audit time | NATIVE_WORKING |
| Quota awareness/headroom | 39,424 quota snapshots; strict resolver and auto refresh exist, but only five provider identities have persisted snapshots and preflight is off | NATIVE_NEEDS_CONFIG |
| Rate-limit awareness | lockout, retry, rate-limit and cooldown settings are enabled | NATIVE_WORKING |
| Circuit breaker | model lockout, provider breaker settings, and persisted domain breaker state exist | NATIVE_WORKING, scope-limited |
| Cooldown and automatic recovery | connection cooldown, wait-for-cooldown, retry, half-open recovery paths exist | NATIVE_WORKING |
| Persistent circuit state | domain_circuit_breakers has a persisted HALF_OPEN lma row; connection_runtime_state is empty | NATIVE_WORKING for domain scope; provider scope unproven |
| /v1/search | GET lists 17 models/providers; POST validation route exists | NATIVE_WORKING |
| Search providers/fallback | search registry, configured search providers, fallback handler | NATIVE_WORKING |
| Search cache | in-memory TTL cache and request coalescing; API stats are live | NATIVE_WORKING |
| Search deduplication | coalescing exists; v3.8.51 fixes a concurrent deduplication-hash defect | NATIVE_BROKEN at the affected edge case |
| /v1/images/generations | GET lists 230 image models; POST validation route exists | NATIVE_WORKING |
| Image generation/editing/provider discovery | image registry, generation/edit routes, image provider handlers | NATIVE_WORKING |
| Vision/image input | capability metadata, input modalities, image registry, vision bridge code | NATIVE_WORKING |
| Vision versus image generation separation | chat and image routes are distinct; invalid image-generation requests are rejected on the correct route | NATIVE_WORKING |
| A2A | agent card exposes smart-routing, quota-management, provider-discovery, cost-analysis, health-report, and list-capabilities | NATIVE_WORKING; zero tasks currently persisted |
| Routing analytics/history | call logs and explain route exist; routing_decisions table is empty and pipeline flag is off | NATIVE_NEEDS_CONFIG |
| Quality feedback | routing quality source/sink exists; no durable quality decision history was evidenced | NATIVE_NEEDS_CONFIG |
| Route explainability | /api/v1/explain/routing returned live in-memory events and sinks | NATIVE_WORKING |
| Semantic/routing cache | semantic_cache has 419 rows; cache health reports healthy | NATIVE_WORKING |
| RouteLab/evals | /api/evals returns the built-in 10-case golden set; no eval run/suite rows exist | NATIVE_NEEDS_CONFIG |

Important live settings:

| Setting | Current value | Meaning |
|---|---|---|
| freeAccessPolicy | off | strict zero-cost filter is not applied to auto pools |
| hidePaidModels | false | catalog visibility is not a billing safety policy |
| autoRefreshProviderQuota | true | refresh enabled, interval 180 seconds |
| quotaPreflight.enabled | false | free/quota headroom admission is not globally enforced |
| providerCooldown.enabled | false | optional provider-cooldown feature is disabled |
| modelLockout.enabled | true | error-code lockouts are active |
| provider breaker | enabled | OAuth/API-key thresholds and reset timers are configured |
| waitForCooldown.enabled | true | bounded recovery waits are configured |
| comboStrategy / fallbackStrategy | round-robin / round-robin | current combo defaults |
| a2aEnabled | true | A2A service is enabled |
| call_log_pipeline_enabled | 0 | durable detail pipeline is off |

## Requested-feature classification

The following table is the implementation decision matrix for R1-R5. The
three UPSTREAM_3_8_51_ONLY rows are included in the count because they are
material requested-adjacent capabilities needed by the later plan.

| Requested feature | Classification | Evidence / conclusion |
|---|---|---|
| Free Provider Sentinel | NATIVE_NEEDS_CONFIG | strictZeroCostFilter, freeAccessQuota, candidate exclusion reasons, and fail-closed unknown handling already exist; strict mode is off |
| Hard FREE_ONLY | NATIVE_NEEDS_CONFIG | freeAccessPolicy accepts strict and virtual auto-combo wiring applies it; live value is off |
| Real completion probes | NATIVE_WORKING | /api/providers/test and call history exist; future probes need cost-gated admission |
| Free-status verification | NATIVE_NEEDS_CONFIG | static state/types exist, but current provider-level proof is fragmented across catalog, auth, quota, and completion history |
| Quota headroom | NATIVE_NEEDS_CONFIG | quota snapshots and a synchronous strict resolver exist; only five providers have persisted snapshots and quota preflight is disabled |
| Persistent circuit breaker | NATIVE_WORKING | persisted domain breaker and lockout/cooldown state exist; provider-specific durable runtime state is not populated |
| Automatic recovery | NATIVE_WORKING | cooldown wait, retries, backoff, half-open, and recovery settings are live |
| auto/search:free | CONFIRMED_GAP | no alias in live /v1/models; search is a separate endpoint, not an auto LLM route |
| auto/image-gen:free | CONFIRMED_GAP | no alias in live /v1/models; image generation is a separate endpoint/registry |
| auto/vision:free | CONFIRMED_GAP | auto/vision exists, but no free-specific vision alias exists |
| auto/multimodal:free | CONFIRMED_GAP | no alias in live /v1/models |
| Vision versus image-generation separation | NATIVE_WORKING | separate chat/image routes and capability registries are installed |
| IAMM / StockNewsBR routing isolation | CONFIRMED_GAP | IAMM direct and StockNewsBR indirect paths share the same local daemon, provider connections, quotas, and circuit state; no enforced client/tenant routing boundary was demonstrated |
| RouteLab/evals | NATIVE_NEEDS_CONFIG | built-in golden-set endpoint and eval CLI/routes exist, but no configured/run history was found |
| Smart exploration | NATIVE_WORKING | auto scoring plus A2A smart-routing and list-capabilities are present |
| Explainable routing | NATIVE_WORKING | live /api/v1/explain/routing returned route events; durable routing decision storage is not populated |
| v3.8.51 connection billing/exposure/snapshot hardening | UPSTREAM_3_8_51_ONLY | connectionBilling, modelExposureFilter, snapshotBreaker, and subscriptionLadder are added on the inspected branch |
| v3.8.51 AnySearch/xquik search integration | UPSTREAM_3_8_51_ONLY | anysearchSearch.ts and xquikSearch.ts are branch additions; v3.8.50 has no equivalent handlers |
| v3.8.51 bounded routing/cache and deterministic/plugin-v2 hardening | UPSTREAM_3_8_51_ONLY | branch adds bounded maps, catalog memoization, deterministic routing material, and opencode-plugin-v2 |

## Upstream delta: release/v3.8.51

The canonical upstream was inspected dynamically:

- repository: https://github.com/diegosouzapw/OmniRoute
- installed comparison ref: release/v3.8.50 at 091589089cd134a94df9f6cdab9ba562b2cefd18
- inspected branch: release/v3.8.51 at 7a921299c5b4c28dcf837f56a1c312b61414a646
- live package build SHA: dea6bb8; package metadata has no gitHead, so the
  binary cannot be proven to have been built from the comparison ref

Relevant changes found on the v3.8.51 branch:

### Free policy and economic classification

The strict zero-cost feature is not new in v3.8.51. It is already in 3.8.50
and is off by default. The branch materially strengthens the surrounding
economic model:

- connectionBillingCatalog and connectionBilling classify the cost of the
  connection, not only the model price;
- unknown billing remains metered/unsafe rather than free;
- modelExposureFilter prevents catalog labels from bypassing exposure policy;
- snapshotBreaker contributes provider health to auto scoring;
- subscriptionLadder separates subscription, keyless, free, cheap, and premium
  rungs without treating exhausted free pools as permission to spend;
- freeModelCatalog is refreshed and reclassified, including removal or
  downgrading of stale credit/free claims.

This is the strongest upstream direction for R1-R3. It must be evaluated in a
separate lab worktree; it was not copied or promoted.

### Auto-combo and pinned behavior

3.8.50 already has virtual auto combos and the pinned/explicit client
patterns remain visible. 3.8.51 adds routing families, deterministic-routing
material, catalog memoization, bounded cold-start work, and fixes around
explicit/pinned 401 fallback and exact model lockout scope. Future adaptive
changes must remain restricted to auto/* and must not rewrite explicit
provider/model requests.

### Search

3.8.50 has /v1/search, a registry, multiple fallback-capable handlers, cache
and coalescing. 3.8.51 adds AnySearch and Xquik handlers and fixes search
fallback/analytics/dedup/SSRF edge cases. This does not create a live
auto/search:free alias.

### Images and vision

3.8.50 already has /v1/images/generations, image editing, image registry,
provider handlers, and modality checks. 3.8.51 adds image provider/fallback
hardening, empty-2xx image-combo recovery, reference-image/capability fixes,
and derived multimodal metadata. These improve correctness; they do not
justify conflating image generation with vision chat.

### A2A, analytics, cache, and eval

The six A2A skills, explain route, semantic cache, eval route, and routing
source are already present in 3.8.50. 3.8.51 adds task-history and cache
hardening plus bounded routing maps and quality/resilience fixes. The live
3.8.50 installation needs configuration/validation, not a blind feature
rewrite.

Useful upstream references:

- STRICT_ZERO_COST.md:
  https://github.com/diegosouzapw/OmniRoute/blob/7a921299c5b4c28dcf837f56a1c312b61414a646/docs/routing/STRICT_ZERO_COST.md
- branch:
  https://github.com/diegosouzapw/OmniRoute/tree/release/v3.8.51
- connection billing:
  https://github.com/diegosouzapw/OmniRoute/blob/7a921299c5b4c28dcf837f56a1c312b61414a646/open-sse/config/connectionBillingCatalog.ts
- AnySearch:
  https://github.com/diegosouzapw/OmniRoute/blob/7a921299c5b4c28dcf837f56a1c312b61414a646/open-sse/handlers/search/anysearchSearch.ts

## Confirmed gaps and risks

1. Strict free policy is disabled in production. Existing free-looking auto
   routes can therefore use the normal candidate pool unless separately
   constrained.
2. The live auto catalog has no free search, free image-generation, free
   vision, or free multimodal aliases.
3. Provider-level free proof is not a single durable state. A catalog label,
   provider health 200, zero model pricing, and a successful completion are
   separate facts.
4. Persisted quota snapshots cover only five provider identities; the strict
   resolver correctly fails closed on cold/stale/unknown state, but the
   current setting does not force that path.
5. IAMM and StockNewsBR are logically separate clients but not isolated at the
   OmniRoute routing-state boundary.
6. Search coalescing/dedup exists but the v3.8.51 branch records a current
   edge-case fix, so the installed behavior should not be treated as fully
   corrected.
7. Existing provider test history is not real inference proof. Seven
   configured providers have historical successful real completions; the
   remaining providers require controlled, cost-classified probes before
   being promoted to a verified pool.
8. The installed package build SHA cannot be mapped back to a git commit from
   package metadata. Reproducible source work must start from an isolated
   release branch and retain the installed artifact as the rollback baseline.

## Recommended R1-R5 implementation plan

This is a plan only. No phase below was implemented in R0.

### R1 — Sentinel and policy gate

- Preserve the existing strictZeroCostFilter/freeAccessQuota path.
- Build a provider/model sentinel report with the explicit states above:
  catalog, credential, auth, real completion, cost class, hard-stop status,
  quota freshness/headroom, cooldown, and eligibility.
- Enable freeAccessPolicy=strict only in the LAB first.
- Fail closed on unknown, null, stale, credit-backed, or overage-unsafe
  candidates for auto/free profiles.
- Keep explicit/pinned requests on their existing route semantics.
- Do not call a candidate merely to discover whether it is paid.

### R2 — Free route families and media separation

- Add and test only the missing adaptive aliases: auto/search:free,
  auto/image-gen:free, auto/vision:free, and auto/multimodal:free if the
  product contract still requires it.
- Keep search on /v1/search and image generation on image endpoints; aliases
  must dispatch to those capability-specific handlers, not to chat.
- Use v3.8.51 capability and billing code as a lab reference, not a live
  upgrade.

### R3 — Quota, circuit, and recovery control

- Reuse existing quota snapshots, cooldown, model lockout, breaker, and
  recovery paths instead of adding a parallel resilience subsystem.
- Add the minimum durable provider/connection state needed to make
  auto/free eligibility explainable across restart.
- Turn on quota preflight only after fresh-state and reset-window tests pass.
- Verify that recovery after quota reset re-admits the same pinned connection
  only for auto routes; explicit requests remain explicit.
- Test 401, 403, 429, 5xx, timeout, empty response, stale quota, and unknown
  billing cases without using paid inference.

### R4 — Client compatibility and isolation

- Create separate OmniRoute API-key scopes or equivalent server-side route
  scopes for IAMM, StockNewsBR/Harness, Hermes, and OpenCode where the
  installed API manager supports them.
- Keep client files untouched until the server-side scope is validated.
- Prove that IAMM traffic and StockNewsBR traffic cannot silently consume a
  different client's pinned route or a paid candidate.
- Re-run the Hermes, Harness, OpenCode, IAMM, FCC-out-of-path, and generic
  OpenAI-compatible baselines.

### R5 — RouteLab, exploration, and explainability

- Seed the built-in golden set into a LAB eval run before adding cases.
- Add free-only completion probes with a zero-spend budget and recorded
  provider/model evidence.
- Expose candidate exclusions, cost state, quota headroom, cooldown, circuit,
  fallback reason, and quality signal in route explanation.
- Compare auto/smart, auto/coding, auto/coding:free, vision, search, and
  image-generation routes with pinned-route regression tests.
- Promote only evidence-backed candidates; do not infer free status from
  names or catalog presence.

## Safe source/worktree recommendation

Do not edit the installed global package or node_modules.

1. Preserve the current package directory and the live database as rollback
   evidence.
2. Create an isolated LAB clone/worktree from the exact release/v3.8.50 line
   used for comparison, pinned to 091589089cd134a94df9f6cdab9ba562b2cefd18.
3. Run LAB OmniRoute on a separate loopback port and separate data directory.
4. Review release/v3.8.51 in a second worktree/port; do not upgrade the live
   service and do not replace the production wrapper.
5. Before any production package change, compare the installed package
   manifest/build output with the lab build because dea6bb8 is not a gitHead
   provenance proof.

## Rollback strategy

R0 made no runtime change, so the immediate rollback is no-op:

- leave the current systemd unit, wrapper, pnpm package, database, and client
  files unchanged;
- if a later lab policy test changes settings, snapshot the LAB database and
  restore freeAccessPolicy=off before stopping the lab;
- if a later packaged deployment is attempted, retain the current 3.8.50
  package and wrapper as the previous target, stop the new service, restore
  the previous package/unit target, restore the database backup if a schema or
  setting migration occurred, and repeat health/catalog/client smoke tests;
- never roll back by deleting the live data directory or by promoting
  release/v3.8.51 directly.

## Evidence and reproducibility

Read-only evidence used:

- pwd, git status -sb, git rev-parse HEAD, and origin remote;
- systemctl --user status/show/cat for omniroute.service and connected units;
- ss listener/process checks and the OmniRoute process tree;
- installed package metadata, binary/link resolution, and dist/BUILD_SHA;
- protected GETs for health, models, provider/catalog, combos, settings,
  search/image model lists, A2A agent card/status, eval, and routing explain;
- schema/count queries against the local OmniRoute SQLite database with
  credential values excluded;
- client/source inspection for Hermes, OpenCode, Harness, StockNewsBR,
  IAMM, and FCC;
- dynamic git ls-remote and isolated clones of upstream release/v3.8.50 and
  release/v3.8.51.

No auth token, API key, OAuth token, cookie, or provider secret is included in
this document.

## Final report

~~~text
OMNIROUTE_FREE_AUTOPILOT_R0_AUDIT_TOPOLOGY_AND_GAP_MATRIX

LIVE_VERSION=3.8.50
LIVE_PORT_20128=LISTENING_127.0.0.1
LIVE_SERVICE=active:omniroute.service

OMNIROUTE_INSTALL_TYPE=pnpm_global_packaged
OMNIROUTE_SOURCE_PATH=/home/dcima/.local/share/pnpm/store/v11/links/@/omniroute/3.8.50/0ac422879d19374afeb442dde854f53daaceb2e06a8048f6577d10517b623962/node_modules/omniroute

HERMES_TOPOLOGY=OMNIROUTE_DOWNSTREAM
HERMES_BASELINE=FAIL_EXISTING

DEEPSEEK_HARNESS_TOPOLOGY=OMNIROUTE_INDIRECT
DEEPSEEK_HARNESS_BASELINE=NOT_TESTED_WITH_REASON

OPENCODE_TOPOLOGY=OMNIROUTE_DOWNSTREAM
OPENCODE_BASELINE=NOT_TESTED_WITH_REASON

FCC_NVIDIA_TOPOLOGY=OUT_OF_PATH
FCC_NVIDIA_BASELINE=OUT_OF_PATH

OPENAI_COMPAT_BASELINE=NOT_TESTED_WITH_REASON

PINNED_MODEL_BASELINE=explicit provider/model and named combo requests are present
PINNED_PROVIDER_BASELINE=explicit provider prefixes/connections are present
AUTO_ROUTE_BASELINE=38 auto aliases; 9 combos; freeAccessPolicy=off

PROVIDERS_DISCOVERED=37 configured distinct / 46 catalog keys
PROVIDERS_AUTH_VALID=31/37 proven by current/stored health evidence
PROVIDERS_REAL_REQUEST_PASS=7/37 historical 2xx real completion providers
PROVIDERS_FREE_VERIFIED=5/37 historical free-like completion providers

AUTO_ROUTING_NATIVE=YES
FREE_TIER_NATIVE=YES_PARTIAL
QUOTA_NATIVE=YES_PARTIAL
CIRCUIT_BREAKER_NATIVE=YES
SEARCH_NATIVE=YES
IMAGE_GENERATION_NATIVE=YES
VISION_NATIVE=YES

NATIVE_WORKING_COUNT=6
NATIVE_NEEDS_CONFIG_COUNT=5
UPSTREAM_ONLY_COUNT=3
CONFIRMED_GAP_COUNT=5

PAID_INFERENCE_TRIGGERED=NO
SECRETS_EXPOSED=NO

HERMES_MODIFIED=NO
DEEPSEEK_HARNESS_MODIFIED=NO
OPENCODE_MODIFIED=NO
FCC_MODIFIED=NO
IAMM_TOUCHED=NO
STOCKNEWSBR_TOUCHED=NO

COMMIT=NOT_CREATED_DIRTY_REPO
PUSH=NOT_ATTEMPTED

FINAL_RESULT=PASS
~~~
