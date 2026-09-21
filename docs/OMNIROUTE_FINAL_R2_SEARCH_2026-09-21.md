# OmniRoute — Final Free Autopilot: R2 Search Reconstruction (dynamic FREE_ONLY)

Mission: OMNIROUTE_FREE_AUTOPILOT_FINAL_RECONSTRUCTION_R1_11_R4_LIVE_CLOSURE_2026_09_21
Phase: 4 — R2 search reconstruction (isolated candidate; nothing deployed)
Date: 2026-09-21
Workspace: /home/dcima/omniroute-final-free-autopilot-20260921
Branch: final/free-autopilot-2026-09-21

UPSTREAM_BASE_SHA=dea6bb8b6b64d3a3d9f639a044625c3452442c56
R1_CANDIDATE_SHA=864ddc1d57871827ab2be3a9235bab5f8c12bc48
R1_REPORT_COMMIT=3f4d1219b542cfcaf5c5991f7053eb8117632aa4
R1_INSPECTOR_FIX_SHA=2e10170e8a481ef40af4bdda9f0fb390eab96bc7
R1_11_REPORT_COMMIT=26066ca07fab180f7f39d58abc56efe03205e28e
R2_SHA=af44c10b595cbe36d3e1168a9918d7f857ce5862
R2_COMMIT=af44c10b5 "feat(omniroute): reconstruct dynamic FREE_ONLY search routing" (3 files, +796/-1)

## 1. Result (required fields)

R2=PASS
AUTO_SEARCH_FREE=PASS
STATIC_SEARCH_ALLOWLIST=NO
SEARCH_DYNAMIC_DISCOVERY=PASS
SEARCH_FREE_TO_FREE_FAILOVER=PASS
SEARCH_PAID_FALLBACK=NO

## 2. What was reconstructed

New pure module `open-sse/services/searchFreeRouting.ts` (+293), no parallel gateway:

- `FREE_ONLY_SEARCH_SELECTOR = "auto/search:free"` — the `provider` value that opts a
  `/v1/search` request into FREE_ONLY routing.
- `NO_FREE_SEARCH_PROVIDER_AVAILABLE` — terminal error when the free chain is exhausted.
- `FREE_SEARCH_BREAKER_PREFIX = "search:"` — breaker namespace so search legs never
  collide with model-provider legs.
- Eligibility is metadata-only and shortlist-free (`classifySearchProviderFreeStatus`):
  cost missing/non-finite/negative → UNKNOWN_COST (deny); cost 0 + self-hosted base URL
  (loopback / RFC1918 / `.local` / `.internal`) → SELF_HOSTED (allow); cost 0 + keyless
  (`authType: "none"`) → FREE_VERIFIED (allow); cost 0 + keyed but `freeMonthlyQuota > 0`
  → FREE_VERIFIED (allow); cost 0 + keyed + quota 0 → FREE_UNKNOWN (deny); cost > 0 with
  a free quota → CREDIT_BACKED (deny); cost > 0 → PAID (deny).
  `FREE_ELIGIBLE_SEARCH_STATUSES = ["FREE_VERIFIED", "SELF_HOSTED"]` only.
- `buildFreeSearchChain()` discovers providers from `SEARCH_PROVIDERS` and skips
  `disabled`, unsupported `search_type` (`supportsSearchType`), blocked ids
  (`blockedProviders` policy), unconfigured loopback providers
  (`isUnconfiguredLoopbackSearchProvider`) and every non-eligible cost class; the chain
  orders non-`fallbackOnly` first, then cheapest, then registry order — all derived from
  registry metadata, never from a hardcoded provider list.
- Deterministic quality gate `assessSearchResultQuality()` (results array present,
  ≥1 result, ≥1 well-formed absolute http(s) URL; freshness measured, not required) and
  `dedupeSearchResults()` / `normalizeResultUrl()` (hash stripped, host lowercased,
  trailing slashes trimmed, first occurrence wins).
- `runFreeSearchChain()` — one bounded pass, at most one attempt per chain entry:
  a leg that fails, returns no results, or fails the quality gate hands off to the next
  free leg; skips are recorded with reasons (`no-credentials`, `rate-limited`,
  `circuit-open`); nothing wins → `{ ok: false, exhausted: true }` with `allRateLimited`
  set when every attempt was rate-limited. The runner can only ever touch the chain it is
  given, so a paid provider is structurally unreachable.

