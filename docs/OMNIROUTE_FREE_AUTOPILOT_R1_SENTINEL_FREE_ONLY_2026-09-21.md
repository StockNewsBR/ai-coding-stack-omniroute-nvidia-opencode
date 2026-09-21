# OmniRoute Free Autopilot R1 — Sentinel and Hard FREE_ONLY

Date: 2026-09-21

## Outcome

R1 was implemented in an isolated lab checkout based on the exact installed
OmniRoute v3.8.50 source commit. The live packaged installation was not
upgraded and the R1 source was not deployed to it.

The free-policy implementation and its deterministic test matrix pass. The R1
release gate is blocked by a current DeepSeek Harness model-catalog mismatch
that is outside the isolated R1 source and cannot be repaired without changing
client/runtime configuration. Hermes remains the same pre-existing external
Z.AI failure documented by R0.5.

## Source and deployment boundary

```text
LIVE_VERSION=3.8.50
LIVE_ENDPOINT=http://127.0.0.1:20128
LIVE_SERVICE=omniroute.service (active)
LIVE_INSTALL_TYPE=pnpm_global_packaged
LIVE_SOURCE=/home/dcima/.local/share/pnpm/store/.../node_modules/omniroute

IMPLEMENTATION_SOURCE=/home/dcima/omniroute-lab-r1-v3.8.50
IMPLEMENTATION_BRANCH=r1-sentinel-hard-free-only-2026-09-21
LAB_PORT=22128
LAB_DATA_DIR=/tmp/omniroute-r1-lab-data
START_SHA=091589089cd134a94df9f6cdab9ba562b2cefd18
FINAL_SHA=669eb4690ffceecea0773a9653c2da00baa603c4
LAB_COMMIT=669eb46 feat(auto): add free provider sentinel and strict free gate
```

The lab database was set to `freeAccessPolicy=strict` for the candidate API
smoke test and then restored to `off` before the lab was stopped. Production
finished with `freeAccessPolicy=off`, matching the R0/R0.5 baseline. No live
R1 source or package was loaded.

An unexpected live database setting drift to `freeAccessPolicy=strict` was
observed during the final safety check. It was restored to `off` before
sign-off and verified from the live SQLite database. The final live service was
active, healthy, and listening on `127.0.0.1:20128`.

## Files changed in the isolated lab

Only these files are in the R1 source commit:

- `open-sse/handlers/autoComboCandidates.ts`
- `open-sse/services/autoCombo/freeAccessQuota.ts`
- `open-sse/services/autoCombo/strictZeroCostFilter.ts`
- `open-sse/services/autoCombo/virtualFactory.ts`
- `tests/unit/autoCombo/free-provider-sentinel-r1.test.ts`

The lab-only generated `pnpm-lock.yaml` was not committed.

## Native components reused

R1 extends the existing v3.8.50 path:

- `strictZeroCostFilter` remains the only strict free admission filter.
- `freeAccessQuota` remains the quota/cache resolver; R1 adds a cache-only
  inspection read so candidate reporting cannot trigger a provider request.
- `virtualFactory` remains the only auto-combo pool builder.
- The existing provider registry, model catalog, no-auth connection handling,
  connection cooldowns, model lockouts, provider circuit breaker, and recovery
  scheduler remain authoritative.
- The existing candidate endpoint remains read-only; it now exposes the
  sentinel facts without returning credentials.

No second router, provider registry, health subsystem, circuit breaker, or quota
engine was added.

## Confirmed gaps closed

The implementation closes only the R0-confirmed configuration/integration gaps:

1. A pure provider/model sentinel now projects catalog presence, credential and
   auth state, real-probe state, explicit free state, quota state, health,
   cooldown, circuit state, recent failures, capability, and final eligibility.
2. Strict free admission now rejects paid, unknown, null-cost,
   credit-backed, discontinued, unverified, stale, exhausted, unhealthy,
   cooldown, and open-circuit candidates.
3. Credentialless compatible local connections are classified as
   `SELF_HOSTED` and do not require a cloud quota row.
4. Native provider breaker availability is consulted by strict auto/free pool
   preparation.
5. Candidate inspection is fail-closed for unknown catalog/cost data and does
   not run a real probe merely because the endpoint is read.

Explicit provider/model requests are not passed through the strict adaptive
pool. The pinned routing invariant remains unchanged.

## Free policy

```text
FREE_VERIFIED  -> ALLOW
SELF_HOSTED    -> ALLOW
FREE_UNKNOWN   -> DENY
UNKNOWN        -> DENY
NULL_COST      -> DENY
PAID           -> DENY
CREDIT_BACKED  -> DENY
```

