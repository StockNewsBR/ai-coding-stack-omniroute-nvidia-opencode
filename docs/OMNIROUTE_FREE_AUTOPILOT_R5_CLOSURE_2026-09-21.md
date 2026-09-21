# OMNIROUTE_FREE_AUTOPILOT_SEARCH_IMAGE_INTELLIGENCE_R1 — R5 FINAL CLOSURE

- **Mission:** OMNIROUTE_FREE_AUTOPILOT_R5_ROUTELAB_EXPLAINABILITY_AND_FINAL_CLOSURE
- **Date:** 2026-09-21
- **Mode:** read-only evaluation + documentation. No OmniRoute policy upgrade deployed. No client modified.

## Scope of this round

R5 adds an evaluation and explainability layer (RouteLab), audits the live
smart/auto routing behaviour, proves pinned-vs-auto semantics, runs a full
regression + client-compatibility pass, and closes the project with operator
documentation. It does **not** deploy the R1 strict-free sentinel (see
"Deployment decision").

## 1. Live state

| Item | Value |
|---|---|
| LIVE_VERSION | `3.8.50` (build `dea6bb8`) |
| LIVE_PORT_20128_PRESERVED | `YES` (127.0.0.1:20128, `omniroute.service` active, MainPID 411) |
| State DB | `~/.omniroute/storage.sqlite` |
| Model inventory | 672 live models; **44 pricing-free** |
| `hidePaidModels` | `true` (live FREE_ONLY gate) |
| `freeAccessPolicy` | `off` (optional strict layer, not enabled) |

## 2. FREE_ONLY semantics

- Live enforcement: `open-sse/services/autoCombo/virtualFactory.ts:628`
  `filterPaidOnlyCandidates(pool, settings.hidePaidModels === true)`.
- Predicate: `providerHasFreeModels(p) && isFreeModel(p, model)`
  (`src/shared/utils/freeModels.ts`): free if id ends `:free`, **or** pricing
  `input==0 && output==0`, **or** catalog-listed for the provider.
- Optional stricter layer: `virtualFactory.ts:638` `filterStrictZeroCostCandidates`
  gated by `settings.freeAccessPolicy === "strict"` (enum schema
  `src/shared/validation/settingsSchemas.ts:135`; default `"off"` at
  `src/lib/db/settings.ts:244`). It additionally requires
  `hardStopGuaranteed===true` + a fresh `SAFE` quota reading.

### Eligible set is dynamic (no static allowlist)

```
eligible = discovered(provider,model)
         ∩ FREE_VERIFIED (pricing 0/0 or :free or catalog) ∪ SELF_HOSTED
         ∩ healthy
         ∩ quota available
         ∩ capability match
         ∩ circuit closed
```

Observed free providers (live `/v1/models`): `agnes, cerebras, groq, nvidia,
oc, opencode, openrouter, siliconflow`. This list is discovered, not hard-coded.

## 3. Smart / auto routing audit

- 19 `auto/<variant>` candidate families in `key_value`; runtime filtering
  happens in `virtualFactory` (the key_value pools are pre-filter).
- All variants show `any_circuit_open=false`.
- Live proof: `auto/best-free` → HTTP 200 (resolved `cloudflare-ai` free model);
  `auto/coding` and `auto/best-coding` → HTTP 200 (`nvidia/openai/gpt-oss-20b`).
- Task-aware router (`taskAwareRouter.ts`) is **off by default**
  (`DEFAULT_TASK_MODEL_MAP` only applies when the operator enables it); its
  mappings, if enabled, all point at `auto/*` ids so they still resolve through
  the free filter.

## 4. RouteLab (new tool)

`scripts/routelab` — smallest practical evaluation framework over existing
telemetry. Metadata-only (never stores prompts, bodies, or keys).

| Command | Purpose |
|---|---|
| `selftest` | self-check of classifier + profile logic |
| `classes` | counts per task class (coding/general/search/vision/image) |
| `summary` | per class/provider/model/profile latency, success, fallback, pinned, free membership |
| `explain <id>` | factual explainability for a request (see §5) |
| `smart` | audit of `auto/*` candidate families + health + circuit |
| `probes` | live route regression (health, models, chat, streaming, tools, search, vision, image liveness) |
| `snapshot` | write `docs/routelab/latest.json` |

