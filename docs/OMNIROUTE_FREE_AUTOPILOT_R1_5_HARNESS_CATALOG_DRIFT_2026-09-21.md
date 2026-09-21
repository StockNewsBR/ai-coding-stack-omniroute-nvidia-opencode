# OmniRoute Free Autopilot R1.5 — Harness Catalog Drift Closure

Date: 2026-09-21

Status: `BLOCKED` for live promotion. The exact server-side compatibility
repair is valid and tested in the isolated R1 LAB, but it was not deployed to
the live packaged OmniRoute, as required by this mission. No client was
modified.

## Scope and safety boundary

- Live OmniRoute was not upgraded, restarted, or replaced.
- No Harness, OpenCode, Hermes, FCC, IAMM, or StockNewsBR code/configuration
  was changed.
- No OpenCode dynamic plugin migration was performed.
- No new paid or unknown-cost provider probe was launched; the mandated Hermes
  baseline was the existing pinned client path and is reported separately.
- The LAB started at the exact R1 commit and was committed independently.
- The main documentation repository had pre-existing dirty files; its new
  report is intentionally not committed.

## Exact failure reproduction

The safe operation was the existing read-only A2A compatibility request:

```text
POST http://127.0.0.1:9901/
JSON-RPC method=SendMessage
message=Reply exactly READONLY_OK
```

The live chain is:

```text
StockNewsBR A2A bridge :9901
  -> DeepSeek Harness JSON-RPC :3080
  -> OmniRoute :20128

Hermes :9900 is an auxiliary health dependency of the bridge, not the
inference hop for this A2A operation.
```

The bridge reads `/v1/models` and prefers the exact configured route
`zai/glm-4.7-flash`. When that row is absent, it selects the lexicographically
first zero-priced visible route. The post-LAB live retest returned:

```text
A2A_HTTP=200
HARNESS_TASK_STATE=TASK_STATE_FAILED
HARNESS_REQUESTED_PROVIDER=omniroute
HARNESS_REQUESTED_MODEL=zai/glm-4.7-flash
HARNESS_SELECTED_MODEL=oc/deepseek-v4-flash-free
HARNESS_ERROR_CLASS=model-unavailable
HARNESS_ERROR=pi-ai provider "omniroute" has no configured model "oc/deepseek-v4-flash-free"
```

The earlier R1 reproduction selected `cerebras/zai-glm-4.7` and produced the
same `model-unavailable` class. The selected fallback changed because the
visible zero-priced catalog changed; this is catalog drift, not a requested
model rename.

The bridge process returned normally and the A2A transport was HTTP 200; the
failure is the task result from the DSh model-selection layer.

## Client and configuration readback

| Layer | Readback | Result |
|---|---|---|
| Harness bridge | `/home/dcima/stocknewsbr-audit-fix/agent-os/integrations/harness_a2a.py` | Reads live `/v1/models`; preferred exact ID is `zai/glm-4.7-flash`; fallback is catalog-driven |
| DeepSeek Harness | `/home/dcima/deepseek-harness-poc` | `provider=omniroute`, default model `zai/glm-4.7-flash` |
| DSh configured model list | `/home/dcima/.dsh/settings.yaml` | `zai/glm-4.7-flash`, `auto/pro-coding`, `auto/vision`, `auto/cheap`, `oc/gemini-3.7-flash` |
| OpenCode client config | `~/.config/opencode/opencode.json`, `~/.opencode/opencode.json` | Static provider block; current model list does not include Z.AI |
| OpenCode API-key ACL | OmniRoute server-side key record | Restricted visible list contains `oc/deepseek-v4-flash-free` and `openrouter/cohere/north-mini-code:free` |

The Harness setting and DSh model list were not stale: they still name the
same exact provider/model identity that succeeded in the R0.5 compatibility
probe. The bridge's fallback is what becomes unconfigured.

## Catalog-layer comparison

The failing identity is `zai/glm-4.7-flash`. It is a provider/model ID, not an
OmniRoute alias.

