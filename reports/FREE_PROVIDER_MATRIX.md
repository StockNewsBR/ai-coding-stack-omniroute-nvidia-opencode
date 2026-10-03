# Free Provider Matrix — VPS OmniRoute 3.8.51

Date: 2026-10-03
Source of truth: VPS production runtime (no configured provider connections; all providers below are system/keyless or excluded by strict policy)

| Provider | Alias | Auth type | Models | Free status | Card/KYC | Overage risk | Health (VPS) | Real E2E | Class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| duckduckgo-web | ddgw | keyless noauth | 6 text | free (web frontend) | none | none (frontend) | healthy | PASS `ddgw/gpt-5.4-mini` 200, cost 0.0000000000 | **A** |
| aihorde (image) | horde | keyless noauth | 146 image | free (kudos, anonymous) | none | none | healthy | PASS `aihorde/Deliberate` 200, cost 0.0000000000 | **A** |
| aihorde (text) | horde | API key required | 3 text | free with account key | none | none | 401 keyless | HTTP 401 without key | **B** (key) |
| opencode | oc | keyless, OpenCode-client gated | 10 catalog / 2 exposed | conditional free tier | none | none | cooling 429; 403 outside OpenCode client | 429 cooldown / 403 FreeTierError | **C** |
| uncloseai | unc | keyless | 1 | unknown | none | unknown | broken | HTTP 404 model does not exist | **E** |
| veoaifree-web | veo-free | keyless | 2 video | untested | none | unknown | not exercised | not tested | **F** |
| veo-free | veo-free | keyless | 2 video | untested | none | unknown | not exercised | not tested | **F** |
| cloudflare-playground | cfp | system, not free-classified | 20 | excluded by strict policy | - | - | not routed | not applicable | NOT_CONFIGURED |
| auggie | aug | system, not free-classified | 28 | excluded by strict policy | - | - | not routed | not applicable | NOT_CONFIGURED |
| devin-cli-agentic | dva | system, not free-classified | 110 | excluded by strict policy | - | - | not routed | not applicable | NOT_CONFIGURED |
| codex-app-server | cxa | system, not free-classified | 46 | excluded by strict policy | - | - | not routed | not applicable | NOT_CONFIGURED |
| zcode | zc | system, not free-classified | 14 | excluded by strict policy | - | - | not routed | not applicable | NOT_CONFIGURED |

## Mission-listed providers not present in the 3.8.51 system catalog

Pollinations, Kiro AI, Qoder, NVIDIA NIM, Gemini free tier, Groq, Cerebras, GLM/Z.AI direct, Kilo Gateway, SiliconFlow, Tencent, Baidu, OpenRouter free, Kimi/Moonshot, Cheaper Inference, AgentRouter.

Status: **NOT_PRESENT** on this runtime (no provider entries, nothing to enable). Re-check after future releases.

## Adoption rules enforced

- Zero real cost proven by E2E (`x-omniroute-response-cost: 0.0000000000`).
- No card/KYC/paid-overage providers in default routes.
- Credit/trial providers (e.g. AgentRouter) = class C/D; excluded from FREE routing by policy.
- `customModels[].isFree` is NOT used to mark anything free without verified E2E.

## New candidates seen in R2

- `ddgw` text family (6 models) — adopted into `aimm-*` profiles.
- AI Horde text models (3) — conditional on a free account key; not adopted keyless.
- Cloudflare Playground (cfp) and ZCode (zc) — interesting but not free-classified; excluded under strict policy; TEST_ONLY if upstream marks them free.
