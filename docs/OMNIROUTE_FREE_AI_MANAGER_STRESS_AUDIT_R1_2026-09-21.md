# OmniRoute — FREE AI Manager Stress / Resilience Audit R1 (isolated clone)

Mission: OMNIROUTE_FREE_AI_MANAGER_STRESS_AUDIT_R1
Phase: isolated stress validation (not deployed)
Date: 2026-09-21
Workspace: /home/dcima/omniroute-free-manager-stress-r1 (clone of /home/dcima/omniroute-final-free-autopilot-20260921)
Branch: test/free-ai-manager-stress-r1

- CERTIFIED_RUNTIME_SHA=7e5a2d80b23ea2e10b588581236abad1614a04a7
- STRESS_COMMIT_SHA=uncommitted at report time (tests + report only; see commit section)
- STRESS_TESTS=1 file, tests/unit/free-ai-manager-stress-r1.test.ts (20 tests, +1086 lines)
- PRODUCTION_REPO_CHANGED=NO (clone only; original workspace untouched)
- PAID_INFERENCE_TRIGGERED=NO (no provider requests; all fault injection deterministic and in-process)

## 1. Required fields

FREE_AI_MANAGER_STRESS=PASS
STATIC_FREE_PROVIDER_ALLOWLIST=NO
DYNAMIC_DISCOVERY=PASS
FREE_VERIFIED_ONLY_AUTO=PASS
SELF_HOSTED_AUTO=PASS
FREE_UNKNOWN_DENY=PASS
UNKNOWN_COST_DENY=PASS
NULL_COST_DENY=PASS
CREDIT_BACKED_DENY=PASS
PAID_AUTO_DENY=PASS
FREE_TO_FREE_FAILOVER=PASS
AUTO_PROVIDER_RECOVERY=PASS
AUTH_FAILURE_ISOLATION=PASS
RATE_LIMIT_COOLDOWN=PASS
QUOTA_EXHAUSTION_FAILOVER=PASS
CIRCUIT_OPEN_FAILOVER=PASS
CIRCUIT_RECOVERY=PASS
CAPABILITY_ISOLATION=PASS
ALL_FREE_UNAVAILABLE_CONTROLLED=PASS
BOUNDED_RETRY=PASS
CONCURRENCY_SAFETY=PASS
READ_ONLY_INSPECTION_NO_PROVIDER_CALL=PASS
PAID_AUTO_FALLBACK=NO
PAID_INFERENCE_TRIGGERED=NO
PRODUCTION_CHANGED=NO
OPENCODE_CHANGED=NO
TESTS=20/20 pass (node --test, 0 fail, 0 skipped)
TYPECHECK=PASS (npm run typecheck:core, tsc -p tsconfig.typecheck-core.json, 0 diagnostics)
LINT=PASS (eslint tests/unit/free-ai-manager-stress-r1.test.ts, exit 0)
FINAL_RESULT=PASS

## 2. Scope and method (native components only — no second router, no new scoring system)

The stress suite drives the same native modules that the FREE AI Manager uses at runtime, with deterministic in-process state (no DB, no network, no credential mutation, no provider calls):

- Eligibility/cost admission: `classifyFreeCost` / `evaluateFreeSentinel` (`open-sse/services/autoCombo/freeProviderSentinel.ts`) against the real `FREE_MODEL_BUDGETS` catalog (`open-sse/config/freeModelCatalog.data.ts`).
- Pool narrowing pipeline: `filterResilienceBlockedCandidates` (`resilienceCandidateFilter.ts`) → `filterStrictZeroCostCandidates` (`strictZeroCostFilter.ts`) → `filterTosAvoidCandidates` → `filterExcludedCandidates` (`candidateOverrides.ts`).
- Per-request fault recording: `applyComboTargetExhaustion` + `shouldRecordProviderBreakerFailure` + `getExhaustedTargetSkipReason` (`open-sse/services/combo/targetExhaustion.ts`, `comboPredicates.ts`).
- Selection: `selectWithStrategy` (`routerStrategy.ts`, rules strategy) over `ProviderCandidate` (`scoring.ts`). `selectProvider`/`scoring` weights untouched.
- Circuit lifecycle: `getCircuitBreaker` (`src/shared/utils/circuitBreaker.ts`) with CLOSED → DEGRADED → OPEN → HALF_OPEN → CLOSED transitions.
- Bounds: `clampGlobalAttempts`, `MAX_GLOBAL_ATTEMPTS`, `MAX_GLOBAL_ATTEMPTS_HARD_CAP`; `runFreeSearchChain` one-pass semantics.
- Capability isolation: `buildAutoCandidateFilter` (`suffixComposition.ts`), `buildFreeSearchChain` (`searchFreeRouting.ts` + `supportsSearchType`), `resolveFreeImageProvider` (`freeImageRouting.ts`).
- Read-only inspection: `readFreeAccessStateCached` vs `resolveFreeAccessState` (`freeAccessQuota.ts`) and the candidate inspector wiring (`open-sse/handlers/autoComboCandidates.ts`).