Route integration in `src/app/api/v1/search/route.ts` (+133/-1): a branch inside the
native POST handler, before the native provider/credential resolution. It builds the free
chain from `Object.values(SEARCH_PROVIDERS)` with the blocked-provider filter, resolves
per-leg credentials with the native helper (`resolveSearchExecutionCredentials`, including
`getSearchCredentialFallbacks` and quota preflight), skips rate-limited credentials
(`isAllRateLimitedCredentials`), consults the native breaker
(`getCircuitBreaker("search:<id>", { failureThreshold: 3, resetTimeout: 30_000 })`,
`canExecute()`), executes each leg through the native `handleSearch()` **without**
`alternateProvider`/`alternateCredentials` (a leg therefore cannot escalate to another,
potentially paid, provider), caches with `getOrCoalesce` under the synthetic provider
component `auto/search:free` (so free results never collide with plain `auto` caching) and
returns the same response envelope as the native path
(`{ id: "search-<uuid>", ...data, cached, usage }`, usage zeroed on cache hits). Exhaustion
returns HTTP 503 `NO_FREE_SEARCH_PROVIDER_AVAILABLE` (429 when every leg was rate-limited).
No paid provider can appear in the chain, and no cost is recorded for free legs.

## 3. R2 vs R5 failover contradiction — resolved

The old R2 report claimed `FREE_TO_FREE_FAILOVER=YES`; the old R5 live report observed
`SEARCH_FAILOVER=CREDENTIAL_ONLY`. Both are accurate for the paths they described:

- The **native** auto-select/alternate path is credential-driven: the alternate leg is the
  first other provider (sorted by `costPerQuery`, `fallbackOnly` excluded, rate-limited
  skipped) that has credentials — which means the native path _can_ hand a retry to a paid
  provider whenever it is the cheapest credentialed one. That is exactly R5's observation.
- The **FREE_ONLY branch** (`auto/search:free`) never constructs an alternate: its chain is
  built exclusively from FREE_VERIFIED/SELF_HOSTED metadata, each leg is called without
  `alternateProvider`, and the only terminal states are a free success or
  `NO_FREE_SEARCH_PROVIDER_AVAILABLE`. Within this branch free→free failover is real and
  paid is unreachable — the PASS recorded in section 1 applies to this branch, which is the
  mission's required semantics.

## 4. Tests and gates

- `tests/unit/search-free-routing.test.ts` (new, +371, node:test scope): 13/13 PASS —
  classification matrix, self-hosted truth table, eligibility set, chain filtering
  (paid/credit/unknown/disabled/unsupported/blocked/unconfigured-loopback excluded),
  chain ordering, quality gate, URL normalization + dedupe, bounded failover (stop at the
  first quality-passing leg), quality-gate handoff, skip reasons, all-rate-limited
  exhaustion, all-failing exhaustion (attempts == chain length, stable terminal constant),
  real-helper dedupe on the winning leg.
- Regression: the four autoCombo vitest suites remain green (4 files / 56 tests).
- `npm run check:open-sse-typecheck`: no new errors; only the pre-existing, independently
  reproduced baseline entry `src/app/api/v1/models/catalog.ts TS2367`.
- Lint: scoped eslint + pre-commit lint-staged (prettier/eslint --fix) PASS; docs-sync,
  explicit-any budget and tracked-artifacts hooks PASS; secret scan clean.

## 5. Honest limitations

- The circuit breaker is **consulted** (`canExecute()`) but not re-implemented: failure
  recording stays owned by the existing upstream paths (mission rule: no second breaker
  implementation). The `search:` namespace keeps search legs isolated from model legs.
- `isUnconfiguredLoopbackSearchProvider` inspects only the registry config, so a
  `searxng-search` connection whose `providerSpecificData.baseUrl` is overridden at
  connection level stays excluded from the free chain unless the registry default is
  overridden (same known limitation the old R2 documented; deliberately not "fixed" by
  guessing identities).
- The free branch is validated deterministically at unit level; the live `auto/search:free`
  exercise is part of the integrated Phase 7/8 canary and is not claimed here.

## 6. Data safety

No paid or credit-backed search provider is reachable from the free branch; no provider
calls were made while implementing or testing R2; live production OmniRoute (127.0.0.1:20128)
was not touched; OpenCode/IAMM/StockNewsBR/Hermes/Harness were not modified.