Promotional, trial, AWS, and other credit-backed access is not treated as
free. There is no automatic paid fallback.

## R1 deterministic test matrix

The new sentinel suite passed 10/10. The existing v3.8.50 strict-policy suites
passed 31/31. Typecheck, targeted ESLint, and `git diff --check` also passed.

| Required behavior | Result | Evidence |
|---|---|---|
| Verified-free route allowed | PASS | sentinel unit test |
| Self-hosted route allowed | PASS | sentinel/filter unit test |
| Paid route denied | PASS | cost-state unit test |
| Unknown-cost route denied | PASS | cost-state unit test |
| Null-cost route denied | PASS | cost-state unit test |
| Credit-backed route denied | PASS | cost-state and catalog unit tests |
| Auth-failed free route excluded | PASS | sentinel unit test |
| Unhealthy free route excluded | PASS | native health input unit test |
| Rate-limited/exhausted route excluded | PASS | native quota state unit test |
| Open circuit excluded | PASS | native breaker callback unit test |
| Half-open success recovers | PASS | `HALF_OPEN` recovery unit test |
| All eligible routes unavailable | PASS | empty strict pool assertion |
| No paid fallback | PASS | paid candidate remains absent from strict pool |
| Explicit pinned model unchanged | PASS | strict-off identity test and live explicit probe |
| Explicit pinned provider unchanged | PASS | live OpenRouter provider/model resolution |

The live direct completion probes used the already observed zero-priced
OpenRouter route `openrouter/cohere/north-mini-code:free`. No paid or
unknown-cost inference was issued. The post-change direct checks returned:

```text
GET /v1/models              HTTP 200
non-stream completion       HTTP 200, OK
streaming                   HTTP 200, SSE events and [DONE]
deterministic r1_noop tool  HTTP 200, exactly one tool call
```

The isolated strict lab candidate endpoint returned only unknown-cost
catalog rows as ineligible (`routingEligible=0`); it did not infer or fall back
to paid models. The live candidate endpoint was not used for inference.

## Provider baseline

The R0 provider discovery remains the compatibility baseline:

```text
PROVIDERS_DISCOVERED=37 configured / 46 catalog
PROVIDERS_AUTH_VALID=31/37
PROVIDERS_REAL_REQUEST_PASS=7/37
PROVIDERS_FREE_VERIFIED=5/37
```

R1 did not broaden live provider probing. The lab tests use synthetic catalog,
quota, health, auth, and breaker facts for paid/unknown exclusion; they do not
spend money to prove a paid route is denied.

## Client regression evidence

### Hermes

The exact pinned Hermes command still reached OmniRoute on the unchanged
contract:

```text
base=http://127.0.0.1:20128
endpoint=POST /chat/completions
model=zai/glm-4.7-flash
route=PINNED
```

The post-change call history recorded the same external Z.AI signature as R0.5:
HTTP `529` overload responses followed by aborted retries (`499`). No auth,
alias, local routing, protocol, streaming, tool, schema, port, or network-local
failure appeared.

```text
HERMES_COMPATIBILITY=BASELINE_EXTERNAL_PROVIDER_FAILURE_PRESERVED
HERMES_ROOT_CAUSE=PROVIDER_HEALTH
HERMES_FAILURE_SIGNATURE_CHANGED=NO
HERMES_CLIENT_CONFIG_CHANGED=NO
```

### OpenCode

OpenCode remains downstream at `http://localhost:20128/v1`. The R0.5
documented NVIDIA probe model is no longer present in the current OpenCode
allowlist, so it was not forced. The currently configured verified-free
`openrouter/cohere/north-mini-code:free` model was used without editing the
client configuration:

```text
OPENCODE_BASELINE=PASS
OPENCODE_ROUTE_TYPE=EXPLICIT_FREE_PROBE
OPENCODE_SIMPLE_COMPLETION=PASS
OPENCODE_STREAMING=PASS
OPENCODE_TOOL_CALLING=NOT_USED
```

The configured `auto/coding:free` alias was not invoked live because current
catalog state could not prove an eligible auto candidate without changing the
client or spending money.

### DeepSeek Harness

The discovered chain remains:

```text
StockNewsBR A2A :9901
  -> DeepSeek Harness :3080 JSON-RPC
  -> OmniRoute :20128
Hermes :9900 is an auxiliary health dependency
```

The intermediate services were reachable and storage/Hermes health were ready,
but the current live catalog no longer contains the R0.5 preferred
`zai/glm-4.7-flash`. The bridge selected current zero-priced catalog entries
(`cerebras/zai-glm-4.7` during the exact A2A probe; later health selected the
current OpenCode free entry), and DSh rejected the selected model as
unconfigured. The bridge health endpoint was HTTP 503/DEGRADED and the harmless
A2A task returned `model-unavailable`.