Real external providers were NOT probed. Failure injection (408/429/401/403/5xx/quota exhaustion/cooldown/circuit) is local and deterministic. No free quota was burned, no paid inference was triggered.

## 3. Fault matrix (SCENARIO / INITIAL_STATE / EVENT / EXPECTED_ROUTE_STATE / ACTUAL_ROUTE_STATE / PASS-FAIL)

| SCENARIO | INITIAL_STATE | EVENT | EXPECTED_ROUTE_STATE | ACTUAL_ROUTE_STATE | PASS/FAIL |
|---|---|---|---|---|---|
| STRESS_A | FREE_VERIFIED cerebras conn + FREE_VERIFIED groq conn, both healthy | none | exactly one eligible selection from the pair | `selectWithStrategy` returns one provider, `candidatesConsidered=2`, decision is one of the pair | PASS |
| STRESS_B | cerebras selected, groq idle | cerebras returns 408 timeout | failure recorded; native health/cooldown updated; groq selectable | `shouldRecordProviderBreakerFailure=true`; breaker failureCount=1; `exhaustedConnections={cerebras:conn}` (provider set untouched); persisted `rateLimitedUntil` filters cerebras out; filtered pool `[groq]`; selection = groq | PASS |
| STRESS_C | cerebras selected, groq idle | cerebras returns 429 | cerebras in 429 cooldown; groq selected | `transientRateLimitedProviders={cerebras}`, no connection exhaustion, no provider quota mark; cooled pool `[groq]`; selection = groq | PASS |
| STRESS_D | cerebras quota reading EXHAUSTED, groq SAFE | pool rebuilt | cerebras excluded; groq selected | sentinel drops cerebras conn (`reason=QUOTA_EXHAUSTED`, `safeConnectionIds=[]`); filtered pool `[groq]`; selection = groq | PASS |
| STRESS_E | cerebras conn + groq conn | cerebras 401, then 403 | affected connection excluded/unavailable; other free connection usable; no credential change | `exhaustedConnections` size 1 (`cerebras:conn`), provider-level set empty; groq skip reason null; input pool refs/len unmutated; cerebras remains eligible in a clean pipeline | PASS |
| STRESS_F | cerebras breaker threshold 3 | cerebras 5xx three times | native breaker OPEN; immediate reuse prevented; other FREE provider selectable | breaker state OPEN, next `execute` rejects `CircuitBreakerOpenError`, `getRetryAfterMs()>0`; rules selection over `[cerebras OPEN, groq CLOSED]` picks groq | PASS |
| STRESS_G | cerebras breaker OPEN (reset 40 ms) | cooldown elapses, half-open probe succeeds | after native recovery semantics cerebras eligible again | after 60 ms `canExecute()=true`, state HALF_OPEN; success → CLOSED, failureCount 0; pipeline contains cerebras again | PASS |
| STRESS_H | all FREE candidates exhausted/rate-limited/blocked | pool rebuilt and selection attempted | controlled NO_FREE_PROVIDER_AVAILABLE or capability equivalent; never PAID | filtered pool `[]`; `selectWithStrategy([])` throws (no silent fallback); decoy pool (PAID/CREDIT_BACKED/NULL_COST/UNKNOWN_COST) → `[]`; 20 rounds observed exactly `NO_FREE_PROVIDER_AVAILABLE` | PASS |
| STRESS_COST | mixed pool: FREE_VERIFIED, SELF_HOSTED, FREE_UNKNOWN, UNKNOWN_COST, NULL_COST, CREDIT_BACKED, PAID | failures injected into the allowed candidates only | only FREE_VERIFIED/SELF_HOSTED ever eligible; denied classes never become fallback | classification exact; after killing allowed classes survivors `[]`; observed outcome only `NO_FREE_PROVIDER_AVAILABLE`; `STRESS_PAID_ESCAPE=NO` | PASS |
| STRESS_FAILOVER | synthetic FREE_VERIFIED alpha/beta/gamma (hard-stop rows) | alpha fails, then beta fails, then alpha recovers | free→free failover A→B, B→C; no hardcoded sequence; A eligible again after recovery | readers SAFE; A cooled → {beta,gamma}; A+B cooled → `[gamma]` and selection gamma; A recovered → alpha eligible again | PASS |
| CAP_VISION | candidates with `resolvedSupportsVision` true/false | vision capability filter applied | provider with wrong capability never selected | `buildAutoCandidateFilter("vision")` false for non-vision, true for vision; coding/chat without tier = no filter | PASS |
| CAP_SEARCH | web-only free search providers + news-only + PAID + CREDIT_BACKED | `buildFreeSearchChain({searchType:"web"})` then execution | only capability-compatible FREE_VERIFIED/SELF_HOSTED legs tried | chain excludes news-only and paid/credit providers; `runFreeSearchChain` executes the free web leg only; each leg at most once | PASS |
| CAP_IMAGE | image registry: local SELF_HOSTED + FREE_VERIFIED budget + PAID-only + inactive conn + all-circuit-open | `resolveFreeImageProvider` | only eligible FREE image providers; chat/vision candidates can never be image generators | local+free → ok; paid-only → `NO_FREE_IMAGE_PROVIDER_AVAILABLE/NO_ELIGIBLE_FREE_IMAGE_PROVIDER`; inactive conn → not ok; all open → `ALL_FREE_IMAGE_PROVIDERS_CIRCUIT_OPEN` | PASS |
| BOUNDED | 5-leg failing chain; unbounded-looking inputs | dispatch loop executed | failover count bounded; broken provider cannot cycle infinitely | `clampGlobalAttempts(undefined/0)=30`, `(3)=3`, `(5000)=200`; 5-leg chain called each leg exactly once, `attempts.length=5`, `exhausted=true`; simulated loop bounded ≤200 | PASS |
| CONCURRENCY | healthy 3-provider pool | 12 parallel selections + 8 parallel search chains + mixed breaker/selection `Promise.allSettled` | no paid escape, no infinite loop, no duplicate retry storm, no deadlock | all 12 selections pick allowed providers; all 8 chains ok with per-leg calls ≤8 and attempts ≤ chain length; 3/3 settled with selection fulfilled | PASS |
| QUOTA_REBUILD | cerebras reading flips SAFE/EXHAUSTED during rebuild | 6 rebuild rounds | quota update during pool rebuild never admits denied classes or deadlocks | survivors only cerebras/groq; selections only allowed providers | PASS |
| READ_ONLY_SRC | candidate inspector source | static inspection | listing candidates never triggers provider inference | `autoComboCandidates.ts` imports and passes `readFreeAccessStateCached`; no `resolveFreeAccessState(` call anywhere in the file | PASS |
| READ_ONLY_RT | seeded cache entry for a usage-fetcher provider | `readFreeAccessStateCached` hit/miss with `globalThis.fetch` poisoned to throw | cache-only read; no provider call ever issued | hit returns cached reading; miss/non-usage provider → `undefined`; fetch poison invoked 0 times | PASS |
| SOURCE_GUARD | free routing modules | static scan | no static provider priority (nvidia/openrouter/zen) in free eligibility/routing | no match in `freeProviderSentinel.ts`, `strictZeroCostFilter.ts`, `resilienceCandidateFilter.ts`, `candidateOverrides.ts`, `routerStrategy.ts` | PASS |