| Model ID | Harness expects | OpenCode lists | OmniRoute live lists | R1 LAB lists | Provider live support | Free status | Real request status |
|---|---|---|---|---|---|---|---|
| `zai/glm-4.7-flash` | Yes; preferred exact model | No; static restricted list omits it | No for the current OpenCode key; also absent from the current filtered all-model projection | Before fix: provider registry yes, free projection no. After fix: exact row appears | Dispatch accepted by OmniRoute; current upstream is unhealthy with 529/429 behavior | `FREE_UNKNOWN` at provider/model safety level; R0 classified provider `zai` as `UNKNOWN` | R0.5 historical zero-priced completion passed; current Hermes probes are intermittent and the latest probe timed out during the same external Z.AI health condition |
| `cerebras/zai-glm-4.7` | No | No | Present during an earlier R1 catalog snapshot, absent from current restricted view | Not a substitute for the requested identity | Not used by the requested pinned route | Not a valid replacement identity | Fallback selection only; DSh rejected it as unconfigured |
| `oc/deepseek-v4-flash-free` | No | Yes | Yes | Existing catalog path | R1 direct free route passed | Existing verified-free R1 test route | Current A2A fallback; DSh rejects before inference |
| `openrouter/cohere/north-mini-code:free` | No | Yes | Yes | Existing catalog path | R1 direct route passed | Existing verified-free R1 test route | R1 direct completion/stream/tool tests passed |

### Internal OmniRoute and provider evidence

The exact identity remains present in the installed v3.8.50 internals and in
provider discovery data:

- `open-sse/config/providers/registry/zai/index.ts` advertises
  `glm-4.7-flash`.
- The live `model_capabilities` table contains provider `zai`, model
  `glm-4.7-flash`, with recent synchronization metadata.
- Both live Z.AI model-sync records contain `glm-4.7-flash`.
- The live pricing namespace contains a zero-priced row for the exact Z.AI
  model.
- The previous R0 protected catalog snapshot contained
  `zai/glm-4.7-flash` with zero input/output/cached pricing.
- Current OmniRoute logs accept the explicit route as provider `zai`, model
  `glm-4.7-flash`, and reach the upstream, which currently returns overload or
  rate-limit responses.

Therefore this is not a retired provider model, an upstream rename, or a
missing dispatcher route.

## Root-cause classification

Primary classification:

```text
OMNIROUTE_CATALOG_OMISSION
```

The current v3.8.50 catalog projection applies `hidePaidModels=true` to the
current R1.5 live baseline. Its free predicate requires both a free provider
roster and a free model match. The static free roster had no `zai` entry, so
the exact synced/registered row was omitted from the filtered catalog. The
OpenCode API-key restriction then narrowed the bridge-visible list further.

Contributing condition:

```text
STALE_OPENCODE_STATIC_CATALOG=YES
```

The legacy OpenCode static provider/API-key projection does not dynamically
refresh from the live OmniRoute catalog. It is a compatibility amplifier, not
the primary identity loss: even an unmodified DSh configuration cannot select
the preferred row when the server projection does not expose it.

Other classifications:

```text
STALE_HARNESS_MODEL_REFERENCE=NO
OMNIROUTE_ALIAS_MISSING=NO
OMNIROUTE_CATALOG_OMISSION=YES
PROVIDER_MODEL_RETIRED=NO
PROVIDER_DISCOVERY_DRIFT=NO
MODEL_RENAMED_UPSTREAM=NO
FREE_ROUTE_ROTATED=NO
```

The exact model's current cost state remains insufficient for strict free
admission. A zero-priced catalog object and a historical successful response
do not by themselves prove a hard billing stop. This is why the LAB repair
restores catalog identity but deliberately does not add `hardStopGuaranteed`.

## Server-side repair decision

```text
SERVER_SIDE_REPAIR_VALID=YES_IN_ISOLATED_LAB_ONLY
HARNESS_REQUIRES_CLIENT_MODEL_MIGRATION=NO
HARNESS_PINNED_MODEL_SEMANTICS=UNCHANGED
```

The valid repair is to restore the exact existing `zai` / `glm-4.7-flash`
catalog record to the native free-like projection. It does not map the
request to Cerebras, OpenCode, or another model, and it does not add an alias.
The repair is therefore identity-preserving.

The repair is not a hard-free admission grant. In the R1 sentinel it resolves
as `FREE_UNKNOWN` without independently verified hard-stop terms and fresh
quota state, so strict `auto/*` admission remains denied. This preserves the
R1 rules:

```text
FREE_UNKNOWN -> DENY
UNKNOWN      -> DENY
PAID         -> DENY
```

Changing the live catalog, disabling `hidePaidModels`, editing the OpenCode
key ACL, or changing either client configuration was outside this mission.

## OpenCode catalog mode

```text
OPENCODE_CATALOG_MODE=STATIC_PROVIDER_BLOCK
OPENCODE_STATIC_DRIFT=YES
OPENCODE_DYNAMIC_PLUGIN_MIGRATION_NEEDED=YES_FOR_GENERAL_DRIFT_REMEDIATION
OPENCODE_DYNAMIC_PLUGIN_MIGRATION_PERFORMED=NO
```

