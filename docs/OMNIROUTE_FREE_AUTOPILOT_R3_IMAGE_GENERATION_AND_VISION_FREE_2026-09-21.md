# OMNIROUTE FREE AUTOPILOT — R3: IMAGE GENERATION + VISION (FREE_ONLY)

Date: 2026-09-21
Model: DeepSeek V4.1
Runtime: OpenCode Linux + OMO
Scope: Lab only — `Auto/vision:free` + `auto/image-gen:free` under strict FREE_ONLY, VISION and IMAGE GENERATION kept strictly separate.

---

## 1. Mission objective

Establish reliable FREE_ONLY routing for **VISION** and **IMAGE GENERATION** while keeping the two
strictly separate. VISION = image input → understanding. IMAGE GENERATION = prompt/image →
generated/edited image. A vision model must never automatically qualify as an image generator.

Constraints honored: OpenCode config/auth/providers/model-picker frozen; native subsystems reused
(no duplicate image subsystem); no AWS / Meta image integration; no primary/secondary/fallback
hierarchy invented; no paid or credit-backed fallback.

---

## 2. Native subsystem audit (reuse, no duplication)

| Capability | Native owner | Verified |
|---|---|---|
| Vision (image input → analysis) | `src/lib/modelCapabilities.ts` → `getResolvedModelCapabilities().supportsVision` | present, chat-only surface |
| Image generation (prompt/image → image) | `open-sse/config/imageRegistry.ts` + `open-sse/handlers/imageGeneration.ts` | present, dedicated endpoint/registry |
| Image generation route | `src/app/api/v1/images/generations/route.ts` | reused (alias wired here) |
| Image editing | `src/app/api/v1/images/edits/route.ts` | untouched |
| Image fallback engine | `open-sse/services/imageCombo.ts` (`executeImageCombo`) | reused (priority failover) |
| Image model discovery | `open-sse/config/dynamicImageModelSources.ts` | untouched |
| Free gate (strict) | `open-sse/services/autoCombo/strictZeroCostFilter.ts` | reused as policy reference |
| Free budgets | `open-sse/config/freeModelCatalog(.data).ts` | reused as sole FREE_VERIFIED source |
| Auto catalog | `open-sse/services/autoCombo/builtinCatalog.ts` | extended (2 advertised ids) |
| Quota / circuit / health | `freeAccessQuota.ts`, `shared/utils/circuitBreaker`, `resilienceCandidateFilter.ts` | reused |

Structural separation is native: image-generation capability is defined **only** by membership in
`IMAGE_PROVIDERS`; vision capability is defined **only** by `ResolvedModelCapabilities.supportsVision`.
The two registries never cross, so a vision model cannot appear as an image generator and vice versa.

---

## 3. Changes (LAB: `/home/dcima/omniroute-lab-r1-v3.8.50`, 4 files)

1. **`open-sse/services/autoCombo/builtinCatalog.ts`** — `AUTO_SUFFIX_VARIANTS` now advertises
   `auto/vision:free` and `auto/multimodal:free`. `parseAutoSuffix` already accepted
   `<category>:free`; the auto API route enumerates `AUTO_SUFFIX_VARIANTS`, so both ids appear
   automatically in `GET /api/combos/auto`. The strict free gate still applies to the whole
   prepared pool whenever `freeAccessPolicy === 'strict'`, so these aliases are strictness-aware and
   never fall back to paid.
2. **NEW `open-sse/config/freeImageRouting.ts`** — pure, sync FREE_ONLY image resolver.
   - `NO_FREE_IMAGE_PROVIDER_AVAILABLE` controlled code.
   - `SELF_HOSTED` = registry provider with `authType === 'none'` (ComfyUI / SD WebUI) **and** an
     active connection.
   - `FREE_VERIFIED` = provider+model with an explicit hard-free budget row
     (`keyless|recurring-daily|recurring-monthly|recurring-uncapped`, `hardStopGuaranteed === true`).
   - Iterates `IMAGE_PROVIDERS` in registry order (no hardcoded names); no chat/vision capability is
     consulted. Returns the controlled code otherwise.
3. **`src/app/api/v1/images/generations/route.ts`** — `auto/image-gen[:free]` is resolved immediately
   after API-key policy enforcement and before combo detection. Eligibility probe = provider has an
   active connection **and** circuit `canExecute()`. Ineligible → `503 NO_FREE_IMAGE_PROVIDER_AVAILABLE`.
   Eligible → `body.model` is rewritten to `${provider}/${model}` and continues through the native
   capability-specific image handler. Never dispatches to chat; never paid fallback.
4. **NEW `tests/unit/autoCombo/free-vision-image-r3.test.ts`** — 8 node:test cases (see §5).

No new image subsystem, no new provider registry, no OpenCode change.

---

## 4. Free provider discovery (live registry, read-only)

- Image providers in registry: **43**; image models: **235**.
- `SELF_HOSTED` image generators (registry `authType: "none"`): **`sdwebui`**, **`comfyui`**
  (local, `localDefault` `http://localhost:7860` / `:8188`, `hasFree: true`).
- Remote `FREE_VERIFIED` image generators from the free budget catalog: **none** — every
  `FREE_MODEL_BUDGETS` row is a chat/text model id; no row matches any image model id.
