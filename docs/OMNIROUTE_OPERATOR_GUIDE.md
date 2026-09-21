# OmniRoute Free Autopilot — Operator Guide (Canonical)

Audience: operators running the local OmniRoute gateway for OpenCode, DeepSeek Harness,
Hermes, IAMM and StockNewsBR.

Scope: this document describes **behaviour and rules**, not secrets. No API keys, tokens
or credentials appear here. Version/paths below are the state verified in mission
`OMNIROUTE_FREE_AUTOPILOT_R5_ROUTELAB_EXPLAINABILITY_AND_FINAL_CLOSURE` (2026-09-21).

---

## 1. Architecture

```
                       +----------------------------------------------+
 clients               |            OmniRoute gateway (local)          |
 -------               |  listen 127.0.0.1:20128                       |
 OpenCode  ----------> |  /v1/chat/completions  /v1/responses          |
 DeepSeek Harness ---> |  /v1/embeddings  /v1/search                   |
 Hermes    ----------> |  /v1/images/generations  /v1/media ...        |
 IAMM      ----------> |                                               |
 StockNewsBR --------> |  routing: explicit -> provider/model          |
                       |           auto/*   -> adaptive combo pool      |
                       |           free gate: hidePaidModels filter     |
                       +-------------------+--------------------------+
                                           |
                        +------------------+------------------+
                        | discovered provider connections  (43)    |
                        | health/quota/circuit runtime state        |
                        +------------------------------------------+
```

- **Runtime**: user systemd unit `omniroute.service`, `ExecStart` wraps
  `omniroute serve --no-open --no-recovery` via `/home/dcima/.local/bin/omniroute-systemd-run`
  (sets `HOSTNAME=127.0.0.1`); `ExecStartPost` runs `/home/dcima/.local/bin/omniroute-fix-orcarouter`.
- **Version**: `3.8.50`, build SHA `dea6bb8` (baseline / rollback target).
- **State DB**: `~/.omniroute/storage.sqlite` (call logs, provider connections, quota
  snapshots, circuit breakers, combos, api keys).
- **Installed package**: `~/.local/share/pnpm/global/v11/<hash>/node_modules/omniroute`.
- **FCC / NVIDIA**: separate stack, **out of path** for this gateway. Do not couple it.
- **OpenCode is a test client only.** Its config, auth store, providers, connections and
  default model are frozen for this project.

Endpoints: `GET /api/health` (public liveness), `GET /v1/models` (Bearer), OpenAI-compatible
`/v1/chat/completions`, `POST /search`, `POST /v1/images/generations`.

---

## 2. FREE_ONLY rules

Free-only enforcement for adaptive (`auto/*`) routing is **active** in the live build
through the paid-model filter, not through the optional strict layer.

| Setting | Live value | Effect |
|---|---|---|
| `hidePaidModels` | `true` | Removes paid-only candidates from `auto/*` pools and (where applicable) from the catalog projection. |
| `freeAccessPolicy` | `off` | Optional strict zero-cost + hard-stop + quota layer. **Not enabled.** |

Source of truth (installed package):

- `open-sse/services/autoCombo/virtualFactory.ts:628`
  `filterPaidOnlyCandidates(pool, settings.hidePaidModels === true)` — the live gate.
- `open-sse/services/autoCombo/paidModelFilter.ts`
  keeps a candidate only when `providerHasFreeModels(provider) && isFreeModel(provider, model)`
  (`src/shared/utils/freeModels.ts`). A model counts as free when its id ends `:free`,
  or its pricing is `0/0`, or its id is listed in the free-model catalog for that provider.
- `open-sse/services/autoCombo/strictZeroCostFilter.ts` — additional opt-in layer requiring
  a catalogued budget entry, a guaranteed hard stop, and fresh `SAFE` quota state.
  `virtualFactory.ts:638` enables it only when `freeAccessPolicy === "strict"`.
- `src/shared/validation/settingsSchemas.ts:135` — `freeAccessPolicy: enum("off","strict")`.
- Default in `src/lib/db/settings.ts:244` is `"off"`.