The upstream dynamic plugin remains a separately approvable migration. It was
not installed or configured. Exact server-side identity restoration is the
smaller compatibility repair; dynamic refresh would address future general
catalog drift but is not required to justify changing the requested model.

## Isolated LAB repair

```text
LAB_SOURCE=/home/dcima/omniroute-lab-r1-v3.8.50
LAB_START_SHA=669eb4690ffceecea0773a9653c2da00baa603c4
LAB_FINAL_SHA=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4
LAB_COMMIT=95e7147 fix(catalog): preserve verified Harness route identity
```

Files changed in the LAB commit only:

- `open-sse/config/freeModelCatalog.data.ts`
- `tests/unit/free-models.test.ts`
- `tests/unit/harness-catalog-drift-r1_5.test.ts`

The change adds only the exact `zai` / `glm-4.7-flash` projection record and
updates the catalog curation date. No registry, router, breaker, quota engine,
client adapter, alias, or provider mapping was added.

The exact release/tag does not contain a separate generator input for this
legacy projection row, so the correction is intentionally confined to the
isolated LAB data projection. It must not be hand-applied to the packaged
installation.

LAB evidence:

```text
catalog fixture with hidePaidModels=true:
  HTTP=200
  target id=zai/glm-4.7-flash
  owned_by=zai

strict sentinel for the same row:
  freeStatus=FREE_UNKNOWN
  routingEligible=false
  exclusionReason=FREE_STATUS_UNVERIFIED
```

This proves that the row appears under the intended exact identity without
silently substituting another provider, while R1 hard-free admission remains
fail-closed.

## Test matrix

Passed in the isolated LAB:

| Check | Result |
|---|---|
| Exact Harness model appears in catalog projection | PASS |
| Provider identity remains `zai` | PASS |
| Different `zai` model is not accidentally admitted by the row | PASS |
| Restored row does not become strict FREE_VERIFIED | PASS |
| `FREE_UNKNOWN` remains excluded from strict auto admission | PASS |
| R1 sentinel suite | 10/10 PASS |
| R1 strict/filter Vitest suites | 35/35 PASS |
| Focused catalog/free-model Node tests | 20/20 PASS |
| Core typecheck | PASS |
| Targeted ESLint | PASS |
| `git diff --check` | PASS |

Existing R1 evidence retained without source deployment:

```text
FREE_ONLY=PASS
FREE_VERIFIED_ALLOW=PASS
SELF_HOSTED_ALLOW=PASS
UNKNOWN_COST_DENY=PASS
NULL_COST_DENY=PASS
PAID_DENY=PASS
CREDIT_BACKED_DENY=PASS
HEALTH_FILTER=PASS
QUOTA_FILTER=PASS
CIRCUIT_BREAKER=PASS
AUTO_RECOVERY=PASS
FREE_TO_PAID_FALLBACK=NO
```

## Compatibility and regression results

### DeepSeek Harness

The live post-LAB retest is still the pre-deployment failure shown above. It
is not a client migration requirement: the exact model is still present and a
server-side projection repair is valid. The live result is recorded honestly
as `BLOCKED_EXISTING_MODEL_CATALOG_DRIFT` until an approved deployment and
end-to-end retest occur.

### OpenCode and direct OpenAI-compatible API

No client files changed. The current live `/v1/models` request still returns
HTTP 200 with the two restricted OpenCode-visible free routes. R1's direct
completion, streaming, and deterministic no-op tool-call probes remain the
last successful live compatibility evidence; no live source or package was
loaded by R1.5.

```text
OPENCODE_COMPATIBILITY=PASS
OPENAI_COMPATIBILITY=PASS
OPENAI_STREAMING=PASS
OPENAI_TOOL_CALLING=PASS
```

### Hermes

Hermes remains explicitly pinned to `zai/glm-4.7-flash`. Two minimum probes
during this mission showed the same intermittent external behavior already
documented by R0.5/R1: one transient successful CLI return and a subsequent
timeout while OmniRoute's Z.AI path was externally unhealthy. No new local
auth, alias, routing, protocol, streaming, tool-call, schema, port, or
network-local failure appeared.

```text
HERMES_COMPATIBILITY=BASELINE_EXTERNAL_PROVIDER_FAILURE_PRESERVED
HERMES_ROOT_CAUSE=PROVIDER_HEALTH
HERMES_FAILURE_SIGNATURE_CHANGED=NO
```

### Pinned semantics

The LAB change is catalog-only. It does not rewrite explicit requests and does
not add fallback behavior to a pinned model/provider request.

