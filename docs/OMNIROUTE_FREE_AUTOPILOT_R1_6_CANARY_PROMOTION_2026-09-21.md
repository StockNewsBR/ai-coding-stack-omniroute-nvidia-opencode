# OmniRoute Free Autopilot R1.6 — Canary Promotion and Rollback

Date: 2026-09-21  
Candidate: `95e714773bc37b6eed863b93bb6d16cbd3d0c3a4`  
Result: `BLOCKED_BEFORE_PROMOTION`

## Executive result

The R1/R1.5 package was built, packed, installed in an isolated canary, and
validated without changing the live service. The candidate correctly restores
the exact `zai/glm-4.7-flash` catalog identity and keeps that route
`FREE_UNKNOWN`, therefore excluded from strict auto/free admission.

Promotion was not eligible after an authenticated-client canary check exposed
a separate pre-existing server-side model ACL boundary: the shared API key
used by OpenCode, the Harness A2A bridge, and the Hermes wire contract is a
restricted key whose allowed model list does not contain `zai/glm-4.7-flash`.
The candidate's unrestricted catalog contains the repaired row, but the
real-client view does not. Promoting would therefore leave the Harness catalog
failure in place. No ACL, client configuration, or live package was changed.

The required next decision is a separately approved OmniRoute-side ACL repair
that adds the exact existing model identity to the intended key, or an
explicit approval to use an already authorized all-model key. Client
migration, model substitution, and provider substitution remain unnecessary
and were not performed.

## Live baseline and final integrity

| Field | Before / after this mission |
|---|---|
| Version | `3.8.50` / `3.8.50` |
| Service | `omniroute.service`, active |
| Listener | `127.0.0.1:20128`, listening |
| Main PID | `440` remained live |
| Health | `GET /api/health` HTTP 200 |
| Install type | pnpm global packaged |
| Live package build SHA | `dea6bb8` |
| Live package root | pnpm store link for installed `3.8.50` |
| `freeAccessPolicy` | `off` unchanged |
| `hidePaidModels` | `true` unchanged |
| Service ExecStart | `/home/dcima/.local/bin/omniroute-systemd-run` |

The protected `/api/system/version` endpoint correctly required auth; the
installed wrapper reported `3.8.50`. No service restart or package-manager
mutation was performed against production.

## Candidate source and artifact

```text
IMPLEMENTATION_SOURCE=/home/dcima/omniroute-lab-r1-v3.8.50
CANDIDATE_START_SHA=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4
CANDIDATE_FINAL_SHA=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4
PACKAGE_VERSION=3.8.50
PACKAGE_SOURCE_SHA=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4
RELEASE_ARTIFACT=/tmp/r1-6-release/omniroute-3.8.50.tgz
RELEASE_ARTIFACT_SHA256=d73c741e7d6b0e63b5fe91eaed27d688d6675985faeb185c05bd4cfaf6ab5e09
ARTIFACT_BUILD_SHA=95e7147
```

The LAB diff from the R1 base contains only the R1 sentinel/free-admission
files and the R1.5 exact catalog projection/test files. No v3.8.51 wholesale
backport or unrelated production feature was imported:

- R1 sentinel/admission: `open-sse/handlers/autoComboCandidates.ts`,
  `open-sse/services/autoCombo/freeAccessQuota.ts`,
  `open-sse/services/autoCombo/strictZeroCostFilter.ts`,
  `open-sse/services/autoCombo/virtualFactory.ts`.
- R1/R1.5 tests: the sentinel, free-model, and catalog-drift unit suites.
- R1.5 catalog projection: `open-sse/config/freeModelCatalog.data.ts` adds
  only the exact `zai` / `glm-4.7-flash` row and updates the curation date.

```text
LAB_HEAD_MATCH=YES
UNRELATED_CHANGE_FOUND=NO
```

The only LAB worktree dirt is the uncommitted generated `pnpm-lock.yaml`; it
was not part of the candidate commit.

## Quality gates