## 4. Dynamic discovery and no static allowlist

Eligibility is computed from facts, not identity: a novel provider id (`free-alpha-9`) with a hard-stop guaranteed catalog row is admitted exactly like a real provider, and a real self-hosted id (`vllm`) is admitted without any quota read. Provider identity influences only capability/configuration, never FREE admission. The required free set is exactly `{FREE_VERIFIED, SELF_HOSTED}` (`AUTO_FREE_ALLOWED_COST_CLASSES`), and an explicit source guard fails the suite if a provider-priority name appears in the free routing modules. No `STATIC_FREE_PROVIDER_ALLOWLIST` exists in the audited path.

## 5. Cost-class stress results

`FREE_VERIFIED` (real groq/cerebras hard-stop rows) and `SELF_HOSTED` (vllm) are the only auto-admissible classes. `FREE_UNKNOWN` (chatgpt-web row without `hardStopGuaranteed`, api-airforce), `UNKNOWN_COST` (no cost metadata), `NULL_COST` (explicit null cost), `CREDIT_BACKED` (agentrouter one-time-initial), and `PAID` are all denied by `classifyFreeCost` regardless of provider name. Under stress — with every allowed candidate failed — the denied classes are never substituted; observed route state is only `NO_FREE_PROVIDER_AVAILABLE`. `STRESS_PAID_ESCAPE=NO` holds.

