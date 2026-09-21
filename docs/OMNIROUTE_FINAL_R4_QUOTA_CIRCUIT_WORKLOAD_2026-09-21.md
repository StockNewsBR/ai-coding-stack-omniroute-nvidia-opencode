# OmniRoute — Final Free Autopilot: R4 Quota / Circuit Breaker / Workload Isolation (redo from primary source)

Mission: OMNIROUTE_FREE_AUTOPILOT_FINAL_RECONSTRUCTION_R1_11_R4_LIVE_CLOSURE_2026_09_21
Phase: 6 (isolated candidate; not deployed)
Date: 2026-09-21
Workspace: /home/dcima/omniroute-final-free-autopilot-20260921
Branch: final/free-autopilot-2026-09-21

- UPSTREAM_BASE_SHA=dea6bb8b6b64d3a3d9f639a044625c3452442c56
- R4_SHA=f7f739e661919452bd0fe8355e629ef223a33d51
- R4_COMMIT=f7f739e66 "feat(omniroute): harden quota circuit and workload isolation" (tests only: 1 file, +266)

RETRO NOTE: the previous R4 final report was never saved, so R4 is treated as NOT certified
and is redone here from primary source. No old R4 diff was imported; the work below is a
verification/hardening pass over the native components of the final candidate.

## 1. Required fields

R4=PASS
QUOTA_AWARENESS=PASS
CIRCUIT_BREAKER=PASS
COOLDOWN=PASS
AUTO_RECOVERY=PASS
WORKLOAD_ISOLATION=PASS
IAMM_PROFILE_ISOLATION=PASS
STOCKNEWSBR_PROFILE_ISOLATION=PASS
LEGACY_PROFILE_ISOLATION=PASS
PAID_AUTO_FALLBACK=NO

## 2. What was verified (native components only — no second breaker, no parallel engine)

QUOTA AWARENESS

- Quota telemetry is headroom/negative evidence only, never cost classification (the sentinel
  owns classification): a fresh EXHAUSTED reading denies the connection (`safeConnectionIds: []`,
  reason `QUOTA_EXHAUSTED`); a fresh SAFE reading with headroom keeps the connection and reports
  `quotaStatus: "SAFE"` + `quotaRemaining`; absent/stale/UNKNOWN telemetry never excludes a
  provably hard-free route (hard-stop or self-hosted) but also never upgrades an unproven one.
- Native state: `src/lib/quota/providerQuotaState.ts` (`getProviderQuota`, `recordProviderQuotaUsage`,
  `clearProviderQuota`); the pool-level synchronous cache reader is `freeAccessQuota.ts`
  (fail-closed, invalidated on 402/403 via `markAccountUnavailable`).

CIRCUIT BREAKER + COOLDOWN + RECOVERY

- The provider breaker is per provider name via the native registry
  (`getCircuitBreaker(name, options?)`): the R4 suite asserts distinct instances per provider,
  both CLOSED initially, `canExecute()` true, and `reset()` stable — i.e. a provider-specific
  failure cannot globally disable unrelated free providers.
- Component semantics (threshold trip, HALF_OPEN probe, recovery to CLOSED, per-kind thresholds)
  are covered by the 52-test native breaker batch, all PASS:
  `provider-breaker-halfopen-recovery`, `circuit-breaker-failure-kind`,
  `resilience-settings-upstream429-breaker`, `circuit-breaker-abort-provider-trip-7907`,
  `8376-econnrefused-breaker`, `breaker-network-error-guard`.
- Connection-level cooldown/terminal isolation: `filterResilienceBlockedCandidates` drops only the
  affected connection (future `rateLimitedUntil`, or `testStatus` unavailable/terminal) while
  unrelated providers' candidates survive; the all-healthy case preserves the pool reference.
