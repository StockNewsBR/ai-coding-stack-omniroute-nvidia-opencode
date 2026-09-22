# OmniRoute — Paid Image Fallback Canary R1.1

**Mission:** `OMNIROUTE_IMAGE_PAID_FALLBACK_CANARY_R1_1`
**Role:** Isolated real-provider canary / minimum-spend validation
**Date:** 2026-09-22
**Workspace:** `/home/dcima/omniroute-image-paid-canary-r1-1` (isolated clone, `--no-local`)
**Branch:** `canary/image-paid-fallback-r1-1`
**Model:** DeepSeek V4.1 Flash

---

## 1. Base and result summary

| Field | Value |
|---|---|
| BASE_SHA | `17e49346d6269760d3e825773b5b4499f351188b` |
| FINAL_SHA | `21aa1235ec414776dd49761675b2d247edd7069c` |
| Branch tip | `21aa1235ec414776dd49761675b2d247edd7069c` + the report commit below |

Authoritative base: R1 closure HEAD `17e49346d6269760d3e825773b5b4499f351188b`
(R1 implementation `d90881a2759c2220fee277414afbe0e14e905f37`).

The isolated clone was created with `git clone --no-local` from
`/home/dcima/omniroute-image-paid-fallback-r1`; `HEAD` was verified to equal the
expected R1 closure SHA before any work began. `audit-origin` was added as
`https://github.com/StockNewsBR/ai-coding-stack-omniroute-nvidia-opencode.git`.
No force operations were used.

**Outcome:** neither paid provider could be exercised with real spend, for
independent reasons, and no provider implementation defect was found.

---

## 2. Live production baseline and post-check (read-only)

The authoritative endpoint is `http://127.0.0.1:20128/api/health` (the previous
R1 report used `/health` incorrectly). The response carries **no** build SHA, so
the SHA was verified through the same mechanism used in
`POST_LIVE_HOUSEKEEPING_R1`: reading the installed package's `dist/BUILD_SHA`.

| Field | Value |
|---|---|
| LIVE_HEALTH_BEFORE | PASS (`{"status":"ok","timestamp":"2026-09-22T16:21:21.169Z"}`) |
| LIVE_HEALTH_AFTER | PASS (`{"status":"ok","timestamp":"2026-09-22T16:38:38.855Z"}`) |
| LIVE_BUILD_SHA_BEFORE | `7e5a2d80b` |
| LIVE_BUILD_SHA_AFTER | `7e5a2d80b` |
| LIVE_MAIN_PID_BEFORE | `426` |
| LIVE_MAIN_PID_AFTER | `426` |

Listener: single `LISTEN` socket on `127.0.0.1:20128` (unchanged). Service:
systemd **user** unit `omniroute.service`, `ActiveEnterTimestamp` unchanged at
`Tue 2026-09-22 09:08:18 -03` (`lsof` is not installed on this host;
`systemctl --user show omniroute.service -p MainPID --value` was used to resolve
the PID).

⇒ `PRODUCTION_CHANGED=NO`, `LIVE_SERVICE_RESTARTED=NO`.

---

## 3. Phase 2 — Official provider revalidation

### AWS (Amazon Bedrock Runtime / InvokeModel / Amazon Nova Canvas)

| Field | Value |
|---|---|
| AWS_API_VERIFIED | YES |
| AWS_MODEL_VERIFIED | YES |
| AWS_AUTH_VERIFIED | YES |
| AWS_PRICE_VERIFIED_AT | NOT_VERIFIED |

- **API + model:** official AWS documentation surfaced through Context7
  (`/websites/aws_amazon_bedrock`, sourced from
  `docs.aws.amazon.com/.../bedrock-runtime_example_bedrock-runtime_InvokeModel_AmazonNovaImageGeneration_section.md`)
  confirms model id `amazon.nova-canvas-v1:0` and the InvokeModel payload
  `{"taskType":"TEXT_IMAGE","textToImageParams":{"text":…},"imageGenerationConfig":{…,"numberOfImages":1}}`,
  with the response at `model_response["images"][0]` (base64 PNG). This matches
  `open-sse/config/paidImageAwsAdapter.ts` exactly
  (`buildAwsImageRequestBody`, `parseAwsImageResponse`).
- **Auth:** official AWS docs (`bedrock/latest/userguide/api-keys.html`) confirm
  Amazon Bedrock API keys authenticate as `Authorization: Bearer <api-key>`
  (short-term and long-term key types, IAM-gated by `bedrock:CallWithBearerToken`).
  The adapter's Bearer mechanism is therefore an **officially supported** path.
  Its source comment claiming "real AWS uses SigV4" is incomplete but not wrong
  about the alternative; it is inaccurate as a statement of what the adapter does.
