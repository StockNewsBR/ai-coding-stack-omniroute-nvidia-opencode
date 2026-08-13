# NVIDIA NIM: GLM-5.2 and Nemotron

NVIDIA NIM was the highest-value heavyweight provider in this stack.

## GLM-5.2

Official model page: https://build.nvidia.com/z-ai/glm-5.2

NVIDIA currently lists `z-ai/glm-5.2` as a **Free Endpoint** and describes it as a flagship model for agentic workflows, coding, reasoning and tool use. The model card lists a 1M-token context window and 753B parameters.

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

## Models we used successfully

These ratings are **our field ratings**, not scientific benchmarks.

| Route | Coding | Reasoning/audit | Role in our stack |
|---|---:|---:|---|
| `z-ai/glm-5.2` | ★★★★★ | ★★★★★ | long-horizon implementation, architecture, difficult audits |
| Nemotron 3 Ultra 550B A55B | ★★★★☆ | ★★★★★ | deep audit, investigation, second opinion |
| Nemotron 3 Super 120B A12B | ★★★★☆ | ★★★★☆ | strong general fallback |

Read the exact live model IDs from NVIDIA or your gateway before copying commands.

## Important retirement lesson

A model can disappear while an old config still references it. During our August 2026 work, an older NVIDIA DeepSeek V4 Pro route stopped being a usable route. The correct fix was not to retry forever; it was to remove or demote the dead route and promote working GLM/Nemotron routes.

## NVIDIA through OmniRoute

Once your NIM key is connected in OmniRoute, a client talks only to OmniRoute:

```text
OpenCode → http://127.0.0.1:20128/v1 → NVIDIA NIM → GLM-5.2
```

This is preferable to hard-wiring the NVIDIA endpoint into every coding client because you keep fallback logic in one place.

## NVIDIA through FCC

FCC exposes a provider-prefixed model namespace. Configure the NVIDIA key in FCC's Admin UI, then select an NVIDIA-backed model under **Model Config**.

Official FCC project: https://github.com/Alishahryar1/free-claude-code

## Validation script

```bash
export NVIDIA_API_KEY='...'
bash scripts/validate-nvidia-models.sh
```

The script is intentionally small and transparent so you can change the IDs to whatever NVIDIA currently exposes.