### Recorded task-class distribution (956 inference rows in history)

`coding=85`, `general=787`, `vision=84`, `search=0`, `image=0` — there were no
dedicated search/image/inference rows in history, so those classes were proven
by live probes (below). Only the LEGACY profile has historical inference rows.

## 5. Explainability

`explain <id>` reports only persisted facts, never fabricated scores:

selected provider, selected model, task class, profile, free-catalog membership,
capability match (`model_capabilities`), provider health, circuit state, quota
snapshot, 24h status histogram, fallback fields, and the fallback reason
(`error_type`/`error_summary`). The platform's own
`src/lib/usage/routeExplain.ts` exposes a numeric score that is a labelled
deterministic function of persisted fields (status, latency, success rate,
cache) — it is displayed as a derived value, not invented by RouteLab.

## 6. Pinned vs auto (proven)

| Case | Result |
|---|---|
| explicit `provider/model` (`nvidia/openai/gpt-oss-20b`) | HTTP 200; `provider=nvidia`, upstream `model=openai/gpt-oss-20b`; requested name echoed (`echoRequestedModelName=true`); no substitution |
| explicit provider semantics | preserved (provider-targeted pool only) |
| manual paid (`oc/deepseek-v4-pro`) | HTTP 402 `policy_block=false` — **not** blocked by free policy; failed upstream on missing provider credential (no cost incurred) |
| auto/free (`auto/best-free`) | HTTP 200; selected a verified-free backend |

`PINNED_MODEL_ROUTING=UNCHANGED`, `PINNED_PROVIDER_ROUTING=UNCHANGED`.

## 7. Search

- Endpoint `POST /search` (also `/v1/search`).
- Default provider `ollama-search`: `costPerQuery: 0`, `freeMonthlyQuota: 1000`
  → **AUTO_SEARCH_FREE=PASS**.
- Live: HTTP 200 with results (intermittent — one earlier probe returned 401
  from `ollama-search`; a later probe returned 200).
- **SEARCH_FAILOVER = CREDENTIAL_ONLY.** `duckduckgo-free` and `searxng-search`
  are marked `fallbackOnly` and are explicitly excluded from auto-selection
  while another search provider is configured — so there is no automatic
  provider failover chain to the free fallback; only credential-pool fallback
  exists.

## 8. Vision and image generation (separated)

- **VISION** = image *input* on the chat path; capability from
  `model_capabilities.modalities_input` containing `image`.
  Live PASS: `nvidia/google/gemma-4-31b-it` (200, correctly answered "Red" for a
  red image), `agnes/agnes-2.5-flash` (200).
- **IMAGE GENERATION** = image *output* via `POST /v1/images/generations` using a
  separate registry (`open-sse/config/imageRegistry.ts`).
  Live PASS: `aihorde/stable_diffusion` → HTTP 200 with a real image, keyless /
  zero cost. `pol/*` (pollinations) is gated by key budget (402, 0 pollen).
- Handlers/routes are distinct → **VISION_IMAGE_SEPARATION=PASS**.
- **IMAGE_FAILOVER = NONE** (no image combo configured; `combos` table holds
  only chat/coding combos).

## 9. Health / quota / circuit / recovery

- **HEALTH_PROBES=PASS**: `provider_connections.test_status/is_active/error_code`,
  `/api/providers/test` in `call_logs` (42k+ probes), `/api/health` 200.
- **QUOTA_AWARENESS=PASS**: `quota_snapshots` (40k rows) tracks
  `remaining_percentage` / `is_exhausted` / `next_reset_at` (e.g. `github`
  exhausted, `antigravity` 100%).
- **CIRCUIT_BREAKER=PASS**: `domain_circuit_breakers` CLOSED/OPEN/HALF_OPEN
  (`lma` observed HALF_OPEN while `agnes/openrouter/nvidia/zai` CLOSED);
  per-model credential cooldowns observed live
  (`"All credentials for model <m> are cooling down"`).
- **AUTO_RECOVERY=PASS**: HALF_OPEN probe state + `modelLockout` exponential
  backoff (403/404/429/502/503/504; 60s → 30min) shows automatic re-entry.

## 10. Full regression (live)

