# OMNIROUTE — IMAGE FREE-FIRST PAID FALLBACK — R1 (2026-09-22)

**Mission:** OMNIROUTE_IMAGE_FREE_FIRST_PAID_FALLBACK_R1
**Role:** Isolated paid image provider integration
**Workspace:** `/home/dcima/omniroute-image-paid-fallback-r1` (independent physical clone)
**Branch:** `feature/image-free-first-paid-fallback-r1`
**Base:** `feature/image-paid-fallback-framework-r0`

---

## 1. Status block

```
BASE_SHA=ff229f979430bd41f06450c6592b9679d1f70bca
FINAL_SHA=d90881a2759c2220fee277414afbe0e14e905f37

R0_REGRESSION=PASS (38/38)
NEW_TESTS=PASS (61/61)
TYPECHECK=PASS
LINT=PASS
BUILD=PASS

FREE_FIRST=YES

IMAGE_PAID_FALLBACK_DEFAULT=NO
TEXT_PAID_FALLBACK=NO

AWS_PROVIDER_VERIFIED=YES
AWS_ADAPTER_IMPLEMENTED=YES

META_PROVIDER_VERIFIED=YES
META_ADAPTER_IMPLEMENTED=YES
META_INTEGRATION_STATUS=VERIFIED_AND_IMPLEMENTED

DYNAMIC_PROVIDER_SELECTION=PASS
STATIC_PROVIDER_PRIORITY=NO

PRICE_HARDCODED=NO
PRICE_EVIDENCE_CONFIGURABLE=YES

MAX_COST_GUARD=PASS
DAILY_BUDGET_GUARD=PASS
MONTHLY_BUDGET_GUARD=PASS
CONCURRENT_BUDGET_OVERRUN=NO

HEALTH_INTEGRATION=PASS
QUOTA_INTEGRATION=PASS
CIRCUIT_INTEGRATION=PASS

FREE_FAILURE_REASON_LOGGING=PASS
COST_LOGGING=PASS

PAID_API_CALLED=NO
PAID_SPEND=0

PRODUCTION_CHANGED=NO
LIVE_SERVICE_RESTARTED=NO

OPENCODE_CHANGED=NO
HARNESS_CHANGED=NO
HERMES_CHANGED=NO
IAMM_CHANGED=NO
STOCKNEWSBR_CHANGED=NO

SECRETS_COMMITTED=NO
SECRETS_PRINTED=NO

FINAL_RESULT=PASS
```

> `FINAL_SHA` above is the R1 **implementation tip**. The closure (report) commit is the branch head; see §9.

---

## 2. Scope — what R1 did and did NOT do

R1 integrates **concrete** AWS and Meta paid image-generation adapters into the
**existing, unchanged** R0 framework (FREE_FIRST, `PaidImageProviderAdapter`,
paid image policy, max-cost / daily / monthly budget guards, durable paid-image
ledger, health gate, quota gate, circuit gate, dynamic cost-based selection,
strict image-generation capability wall).

R1 **did not** redesign R0. R1 **did not** enable paid fallback anywhere.

**Production state is untouched.** The committed/default state remains:

```
FREE_FIRST=YES
IMAGE_PAID_FALLBACK_DEFAULT=NO
TEXT_PAID_FALLBACK=NO
```

No paid image inference was made. No money was spent. No credentials were
created, rotated, printed or committed. OpenCode / Harness / Hermes / IAMM /
StockNewsBR were not touched.

---

## 3. Phase 1 — Provider reality check (official sources only)

### AWS — `AWS_PROVIDER_VERIFIED=YES`

- **Service/operation:** Amazon **Bedrock Runtime** `InvokeModel` (native,
  non-Converse): `POST https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke`,
  `Content-Type: application/json`.
- **Models (current, documented):** `amazon.nova-canvas-v1:0` (Amazon Nova
  Canvas), `amazon.titan-image-generator-v2:0` (Titan Image Generator G1 v2).
  Neither is hardcoded as an eternal default — both are exported as named
  constants for reference and the adapter requires a configured model id.
- **Text-to-image request:** `{"taskType":"TEXT_IMAGE","textToImageParams":{"text":<string>},"imageGenerationConfig":{"numberOfImages":<int>}}`
  (fields verified from the Nova user guide; the adapter emits the minimal
  verified subset).
- **Response:** `{"images":["<base64 PNG>", ...]}` — bytes at `images[0]`.
- **Auth:** AWS itself uses SigV4 + `bedrock:InvokeModel`. The adapter reuses
  OmniRoute's **existing** Bedrock credential mechanism (Bearer API key via the
  existing `buildBedrockRuntimeBaseUrl` / bedrock service helpers) rather than
  introducing a second credential path or a SigV4 implementation.