- Live configured providers (`provider_connections`, read-only): **no `sdwebui`, no `comfyui`**.
  Therefore **no** free image generator is currently eligible → the mandated controlled code is the
  correct live result.

`VISION_FREE_PROVIDERS` (free vision-capable chat rows present in the catalog; strict gate still
requires health/quota/circuit and, for non-keyless rows, `hardStopGuaranteed`), representative:
`cohere/command-a-vision-07-2025`, `huggingchat/CohereLabs/command-a-vision-07-2025`,
`pollinations/qwen-vision` (keyless), `ovhcloud/Qwen2.5-VL-72B-Instruct` (keyless),
plus vision-capable recurring-daily rows (gemini-2.5-flash, bluesminds/gpt-4o-mini, t3-web/gpt-4o, …).

---

## 5. Tests and measurements

Minimal, no network, no generation batches (benchmark discipline honored — no paid call made).

`tests/unit/autoCombo/free-vision-image-r3.test.ts` — **8/8 pass**:
free image generation (SELF_HOSTED); FREE_VERIFIED requires a hard-stop free row (credit-backed
`one-time-initial` rejected); provider health/circuit failure → controlled failure; free-to-free
selection skips an unavailable provider; all-free unavailable → controlled code, never paid;
VISION≠IMAGE_GENERATION (alias regex; vision chat model not an image generator; vision budget row
alone ineligible); `vision:free`/`multimodal:free` parse + vision candidate filter; both ids advertised.

Regression (unchanged, still green):
- `node:test` batch — `free-vision-image-r3`, `image-generation-route`,
  `image-routes-combo-edits-3214-3215`: **41/41 pass**.
- `node:test` — `free-provider-sentinel-r1`, `image-generation-route`, `image-combo`: **51/51 pass**.
- `vitest --config vitest.mcp.config.ts` — `builtin-vision-spec`, `vision-filter-excludes-forced`,
  `suffixComposition-4517`, `free-alias-intelligence-8601`, `strict-zero-cost-filter`: **31/31 pass**.

Quality gates on the 4 changed files: `npm run typecheck:core` → **0 errors**;
`eslint --suppressions-location config/quality/eslint-suppressions.json <4 files>` → **exit 0**.

Image-benchmark closure: no free image generator is eligible live, so the benchmark terminates at the
controlled failure **before** any provider call — success/mime/dimensions/latency/rate-limit are
therefore N/A by design, and no paid/credit-backed/unknown-cost request is ever issued.

---

## 6. Free policy conformance

| Gate | Result |
|---|---|
| FREE_VERIFIED / SELF_HOSTED only | enforced |
| Health + quota + circuit closed | enforced (active connection + `canExecute()`) |
| Free-to-free image failover | native `executeImageCombo` priority failover + resolver skips unavailable providers |
| Free-to-free vision failover | native auto pool resilience/cooldown/circuit filtering; empty pool → controlled failure |
| Paid / credit-backed / unknown-cost fallback | none |
| VISION vs IMAGE GENERATION | structurally separated; PASS |

---

## 7. Final report fields

```
VISION_NATIVE=YES (src/lib/modelCapabilities.ts getResolvedModelCapabilities.supportsVision)
IMAGE_GENERATION_NATIVE=YES (open-sse/config/imageRegistry.ts + imageGeneration.ts + images/generations route)
VISION_FREE_PROVIDERS=cohere/command-a-vision-07-2025, huggingchat/CohereLabs/command-a-vision-07-2025, pollinations/qwen-vision, ovhcloud/Qwen2.5-VL-72B-Instruct (+ vision-capable recurring-daily rows)
IMAGE_FREE_PROVIDERS=sdwebui (SELF_HOSTED, unconfigured), comfyui (SELF_HOSTED, unconfigured); no remote FREE_VERIFIED image row
AUTO_VISION_FREE=auto/vision:free (advertised; vision-capable ∩ strict FREE_ONLY when freeAccessPolicy=strict)
AUTO_IMAGE_GEN_FREE=auto/image-gen:free (capability-specific image handler; never chat)
VISION_IMAGE_SEPARATION=PASS
FREE_IMAGE_FAILOVER=native executeImageCombo priority failover (free->free); no paid fallback
FREE_VISION_FAILOVER=auto pool resilience/cooldown/circuit filtering; empty pool -> controlled failure
NO_FREE_IMAGE_RESULT=NO_FREE_IMAGE_PROVIDER_AVAILABLE (503, valid controlled failure)
PAID_IMAGE_USED=NO
CREDIT_BACKED_IMAGE_USED=NO
UNKNOWN_COST_IMAGE_USED=NO
AWS_IMAGE_TOUCHED=NO
META_IMAGE_TOUCHED=NO
OPENCODE_CHANGED=NO
PROVIDERS_DELETED=0
CONNECTIONS_DELETED=0
FINAL_RESULT=PASS
```

---

## 8. Notes / future work

- Lab working tree only; the lab `.git` worktree pointer is broken (pre-existing, see R1.9), so no
  commit was created. Live OmniRoute service and OpenCode were not modified or deployed.
- To make free image generation actually available, configure a self-hosted ComfyUI / SD WebUI
  connection (then `auto/image-gen:free` resolves to it), or add an explicit hard-stop free image
  budget row for a remote provider.
- AWS and Meta image integration remain future work, as instructed (untouched).