- **Pricing:** official Nova Canvas per-image pricing could **not** be obtained.
  `aws.amazon.com/bedrock/pricing/` renders the Amazon Nova "Creative Content
  Generation models" accordion client-side (empty in the fetched HTML);
  `docs.aws.amazon.com` pages return no body to plain fetch; Context7 returned
  schema but no pricing. The `$0.036` / `$0.08` per-image figures found in the
  pricing page belong to **Stability AI SDXL**, not Nova Canvas. Per the mission
  rule, no price is asserted from unverified or historical sources.

### Meta (Meta Model API / `/v1/images/generations`)

| Field | Value |
|---|---|
| META_API_VERIFIED | YES (host + route exist, POST, auth-gated) |
| META_MODEL_VERIFIED | NO |
| META_AUTH_VERIFIED | UNVERIFIED |
| META_PRICE_VERIFIED_AT | NOT_VERIFIED |

- `getent hosts api.meta.ai` → `star.c10r.facebook.com` (Meta CDN).
- `GET https://api.meta.ai/v1/images/generations` → `HTTP/2 401` with
  `allow: POST`, `x-route: model-api-rust`, `x-request-id`, CORS `*` — the route
  exists and is auth-gated.
- `GET https://api.meta.ai/` → `HTTP/2 403` with Meta `x-fb-request-id` /
  `x-fb-trace-id` / `x-fb-rev` headers.
- The specific model id `muse-image-1.0` could **not** be confirmed from any
  official public source: Meta's developer documentation portal is gated
  (`www.llama.com/docs/overview/` returns an SSO identity page;
  `llama.developer.meta.com/docs/` returns HTTP 500). The adapter's header claim
  of "two independent official sources" could not be reproduced.

Per the mission rule — *if provider reality changed, stop that provider; do not
patch around undocumented behaviour* — the Meta paid path was **not** exercised.

---

## 4. Phase 3 — Credential readiness

| Field | Value |
|---|---|
| AWS_CREDENTIAL_PRESENT | NO |
| META_CREDENTIAL_PRESENT | NO |

Checked read-only through the intended secure mechanisms only; no credential was
created, rotated, copied, echoed, or committed:

- shell environment: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_SESSION_TOKEN`, `AWS_REGION`, `AWS_DEFAULT_REGION`,
  `AWS_BEARER_TOKEN_BEDROCK`, `BEDROCK_API_KEY`, `MODEL_API_KEY`,
  `META_API_KEY`, `META_MODEL_API_KEY` — all absent; `~/.aws` does not exist.
- OpenCode `auth.json` provider keys: no `aws` / `bedrock` / `meta` / `muse`.
- OmniRoute `storage.sqlite` `provider_connections`: zero rows for any
  `aws` / `bedrock` / `meta` / `muse` / `aws-bedrock-image` / `meta-muse-image`.
- workspace `.env*` files and the `omniroute.service` unit `Environment`: no
  AWS/Meta/Bedrock key names.

⇒ both providers are **BLOCKED_EXTERNAL**; no real provider call was attempted.

---

## 5. Phase 4 — Tool-backed secret scan

`node scripts/check/check-secrets.mjs` ran and exited 0 with a **graceful skip**:
`secretFindings=SKIP reason=binary-absent` (gitleaks is not on `PATH`).
Per mission rule no binary was installed automatically; the limitation is
recorded. The repo-native manual fallback was performed instead:

- targeted scan of all 13 R1-changed files for `AKIA`/`ASIA` key ids, PEM
  private-key blocks, long literal secret assignments, Bearer literals, and
  hardcoded `unitPrice` values → none (the only `unitPrice` lines are a type
  guard and a doc comment in `paidImagePriceEvidence.ts`).
- `git grep` across all tracked files → only obvious synthetic fixtures
  (`AKIAEXAMPLE123456789`, `ASIAIOSFODNN7EXAMPLE`,
  `TEST_RSA_PRIVATE_KEY_PLACEHOLDER_DO_NOT_USE`, `sk-` placeholders).

⇒ `SECRETS_IN_BRANCH=NO`, `SECRETS_COMMITTED=NO`, `SECRETS_PRINTED=NO`.

---

## 6. Phases 5–6 — Canary price evidence and hard spend guard

Canary-only artifacts, deliberately kept **outside** provider implementation
source (no price is hardcoded into the adapters):

- `canary/r1-1/price-evidence.json` — carries `currency=USD`, `unit=image`,
  `ceilingUsd=0.1`, `maxImagesPerProvider=1`, an empty `evidence[]` array, and a
  `verificationAttempts[]` record explaining, per provider, why no verified
  official unit price exists.
- `canary/r1-1/spend-guard.ts` — loads that evidence and evaluates the real
  `buildPaidImageQuote` from `open-sse/config/paidImagePriceEvidence.ts`.

Guard output (`node --import tsx/esm canary/r1-1/spend-guard.ts`):

```
rows: aws-bedrock-image / amazon.nova-canvas-v1:0 → COST_QUOTE_UNAVAILABLE
      meta-muse-image   / muse-image-1.0          → COST_QUOTE_UNAVAILABLE