## 6. Free-to-free failover and recovery

`FREE_TO_FREE_FAILOVER=PASS`: alpha → beta → gamma failover across three synthetic hard-stop FREE_VERIFIED providers, with no hardcoded sequence (order emerges from native filtering + rules scoring). `AUTO_PROVIDER_RECOVERY=PASS`: after cooldown/breaker recovery semantics, alpha becomes eligible again. Connection-scoped 401/403 exhaustion affects only the failing connection, leaving the sibling provider usable, and never mutates credentials or deletes anything.

## 7. Bounds, concurrency, and non-escalation

Retry/failover bounds are native: `MAX_GLOBAL_ATTEMPTS=30` (hard cap 200 via `clampGlobalAttempts`), `MAX_COMBO_DEPTH=3` (hard cap 10), and the search chain executes each candidate at most once. Concurrency tests confirm parallel routing, concurrent failure during routing, circuit transitions during selection, and quota flips during pool rebuild do not deadlock, do not loop, and do not emit a retry storm or a paid escape.

## 8. Read-only observability

`getAutoComboCandidates` decorates the pool using `readFreeAccessStateCached` (cache-only) and the source assertion proves `resolveFreeAccessState(` — the refresh-triggering variant — is never called from the listing path. A runtime test seeds the free-access cache, poisons `globalThis.fetch` to throw if invoked, and confirms a cache hit is returned while a miss yields `undefined` with zero fetch calls. Reading candidates never probes a provider.

## 9. Honest notes (native semantics observed, not bugs)

- `rules` strategy falls back to the full candidate list if every candidate is circuit-OPEN; in the live pipeline OPEN providers are already removed upstream by the breaker-aware filtering and per-target skip logic, so this fallback is only reachable when no healthy alternative exists.
- `engine.selectProvider` re-admits candidates excluded by the optional self-healing layer when the filtered pool is empty; this is deliberate native behavior and not a FREE-classification bypass (FREE admission happens earlier and is never relaxed).
- `resolveAutoStrategyOrder` keeps quota-blocked eligible targets as a last-resort tail after the selected target; per-request enforcement of exhaustion/cooldown relies on `getExhaustedTargetSkipReason` plus persisted `rateLimitedUntil`/`unavailable` status, which the stress suite exercises directly.
- Tests are component-level and deterministic; no live :20128 service, no live DB, and no external provider endpoint was contacted. Circuit timing tests use small native reset windows (40 ms) plus real `Date.now()` waits.

## 10. Evidence

- Test file: `tests/unit/free-ai-manager-stress-r1.test.ts` (20 tests; node:test + node:assert/strict).
- Run command: `DISABLE_SQLITE_AUTO_BACKUP=true node --max-old-space-size=8192 --import tsx/esm --import ./open-sse/utils/setupPolyfill.ts --import ./tests/_setup/isolateDataDir.ts --test tests/unit/free-ai-manager-stress-r1.test.ts` — result `# tests 20`, `# pass 20`, `# fail 0`, `# skipped 0`.
- Typecheck: `npm run typecheck:core` — zero diagnostics.
- Lint: `npx eslint tests/unit/free-ai-manager-stress-r1.test.ts` — exit 0.
- Full machine output captured at `/tmp/opencode/stress-run3.txt` (isolated clone, not committed).

## 11. Conclusion

The FREE AI Manager continuously selects among all dynamically discovered eligible FREE routes. Admission is fact-based (catalog/registry classification + sentinel) with an exact `{FREE_VERIFIED, SELF_HOSTED}` boundary; failures produce native health/cooldown/circuit updates; failover is free-to-free with bounded retries and controlled all-unavailable outcomes; capability boundaries (chat/vision/search/image) are enforced independently; and paid or unproven-cost routes are never used as fallback. FINAL_RESULT=PASS.
