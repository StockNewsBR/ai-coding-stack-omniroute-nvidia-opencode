# OmniRoute — Image Paid Fallback Framework R0 (free-first preserved)

Mission: OMNIROUTE_IMAGE_PAID_FALLBACK_FRAMEWORK_R0
Phase: R0 (framework only — no provider adapter shipped, nothing enabled)
Date: 2026-09-21
Workspace: /home/dcima/omniroute-image-paid-framework-r0
Branch: feature/image-paid-fallback-framework-r0

- UPSTREAM_BASE_SHA=f7f739e661919452bd0fe8355e629ef223a33d51 ("feat(omniroute): harden quota circuit and workload isolation")
- CHECKPOINT_SHA=eaa81ac7a0f15fa294b4ec5d869c98e148597c6b ("wip(image): preserve paid fallback framework after interrupted build")
- Closure commit: HEAD of this branch after this document (see `git log -1`).

## 1. Required fields

FRAMEWORK_R0=PASS
FREE_FIRST=YES
IMAGE_PAID_FALLBACK_DEFAULT=NO
TEXT_PAID_FALLBACK=NO
PAID_IMAGE_PROVIDER_INTERFACE=PASS
BUDGET_GUARD=PASS
MAX_COST_GUARD=PASS
DAILY_BUDGET_GUARD=PASS
MONTHLY_BUDGET_GUARD=PASS
DYNAMIC_PROVIDER_SELECTION_FRAMEWORK=PASS
HEALTH_INTEGRATION=PASS
QUOTA_INTEGRATION=PASS
CIRCUIT_INTEGRATION=PASS
AWS_ADAPTER_IMPLEMENTED=NO
META_ADAPTER_IMPLEMENTED=NO
PAID_API_CALLED=NO
PAID_SPEND=0
PRODUCTION_CHANGED=NO
OPENCODE_CHANGED=NO
TESTS=38/38 PASS (tests/unit/image-paid-fallback-framework.test.ts)
TYPECHECK=PASS (npm run typecheck:core, exit 0)
LINT=PASS (eslint scoped to changed files, exit 0)
BUILD=PASS (npm run build, exit 0)
REMOTE_PUSH=PASS (audit-origin/feature/image-paid-fallback-framework-r0)
FINAL_RESULT=PASS

## 2. What was built

Free-first is untouched: the image route still resolves the free provider pool first and only
consults the paid framework when the free pool fails. The paid path is a gated, disabled-by-default
framework — no paid provider implementation ships in R0.

- `open-sse/config/paidImagePolicy.ts` — policy model + fail-closed normalization:
  `DEFAULT_PAID_IMAGE_POLICY = Object.freeze({ imagePaidFallbackEnabled: false })`.
  `normalizePaidImagePolicy()` disables malformed policy and drops unverifiable budgets.
  `isPaidImagePolicyFunded()` requires enabled + all three budgets (max cost per image, daily,
  monthly). `evaluatePaidImageBudget()` denies in order: policy gate → budget-config gate →
  quote validity → per-image max cost → spend-state gate (`BUDGET_STATE_UNVERIFIED`) → daily cap →
  monthly cap → allow.
- `open-sse/config/paidImageProviderAdapter.ts` — provider interface only, no implementations:
  `PaidImageProviderAdapter` with `capabilities()` (capability wall: only `image-generation`),
  `isConfigured()`, `isAvailable()`, `healthStatus()`, live `quoteCost()` (never a stored constant),
  `quotaState()`, `generateImage()`, optional `reportUsage()`. Non-image capabilities
  (`chat`, `text`, `coding`, `search`, `vision-understanding`, `embeddings`, `tools`) are
  explicitly rejected — this is the TEXT_PAID_FALLBACK=NO wall.
- `open-sse/config/paidImageRouting.ts` — dynamic selection + execution:
  `resolvePaidImageProvider()` gates every adapter through allow/deny lists, capability,
  configuration, availability, injected circuit state, health (`healthy`/`degraded` only), quota
  (`available` only), live cost quote, quality floor, and the budget evaluator over the ledger;
  survivors are sorted by estimated cost ascending (providerId tiebreak) — cheapest acceptable
  provider wins. `executePaidImageProvider()` re-checks capability + policy + funding before any
  call, and records ledger entries (executed/failed) in all outcomes.
  `resolveImageRouteSelection()` composes free-first: `request.free.ok` returns immediately;
  otherwise paid is evaluated with `DEFAULT_PAID_IMAGE_POLICY`, and the route reports
  `NO_FREE_IMAGE_PROVIDER_AVAILABLE` with the paid deny reason attached.