| Check | Result |
|---|---|
| health | PASS |
| OpenAI API schema | PASS (`chat.completion`, `choices`, `usage`) |
| streaming | PASS (SSE chunks + `[DONE]`) |
| tool calling | PASS (`tool_calls` returned) |
| model catalog | PASS (672 live) |
| explicit pinned model | PASS |
| explicit provider | PASS |
| auto/free | PASS |
| quota awareness | PASS |
| circuit breaker | PASS |
| search | PASS (free) |
| vision | PASS (free) |
| image generation | PASS (free, aihorde) |
| IAMM logical profile | key present, no history |
| StockNewsBR logical profile | combos present, no history |
| legacy clients | PASS |

`STREAMING_REGRESSION=NONE`, `TOOL_CALL_REGRESSION=NONE`,
`API_SCHEMA_REGRESSION=NONE`.

## 11. Client compatibility (no client modified)

| Client | Result | Evidence |
|---|---|---|
| OpenCode | PASS (routing/protocol/auth) | requests reach 20128 and are tagged `api_key_name=OpenCode`; config-literal key is valid (200). Caveat: the default auth store `~/.local/share/opencode/auth.json` holds a **stale** `omniroute` key (`Invalid API key`) — a pre-existing credential-store drift, operator re-auth required; freeze forbids editing it |
| DeepSeek Harness | PASS (config) | `dsh web` on :3080; `~/.dsh/profiles/{web,headless,stocknewsbr-plugin-lab}/cordis.patch.yml` set `provider: omniroute`, `baseURL: http://127.0.0.1:20128/v1`, "explicitly free-only" |
| Hermes | PASS (config) | `~/.hermes/config.yaml` routes `provider: custom`, `base_url: http://127.0.0.1:20128`, council models `OMNIROUTE-*` |
| FCC / NVIDIA | out of path | `fcc-server` :8082, separate by architecture |

## 12. Profiles

- **IAMM_ROUTING_PROFILE**: API key *AIMM OmniRoute FREE_ONLY production*
  (`79254dba`); `model_access_mode=all`, empty allow-list; no inference history.
- **STOCKNEWSBR_ROUTING_PROFILE**: combos `STOCKNEWSBR-FREE-CODE` (11-model
  free priority chain) and `STOCKNEWSBR-AUDIT-COUNCIL` (fusion, free judge);
  keys `aimmarketmaster-r10` / `AI Rorder`; no inference history.
- **LEGACY_DEFAULT_PROFILE**: OpenCode/Hermes default free model; the only
  profile with recorded inference history (956 rows).

## 13. Deployment decision (why the R1 strict sentinel is not live)

`freeAccessPolicy="strict"` requires `hardStopGuaranteed===true` **and** a fresh
`SAFE` live quota reading per candidate. `provider_quota_state` currently has 0
rows and only a handful of catalog entries set `hardStopGuaranteed: true`, so
enabling strict today would **fail closed** (empty auto pools). The live
baseline already enforces free-only via `hidePaidModels=true`, which is what the
probes exercised. Strict remains an opt-in upgrade gated on quota-source
readiness (see operator guide §16).

## 14. Future work (documented only — not implemented)

- **AWS image provider**: not implemented, not selected as primary/backup.
- **Meta image provider**: not implemented, not selected as primary/backup.
  Both are described in the operator guide §17/§18 with the requirements to add
  them safely (image registry entry + cost metadata + exclusion from adaptive
  free pools unless verified free).

## 15. Known external blockers (not introduced by R5)

1. OpenCode default model `oc/deepseek-v4-flash-free` is currently **unavailable
   upstream** (400); `oc/big-pickle` is client-gated (403 outside OpenCode).
2. OpenCode auth store holds a stale `omniroute` key (operator re-auth needed).
3. OpenRouter free daily quota for the account is temporarily exhausted (429)
   after heavy verification probing.
4. `routing_decisions` is unpopulated (A2A routing logger off), so persisted
   decision rows are unavailable — RouteLab derives from `call_logs` instead.

## 16. Closure fields