```text
LAB_TESTS=PASS
LAB_TYPECHECK=PASS
LAB_LINT=PASS_SCOPED_CHANGED_FILES
LAB_BUILD=PASS_WITH_EXISTING_MANIFEST_WORKAROUND
```

Evidence:

- R1/R1.5 focused Node tests: `30/30` pass.
- strict free-filter Vitest suites: `35/35` pass.
- routing/catalog/auto/combo suites: `124/124` pass.
- resilience/quota/health/circuit suites: `84/84` pass.
- OpenAI/stream/tool protocol suites: `28/28` pass.
- `pnpm run typecheck:core`: pass.
- ESLint over all changed production/test files: pass.
- Full repository lint remains red on pre-existing dashboard/UI React compiler
  findings outside the candidate files; those unrelated findings were not
  changed.
- The supported build scripts completed after a LAB-only hoisted dependency
  install made the pre-existing undeclared `remark-gfm` build dependency
  resolvable. No source or live dependency was edited.
- `check-pack-boot` passed clean-install boot, auth, settings persistence, and
  second-boot persistence checks.
- Pack-artifact policy passed with the explicit canary provenance override;
  the candidate commit is not on the upstream release branch.

## Isolated canary

```text
CANARY_ROOT=/tmp/omniroute-r1-6-canary.Fdy5u0
CANARY_DATA_DIR=/tmp/omniroute-r1-6-data.It4VPs
CANARY_PORT=33123
CANARY_VERSION=3.8.50
CANARY_SOURCE_SHA=95e7147
```

The candidate artifact was installed into a fresh temporary prefix. The
database, HOME/XDG state, API secret, and mock upstreams were isolated from
production. The canary was cleanly stopped after validation.

### Unrestricted candidate contract

```text
GET /api/health                 HTTP 200
GET /api/system/version         current=3.8.50
GET /v1/models                  HTTP 200; 502 rows
```

The exact row was present:

```text
id=zai/glm-4.7-flash
owned_by=zai
CATALOG_PROVIDER_SUBSTITUTION=NO
CATALOG_MODEL_SUBSTITUTION=NO
```

An isolated local `ollama-local` self-hosted mock provided a no-spend healthy
route. Completion, streaming with `[DONE]`, and a deterministic tool call all
passed through the candidate. An isolated Anthropic-shaped mock was used only
to prove the pinned Z.AI request shape without contacting Z.AI. Candidate call
history recorded:

```text
requested_model=zai/glm-4.7-flash
provider=zai
resolved_model=glm-4.7-flash
status=200
```

There was no silent provider/model substitution and no paid or unknown-cost
upstream inference.

### Strict free policy

The candidate's `auto/coding:free` candidate endpoint did not admit the Z.AI
row. The R1 unit matrix also remained green:

```text
ZAI_GLM47_FREE_STATUS=FREE_UNKNOWN
ZAI_GLM47_AUTO_FREE_ALLOWED=NO
FREE_VERIFIED_ALLOW=PASS
SELF_HOSTED_ALLOW=PASS
UNKNOWN_COST_DENY=PASS
NULL_COST_DENY=PASS
PAID_DENY=PASS
CREDIT_BACKED_DENY=PASS
FREE_TO_PAID_FALLBACK=NO
```

The catalog repair restores identity; it does not grant strict free status.

### Authenticated-client catalog gate

The actual shared client key is a pre-existing restricted OmniRoute key. Its
read-only database policy is:

```text
model_access_mode=restricted
allowed_models=oc/deepseek-v4-flash-free, openrouter/cohere/north-mini-code:free
```

The same policy was seeded into an isolated candidate key. Results:

```text
unrestricted candidate /v1/models: exact Z.AI row PRESENT
restricted candidate /v1/models: HTTP 200, exact Z.AI row ABSENT
```

This is why the client-facing catalog gate is not green. Adding the repaired
identity to that server-side allowlist would be a separate authorization
change and was not silently made.

## Pre-promotion client baselines

