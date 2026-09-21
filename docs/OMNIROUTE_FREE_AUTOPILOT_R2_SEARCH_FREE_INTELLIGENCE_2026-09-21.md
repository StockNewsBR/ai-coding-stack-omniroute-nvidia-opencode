# OMNIROUTE_FREE_AUTOPILOT_R2_SEARCH_FREE_INTELLIGENCE

- DATE: 2026-09-21
- RUNTIME: OpenCode Linux + OMO
- LAB: `/home/dcima/omniroute-lab-r1-v3.8.50` (isolated checkout, baseline commit `96c8287`)
- LIVE: `http://127.0.0.1:20128` (read-only verify target, packaged v3.8.50, untouched)

## OMNIROUTE_FREE_AUTOPILOT_R2_SEARCH_FREE_INTELLIGENCE

SEARCH_NATIVE=YES

SEARCH_ENDPOINT=POST /v1/search

SEARCH_PROVIDERS_DISCOVERED=17

SEARCH_PROVIDERS_FREE_VERIFIED=3

SEARCH_PROVIDERS_HEALTHY=3

SEARCH_PROVIDERS_ELIGIBLE=3

AUTO_SEARCH_FREE=YES

FREE_TO_FREE_FAILOVER=YES

TIMEOUT_HANDLING=YES

RATE_LIMIT_HANDLING=YES

CIRCUIT_BREAKER=YES

CACHE=YES

DEDUP=YES

UNKNOWN_COST_SEARCH_USED=NO

PAID_SEARCH_USED=NO

CREDIT_BACKED_SEARCH_USED=NO

PAID_SEARCH_FALLBACK=NO

OPENCODE_CHANGED=NO

HARNESS_CHANGED=NO

HERMES_CHANGED=NO

PROVIDERS_DELETED=0

CONNECTIONS_DELETED=0

REGRESSION=NONE

FINAL_RESULT=PASS

## Detail

### SEARCH_NATIVE / SEARCH_ENDPOINT
No parallel gateway was created. The free-only path is a branch inside the existing native
`/v1/search` route (`src/app/api/v1/search/route.ts`) and reuses, unmodified:

| Native component | Reused for |
|---|---|
| `open-sse/config/searchRegistry.ts` (`SEARCH_PROVIDERS`, `supportsSearchType`, `isUnconfiguredLoopbackSearchProvider`) | dynamic provider discovery, capability check, catalog-default loopback skip |
| `open-sse/handlers/search.ts` (`handleSearch`) | per-provider request building, normalization, timeout, call logging |
| `open-sse/services/searchCache.ts` (`computeCacheKey`, `getOrCoalesce`) | cache + concurrent-request coalescing (dedup) |
| `src/shared/utils/circuitBreaker.ts` (`getCircuitBreaker`) | per-provider breaker under the namespace `search:<providerId>` |
| `@/app/api/v1/_shared/rateLimit.ts` (`isAllRateLimitedCredentials`, `rateLimitedProviderResponse`) | rate-limit detection and 429 response |
| route-local `resolveSearchExecutionCredentials` (quota preflight) | credential + quota availability |

New files (lab only):
- `open-sse/services/searchFreeRouting.ts` (221 lines) — discovery/classification/chain/quality/dedup, pure and unit-testable.
- `tests/unit/search-free-routing.test.ts` (438 lines) — 15 deterministic `node:test` cases.

Modified file (lab only): `src/app/api/v1/search/route.ts` (+179 lines, no deletions).

### Provider discovery (no hardcoded shortlist)
All 17 registry providers are classified from their own metadata only
(`costPerQuery`, `freeMonthlyQuota`, `authType`, `baseUrl`):

- `costPerQuery` missing/non-finite/negative -> UNKNOWN_COST (excluded)
- `cost=0` + private/loopback baseUrl -> SELF_HOSTED (eligible)
- `cost=0` + keyless (`authType=none`) or `freeMonthlyQuota>0` -> FREE_VERIFIED (eligible)
- `cost=0` + keyed + `freeMonthlyQuota=0` -> FREE_UNKNOWN (excluded)
- `cost>0` + `freeMonthlyQuota>0` -> CREDIT_BACKED (excluded)
- `cost>0` + `freeMonthlyQuota=0` -> PAID (excluded)

Result over the shipped registry:

- FREE_VERIFIED (3): `ollama-search`, `context7`, `duckduckgo-free`
- SELF_HOSTED (0 in live config, 1 potential): `searxng-search` only when the operator overrides the catalog default `http://localhost:8888/search`
- Excluded (14): `serper-search`, `brave-search`, `perplexity-search`, `exa-search`, `tavily-search`, `firecrawl`, `google-pse-search`, `linkup-search`, `searchapi-search`, `youcom-search`, `jina-search` (CREDIT_BACKED); `zai-search`, `x-search` (FREE_UNKNOWN); `searxng-search` when unconfigured (loopback default).

Live reachability probe (unauthenticated, no quota spent):
`ollama.com/api/web_search` -> 405, `context7.com/api/v1` -> 404, `lite.duckduckgo.com/lite/` -> 202 (all reachable),
`localhost:8888/search` -> unreachable (correctly excluded as unconfigured loopback).

SEARCH_PROVIDERS_HEALTHY=3 = the three reachable FREE_VERIFIED providers; health at routing time is
also gated by credential preflight and circuit-breaker state, not by a separate probe sweep.