- **Evidence:** `docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html`,
  `.../image-gen-access.html`,
  `docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-canvas.html`,
  `.../model-card-amazon-titan-image-generator-g1-v2.html`.
- **Pricing:** NOT written as code truth (see §6).

### Meta — `META_PROVIDER_VERIFIED=YES`

- **Product:** **Meta Model API — "Muse Image"**, a real, officially documented,
  publicly callable paid image-generation API.
- **Endpoint:** `POST https://api.meta.ai/v1/images/generations`
  (OpenAI Images API compatible; base_url `https://api.meta.ai/v1`).
- **Model:** `muse-image-1.0`.
- **Auth:** `Authorization: Bearer $MODEL_API_KEY`.
- **Request:** `{ model, prompt, n (1–10), size?, response_format?, output_format? }`.
- **Response:** `{ created, data:[{ b64_json?, url?, revised_prompt? }], output_format?, usage? }`.
- **Evidence (two independent official sources):**
  `dev.meta.ai/docs/api-reference/images/create-image` (fetched directly — full
  API reference returned) and `ai.developer.meta.com/docs/image-generation`
  (+ `developer.meta.com/ai/models/muse-image/`).
- Because a real, callable, officially documented Meta image API **was**
  verified, the Meta adapter was implemented. `META_INTEGRATION_STATUS=VERIFIED_AND_IMPLEMENTED`
  (not `BLOCKED_EXTERNAL`).
- **Pricing:** NOT written as code truth (see §6).

No endpoint, model id, SDK method, auth format, quota API or price was
fabricated.

---

## 4. Phase 2 — Existing integration points reused (no duplication)

| Concern | Reused existing mechanism |
|---|---|
| Credential retrieval | Existing provider-connection credential mechanism (`getCachedProviderConnections` / connection records); adapters accept the resolved key as config and never persist it |
| Bedrock endpoint/region | `open-sse/config/bedrock.ts` — `normalizeBedrockRegion`, `resolveBedrockRegion`, `buildBedrockRuntimeBaseUrl` |
| Bedrock error shape precedent | `open-sse/services/bedrock.ts` (`BedrockNativeApiError`, Bearer header convention) |
| Budget ledger storage | `src/lib/db/domainState.ts` `saveCostEntry` / `loadCostTotal` (table `domain_cost_history`, scope `paid-image`) — **no second database** |
| Health / circuit | Router consumes `isCircuitOpen(providerId)` supplied by the caller (native `getCircuitBreaker`) — **no duplicate breaker** |
| Request ids | Caller-supplied `requestId` propagated into ledger entries and decision logs |
| Routing | Existing `resolvePaidImageProvider` / `resolveImageRouteSelection` |

No second secret store, credential DB, breaker, global health engine or provider
subsystem was created.

---

## 5. Phase 3–7 — Adapters and registry

New modules (all under `open-sse/config/`):

- **`paidImageProviderAdapter`-implementing adapters**
  - `paidImageAwsAdapter.ts` — `createAwsImageAdapter(config)`; providerId
    `aws-bedrock-image`; region configurable; model id configurable (required);
    Bearer credential; bounded `AbortController` timeout (default 60 s);
    normalized errors (`AWS_IMAGE_AUTH_ERROR`, `AWS_IMAGE_THROTTLED`,
    `AWS_IMAGE_MODEL_NOT_FOUND`, `AWS_IMAGE_VALIDATION_ERROR`,
    `AWS_IMAGE_PROVIDER_ERROR`, `AWS_IMAGE_TIMEOUT`, `AWS_IMAGE_NETWORK_ERROR`,
    `AWS_IMAGE_CREDENTIALS_MISSING`, `AWS_IMAGE_MODEL_MISSING`, …); latency
    reported; `actualCostUsd` deliberately **absent** (no factual per-call cost
    evidence) so only the estimated quote is retained.
  - `paidImageMetaAdapter.ts` — `createMetaImageAdapter(config)`; providerId
    `meta-muse-image`; baseUrl configurable (default `https://api.meta.ai/v1`);
    model configurable (required); Bearer credential; bounded timeout;
    normalized errors (`META_IMAGE_AUTH_ERROR`, `META_IMAGE_RATE_LIMITED`,
    `META_IMAGE_MODEL_NOT_FOUND`, `META_IMAGE_VALIDATION_ERROR`,
    `META_IMAGE_PROVIDER_ERROR`, `META_IMAGE_TIMEOUT`, `META_IMAGE_NETWORK_ERROR`,
    `META_IMAGE_CREDENTIALS_MISSING`, `META_IMAGE_MODEL_MISSING`, …);
    `actualCostUsd` absent.
- **Capability wall:** both adapters expose **`["image-generation"]` only** —
  never chat/text/coding/search/vision-understanding/embeddings/tools.