This is a current Harness/catalog configuration mismatch, not a change made by
the isolated R1 source. Repair would require changing the Harness/DSh model
mapping or client runtime, which this mission forbids.

```text
DEEPSEEK_HARNESS_COMPATIBILITY=BLOCKED_EXISTING_MODEL_CATALOG_DRIFT
HARNESS_REPAIR_PERFORMED=NO
HARNESS_CONFIG_CHANGED=NO
```

### FCC/NVIDIA

FCC/NVIDIA remains `OUT_OF_PATH`; no FCC request or configuration was changed.

## Final live integrity

```text
LIVE_SERVICE=active
LIVE_PORT=127.0.0.1:20128 LISTENING
GET /api/health=HTTP 200
LIVE_FREE_ACCESS_POLICY=off (restored and verified)
R1_SOURCE_DEPLOYED=NO
CLIENT_CONFIG_CHANGED_BY_R1=NO
SECRETS_EXPOSED=NO
PAID_INFERENCE_TRIGGERED=NO
PAID_SPEND_TRIGGERED=NO
```

## Rollback

No production rollback is required because the lab commit was never deployed.
The isolated implementation can be reverted with:

```text
git -C /home/dcima/omniroute-lab-r1-v3.8.50 revert 669eb4690ffceecea0773a9653c2da00baa603c4
```

The production rollback point remains the installed packaged v3.8.50 and its
existing user service. If a future deployment is approved, first snapshot the
lab/production database, keep `freeAccessPolicy=off` until compatibility gates
pass, and restore the packaged 3.8.50 service if any gate fails.

## R1 report

```text
OMNIROUTE_FREE_AUTOPILOT_R1_SENTINEL_AND_HARD_FREE_ONLY

LIVE_VERSION=3.8.50
IMPLEMENTATION_SOURCE=/home/dcima/omniroute-lab-r1-v3.8.50
START_SHA=091589089cd134a94df9f6cdab9ba562b2cefd18
FINAL_SHA=669eb4690ffceecea0773a9653c2da00baa603c4

FREE_ONLY=PASS (isolated lab; not enabled in production)
FREE_VERIFIED_ALLOW=PASS
SELF_HOSTED_ALLOW=PASS
UNKNOWN_COST_DENY=PASS
NULL_COST_DENY=PASS
PAID_DENY=PASS
CREDIT_BACKED_DENY=PASS

REAL_COMPLETION_PROBE=PASS (existing verified-free route)
HEALTH_FILTER=PASS
QUOTA_FILTER=PASS
CIRCUIT_BREAKER=PASS
AUTO_RECOVERY=PASS

PROVIDERS_DISCOVERED=37 configured / 46 catalog
PROVIDERS_FREE_VERIFIED=5/37
FREE_ROUTING_ELIGIBLE=2 tested allow classes; 0 live promotion

FREE_TO_PAID_FALLBACK=NO
PAID_MODEL_USED=NO
PAID_SPEND_TRIGGERED=NO

HERMES_COMPATIBILITY=BASELINE_EXTERNAL_PROVIDER_FAILURE_PRESERVED
HERMES_ROOT_CAUSE=PROVIDER_HEALTH
HERMES_FAILURE_SIGNATURE_CHANGED=NO

DEEPSEEK_HARNESS_COMPATIBILITY=BLOCKED_EXISTING_MODEL_CATALOG_DRIFT
OPENCODE_COMPATIBILITY=PASS
OPENCODE_STREAMING=PASS
OPENAI_COMPATIBILITY=PASS
OPENAI_STREAMING=PASS
OPENAI_TOOL_CALLING=PASS
FCC_NVIDIA_COMPATIBILITY=OUT_OF_PATH

PINNED_MODEL_ROUTING=UNCHANGED
PINNED_PROVIDER_ROUTING=UNCHANGED
CLIENT_CONFIG_CHANGES_REQUIRED=NO

HERMES_CODE_MODIFIED=NO
DEEPSEEK_HARNESS_CODE_MODIFIED=NO
OPENCODE_CODE_MODIFIED=NO
FCC_CODE_MODIFIED=NO
IAMM_CODE_TOUCHED=NO
STOCKNEWSBR_CODE_TOUCHED=NO
SECRETS_EXPOSED=NO

REGRESSION=BLOCKED_EXISTING_HARNESS_CATALOG_DRIFT
COMMIT=LAB 669eb46; documentation repo not committed because pre-existing dirty state
PUSH=NOT_ATTEMPTED

R2_RELEASE_GATE=BLOCKED
FINAL_RESULT=BLOCKED
```