```text
PINNED_MODEL_ROUTING=UNCHANGED
PINNED_PROVIDER_ROUTING=UNCHANGED
```

## Live integrity after the mission

```text
LIVE_VERSION=3.8.50
LIVE_PORT=127.0.0.1:20128
LIVE_SERVICE=active
LIVE_HEALTH=HTTP 200 /api/health, status=ok
LIVE_UNCHANGED=YES
LIVE_FREE_ACCESS_POLICY=off
```

The current R1.5 start/end observation of `hidePaidModels` is `true`; it was
not changed by this mission. R0 historically recorded it as `false`, so that
settings discrepancy is pre-existing and deliberately not repaired here.

Client configuration hashes remained unchanged:

```text
~/.config/opencode/opencode.json  a6b2c8e0c2fd21146213a102859eb64b4f180bbd4927a3b81a9cdf49c0126ac1
~/.opencode/opencode.json         1178ba5c1e071f85237649f36dff83a0dcd90aa085713e6bd02c75df3943d902
~/.dsh/settings.yaml              d84ed4a52e91170f702b4539c97590213a290b69c402c3f3651d2f29c2f8591f
```

## Rollback and promotion procedure

The isolated LAB repair can be rolled back without touching live runtime:

```text
git -C /home/dcima/omniroute-lab-r1-v3.8.50 revert 95e714773bc37b6eed863b93bb6d16cbd3d0c3a4
```

No production rollback was needed because no production artifact, service
unit, database, setting, or client was changed. A future promotion requires
separate approval, a production database/settings snapshot, a review of the
`FREE_UNKNOWN` status, a controlled catalog cache refresh/restart plan, and a
repeat of the Harness, OpenCode, direct API, Hermes, and R1 gates. If any gate
fails, retain the packaged v3.8.50 service and revert the isolated catalog
change before reconsidering deployment.

## Final report

```text
OMNIROUTE_FREE_AUTOPILOT_R1_5_HARNESS_MODEL_CATALOG_DRIFT_CLOSURE

LIVE_VERSION=3.8.50
LIVE_HEALTH=HTTP 200 /api/health status=ok
LIVE_UNCHANGED=YES

LAB_START_SHA=669eb4690ffceecea0773a9653c2da00baa603c4
LAB_FINAL_SHA=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4

HARNESS_ROUTE_CHAIN=:9901 A2A bridge -> :3080 DSh JSON-RPC -> :20128 OmniRoute; :9900 auxiliary Hermes health

HARNESS_REQUESTED_MODEL=zai/glm-4.7-flash
HARNESS_REQUESTED_PROVIDER=omniroute
HARNESS_REQUESTED_ALIAS=NONE (exact provider/model ID)

CATALOG_DRIFT_ROOT_CAUSE=OMNIROUTE_CATALOG_OMISSION

OPENCODE_CATALOG_MODE=STATIC_PROVIDER_BLOCK
OPENCODE_STATIC_DRIFT=YES
OPENCODE_DYNAMIC_PLUGIN_MIGRATION_NEEDED=YES_FOR_GENERAL_DRIFT_REMEDIATION_NOT_PERFORMED

OMNIROUTE_ALIAS_MISSING=NO
OMNIROUTE_CATALOG_OMISSION=YES
PROVIDER_MODEL_RETIRED=NO
PROVIDER_LIVE_SUPPORT=REACHABLE_BUT_UNHEALTHY_529_429

HARNESS_REQUIRES_CLIENT_MODEL_MIGRATION=NO

HARNESS_PINNED_MODEL_SEMANTICS=UNCHANGED

DEEPSEEK_HARNESS_COMPATIBILITY=BLOCKED_EXISTING_MODEL_CATALOG_DRIFT

OPENCODE_COMPATIBILITY=PASS

OPENAI_COMPATIBILITY=PASS
OPENAI_STREAMING=PASS
OPENAI_TOOL_CALLING=PASS

HERMES_COMPATIBILITY=BASELINE_EXTERNAL_PROVIDER_FAILURE_PRESERVED

FREE_ONLY=PASS
PAID_FALLBACK=DISABLED
PAID_SPEND_TRIGGERED=NO

CLIENT_CONFIG_CHANGED=NO

DEEPSEEK_HARNESS_CODE_CHANGED=NO
OPENCODE_CONFIG_CHANGED=NO
HERMES_CONFIG_CHANGED=NO

R1_LAB_COMMIT=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4
R1_PROMOTION_READY=NO

R2_RELEASE_GATE=BLOCKED

FINAL_RESULT=BLOCKED
```