- `open-sse/config/paidImageLedger.ts` — budget ledger interface + in-memory implementation;
  entries carry no prompt contents or secrets; denied entries never count as spend; unparsable
  timestamps are conservatively counted.
- `src/lib/usage/domainPaidImageLedger.ts` — durable ledger backed by the existing
  `domain_state` cost helpers (`saveCostEntry`/`loadCostTotal`), scope `paid-image` — reuses the
  existing persistence, does not open a second DB.
- `src/app/api/v1/images/generations/route.ts` — wires the free resolution result through
  `resolveImageRouteSelection` (free-first preserved) and handles provider-only selections.

## 3. Guard evidence

- BUDGET_GUARD / DAILY / MONTHLY: `evaluatePaidImageBudget()` caps `dailySpend + estimated` and
  `monthlySpend + estimated` against configured budgets; missing/unverifiable spend state denies
  (`BUDGET_STATE_UNVERIFIED`) — fail-closed, never fail-open.
- MAX_COST_GUARD: per-image estimate above `maxCostPerImage` denies (`MAX_COST_EXCEEDED`);
  absent or non-finite quote denies (`COST_QUOTE_UNAVAILABLE`).
- HEALTH_INTEGRATION: adapter health `healthy`/`degraded` passes, `unhealthy`/`unknown` denies.
- QUOTA_INTEGRATION: adapter quota `available` passes, `exhausted`/`unknown` denies.
- CIRCUIT_INTEGRATION: injected circuit state published by the existing circuit breaker is
  consulted per adapter (`FREE_IMAGE_CIRCUIT_OPEN` free-failure reason is carried into the paid
  fallback decision) — no second breaker is implemented here.
- DYNAMIC_PROVIDER_SELECTION_FRAMEWORK: adapters are enumerated at call time through the interface
  and the cheapest acceptable quote is selected; adding a provider is an adapter registration,
  not a routing edit.
- Defaults: `imagePaidFallbackEnabled: false` in the frozen default policy; with no adapter
  registered and the policy disabled, the paid path denies at the first gate.

## 4. Boundary compliance

- AWS_ADAPTER_IMPLEMENTED=NO / META_ADAPTER_IMPLEMENTED=NO: no AWS/Bedrock/Meta/other provider
  references or implementations in the framework files (grep-verified).
- PAID_API_CALLED=NO / PAID_SPEND=0: no network calls (`fetch`, URLs, axios) in any framework
  file; all tests use in-process synthetic adapters.
- PRODUCTION_CHANGED=NO: production OmniRoute, live :20128, IAMM, StockNewsBR untouched.
- OPENCODE_CHANGED=NO: no OpenCode config/auth/connection changes.

## 5. Validation evidence

- Tests: `DISABLE_SQLITE_AUTO_BACKUP=true node --max-old-space-size=8192 --import tsx/esm
--import ./open-sse/utils/setupPolyfill.ts --import ./tests/_setup/isolateDataDir.ts
--test tests/unit/image-paid-fallback-framework.test.ts` → tests 38, pass 38, fail 0.
- Typecheck: `npm run typecheck:core` → exit 0 (framework files added to
  `tsconfig.typecheck-core.json`).
- Lint: eslint on changed files with the repo suppression file → exit 0.
- Build: `npm run build` (isolated Next build + standalone colocation) → exit 0.

## 6. Files

| File                                               | Δ      |
| -------------------------------------------------- | ------ |
| `open-sse/config/paidImageLedger.ts`               | +78    |
| `open-sse/config/paidImagePolicy.ts`               | +211   |
| `open-sse/config/paidImageProviderAdapter.ts`      | +84    |
| `open-sse/config/paidImageRouting.ts`              | +477   |
| `tests/unit/image-paid-fallback-framework.test.ts` | +696   |
| `src/app/api/v1/images/generations/route.ts`       | +14 −3 |
| `src/lib/usage/domainPaidImageLedger.ts`           | +38    |
| `tsconfig.typecheck-core.json`                     | +5     |

## 7. Next (out of scope for R0)

Registering any concrete paid image provider (adapter implementation, credentials, enablement of
`imagePaidFallbackEnabled` with budgets) is explicitly NOT part of R0 and requires separate
approval — the framework is inert until then.
