# OmniRoute v3.8.51 Provider Audit — IAMM / StockNewsBR (FREE FIRST)

- Environment: production VPS (200.…, loopback-bound gateway) + local workstation mirror
- Policy: FREE_ONLY strict (`hidePaidModels=true`, `freeAccessPolicy=strict`), `PAID_FALLBACK=0`, zero paid calls executed
- VPS configured provider connections: 0 (all routes use keyless/built-in providers)
- VPS catalog: 197 models (openresty updated 2026-10-03 11:15 UTC); local catalog: 610 models

## Inventory (VPS production)

| Provider | Auth | Models | Free | Health (2026-10-03) | Last real E2E | Tier | Enabled |
|---|---|---|---|---|---|---|---|
| `ddgw` (keyless web) | none | 6 (`gpt-5.4-mini`, `gpt-5.6-luna`, `claude-haiku-4-5`, `mistral-small-2603`, `tinfoil/gpt-oss-120b`, `tinfoil/gemma4-31b`) | yes | HEALTHY | PASS — text, HTTP 200, 1.2–1.4 s, cost 0 | direct free text | yes |
| `horde` (AI Horde) | none | 146 image models (`aihorde/*`) | yes | HEALTHY | PASS — image `aihorde/Deliberate`, HTTP 200, ~35 s, cost 0 | free image | yes |
| `opencode` (OpenCode Zen keyless) | none | 2 (`oc/big-pickle`, `oc/deepseek-v4-flash-free`) | yes (restricted) | COOLDOWN — `deepseek-v4-flash-free` 429 until ~11:43 UTC; `big-pickle` 403 `FreeTierError` outside OpenCode | attempted, not usable from gateway right now | auto combo candidate | yes (keyless) |
| `veoaifree-web` + `veo-free` | none | 4 (`veo`, `seedance` each) | yes | UNTESTED | none yet | free video (candidate) | yes (exposed) |
| `unc` (uncloseai) | none | 1 (`Lorbus/Qwen3.6-27B-int4-AutoRound`) | yes | UNSTABLE — 404 model missing (resets ~2 min) | FAILED | none | yes (keyless) |

Notes:
- `auto/*` combos (47) currently resolve to the single keyless candidate `opencode`; `auto/best-free` returned 503 `ALL_TARGETS_SKIPPED` then 404 `no_executable_targets` during the cooldown window. Combos are functional by design but starved while no second free connection is configured.
- No NVIDIA, Pollinations, Kilo, Agnes, Bedrock, Codex or ChatGPT-Web routes are configured on the production VPS at this time. The v3.8.51 upgrade did not add any.
- Local workstation additionally exposes the same free families (`ddgw`, `aihorde`, `oc`) plus whatever user connections exist locally; production parity is not required for dev-only connections.

## Free provider candidates produced by this audit

| Candidate | Kind | Recommendation | Evidence |
|---|---|---|---|
| `ddgw` keyless web models | text (6 models, up to 1.05M ctx) | ADOPT_NOW as free text route | real E2E HTTP 200, cost 0, provider headers present |
| AI Horde `aihorde/*` | image (146 models) | ADOPT (already live) | real E2E HTTP 200, cost 0, b64 WebP |
| `veo-free` / `veoaifree-web` | video (4 models) | TEST_ONLY | catalog-only, no E2E yet |
| uncloseai (`unc`) | text (1 model) | MONITOR | 404 model missing during test |
| OpenCode Zen `oc/*` | text (2 models) | CONDITIONAL | restricted to OpenCode client; cooldown behavior |

Adoption criterion (unchanged): real cost zero proven, secure auth, stable health, REAL E2E pass. No provider was enabled by default and no paid fallback was introduced.