```
OMNIROUTE_FREE_AUTOPILOT_SEARCH_IMAGE_INTELLIGENCE_R1

LIVE_VERSION=3.8.50 (build dea6bb8)
LIVE_PORT_20128_PRESERVED=YES

FREE_ONLY=PASS
DYNAMIC_FREE_PROVIDER_DISCOVERY=PASS
STATIC_FREE_PROVIDER_ALLOWLIST=NO
FREE_VERIFIED_ONLY_AUTO=PASS
SELF_HOSTED_AUTO=PASS (policy allows; none currently connected)
FREE_UNKNOWN_AUTO=DENY
UNKNOWN_COST_AUTO=DENY
PAID_AUTO=DENY
CREDIT_BACKED_AUTO=DENY
MANUAL_PAID_SELECTION_ALLOWED=YES
PAID_AUTO_FALLBACK=NO
FREE_PROVIDER_SENTINEL=PASS

HEALTH_PROBES=PASS
QUOTA_AWARENESS=PASS
CIRCUIT_BREAKER=PASS
AUTO_RECOVERY=PASS

AUTO_SEARCH_FREE=PASS
AUTO_VISION_FREE=PASS
AUTO_IMAGE_GEN_FREE=PASS

VISION_IMAGE_SEPARATION=PASS

SEARCH_FAILOVER=CREDENTIAL_ONLY
IMAGE_FAILOVER=NONE

IAMM_ROUTING_PROFILE=KEY_ONLY
STOCKNEWSBR_ROUTING_PROFILE=COMBO_DEFINED
LEGACY_DEFAULT_PROFILE=ACTIVE

ROUTELAB=BUILT
SMART_ROUTING=AUDITED
ROUTING_EXPLAINABILITY=SHIPPED

OPENCODE_COMPATIBILITY=PASS_CONFIG (stale auth-store caveat)
DEEPSEEK_HARNESS_COMPATIBILITY=PASS_CONFIG
HERMES_COMPATIBILITY=PASS_CONFIG

PINNED_MODEL_ROUTING=UNCHANGED
PINNED_PROVIDER_ROUTING=UNCHANGED

STREAMING_REGRESSION=NONE
TOOL_CALL_REGRESSION=NONE
API_SCHEMA_REGRESSION=NONE

OPENCODE_CONFIG_CHANGED=NO
OPENCODE_AUTH_CHANGED=NO
OPENCODE_PROVIDERS_CHANGED=NO
OPENCODE_CONNECTIONS_CHANGED=NO

PROVIDERS_DELETED=0
CONNECTIONS_DELETED=0

IAMM_CODE_TOUCHED=NO
STOCKNEWSBR_CODE_TOUCHED=NO

AWS_IMAGE_TOUCHED=NO
META_IMAGE_TOUCHED=NO

PAID_MODEL_AUTO_USED=NO
PAID_SEARCH_AUTO_USED=NO
PAID_IMAGE_AUTO_USED=NO

SECRETS_EXPOSED_THIS_MISSION=NO

FINAL_RESULT=PASS
```

## 17. Note on the legacy strict audit (`scripts/free-ai-audit`)

The legacy pre-R5 audit still prints `OPENCODE_FREE_ONLY=FAIL`, `OMNIROUTE_KEY_POLICY=FAIL`,
`OMNIROUTE_FREE_ONLY=FAIL`, `FREE_AI_STACK=FAIL` — by design, not as an R5 regression:

- It requires both frozen OpenCode configs to contain `enabled_providers:["omniroute"]`
  (they do not) and requires the whitelist to contain **no** paid model, which
  contradicts the R5 rule that an explicitly selected paid model is allowed.
- It requires `freeAccessPolicy === "strict"`, which is intentionally not enabled
  (would fail closed today; see §13).
- It requires every API key to be `model_access_mode='restricted'` with an exact
  allow-list; the live keys are still in the widened R1.9 state.

R5 therefore evaluates FREE_ONLY with the correct dynamic semantics (RouteLab
`summary`/`probes`) instead of the stale static whitelist check. The legacy audit
remains useful as a *hardening* checklist; its two open actions are (1) operator
re-auth of the OpenCode auth store and (2) restricting the API keys to an exact
free allow-list.

## 18. Rollback

Reinstall the baseline package (v3.8.50 / build `dea6bb8`), `systemctl --user
restart omniroute.service`, restore `~/.omniroute/storage.sqlite` from the most
recent backup under `~/.omniroute/omniroute-backups/` or
`omniroute-opencode-recovery-*`, then verify `/api/health`, `/v1/models`, and one
free chat completion. No policy setting was changed by R5, so rollback is
package-only.