- **`paidImageProviderRegistry.ts`** — smallest native-compatible registry
  (`register/has/get/list/size`). It permits AWS **and** Meta and encodes **no**
  priority. Selection belongs to the R0 router.
- **`paidImagePriceEvidence.ts`** — configurable price evidence (§6).

---

## 6. Phase 6 — Price evidence (no hardcoded prices)

`PRICE_HARDCODED=NO` · `PRICE_EVIDENCE_CONFIGURABLE=YES`

- No `AWS_IMAGE_COST` / `META_IMAGE_COST` constant exists. Historical/observed
  prices (`$0.04`, `$0.01`, …) are **not** encoded anywhere in source.
- `normalizePriceEvidence(raw)` accepts an auditable record carrying
  `providerId, modelId?, currency ("USD"), unit ("image"), unitPrice,
  verifiedAt, effectiveAt?, source?, maxAgeMs?`. Malformed → dropped.
- `selectPriceEvidence` filters by provider + freshness, prefers an exact model
  match, then a provider-wildcard entry, then the lowest `unitPrice`.
- `buildPaidImageQuote` computes `unitPrice × n`; **missing / malformed /
  stale** evidence → `null` → the router emits `COST_QUOTE_UNAVAILABLE` and the
  provider is **rejected (fail closed)**.

---

## 7. Phase 8–10 — Policy loading, free-first wiring, failure reasons

- **Policy loading:** `paidImagePolicyLoader.ts` exposes
  `loadPaidImagePolicy(source)` and `loadPaidImagePolicyFromEnv(env)`. Default
  is `{ imagePaidFallbackEnabled: false }`. Budgets
  (`maxCostPerImage`, `dailyImageBudget`, `monthlyImageBudget`) and optional
  `allowProviders`/`denyProviders`/`qualityFloor` come from external
  configuration (env keys `IMAGE_PAID_FALLBACK_ENABLED`,
  `IMAGE_PAID_MAX_COST_PER_IMAGE`, `IMAGE_PAID_DAILY_BUDGET`,
  `IMAGE_PAID_MONTHLY_BUDGET`, `IMAGE_PAID_ALLOW_PROVIDERS`,
  `IMAGE_PAID_DENY_PROVIDERS`, `IMAGE_PAID_QUALITY_FLOOR`). Missing or malformed
  config → **DENY**. No implicit spendy default exists.
- **Free-first wiring:** `src/app/api/v1/images/generations/route.ts` resolves
  FREE first via `resolveFreeImageProvider` → `resolveImageRouteSelection`.
  On FREE success the FREE result is returned **immediately**; no paid adapter is
  consulted, no paid quote is taken, no paid credential is read. Paid adapters
  are **not** passed by default, so runtime stays controlled-unavailable.
- **Failure reasons preserved:** `NO_FREE_IMAGE_PROVIDER_AVAILABLE`,
  `FREE_IMAGE_QUOTA_EXHAUSTED`, `FREE_IMAGE_PROVIDER_UNHEALTHY`,
  `FREE_IMAGE_PROVIDER_TIMEOUT`, `FREE_IMAGE_CIRCUIT_OPEN`. The router records
  the free failure reason and, for any paid selection/execution, logs provider
  selected, estimated cost, decision reason and request id — never prompt
  contents, never secrets.

---

## 8. Phase 11 — Concurrency / budget safety (the one real defect fixed)

**Defect found:** `resolvePaidImageProvider` reads spend, and
`executePaidImageProvider` recorded cost **after** `generateImage`. With an
`await` between the read and the write, two concurrent requests could both
observe the same remaining budget and both spend → overrun.

**Fix (smallest architecture-compatible change):** an **optional atomic
reservation** on `PaidImageBudgetLedger`:

- `tryReserve(request)` added to the ledger interface and implemented
  **synchronously** in both the in-memory ledger (a dedicated reservation map,
  so R0's `entries` semantics are untouched) and the SQLite domain ledger
  (synchronous better-sqlite3 read+write in one Node tick — atomic under the
  single-threaded model).
- `executePaidImageProvider` now reserves **before** `generateImage`; a refused
  reservation returns a controlled denial (no spend). `record()` releases the
  reservation and books the cost once.
- Outstanding reservations are included in `getDailySpendUsd` /
  `getMonthlySpendUsd`, so concurrent *resolves* also see committed budget.
- Fail-closed behaviour is unchanged; R0 semantics (denied entries excluded,
  unparsable timestamps counted conservatively) are preserved.

**Proof:** with a $0.05 daily cap and two concurrent $0.04 requests, exactly one
executes and total daily spend is `$0.04` — never `$0.08`.
`CONCURRENT_BUDGET_OVERRUN=NO`.

---

## 9. Phase 12–13 — Tests (offline, synthetic; no paid calls)

| Suite | File | Tests |
|---|---|---|
| R0 regression | `tests/unit/image-paid-fallback-framework.test.ts` | 38 ✅ |
| AWS adapter contract | `tests/unit/image-paid-fallback-r1-aws-adapter.test.ts` | 18 ✅ |
| Meta adapter contract | `tests/unit/image-paid-fallback-r1-meta-adapter.test.ts` | 19 ✅ |
| Failover matrix + concurrency | `tests/unit/image-paid-fallback-r1-failover.test.ts` + `…-budget-concurrency.test.ts` | 24 ✅ |
| **Total** | | **99 ✅** |

Covered: FREE available → paid never consulted; FREE unavailable + disabled →
controlled unavailable; FREE circuit → explicit reason; cheapest factual quote
wins regardless of registration order; cheaper-but-unhealthy skipped;
cheaper-but-quota-exhausted skipped; AWS circuit open → Meta; Meta circuit open →
AWS; above-max-cost rejected; daily budget exceeded; monthly budget exceeded;
missing/stale price evidence rejected; all candidates invalid → controlled
unavailable; text/search/vision hard-denied; concurrent requests near the budget
boundary cannot overspend. Adapter contract tests cover request/response
mapping, error mapping, timeout, auth-missing, model-missing, price-missing,
health and quota mapping — all with an injected fake fetcher.

No test performs network I/O or paid inference. Tests use a deliberate non-secret
fixture key only.

---

## 10. Phase 14 — Security / secret scan

- `node scripts/check/check-secrets.mjs` → `SKIP reason=binary-absent` (gitleaks
  not on PATH; script exits 0 by design). Recorded as a tooling limitation.
- Manual scan over all changed/new files for AWS keys (`AKIA…`), `aws_secret`,
  private-key headers, `xox[baprs]-`, `ghp_…`, `sk-…`, `Bearer`+long tokens and
  `password=` patterns → **zero matches**.
- The only credential-shaped literal is `MOCK_KEY = "test-key-not-a-secret"` in
  the two adapter test files (deliberate fixture).
- `SECRETS_COMMITTED=NO` · `SECRETS_PRINTED=NO`

---

## 11. Phase 15 / 16 — Validation and no-live proof

```
R0 regression (image-paid-fallback-framework.test.ts) = 38/38 PASS
New R1 tests                                           = 61/61 PASS
npx tsc --pretty false -p tsconfig.typecheck-core.json = exit 0
npx eslint <12 mission files>                          = exit 0
node scripts/build/build-next-isolated.mjs             = exit 0
```

No-live proof (read-only, nothing restarted or deployed):

```
curl -s -m5 http://127.0.0.1:20128/health  -> 404
curl -s -m5 http://127.0.0.1:20128/        -> 307   (a process is listening)
systemctl is-active omniroute.service      -> inactive (MainPID=0)
```

The `:20128` listener was neither restarted nor reconfigured.
`PRODUCTION_CHANGED=NO` · `LIVE_SERVICE_RESTARTED=NO` · `PRODUCTION_BUILD_UNCHANGED=YES`.

---

## 12. Commits and push

- Implementation: `d90881a2759c2220fee277414afbe0e14e905f37`
  — `feat(image): integrate verified paid image provider adapters`
- Closure report: this file
  — `docs(omniroute): close paid image provider integration R1`
- Pushed to `audit-origin` (canonical GitHub remote), branch
  `feature/image-free-first-paid-fallback-r1` only. No force push. `origin`
  (local R0 clone path) left untouched. `LOCAL == REMOTE` verified.

---

## 13. Explicit non-actions (absolute stop respected)

R1 did **not**: enable paid fallback in production; deploy to `:20128`; make a
paid image; spend money; rotate or create credentials; modify OpenCode, Harness,
Hermes, IAMM, StockNewsBR, the production DB, production configuration,
production provider connections, ACLs, or `omniroute.service`.

The first real paid provider calls belong to
`OMNIROUTE_IMAGE_PAID_FALLBACK_CANARY_R1_1`.

---

## 14. Residual risks / notes for the canary phase

1. **Price evidence is required at runtime.** With no configured evidence,
   every paid candidate fails closed with `COST_QUOTE_UNAVAILABLE` — intended,
   but the canary operator must supply real, dated price evidence first.
2. **`actualCostUsd` is intentionally absent** for both adapters until factual
   per-call cost data exists; budget accounting therefore uses the estimated
   quote. Revisit when the provider returns authoritative usage/cost.
3. **AWS auth uses OmniRoute's Bearer-key Bedrock mechanism**, not SigV4. This
   matches the existing integration; if the target account/endpoint requires
   SigV4, that is a canary-phase decision, not an R1 change.
4. **Secret scanning used a manual fallback** because `gitleaks` is absent;
   install gitleaks before the canary for tool-backed evidence.

```
FINAL_RESULT=PASS
```