AUTO_SEARCH_FREE=`{"provider":"auto/search:free"}` on `POST /v1/search` selects the ordered
eligible-free chain. Deterministic order: non-`fallbackOnly` first, then `costPerQuery` ascending,
then registry insertion order. Live web chain = `ollama-search` (if a credential resolves) ->
`context7` -> `duckduckgo-free`.

### FREE_TO_FREE_FAILOVER
One bounded pass over the chain A -> B -> C, calling the native `handleSearch` per leg with no
`alternateProvider`, so a leg can never escalate into a paid provider. First leg whose response
passes the deterministic quality gate wins. On exhaustion the route returns HTTP 503 with
`NO_FREE_SEARCH_PROVIDER_AVAILABLE`. No paid fallback exists on any path.

### TIMEOUT_HANDLING
Native per-provider timeout (`config.timeoutMs`, e.g. 10s) plus the handler's global 15s budget.
A timed-out leg returns 504 from `handleSearch`, is recorded against that leg's breaker, and the
loop advances to the next free leg. Verified by test 5.

### RATE_LIMIT_HANDLING
Two layers, both native: credential-level preflight (`getProviderCredentialsWithQuotaPreflight` +
`isAllRateLimitedCredentials`) skips a leg before any network call; a provider HTTP 429 fails the
leg, is recorded, and the loop advances without retrying that leg. If every leg was rate limited and
nothing else failed, the native `rateLimitedProviderResponse` is returned instead of the terminal 503.
Verified by test 6.

### CIRCUIT_BREAKER
Native `getCircuitBreaker` namespaced as `search:<providerId>` (failureThreshold 3, resetTimeout 30s)
so search failures never cross-talk with model breakers. `canExecute()` is checked before each leg and
the leg's call runs through `breaker.execute(...)`; a failing or low-quality leg records a failure and
trips the breaker. When all legs are open: 503 `NO_FREE_SEARCH_PROVIDER_AVAILABLE` with zero fetches.
Verified by test 8.

### CACHE
Native `getOrCoalesce`/`computeCacheKey` with the synthetic provider component `auto/search:free`, so
free-only results never collide with plain auto results and identical free queries coalesce. Cache hits
return `cached:true` with `usage.queries_used=0`, `search_cost_usd=0`, and record no cost.
Verified by test 11.

### DEDUP
Two levels: native `getOrCoalesce` request coalescing for identical concurrent queries, plus
`dedupeSearchResults()` normalizing result URLs (lowercased scheme/host, hash stripped, trailing
slashes removed) and keeping the first occurrence. Verified by test 12.

### Search quality (deterministic only, no paid LLM judge)
`assessSearchResultQuality()`: results array present, >=1 result, >=1 well-formed absolute http(s)
result URL (`new URL`), `validUrlCount`/`resultCount`/`freshnessCount` (non-empty `published_at`)
counted. Latency is provided by the native handler metrics (`response_time_ms`, `upstream_latency_ms`);
provider success/failure rate is tracked by the circuit breakers. No per-result live HTTP probing was
added (avoids added latency, SSRF surface, and new infrastructure).

### Tests
`tests/unit/search-free-routing.test.ts` -> 15 pass / 0 fail:
normal search; timeout failover; 429 failover; auth-failure failover; circuit open on every leg;
provider unavailable; free->free failover order; cache; dedup; no infinite retry (exactly one attempt
per provider); no paid fallback; news search terminates deterministically (no free news provider).

Command:
```
DISABLE_SQLITE_AUTO_BACKUP=true node --max-old-space-size=8192 --import tsx/esm \
  --import ./open-sse/utils/setupPolyfill.ts --import ./tests/_setup/isolateDataDir.ts \
  --test tests/unit/search-free-routing.test.ts
```

### REGRESSION
- 7 existing search test files -> 89 pass / 0 fail (`search-route`, `search-registry`, `search-cache-ttl-zero`,
  `search-blocked-providers-11100`, `search-provider-named-errors`, `search-handler-duckduckgo`,
  `search-handler-extended`).
- `tsc --noEmit -p tsconfig.typecheck-core.json` -> 0 errors.
- `eslint` on `searchFreeRouting.ts` and `search-free-routing.test.ts` -> 0 problems. The 3 lint errors in
  `route.ts` are pre-existing (unused `extractApiKey`, `isValidApiKey`, `context`) and unchanged.
- Live OmniRoute untouched: `/api/health` -> 200, unauthenticated `POST /v1/search` -> 401.

### Blast radius / rollback
Lab changes only. Rollback:
```
git -C /home/dcima/omniroute-lab-r1-v3.8.50 checkout -- src/app/api/v1/search/route.ts
rm /home/dcima/omniroute-lab-r1-v3.8.50/open-sse/services/searchFreeRouting.ts \
   /home/dcima/omniroute-lab-r1-v3.8.50/tests/unit/search-free-routing.test.ts
```
No client was modified (OpenCode, Harness, Hermes, FCC, IAMM, StockNewsBR). No provider or connection
was deleted or altered.

### Known limitation
`isUnconfiguredLoopbackSearchProvider` inspects only the registry config, so a `searxng-search`
connection whose `providerSpecificData.baseUrl` is overridden is still excluded from the free chain
unless the registry default itself is overridden. Documented in code; not fixed (out of scope,
would change non-free routing behavior).