No client file or code was edited. The direct API probe used the existing
shared key without printing it.

| Client/path | Result |
|---|---|
| OpenCode | Existing `omniroute` path, explicit verified-free model, exit 0; streamed JSON events and expected text |
| Direct OpenAI-compatible API | `/v1/models`, completion, streaming, and deterministic tool call HTTP 200 |
| DeepSeek Harness A2A | HTTP 200 transport but existing `TASK_STATE_FAILED`, `model-unavailable` for fallback `oc/deepseek-v4-flash-free` |
| Hermes exact wire contract | `POST /chat/completions`, pinned `zai/glm-4.7-flash`; client timeout while live call history recorded repeated Z.AI `529 server_error` and `499` aborts |
| FCC/NVIDIA | Out of path; not touched |

The Harness failure is the documented pre-existing catalog drift. The Hermes
failure is the documented external Z.AI provider-health condition. No local
alias, auth, routing, protocol, stream, tool, schema, port, or network-local
failure was introduced.

## Rollback preparation and proof

The exact current live package was packed before any possible promotion:

```text
ROLLBACK_ARTIFACT=/tmp/omniroute-r1-6-rollback.XvQOQY/omniroute-3.8.50.tgz
ROLLBACK_ARTIFACT_SHA256=7e7ec2c6f3960d1fb5227087af21e450499fd144248af6672ba887e1131ff2ef
ROLLBACK_BUILD_SHA=dea6bb8
```

The current service unit, drop-ins, launcher, global package manifest, and
lockfile were captured in the same temporary rollback directory. No data
migration was expected: candidate and live are both v3.8.50 and the R1/R1.5
changes do not add a schema migration.

The native package-manager path was proven in an isolated `PNPM_HOME`:

```text
pnpm add --global --force <current-live-tarball>  -> 3.8.50 / dea6bb8
pnpm add --global --force <candidate-tarball>     -> 3.8.50 / 95e7147
ROLLBACK_PROVEN=YES
```

Because the authenticated catalog gate failed, the live package manager was
not invoked. No rollback was needed or performed.

## Promotion decision

```text
CATALOG_ROW_ZAI_GLM47_PRESENT=YES_UNRESTRICTED_CANARY_NO_RESTRICTED_CLIENT_VIEW
CATALOG_PROVIDER_SUBSTITUTION=NO
CATALOG_MODEL_SUBSTITUTION=NO
ZAI_GLM47_AUTO_FREE_ALLOWED=NO
CANARY_OPENAI_COMPAT=PASS
CANARY_STREAMING=PASS
CANARY_TOOL_CALLING=PASS
ROLLBACK_PROVEN=YES
PROMOTION_ELIGIBLE=NO_AUTHENTICATED_CATALOG_GATE
PROMOTION_PERFORMED=NO
PROMOTION_METHOD=NOT_RUN
ROLLBACK_PERFORMED=NO
```

The correct next action is to obtain approval for the minimal OmniRoute-side
model-ACL repair, then rerun this mission's authenticated canary and real
Harness gate. Do not modify client configuration, substitute the model, or
switch to v3.8.51 as a workaround.

## Change boundary

```text
CLIENT_CONFIG_CHANGED=NO
HERMES_CONFIG_CHANGED=NO
DEEPSEEK_HARNESS_CONFIG_CHANGED=NO
OPENCODE_CONFIG_CHANGED=NO
IAMM_TOUCHED=NO
STOCKNEWSBR_TOUCHED=NO
FCC_TOUCHED=NO
PAID_SPEND_TRIGGERED=NO
```

The documentation repository had pre-existing dirty files. This report is
mission-owned but is intentionally not committed together with them.

One earlier read-only diagnostic command accidentally allowed an existing
client API-key value to appear in a local tool result. No file or client
configuration was changed, the value is not repeated here, and no network
request exposed it. Rotation was not performed because this mission forbids
secret rotation; the incident must be handled separately by the operator.

## Final report