Consequences:

- **Eligible free set is dynamic**: `all discovered models ∩ {verified-free, self-hosted}
  ∩ healthy ∩ quota-available ∩ capability-matched ∩ circuit-closed`. There is **no static
  preferred-provider allowlist**.
- **Denied on auto by default**: free-unknown, unknown-cost, paid, credit-backed.
- Paid/credit models remain reachable **only** by explicit selection (see §3).

> Enabling `freeAccessPolicy="strict"` is a deliberate operator decision. It is stricter
> (hard-stop guarantee + fresh quota headroom) and will **fail closed** when quota state is
> absent. Do not enable it blind: verify quota sources first.

---

## 3. Manual paid model rules

- An explicit model id `provider/model` (or a whitelisted paid alias) is a **manual
  selection**. It bypasses the free-only auto gate by design.
- Verified behaviour: requesting the paid/credit-backed `oc/deepseek-v4-pro` returns an
  upstream credential error (`402`), **not** a policy denial — proof that manual paid
  selection is permitted through routing and only fails on the provider credential.
- Paid models are hidden from adaptive pools. **No paid auto fallback exists.**

Rule of thumb:

| Request form | Behaviour |
|---|---|
| `provider/model` explicitly | Pinned. No auto substitution. Free gate does not apply. |
| `auto/<variant>` | Adaptive. Free-only pool, health/quota/circuit filtered. |
| bare model alias in whitelist | Resolved to its provider/model; treated as explicit. |

---

## 4. Dynamic FREE provider discovery

Discovery is live, not configured:

1. `GET /v1/models` returns the current catalog with pricing
   (`pricing.input === 0 && pricing.output === 0` ⇒ free).
2. `providerHasFreeModels(provider)` derives the set of providers that *have* free models
   from the free-model catalog.
3. Each `auto/*` candidate must satisfy both: `providerHasFreeModels(provider)` **and**
   `isFreeModel(provider, model)`.

Observed live (2026-09-21): 44 pricing-free models in inventory out of ~672 catalog entries;
free-capable providers observed `agnes, cerebras, groq, nvidia, oc, opencode, openrouter,
siliconflow`. These are **results**, not a fixed allowlist, and change as upstreams change.

---

## 5. Provider health

- `provider_connections` (~43 rows) carries `test_status`, `is_active`, `error_code`,
  `rate_limited_until`, `backoff_level`, health-check timestamps.
- Active connection tests are recorded in `call_logs` (`path=/api/providers/test`).
- Health is a **filter input** to adaptive routing: unhealthy/rate-limited connections are
  excluded or deprioritised.

## 6. Quota

- `quota_snapshots` (large, continuously appended) stores `remaining_percentage`,
  `is_exhausted`, `next_reset_at` per provider/connection.
- `provider_quota_state` (token-window state) exists but may be empty until the quota
  fetcher runs for a provider.
- Observed live: providers tracked with `remaining_percentage` 100 and 0/exhausted.
- Quota headroom gates both the optional strict layer and adaptive candidate selection.

## 7. Circuit breaker

- `domain_circuit_breakers` holds `state` ∈ `CLOSED | HALF_OPEN | OPEN`, `failure_count`,
  `last_failure_time`, `options` (failureThreshold, resetTimeout, halfOpenRequests).
- Model-credential cooldowns surface at request time as
  `"All credentials for model <m> are cooling down"` (HTTP 429).
- `modelLockout` (settings) applies exponential backoff on 403/404/429/502/503/504 with
  base 60s and max 30min.
- **Auto-recovery** is demonstrable: a tripped breaker moving to `HALF_OPEN` probes the
  backend and returns to `CLOSED` on success.

---

## 8. Search

- Search providers are defined in `open-sse/config/searchRegistry.ts` with `costPerQuery`
  and `freeMonthlyQuota`.
- The default provider observed is `ollama-search` (`costPerQuery: 0`, `freeMonthlyQuota:
  1000`) ⇒ search is **free at the default**, backed by the `ollama-cloud` credential pool.