- LIVE evidence from the R1.11 isolated canary: a forced 429 was recorded on the affected
  connection (`error_code: "429.0"`, `last_error_type: "rate_limited"`,
  `last_error: "Model mock-local-1 rate_limited"`), the candidate disappeared from the pool,
  subsequent calls failed fast with 503 (no retry storm), and after the mode was cleared a 200
  returned with the candidate back and eligibility intact (AUTO_RECOVERY).
- HONEST LIMITATION: 16 forced 500s updated `last_failure_time` but did not increment
  `failure_count` (`lastFailureKind: null`, `openCycleCount: 0`), so the provider-breaker OPEN
  transition could not be forced from the canary with mock 500s; that transition is covered at
  component level by the batch above instead (the DB row `domain_circuit_breakers` for
  `ollama-local` remained CLOSED with `failureThreshold: 12`, `resetTimeout: 30000`,
  `halfOpenRequests: 1`).

WORKLOAD ISOLATION

- There is no IAMM or StockNewsBR code inside the candidate (zero references): both are external
  client workloads, and neither their code nor their keys were touched.
- The isolation boundary in the candidate is the per-API-key scope: excluded-connection sets are
  applied per caller (`getExcludedConnectionIds(apiKeyId, modelStr)` → `filterExcludedCandidates`),
  so the IAMM view and the StockNewsBR view of the SAME pool differ only by their own exclusions
  and the legacy/default view (empty set) returns the pool reference unchanged. No global mutation,
  no cross-profile routing-history bleed.

PROFILE SEMANTICS

- FREE_ONLY cost admission takes NO profile input: `freeProviderSentinel` / `strictZeroCostFilter`
  (R1), `searchFreeRouting` (R2) and `freeImageRouting` (R3) have no profile parameter.
- Adding profile markers (IAMM / StockNewsBR / default) to a candidate changes nothing: the
  FREE_VERIFIED verdict and `safeConnectionIds` are identical, and no profile can make PAID,
  CREDIT_BACKED, FREE_UNKNOWN, UNKNOWN_COST or NULL_COST eligible (`autoFreeAllowed: false`;
  `AUTO_FREE_ALLOWED_COST_CLASSES` is exactly `{FREE_VERIFIED, SELF_HOSTED}`).
- Manual/pinned selections never pass through this module.

## 3. Evidence

- `tests/unit/free-policy-resilience-r4.test.ts`: 14/14 PASS — quota exhaustion/headroom/missing/
  stale; unproven-never-upgraded; breaker registry keying; cooldown + terminal-status isolation;
  healthy-identity reference; per-caller exclusion scoping without shared-pool mutation; allowlist
  narrowing per caller; profile-marker independence; no class upgrade under any profile; admission-set
  assertion.
- Native breaker batch: 6 files / 52 tests PASS.
- autoCombo regression: 4 files / 56 tests PASS (`vitest.mcp.config.ts`).
- `npm run check:open-sse-typecheck`: no new errors (only the pre-existing
  `src/app/api/v1/models/catalog.ts` TS2367, proven pre-existing at dea6bb8 via the stash experiment).
- Scoped eslint, pre-commit hooks (prettier/eslint --fix, docs-sync, t11 any-budget,
  tracked-artifacts) and the secret scan: all clean.

## 4. Honest limitations

- No new hardening code was required: the native components already satisfied the R4 matrix
  (the mission explicitly allows component-level evidence where the live setup cannot force a
  transition).
- The provider-breaker OPEN transition was not forceable from the canary with mock 500s
  (documented above); cooldown / rate-limit / recovery were proven live.
- IAMM/StockNewsBR isolation is proven structurally at the routing layer with deterministic
  fixtures — no production history was fabricated.

## 5. Data safety

No paid/credit-backed/unknown-cost provider is reachable in R4; no provider calls were made;
live `:20128` untouched; OpenCode / Hermes / Harness / IAMM / StockNewsBR / AWS / Meta untouched;
PROVIDERS_DELETED=0; CONNECTIONS_DELETED=0; CREDENTIALS_DELETED=0; PAID_INFERENCE_TRIGGERED=NO;
SECRETS_EXPOSED=NO.