```text
OMNIROUTE_FREE_AUTOPILOT_R1_6_CANARY_PROMOTION_AND_ROLLBACK

CANDIDATE_START_SHA=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4
CANDIDATE_FINAL_SHA=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4

LAB_TESTS=PASS
LAB_TYPECHECK=PASS
LAB_LINT=PASS_SCOPED_CHANGED_FILES
LAB_BUILD=PASS_WITH_EXISTING_MANIFEST_WORKAROUND

RELEASE_ARTIFACT=/tmp/r1-6-release/omniroute-3.8.50.tgz
RELEASE_ARTIFACT_SHA256=d73c741e7d6b0e63b5fe91eaed27d688d6675985faeb185c05bd4cfaf6ab5e09

CANARY_PORT=33123
CANARY_HEALTH=200
CANARY_OPENAI_COMPAT=PASS
CANARY_STREAMING=PASS
CANARY_TOOL_CALLING=PASS

CATALOG_ROW_ZAI_GLM47_PRESENT=YES_UNRESTRICTED_CANARY_NO_RESTRICTED_CLIENT_VIEW
CATALOG_PROVIDER_SUBSTITUTION=NO
CATALOG_MODEL_SUBSTITUTION=NO

ZAI_GLM47_FREE_STATUS=FREE_UNKNOWN
ZAI_GLM47_AUTO_FREE_ALLOWED=NO

PINNED_MODEL_RESOLUTION=PASS
PINNED_PROVIDER_RESOLUTION=PASS

ROLLBACK_PROVEN=YES
PROMOTION_ELIGIBLE=NO_AUTHENTICATED_CATALOG_GATE
PROMOTION_PERFORMED=NO
PROMOTION_METHOD=NOT_RUN

LIVE_VERSION_BEFORE=3.8.50
LIVE_VERSION_AFTER=3.8.50
LIVE_HEALTH_AFTER=200
LIVE_PORT_20128_AFTER=LISTENING

FREE_ONLY=PASS_LAB_AND_CANARY
FREE_VERIFIED_ALLOW=PASS
SELF_HOSTED_ALLOW=PASS
UNKNOWN_COST_DENY=PASS
NULL_COST_DENY=PASS
PAID_DENY=PASS
CREDIT_BACKED_DENY=PASS

FREE_TO_PAID_FALLBACK=NO
PAID_MODEL_USED=NO
PAID_SPEND_TRIGGERED=NO

HARNESS_CATALOG_COMPATIBILITY=BLOCKED_PREEXISTING_RESTRICTED_KEY_ACL
DEEPSEEK_HARNESS_COMPATIBILITY=BLOCKED_EXISTING_MODEL_CATALOG_DRIFT
HERMES_COMPATIBILITY=BASELINE_EXTERNAL_PROVIDER_FAILURE_PRESERVED

OPENCODE_COMPATIBILITY=PASS
OPENCODE_STREAMING=PASS

OPENAI_COMPATIBILITY=PASS
OPENAI_STREAMING=PASS
OPENAI_TOOL_CALLING=PASS

PINNED_MODEL_ROUTING=UNCHANGED
PINNED_PROVIDER_ROUTING=UNCHANGED

CLIENT_CONFIG_CHANGED=NO
HERMES_CONFIG_CHANGED=NO
DEEPSEEK_HARNESS_CONFIG_CHANGED=NO
OPENCODE_CONFIG_CHANGED=NO

IAMM_TOUCHED=NO
STOCKNEWSBR_TOUCHED=NO
FCC_TOUCHED=NO

SECRETS_EXPOSED=YES_UNINTENTIONAL_LOCAL_TOOL_OUTPUT

ROLLBACK_PERFORMED=NO
ROLLBACK_REASON=NONE

R1_PROMOTION_READY=NO
R1_PROMOTION_STATUS=NOT_PROMOTED
R2_RELEASE_GATE=BLOCKED

COMMIT=NOT_CREATED_DIRTY_REPO
PUSH=NOT_ATTEMPTED

FINAL_RESULT=BLOCKED
```
