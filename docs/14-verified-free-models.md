# Verified Free AI Model Pool — 2026-08-16

This page records the models that were **actually exercised in the lab**, not just discovered in a catalog.

The goal is deliberately small: keep a short pool of strong, useful models for OpenCode/OmniRoute instead of collecting every model name a provider exposes.

> Verification date: **2026-08-16**
>
> OpenCode version used in the runtime audit: **1.18.18**
>
> NVIDIA direct catalog tested: **98 models**

## What “verified” means here

A catalog entry is not enough. For the runtime audit, each candidate was called three times through the same OpenCode harness used for real coding work.

Status meaning:

- **3/3** — stable in the smoke test and eligible for the working pool.
- **2/3** — usable but unstable; kept out of the primary pool.
- **1/3** — unstable.
- **0/3** — hidden/blacklisted in the lab OpenCode picker.

This smoke test proves route + authentication + provider + OpenCode-harness compatibility. It is **not** a scientific coding benchmark by itself.

## Audit result at a glance

### NVIDIA direct

From **98 NVIDIA catalog entries**:

- **15** passed 3/3;
- **2** passed 2/3;
- **81** failed 0/3.

Many failures were stale/EOL routes, unsupported endpoints, provider-side 404/410 responses, timeouts, or endpoints that were not useful chat/coding routes.

### OpenCode Zen / OmniRoute free aliases

From **16 free candidates** discovered in the OpenCode/OmniRoute catalog:

- **14** passed 3/3;
- **2** failed 0/3.

The two confirmed dead aliases in that run were:

- `oc/ling-3.0-flash-free` — 0/3;
- `oc/north-mini-code-free` — 0/3.

## Current priority pool

This is the pool currently preferred for **OmniRoute Pro Coding**.

| Priority | Model / route | Provider path | Lab smoke test | Primary role | Notes |
|---:|---|---|---:|---|---|
| **1** | **GLM-5.2** — `nvidia/z-ai/glm-5.2` | NVIDIA NIM | **3/3** | Main brain: coding, architecture, long audits, agentic work | NVIDIA lists 753B parameters, 1M context, tool use and a free endpoint |
| **2** | **Nemotron 3 Ultra 550B A55B** — `nvidia/nvidia/nemotron-3-ultra-550b-a55b` | NVIDIA NIM | **3/3** | Deep reasoning, long-context audit, difficult agentic work | Detailed NVIDIA model card: 550B total / 55B active, up to 1M context |
| **3** | **Inkling** — `nvidia/thinkingmachines/inkling` | NVIDIA NIM | **3/3** | Multimodal reasoning, coding, tool-use second brain | Strong candidate, but field behavior still matters more than benchmark headlines |
| **4** | **DeepSeek V4 Flash Free** — `oc/deepseek-v4-flash-free` | OpenCode Zen via OmniRoute | **3/3** | Fast heavy coding / implementation | OpenCode lists this alias as free for a limited time |
| **5** | **MiMo-V2.5 Free** — `oc/mimo-v2.5-free` | OpenCode Zen via OmniRoute | **3/3** | Heavy coding / alternate worker | OpenCode lists this alias as free for a limited time |
| **6** | **Nemotron 3 Super 120B A12B** — `nvidia/nvidia/nemotron-3-super-120b-a12b` | NVIDIA NIM | **3/3** | Agent/worker pool, high-volume tasks | NVIDIA model card: 120B total / 12B active, up to 1M context |
| **7** | **Nemotron 3.5 Lightning 30B A3B** — `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` | NVIDIA NIM | **3/3** | Fast worker | Fastest member of this NVIDIA core in the simple 3-call lab smoke test |
| **8** | **Step 3.7 Flash** — `nvidia/stepfun-ai/step-3.7-flash` | NVIDIA NIM | **3/3** | Visual/frontend/tool worker | 198B MoE, ~11B active, 256K context, text + image input |

### Role grouping

```text
BRAINS
1. GLM-5.2
2. Nemotron 3 Ultra 550B
3. Inkling

HEAVY CODING
4. DeepSeek V4 Flash Free
5. MiMo-V2.5 Free

AGENTS / WORKERS
6. Nemotron 3 Super 120B
7. Nemotron 3.5 Lightning
8. Step 3.7 Flash
```

## OmniRoute Pro Coding order

The lab combo uses `priority` routing in this order:

```text
1. nvidia/z-ai/glm-5.2
2. nvidia/nvidia/nemotron-3-ultra-550b-a55b
3. nvidia/thinkingmachines/inkling
4. oc/deepseek-v4-flash-free
5. oc/mimo-v2.5-free
6. nvidia/nvidia/nemotron-3-super-120b-a12b
7. nvidia/nvidia/nemotron-3.5-lightning-30b-a3b
8. nvidia/stepfun-ai/step-3.7-flash
```

When OpenCode talks to these through a custom `omniroute` provider, the visible ID may be prefixed again, for example `omniroute/oc/deepseek-v4-flash-free`. Always copy IDs from your own live `/models` output rather than assuming provider prefixes are identical across machines.

## Important identity rule: aliases are not proof of the physical upstream

For direct NVIDIA routes, the upstream model ID is explicit.

For OpenCode Zen aliases such as:

```text
opencode/deepseek-v4-flash-free
opencode/mimo-v2.5-free
```

we verified that the **alias works**, but we do not claim that a friendly name alone proves the exact physical checkpoint behind the hosted service. Treat hosted alias identity separately from route functionality.

This is important when comparing “different” models: multiple aliases can potentially resolve to the same upstream family or share the same provider quota.

## Notable models that did NOT make the pool

These are useful examples of why catalog discovery is not enough:

| Model | 2026-08-16 lab result | Decision |
|---|---:|---|
| NVIDIA DeepSeek V4 Flash direct | **0/3** | Do not use the NVIDIA direct route; the OpenCode Free route remained healthy |
| NVIDIA DeepSeek V4 Pro direct | **0/3** | EOL/dead route in this environment |
| NVIDIA GPT-OSS 120B | **0/3** | Not in the primary pool |
| NVIDIA Qwen3 Coder 480B A35B | **0/3** | Not in the primary pool |
| NVIDIA Qwen3.5 397B A17B | **0/3** | Not in the primary pool |
| MiniMax M3 (NVIDIA) | **2/3** | Keep as unstable/reserve, not primary |
| Mistral-Nemotron (NVIDIA) | **2/3** | Keep as unstable/reserve, not primary |

## Other NVIDIA routes that passed 3/3

Passing the smoke test does not automatically earn a slot in the top pool. These also passed 3/3 in the 98-model NVIDIA sweep:

- `meta/llama-3.1-70b-instruct`
- `meta/muse-glimmer-30b`
- `nvidia/llama-3.3-nemotron-super-49b-v1.5`
- `nvidia/nemotron-3-nano-30b-a3b`
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
- `nvidia/nemotron-nano-12b-v2-vl`
- `nvidia/nvidia-nemotron-nano-9b-v2`
- `openai/gpt-oss-20b`
- `poolside/laguna-xs-2.1`

They remain useful reserves, but the primary pool is intentionally kept small.

## Rate limits and safe agent concurrency

**Not published yet.**

A model being free and passing 3/3 does **not** tell us how many parallel agents it can safely support. The next dedicated test should measure, per independent provider/quota:

- request rate limit (RPM);
- token rate limit (TPM), when exposed;
- maximum observed parallel requests;
- first concurrency level that triggers 429/timeouts/degradation;
- recommended safe agent count;
- whether two aliases share the same quota bucket.

Until that test is complete, do not infer “8 models = 8 independent quotas” and do not publish a made-up safe-agent number.

## Current upstream facts used for this ranking

Official/current references checked on 2026-08-16:

- GLM-5.2 on NVIDIA: https://build.nvidia.com/z-ai/glm-5.2
- Nemotron 3 Ultra: https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/modelcard
- Nemotron 3 Super: https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b/modelcard
- Inkling: https://build.nvidia.com/thinkingmachines/inkling/modelcard
- Step 3.7 Flash: https://build.nvidia.com/stepfun-ai/step-3.7-flash/modelcard
- OpenCode Zen free catalog: https://opencode.ai/docs/zen/

### Inkling parameter-count note

NVIDIA's short model summary currently shows **952B** parameters, while the detailed Inkling model card states **975B total / 41B active**. We document the discrepancy instead of silently choosing the larger number.

## Re-test before depending on any free route

Free model catalogs and trial quotas rotate quickly. Run a real completion before a long coding mission. A good operating rule is:

```text
DISCOVER → TEST 3x → IDENTIFY UPSTREAM → TEST CONCURRENCY → THEN TRUST
```

The purpose of this page is not to freeze a permanent ranking. It is to keep the repository honest about what was actually working at the latest verification date.