expectedTotal: 0
withinCeiling: true
decision: BLOCK
ok - unverified official price must block
ok - total above ceiling must block
ok - total at ceiling must allow
CANARY_SPEND_GUARD_CHECKS=3/3   (exit 0)
```

Pricing rules: `imagePaidFallbackEnabled` remains **NO** by committed default
(`DEFAULT_PAID_IMAGE_POLICY`); a policy cap cannot be satisfied by an unpriced
provider; the admission ceiling is enforced independently of the provider.

| Field | Value |
|---|---|
| EXPECTED_AWS_MAX_COST | USD 0.00 (no verified official price → fail-closed, no call) |
| EXPECTED_META_MAX_COST | USD 0.00 (same) |
| EXPECTED_TOTAL_MAX_COST | USD 0.00 |
| CANARY_SPEND_APPROVAL_REQUIRED | NO (total is below the USD 0.10 safety ceiling) |

The USD 0.10 figure is a **canary safety ceiling** only — not provider pricing
and not production budget policy.

---

## 7. Phases 8–9 — Real provider canaries

| Field | Value |
|---|---|
| AWS_CANARY | BLOCKED_EXTERNAL |
| META_CANARY | BLOCKED_EXTERNAL |

No real request was made to either provider. For AWS, `AWS_CREDENTIAL_PRESENT=NO`
and `AWS_PRICE_VERIFIED_AT=NOT_VERIFIED` independently prevent an authorised
call. For Meta, `META_CREDENTIAL_PRESENT=NO`, `META_MODEL_VERIFIED=NO` and
`META_PRICE_VERIFIED_AT=NOT_VERIFIED` prevent one. No image was generated,
downloaded, displayed, or transmitted; no payload or base64 body was printed;
and no possibly-billable request was retried.

---

## 8. Phases 10–12 — Failover, free-first, and ledger proofs

These were proven with **deterministic synthetic execution** through the real
adapter factories (`createAwsImageAdapter` / `createMetaImageAdapter` accept an
injectable `fetcher` and clock). Zero network, zero spend.

New canary proof file — `tests/unit/image-paid-canary-r1-1.test.ts`, **11/11
PASS**:

1. real AWS factory with no credentials fails closed (`AWS_IMAGE_CREDENTIALS_MISSING`) and never fetches;
2. same for Meta (`META_IMAGE_CREDENTIALS_MISSING`);
3. both healthy → cheapest acceptable real quote selected;
4. cheapest unhealthy → other provider selected;
5. cheapest quota exhausted → other provider selected;
6. cheapest circuit open → other provider selected;
7. budget insufficient → no provider selected;
8. FREE available → paid adapters never consulted (0 quotes, 0 fetches);
9. FREE unavailable + paid disabled → controlled unavailable (`POLICY_DISABLED`);
10. every non-image capability hard-denied (`CAPABILITY_NOT_IMAGE_GENERATION`), 0 fetches;
11. one executed call accounted exactly once (no duplicate, no leaked reservation).

Complemented by the pre-existing R1 failover suite (18 tests) and the
budget/concurrency suite (6 tests), which cover the same matrix against
stand-in adapters.

| Field | Value |
|---|---|
| FREE_FIRST | PASS |
| DYNAMIC_IMAGE_SELECTION | PASS |
| AWS_META_FAILOVER_SIMULATION | PASS |
| PAID_OUTSIDE_IMAGE | NO |
| LEDGER_ACCOUNTING | PASS |
| DUPLICATE_COST_ENTRY | NO |
| RESERVATION_LEAK | NO |
| CANARY_BUDGET_EXCEEDED | NO |

Ledger semantics verified: `denied` entries are excluded from spend,
reservations count toward committed budget while outstanding and are released by
`record()`, and unparsable timestamps are conservatively counted in both windows.

---

## 9. Phase 13 — Regression

Run in the isolated canary workspace only.

| Suite | Result |
|---|---|
| R0 framework (`tests/unit/image-paid-fallback-framework.test.ts`) | 38 / 38 PASS (`R0_EXIT=0`) |
| R1 (`aws-adapter` 18 + `budget-concurrency` 6 + `failover` 18 + `meta-adapter` 19) | 61 / 61 PASS (`R1_EXIT=0`) |
| Canary proof (`tests/unit/image-paid-canary-r1-1.test.ts`) | 11 / 11 PASS |
| Typecheck core (`tsc -p tsconfig.typecheck-core.json`) | PASS (`TYPECHECK_EXIT=0`) |
| Lint (scoped: `eslint tests/unit/image-paid-canary-r1-1.test.ts`) | PASS (exit 0) |
| Build (`node scripts/build/build-next-isolated.mjs`) | PASS (`BUILD_EXIT=0`, Next.js 16.3.1/Turbopack, "✓ Compiled successfully") |

| Field | Value |
|---|---|
| R0_REGRESSION | PASS (38/38) |
| R1_REGRESSION | PASS (61/61) |
| TYPECHECK | PASS |
| LINT | PASS |
| BUILD | PASS |

The full secret-scan note in §5 applies: gitleaks was unavailable and no binary
was installed; the manual fallback found nothing.

---

## 10. Phase 14 — Final live safety

Re-checked read-only after all canary work: `LIVE_HEALTH_AFTER=PASS`,
`LIVE_BUILD_SHA_AFTER=7e5a2d80b`, `LIVE_MAIN_PID_AFTER=426`. Production was not
deployed to, not restarted, and not reconfigured; no credentials were rotated;
nothing outside the isolated canary workspace was modified.

---

## 11. Required field block

```
BASE_SHA=17e49346d6269760d3e825773b5b4499f351188b
FINAL_SHA=21aa1235ec414776dd49761675b2d247edd7069c

