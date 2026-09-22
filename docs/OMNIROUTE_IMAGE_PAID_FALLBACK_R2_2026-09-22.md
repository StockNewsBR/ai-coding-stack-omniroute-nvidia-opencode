# OmniRoute Image Paid Fallback — R2 (Dynamic Paid Image Provider Routing)

Date: 2026-09-22
Mission: `OMNIROUTE-M22-LIVE-R2-PAID-IMAGE-PROVIDER-SETUP`
Worktree: `/home/dcima/omniroute-image-provider-setup-r2`
Branch: `setup/image-provider-r2`
Base commit: `adeafc363436823449099034375fba61e51f4645`

## 1. Scope

R2 completes the paid **image** fallback framework started in R0/R1. It adds dynamic,
signal-driven provider ranking, the non-secret provider runtime-configuration contract,
the env-driven deps assembly, and the regression coverage that proves the free-first and
text-isolation invariants. No real paid inference was performed; all coverage uses
in-memory synthetic adapters and asserted zero-fetch fetchers.

Policy is unchanged and absolute:

- **TEXT**: `FREE_ONLY=ON`, `TEXT_PAID_FALLBACK=NO`. No text/chat/reasoning/code/search/tool
  request can enter a paid image adapter. The capability wall rejects every
  `PAID_NON_IMAGE_CAPABILITIES` value with `CAPABILITY_NOT_IMAGE_GENERATION`.
- **IMAGE**: `FREE_FIRST=YES`. An eligible free image route short-circuits resolution with
  `via: "free"` **before** any paid adapter is consulted.

## 2. Free-first gate

`resolveImageRouteSelection` returns the free selection immediately when `free.ok` is true.
Paid deps are only evaluated when the free pool reports unavailable/quota/circuit-open, and
only when the paid policy is explicitly enabled and funded. Proven by
`image-paid-fallback-r2-router-dynamic-ranking.test.ts`:
a healthy free route yields **zero** `quoteCost` and **zero** `generateImage` calls on every
configured paid adapter (`FREE_IMAGE_AVAILABLE → PAID_IMAGE_CALLS=0`).

## 3. Default-disabled paid fallback

`DEFAULT_PAID_IMAGE_POLICY` is frozen `{ imagePaidFallbackEnabled: false }`. Production
`resolveFreeImageRouteSelection()` passes no paid deps, so paid resolution composes to
`POLICY_DISABLED`. `buildPaidImageRoutingDeps()` returns `undefined` unless the policy is
enabled **and** funded (max cost/image + daily + monthly budgets all defined) **and** at
least one provider has both a model id and a credential. There is no implicit enable path.

## 4. Dynamic provider selection (no fixed primary/backup)

The router owns ranking; adapters expose no priority. `compareRankingSignals` orders
acceptable candidates by:

1. health tier (`healthy` > `degraded` > `unhealthy` > `unknown`)
2. rate-limit state (not rate-limited first)
3. recent consecutive failures (fewer first)
4. observed latency (lower first)
5. quality score (higher first; `telemetry.qualityScore` overrides the quote value)
6. estimated cost per image (lower first)
7. providerId (stable deterministic tie-break)

Cost is therefore the decider only when every other signal ties. The adapter array order is
irrelevant — proven by A/B array-order tests. No AWS-primary/Meta-backup (or the inverse)
relationship exists anywhere in the code or fixtures.

## 5. Cost guardrails

Enforced in `evaluatePaidImageBudget` / `paidImageLedger`:

- `MAX_COST_PER_IMAGE` → `MAX_COST_EXCEEDED`
- `DAILY_PAID_IMAGE_BUDGET` → `DAILY_BUDGET_EXCEEDED`
- `MONTHLY_PAID_IMAGE_BUDGET` → `MONTHLY_BUDGET_EXCEEDED`

All three fail closed with no silent override. `executePaidImageProvider` reserves budget
atomically via `ledger.tryReserve` before any provider call. Free calls never touch the paid
ledger.

## 6. Circuit breaker

Paid image providers use the existing OmniRoute breaker — the same predicate the free image
pool uses: `(providerId) => !getCircuitBreaker(providerId).canExecute()`. An open circuit
rejects the candidate with `CIRCUIT_OPEN` and removes it from the candidate set; the
remaining eligible provider is selected. No global effect on unrelated text providers.

## 7. Observability

`PaidImageSelection` exposes the selected `rank` signals and the full `considered[]`
rejection list (`providerId`, deny `code`, reason, estimated cost). Ledger entries record
request id, provider, model, capability, fallback reason, decision reason, outcome, and
estimated/actual cost — never prompts, credentials, auth headers, or raw provider bodies.

## 8. Provider readiness

| Provider | Adapter | Credential source (names only) | Readiness |
|---|---|---|---|
| `aws-bedrock-image` | Nova Canvas / Titan Image v2 / **Stability Stable Image Core v1** | `AWS_BEARER_TOKEN_BEDROCK`, `BEDROCK_API_KEY` | Adapter ready; **price evidence blocked externally** |
| `meta-muse-image` | Meta Model API images (`muse-image-1.0`, `https://api.meta.ai/v1`) | `MODEL_API_KEY`, `META_API_KEY` | Adapter ready; official price verified (0.01 USD/image) |

### 8.1 AWS Stable Image Core — EXTERNAL BLOCKER (no invented price)

No official on-demand price is published for `stability.stable-image-core-v1:1`. The AWS
Bedrock pricing page prices only the 13 Stability AI image **services** per generation, and
the AWS Price List API for `us-west-2` contains zero Stability SKUs. Only a non-official
aggregator quotes ~0.04 USD/image, which is not acceptable evidence.

Consequence: the AWS adapter's `quoteCost` returns `null` → `COST_QUOTE_UNAVAILABLE` → the
provider is rejected by the router. This is **fail-closed by design**; no price was
invented. See `canary/r2/aws-price-evidence.example.json`.

## 9. Text isolation

`PAID_NON_IMAGE_CAPABILITIES` (`chat`, `text`, `coding`, `search`, `vision-understanding`,
`embeddings`, `tools`) are rejected at the router's first gate with
`CAPABILITY_NOT_IMAGE_GENERATION`, before any `quoteCost` or `generateImage` call. Covered
per capability in the R2 router test file.

## 10. Validation evidence

- `npm run typecheck:core` — clean.
- `npx eslint <changed files>` — clean.
- Scoped paid-image unit suite (R0, R1, R2) — all green; synthetic adapters only, no network.
- `canary/r2/spend-guard.ts` — offline pre-flight only; blocks when a price is missing or a
  ceiling is exceeded.

## 11. Not enabled in production

Paid image fallback remains disabled in production: `IMAGE_PAID_FALLBACK_ENABLED` is unset,
so `buildPaidImageRoutingDeps()` returns `undefined` and routing is unchanged FREE_ONLY image
behavior. Enabling requires an explicit operator policy (enable flag + all three budgets +
provider model ids + credentials).