- Free fallback providers (`duckduckgo-free`, `searxng-search`) are marked `fallbackOnly`
  and are **never auto-selected while another search provider is configured**. There is a
  credential fallback (`ollama-search → ollama-cloud`) but no provider-level failover chain.
- Endpoint: `POST /search` (also mounted under `/v1/search`).
- Operations note: the default search upstream can intermittently return an auth error from
  its credential pool; retry or re-check the search credential. It is not a free-tier
  violation, but there is currently no automatic free fallback.

## 9. Vision

- Vision = an **image input** on a chat request (an `image_url` content part), handled by
  the chat path.
- Capability comes from `model_capabilities.modalities_input` containing `image`.
- Verified live on free inventory (e.g. `nvidia/google/gemma-4-31b-it`, `agnes/agnes-2.5-flash`).

## 10. Image generation

- Image generation = **image output** via `POST /v1/images/generations`, a separate handler
  and registry (`open-sse/config/imageRegistry.ts`); it is distinct from vision.
- Providers include free/community and keyed options. Verified live free route:
  `aihorde/stable_diffusion` (AI Horde, keyless community) returned a real image.
- Pollinations (`pol/*`) image models exist but are gated by the account's key budget; an
  exhausted budget returns a budget error rather than generating.
- **No image combo is configured**, so there is no image failover chain today.

### Vision / image separation (invariant)

| Concern | Handler | Direction |
|---|---|---|
| Vision | chat completions | image **in** → text out |
| Image generation | `/v1/images/generations` | text in → image **out** |

They must not be conflated; a vision-capable chat model is not an image generator.

---

## 11. Pinned routing

- `provider/model` (or a whitelisted alias) pins the route: the request is sent to that
  exact provider/model, and the requested model name is echoed back
  (`echoRequestedModelName: true`).
- Verified: explicit `nvidia/openai/gpt-oss-20b` → provider `nvidia`, upstream model
  `openai/gpt-oss-20b`, OpenAI response schema intact.
- Explicit pinned behaviour is unchanged by free-only enforcement. There is no silent
  substitution of an explicitly requested target.

---

## 12. Logical profiles

- **IAMM** — represented by the OmniRoute API key labelled *AIMM OmniRoute FREE_ONLY
  production*. It currently has broad (all-model) access and no recorded inference history.
  See §15 for the recommended restriction.
- **StockNewsBR** — combos `STOCKNEWSBR-FREE-CODE` (priority chain of free models) and
  `STOCKNEWSBR-AUDIT-COUNCIL` (fusion with a free judge model), used by the
  StockNewsBR keys (`aimmarketmaster-r10`, `AI Rorder`).
- **Legacy default** — the OpenCode/Hermes default free model; the only profile with
  recorded inference history. Treat any change to it as a compatibility risk.

---

## 13. Client roles and freeze

| Client | Role | State |
|---|---|---|
| OpenCode | Test client; primary legacy consumer | Config/auth/providers/connections/default model **frozen**. Routes to `http://localhost:20128/v1`. |
| DeepSeek Harness | Separate harness, may bridge via its own config | Not wired in the copy inspected; treat as unproven here. |
| Hermes | Operator agent | Points at `http://127.0.0.1:20128`; uses OmniRoute combos. |
| FCC / NVIDIA | Separate stack | **Out of path.** |

OpenCode freeze (do not modify, this project):
`opencode.json`, `auth.json`, providers, connections, default model.

Known OpenCode environment caveat: the OpenCode credential store may hold a **stale**
OmniRoute key. When present, `opencode run` fails with `Invalid API key`, while the key in
the frozen `opencode.json` is valid. Resolution is an operator re-auth; it is **not** a
gateway defect and must not be fixed by editing frozen files.

---

## 14. Rollback

1. Gateway package: reinstall the pinned baseline build (`3.8.50`, SHA `dea6bb8`) from the
   rollback archive noted in the closure report.
2. Service: `systemctl --user restart omniroute.service` (and confirm
   `omniroute-fix-orcarouter` succeeded).
