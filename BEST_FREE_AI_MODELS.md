# Best Free AI Models — Current Lab Shortlist

> Last verified: **2026-08-16**
>
> This is a field-tested shortlist for **OpenCode + OmniRoute coding/agent workflows**, not a list copied from provider catalogs.

## Current Top 8

| # | Model | Route used in the lab | Role | Runtime smoke test |
|---:|---|---|---|---:|
| **1** | **GLM-5.2** | `nvidia/z-ai/glm-5.2` | Main brain: coding, architecture, long audits | **3/3** |
| **2** | **Nemotron 3 Ultra 550B A55B** | `nvidia/nvidia/nemotron-3-ultra-550b-a55b` | Deep reasoning / audit / difficult agents | **3/3** |
| **3** | **Inkling** | `nvidia/thinkingmachines/inkling` | Multimodal reasoning / tool use / coding | **3/3** |
| **4** | **DeepSeek V4 Flash Free** | `oc/deepseek-v4-flash-free` | Fast heavy coding | **3/3** |
| **5** | **MiMo-V2.5 Free** | `oc/mimo-v2.5-free` | Heavy coding / alternate worker | **3/3** |
| **6** | **Nemotron 3 Super 120B A12B** | `nvidia/nvidia/nemotron-3-super-120b-a12b` | Agent/worker pool | **3/3** |
| **7** | **Nemotron 3.5 Lightning 30B A3B** | `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` | Fast worker | **3/3** |
| **8** | **Step 3.7 Flash** | `nvidia/stepfun-ai/step-3.7-flash` | Visual/frontend/tool worker | **3/3** |

## Recommended OmniRoute Pro Coding order

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

Strategy: **`priority`**.

## Why the shortlist is small

In the 2026-08-16 NVIDIA direct sweep, the provider exposed **98 catalog entries**. Only **15 passed 3/3**, 2 passed 2/3, and 81 failed 0/3 in the OpenCode harness.

The point is not to collect models. The point is to keep a small pool of routes that are alive, useful and complementary.

Notable 0/3 results included the direct NVIDIA routes for **DeepSeek V4 Flash**, **DeepSeek V4 Pro**, **GPT-OSS 120B**, **Qwen3 Coder 480B A35B** and **Qwen3.5 397B A17B**. DeepSeek V4 Flash Free still worked through OpenCode Zen/OmniRoute, demonstrating why provider route and model family must be evaluated separately.

## Rate-limit / agent concurrency status

**Pending dedicated measurement.** We do not invent a universal safe-agent count from catalog names.

The next test will measure RPM/TPM where exposed, parallel-request limits, first 429/degradation point, safe concurrent-agent count and shared quota buckets.

## Full evidence and caveats

See:

- [`docs/14-verified-free-models.md`](docs/14-verified-free-models.md) — detailed audit and identity caveats
- [`docs/03-nvidia-nim.md`](docs/03-nvidia-nim.md) — NVIDIA direct routes
- [`docs/02-omniroute.md`](docs/02-omniroute.md) — current OmniRoute priority pool
- [`QUICKSTART.md`](QUICKSTART.md) — shortest setup path

Free/trial availability changes quickly. Re-test before depending on a route.
