# NVIDIA NIM: verified free coding models

NVIDIA NIM was the highest-value heavyweight free/trial provider in this stack.

> Latest lab verification: **2026-08-16**
>
> OpenCode runtime used in the sweep: **1.18.18**
>
> NVIDIA catalog entries tested: **98**

## What the 98-model audit found

We did not assume that a model was usable merely because NVIDIA/OpenCode listed it.

Each catalog entry was called three times through the OpenCode coding harness.

Result:

- **15 models passed 3/3**;
- **2 models passed 2/3**;
- **81 models failed 0/3**.

The failures included stale/EOL routes, 404/410 responses, timeouts, unsupported endpoints and models that were not suitable chat/coding routes.

The full current field summary is in [`14-verified-free-models.md`](14-verified-free-models.md).

## Current NVIDIA priority models

These are the direct NVIDIA routes we currently prioritize for coding/agents.

| Priority | Direct NVIDIA model ID | Smoke test | Primary role |
|---:|---|---:|---|
| **1** | `z-ai/glm-5.2` | **3/3** | Main brain: coding, architecture, long audits, agentic work |
| **2** | `nvidia/nemotron-3-ultra-550b-a55b` | **3/3** | Deep reasoning, long-context investigation, difficult agents |
| **3** | `thinkingmachines/inkling` | **3/3** | Multimodal reasoning/coding and tool use |
| **4** | `nvidia/nemotron-3-super-120b-a12b` | **3/3** | Agent/worker pool, high-volume tasks |
| **5** | `nvidia/nemotron-3.5-lightning-30b-a3b` | **3/3** | Fast worker |
| **6** | `stepfun-ai/step-3.7-flash` | **3/3** | Visual/frontend/tool worker |

DeepSeek V4 Flash Free and MiMo-V2.5 Free remain in the overall priority pool, but our healthy routes for those were OpenCode Zen/OmniRoute aliases rather than the direct NVIDIA route.

## GLM-5.2

Official model page: https://build.nvidia.com/z-ai/glm-5.2

NVIDIA currently lists `z-ai/glm-5.2` as a **Free Endpoint** and describes it as a flagship model for agentic workflows, coding, reasoning and tool use. NVIDIA lists a **1M-token context window** and **753B parameters**.

### Direct API smoke test

```bash
curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $NVIDIA_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"z-ai/glm-5.2",
    "messages":[{"role":"user","content":"Reply only with NVIDIA_GLM_OK"}],
    "max_tokens":32
  }'
```

Never paste a real NVIDIA key into a public config file or shell transcript committed to Git.

## Nemotron 3 Ultra 550B A55B

Official model card: https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/modelcard

The detailed NVIDIA model card describes:

- **550B total / 55B active**;
- hybrid Mamba-2 + MoE + Attention architecture;
- context up to **1M tokens**;
- focus on frontier reasoning, complex agentic workflows, long-context analysis and tool use.

This remains our preferred deep-audit fallback after GLM-5.2.

## Nemotron 3 Super 120B A12B

Official model card: https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b/modelcard

NVIDIA lists:

- **120B total / 12B active**;
- context up to **1M tokens**;
- agentic workflows, long-context reasoning, high-volume workloads, tool use and RAG as primary uses.

This makes Super especially attractive as a worker/agent model instead of spending the heaviest model on every subtask.

## Inkling

Official model card: https://build.nvidia.com/thinkingmachines/inkling/modelcard

Inkling passed our 3/3 smoke test and is a strong multimodal/tool-use candidate.

One upstream metadata detail is worth documenting: NVIDIA's short model summary currently shows **952B** parameters, while the detailed model card states **975B total / 41B active**. We preserve that discrepancy rather than pretending it does not exist.

Benchmarks are useful, but field behavior still decides ranking. A model can score extremely well and still over-scope a simple operational task, so we currently keep Inkling behind GLM-5.2 and Nemotron 3 Ultra in the coding priority chain.

## Step 3.7 Flash

Official model card: https://build.nvidia.com/stepfun-ai/step-3.7-flash/modelcard

NVIDIA documents Step 3.7 Flash as:

- text + image input;
- **198B MoE / ~11B active**;
- **256K context**;
- designed for multimodal, coding, frontend/GUI, tool calling and agentic workflows.

That makes it a useful visual/frontend worker rather than another duplicate “big reasoning” slot.

## Important retirement lesson

A model can disappear while an old config still references it.

During the 2026-08-16 sweep:

- NVIDIA direct **DeepSeek V4 Flash** failed 0/3;
- NVIDIA direct **DeepSeek V4 Pro** failed 0/3 and had already shown EOL behavior;
- **GPT-OSS 120B** failed 0/3;
- **Qwen3 Coder 480B A35B** failed 0/3;
- **Qwen3.5 397B A17B** failed 0/3.

Meanwhile, the **OpenCode Zen / OmniRoute DeepSeek V4 Flash Free alias passed 3/3**. Route health is provider-specific: do not conclude that an entire model family is dead because one provider route is dead.

## NVIDIA through OmniRoute

Once your NIM key is connected in OmniRoute, a client talks only to OmniRoute:

```text
OpenCode → http://127.0.0.1:20128/v1 → NVIDIA NIM → selected model
```

This is preferable to hard-wiring the NVIDIA endpoint into every coding client because fallback logic stays in one place.

Our current `OmniRoute Pro Coding` order is documented in [`02-omniroute.md`](02-omniroute.md) and [`14-verified-free-models.md`](14-verified-free-models.md).

## NVIDIA through FCC

FCC exposes a provider-prefixed model namespace. Configure the NVIDIA key in FCC's Admin UI, then select an NVIDIA-backed model under **Model Config**.

Official FCC project: https://github.com/Alishahryar1/free-claude-code

## Validation script

```bash
export NVIDIA_API_KEY='...'
bash scripts/validate-nvidia-models.sh
```

The script now checks the six direct NVIDIA models in the priority pool and performs three attempts per model.

## Rate limits / parallel agents

Do not infer safe parallel-agent counts from the model list.

We have **not** published a fixed RPM/TPM/concurrency table yet because free/trial quotas can be dynamic and provider/account specific. The next dedicated test should measure:

- observed RPM/TPM where exposed;
- maximum parallel requests before 429/timeouts/degradation;
- safe recommended concurrent agents;
- whether apparently different aliases share one quota bucket.

Until that is measured, a claimed universal “N agents per NVIDIA model” number would be guesswork.