3. State: keep a copy of `~/.omniroute/storage.sqlite` before and after any change.
4. Verify: `GET /api/health` = 200, `GET /v1/models` with Bearer, and one free
   `/v1/chat/completions` request.
5. Rollback archives and dated backups live under `~/.omniroute/omniroute-backups/` and the
   `omniroute-opencode-recovery-*` directories.

---

## 15. Security posture and open items

- 8 API keys exist. All currently have broad (`model_access_mode=all`) access with an empty
  explicit allow-list. The **hardening action** is to restrict each key to the exact model
  allow-list it needs (keeping free models, and `oc/deepseek-v4-pro` only where manual paid
  selection is intended).
- Secret rotation of previously exposed keys is a **pending** operator action.
- Never print or commit keys. RouteLab and the audit scripts deliberately avoid emitting
  credentials.
- Free-only policy does not replace credential hygiene: broad keys can still reach paid
  models by explicit selection.

---

## 16. Future upgrades

- **Free-only strict mode**: before enabling `freeAccessPolicy="strict"`, populate and
  verify quota sources so the hard-stop/quota filter can pass (otherwise it fails closed).
- **Free fallback chains**: if free search/image failover is desired, add explicit combos
  and/or allow `fallbackOnly` free providers on the fallback path.
- **Catalog freshness**: many catalogued "free" models can be stale upstream (removed or
  renamed); periodic health sweeps (RouteLab `probes` / health scan) keep discovery honest.
- **Observability**: `routing_decisions` is currently unpopulated; enabling the A2A routing
  logger would give persisted decision rows for explainability, in addition to RouteLab's
  recompute-from-`call_logs` approach.

## 17. Future AWS image integration (not implemented)

**Not implemented in this mission.** If added later, it must:
- register as an image provider in `imageRegistry.ts` with explicit cost metadata;
- be excluded from adaptive free pools unless it has a verified free/self-hosted tier;
- require manual selection otherwise; and
- be documented here with its quota/circuit semantics.

## 18. Future Meta image integration (not implemented)

**Not implemented in this mission.** Same requirements as §17. No provider hierarchy
(primary/backup) is chosen here; the free-eligible set remains dynamic and is computed at
request time, not hard-coded.

---

## 19. RouteLab (evaluation tooling)

`scripts/routelab` is a read-only evaluation/explainability CLI over existing telemetry plus
live endpoint probes. It never stores prompts and never prints secrets.

| Command | Purpose |
|---|---|
| `selftest` | Runnable self-check of the task classifier and helpers. |
| `summary [--since DATE]` | Per-class / per-profile / per-provider / per-model latency, success and fallback counts. |
| `classes` | Task-class distribution (coding, general, search, vision, image). |
| `explain <id>` | Factual explainability for a request/correlation/response id. |
| `smart` | Audit of `auto/*` candidate pools vs health and circuit state. |
| `probes` | Live regression probes: health, catalog, chat, streaming, tools, search, vision, image-route. |
| `snapshot` | Writes a metadata-only JSON snapshot of the above. |

Task classes are derived from the request path, the model id, and (when available)
`model_capabilities` modalities — never from prompt content.

### Explainability contract

For an adaptive selection, RouteLab reports **only facts**: the selected provider/model, the
task class/profile, whether the model is in the live free catalog, capability match (tools,
reasoning, vision), provider health, circuit state, quota snapshots, 24h provider status
counts, and the fallback reason (HTTP status / error type). It does **not** invent numeric
scores. When the platform's own `src/lib/usage/routeExplain.ts` recomputes a score, that
score is a deterministic function of persisted fields (status/latency/observed success/cache)
and is labelled as such.

---

## 20. Quick reference

```bash
# Gateway
systemctl --user status omniroute.service
curl -s http://127.0.0.1:20128/api/health

# RouteLab (repo root)
node scripts/routelab selftest
node scripts/routelab summary --since 2026-09-18
node scripts/routelab smart
node scripts/routelab probes
node scripts/routelab explain <request-id>

# Static stack audit (read-only; expected to flag widened keys)
node scripts/free-ai-audit
```