LIVE_HEALTH_BEFORE=PASS
LIVE_HEALTH_AFTER=PASS
LIVE_BUILD_SHA_BEFORE=7e5a2d80b
LIVE_BUILD_SHA_AFTER=7e5a2d80b
LIVE_MAIN_PID_BEFORE=426
LIVE_MAIN_PID_AFTER=426

AWS_API_VERIFIED=YES
AWS_MODEL_VERIFIED=YES
AWS_AUTH_VERIFIED=YES
AWS_CREDENTIAL_PRESENT=NO
AWS_CANARY=BLOCKED_EXTERNAL

META_API_VERIFIED=YES
META_MODEL_VERIFIED=NO
META_AUTH_VERIFIED=UNVERIFIED
META_CREDENTIAL_PRESENT=NO
META_CANARY=BLOCKED_EXTERNAL

AWS_PRICE_VERIFIED_AT=NOT_VERIFIED
META_PRICE_VERIFIED_AT=NOT_VERIFIED

EXPECTED_AWS_MAX_COST=USD 0.00
EXPECTED_META_MAX_COST=USD 0.00
EXPECTED_TOTAL_MAX_COST=USD 0.00

ACTUAL_OR_ESTIMATED_AWS_COST=USD 0.00
ACTUAL_OR_ESTIMATED_META_COST=USD 0.00
CANARY_TOTAL_SPEND=USD 0.00

CANARY_BUDGET_EXCEEDED=NO

FREE_FIRST=PASS
DYNAMIC_IMAGE_SELECTION=PASS
AWS_META_FAILOVER_SIMULATION=PASS
PAID_OUTSIDE_IMAGE=NO

LEDGER_ACCOUNTING=PASS
DUPLICATE_COST_ENTRY=NO
RESERVATION_LEAK=NO

R0_REGRESSION=PASS (38/38)
R1_REGRESSION=PASS (61/61)
TYPECHECK=PASS
LINT=PASS
BUILD=PASS

PRODUCTION_CHANGED=NO
LIVE_SERVICE_RESTARTED=NO

OPENCODE_CHANGED=NO
HARNESS_CHANGED=NO
HERMES_CHANGED=NO
IAMM_CHANGED=NO
STOCKNEWSBR_CHANGED=NO

SECRETS_COMMITTED=NO
SECRETS_PRINTED=NO

FINAL_RESULT=PARTIAL_EXTERNAL_BLOCK
```

### FINAL_RESULT justification

`PARTIAL_EXTERNAL_BLOCK` is recorded because the blockers are **external** —
missing credentials, an unverifiable model id, and unavailable official pricing
— and no provider implementation defect was found. Note this is *stronger* than
the single-provider case the rule anticipates: **both** providers are
`BLOCKED_EXTERNAL`, so neither "passed". `PASS` is therefore not truthful, and
`FAIL` would misattribute an external block to the implementation. The
`$0.10` ceiling was never approached: `CANARY_TOTAL_SPEND=USD 0.00`.

---

## 12. Mission protection attestation

`DO NOT` rules observed in full: no changes to OpenCode config/auth/connections/
ACL, Harness, Hermes, IAMM, or StockNewsBR; no deploy to production `:20128`; no
production restart; no production DB/config modification; no credential
rotation; no secrets printed or committed. `TEXT_PAID_FALLBACK` remains **NO**
and `IMAGE_PAID_FALLBACK_DEFAULT` remains **NO**. The canary performed zero
billable image generations.

Production promotion is **not** part of this mission and remains owned by
`OMNIROUTE_IMAGE_PAID_FALLBACK_LIVE_R2`.
