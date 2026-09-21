# OmniRoute Free Autopilot R0.5 Client Compatibility Closure

Mission: `OMNIROUTE_FREE_AUTOPILOT_R0_5_CLIENT_COMPATIBILITY_CLOSURE`
Audit date: 2026-09-21
Scope: compatibility evidence only; no routing-feature implementation

## Executive result

The live service remains OmniRoute `3.8.50` on `127.0.0.1:20128`, active
through the existing user systemd unit. No client file, client code, live
OmniRoute package, service unit, or routing setting was changed.

The direct OpenAI-compatible contract is healthy on a previously successful
zero-priced OpenRouter route: model discovery, non-stream completion,
streaming, and deterministic no-op tool calling all passed. OpenCode also
completed a harmless request through its existing OmniRoute provider using a
safe explicit free model override for the probe; its configured default remains
`auto/coding:free` and was not invoked because live `freeAccessPolicy=off`
still exposes paid/unknown candidates in the auto candidate pool.

The DeepSeek Harness path is healthy end-to-end through its local DSh RPC and
the StockNewsBR A2A bridge. The bridge completed a read-only task and selected
the zero-priced `zai/glm-4.7-flash` route.

Hermes remains the only compatibility blocker. Its exact configured pinned
request reaches OmniRoute, but the upstream Z.AI route is currently unstable:
the probe recorded repeated HTTP `529` overload responses, with historical and
current `429` rate-limit responses and only intermittent `200` responses. This
is provider health/quota behavior, not an alias, client URL, authentication,
or protocol-translation defect. The probe was stopped while Hermes was
retrying so it would not burn additional requests.

Therefore the R1 release gate remains blocked until the existing Hermes
contract produces a stable successful completion or an OmniRoute-side repair is
proven safe. No client migration is recommended.

## Safety and change boundary

- Live OmniRoute package: unchanged (`3.8.50`).
- Live port and systemd unit: unchanged.
- Hermes code/config: unchanged.
- DeepSeek Harness code/config: unchanged.
- OpenCode code/config: unchanged. The CLI probe used a transient model
  argument; it did not edit `opencode.json`.
- FCC, IAMM, and StockNewsBR code/config: unchanged.
- No release/v3.8.51 code was copied or deployed.
- No paid or credit-backed inference route was used.
- No credentials, tokens, cookies, or secret values are included here.

## Live topology

```text
Hermes Agent CLI / sessions
  -> custom OpenAI chat-completions transport
  -> OmniRoute 127.0.0.1:20128/chat/completions
  -> explicit zai/glm-4.7-flash

OpenCode
  -> OpenAI-compatible http://localhost:20128/v1
  -> OmniRoute

DeepSeek Harness :3080
  -> DSh JSON-RPC /api/host.describe, session.*, commands/execute
  -> OmniRoute provider "omniroute" at :20128

StockNewsBR Harness A2A :9901
  -> reads OmniRoute /v1/models and checks Hermes :9900
  -> DSh :3080 session RPC
  -> OmniRoute :20128

Hermes gateway :9900
  -> messaging/health service; not the Harness inference hop

FCC :8082
  -> separate local FCC/provider path; no proven edge to OmniRoute :20128
```

### Runtime identity

| Field | Observed value |
|---|---|
| Version | `3.8.50` |
| Listener | `127.0.0.1:20128` |
| Service | `omniroute.service`, active |
| ExecStart | `/home/dcima/.local/bin/omniroute-systemd-run` |
| Package type | pnpm global packaged install |
| Package source | `/home/dcima/.local/share/pnpm/store/.../node_modules/omniroute` |
| Health | `GET /api/health` HTTP 200 |
| Protected models | `GET /v1/models` HTTP 200; 5,501 models, 38 auto aliases |

The installed package remains a deployment artifact, not a development source
tree. No source worktree was created or modified in this mission.

## Client compatibility map

| Client | Classification | Existing route | Request style | Model/alias | Result |
|---|---|---|---|---|---|
| Hermes Agent | `OMNIROUTE_DOWNSTREAM` | `http://127.0.0.1:20128` | OpenAI chat completions | pinned `zai/glm-4.7-flash` | `FAIL_EXISTING` from provider instability |
| OpenCode | `OMNIROUTE_DOWNSTREAM` | `http://localhost:20128/v1` | OpenAI-compatible chat | configured auto `auto/coding:free`; safe probe explicit OpenRouter free model | `PASS` for client transport; default auto completion withheld safely |
| DeepSeek Harness | `OMNIROUTE_INDIRECT` | DSh `:3080`; A2A bridge `:9901` | DSh JSON-RPC plus A2A JSON-RPC | `omniroute` / `zai/glm-4.7-flash` | `PASS` |
| FCC / NVIDIA | `OUT_OF_PATH` | FCC `:8082` | FCC-native | separate provider path | `OUT_OF_PATH` |
| Direct OpenAI-compatible caller | `OMNIROUTE_DOWNSTREAM` | `http://127.0.0.1:20128/v1` | OpenAI chat completions | explicit zero-priced OpenRouter route | `PASS` |

## Phase A — Hermes diagnosis

### Existing contract

```text
HERMES_COMMAND_OR_SERVICE=/home/dcima/.hermes/hermes-agent/venv/bin/hermes; hermes-gateway.service
HERMES_BASE_URL=http://127.0.0.1:20128
HERMES_ENDPOINT=POST /chat/completions
HERMES_MODEL_OR_ALIAS=zai/glm-4.7-flash
HERMES_ROUTE_TYPE=PINNED
HERMES_STREAMING=CONFIGURED_TRUE_NOT_CONFIRMED_BY_COMPLETED_EXACT_PROBE
HERMES_TOOL_CALLING=CONFIGURED_TRUE_NOT_SMOKED
```

Evidence from the exact configured one-shot (`hermes --no-restore-cwd -z
'Reply with exactly OK.'`):

- OmniRoute recorded `POST /chat/completions`, provider `zai`, model
  `glm-4.7-flash`, source format `openai`, target format `claude`.
- The current model catalog prices the configured model at zero; no paid route
  was selected.
- The request reached the provider. The observed failures were upstream
  `529 server_error` overload responses; the call history also contains
  `429 rate_limited` and `499 Request aborted` outcomes.
- One intermittent `200` occurred during the probe, but repeated `529`
  responses continued and Hermes was retrying. The probe was stopped to avoid
  unnecessary request burn; no completed final CLI response was claimed.
- The OmniRoute provider test endpoint was healthy, but that endpoint is not
  real inference proof.
- The Hermes gateway `GET /health` remained HTTP 200; it is not the inference
  hop for this configured custom provider.

Root cause classification: `PROVIDER_HEALTH` with provider-side rate-limit /
availability behavior. There is no evidence of a client configuration error,
stale alias, authentication failure, network failure, or protocol translation
failure. A safe OmniRoute-side repair was not identified, and no repair was
made.

```text
HERMES_REPAIR=NOT_PERFORMED_NO_SAFE_OMNIROUTE_SIDE_REPAIR
HERMES_REPAIR_REQUIRES_CLIENT_CHANGE=NO
```

## Phase B — OpenCode baseline

Safe config projection:

```text
OPENCODE_CONNECTION=http://localhost:20128/v1; provider=omniroute
OPENCODE_MODEL_OR_ALIAS=omniroute/auto/coding:free
OPENCODE_ROUTE_TYPE=AUTO (configured); safe probe used explicit free model
```

The live auto candidate endpoint was read-only tested. With
`freeAccessPolicy=off`, `auto/coding` returned paid/unknown-looking candidates
as not excluded, so invoking the configured auto alias would not be a safe
no-spend compatibility probe. No auto completion was sent.

The existing OpenCode CLI was invoked without changing its config:

```text
opencode --pure run --format json \
  --model omniroute/openrouter/nvidia/nemotron-3-ultra-550b-a55b:free \
  'Reply with exactly OK.'
```

Result: exit `0`, response text `OK`, and streamed JSON step/text/finish events.
The selected route is a previously successful zero-priced OpenRouter route.

```text
OPENCODE_SIMPLE_COMPLETION=PASS_SAFE_PINNED_FREE_PROBE
OPENCODE_STREAMING=PASS
OPENCODE_TOOL_CALLING=NOT_USED
```

This closes OpenCode client transport compatibility while deliberately leaving
the live auto-policy gap for R1.

## Phase C — DeepSeek Harness baseline

The actual chain is not Harness → Hermes → OmniRoute for inference. Runtime
evidence shows:

1. `stocknewsbr-harness.service` runs DSh web on `127.0.0.1:3080` with
   `HERMES_BASE_URL=http://127.0.0.1:9900` and
   `HERMES_PROVIDER=omniroute` as auxiliary runtime configuration.
2. DSh `POST /api/host.describe` reports `provider=omniroute` and
   `model=zai/glm-4.7-flash`.
3. The A2A bridge reads `/v1/models`, checks Hermes health, then calls DSh
   `session.create`, `session.selectModel`, `session.prompt`, and
   `session.history`; DSh performs the inference through OmniRoute.

The bridge health contract was HTTP 200/READY with storage `READY`, and one
read-only A2A task completed with exact response `OK`. The selected model was
`zai/glm-4.7-flash` with zero catalog pricing. No tools, writes, credentials,
issues, missions, or commits were created by the task.

```text
HARNESS_ROUTE_CHAIN=:9901 A2A bridge -> :3080 DSh JSON-RPC -> OmniRoute :20128;
Hermes :9900 is a healthy auxiliary health dependency, not the inference hop
DEEPSEEK_HARNESS_BASELINE=PASS
```

## Phase D — direct OpenAI-compatible baseline

All probes used the already observed zero-priced, real-request-passing route
`openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`.

| Probe | Result |
|---|---|
| `GET /v1/models` | HTTP 200; catalog readable |
| Non-stream `POST /v1/chat/completions` | HTTP 200; assistant completion returned |
| Stream `POST /v1/chat/completions` | HTTP 200; SSE events and `[DONE]` observed |
| Tool call | HTTP 200; exactly one deterministic `r0_noop` tool call returned |

One earlier tool probe against a different zero-priced model returned HTTP 502
with an upstream empty response. The second verified-free model returned the
required tool call, so the failed attempt is classified as provider/model
behavior rather than an OpenAI compatibility failure.

```text
OPENAI_MODELS_ENDPOINT=PASS (GET /v1/models HTTP 200)
OPENAI_COMPLETION=PASS
OPENAI_STREAMING=PASS
OPENAI_TOOL_CALLING=PASS
OPENAI_COMPAT_BASELINE=PASS
```

## Phase E — pinned and auto routing baseline

The direct probes used an explicit model/provider string and OmniRoute selected
the same provider and model in its call history:

```text
requested_model=openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
resolved_provider=openrouter
resolved_model=nvidia/nemotron-3-ultra-550b-a55b:free
status=200
```

No fallback or alias rewrite occurred.

```text
PINNED_MODEL_TEST=PASS explicit model resolved unchanged
PINNED_PROVIDER_TEST=PASS explicit openrouter provider resolved unchanged
PINNED_MODEL_BASELINE=PASS
PINNED_PROVIDER_BASELINE=PASS
```

The safe adaptive baseline was read-only: `GET /v1/models` exposed 38 auto
aliases, and `GET /v1/auto-combo/coding/candidates` returned HTTP 200. The
candidate response demonstrated why an auto completion was withheld: with
`freeAccessPolicy=off`, paid/unknown candidates were still marked eligible.

```text
AUTO_ROUTE_TEST=PASS_READ_ONLY_CANDIDATE_DISCOVERY
AUTO_ROUTE_BASELINE=READ_ONLY_ONLY_POLICY_OFF
```

## Phase G — service integrity and drift check

After all probes:

- `omniroute.service` remained active.
- `127.0.0.1:20128` remained listening.
- `/api/health` and protected `/v1/models` remained HTTP 200.
- Hermes gateway, Harness web, Harness A2A, and FCC services remained active.
- No probe process remained.
- Existing repository dirtiness remained unrelated to this closure; no client
  repository or configuration file was edited.

## Remaining blocker and R1 gate

Only the exact Hermes pinned-provider baseline is open. The current evidence
does not justify changing Hermes to an auto alias, changing its model, changing
its base URL, or changing its auth. R1 must not begin against production until
the existing Hermes request is stable or a separately approved OmniRoute-side
provider-health repair is proven.

## Final report

```text
OMNIROUTE_FREE_AUTOPILOT_R0_5_CLIENT_COMPATIBILITY_CLOSURE

LIVE_VERSION=3.8.50
LIVE_PORT_20128=LISTENING_127.0.0.1
LIVE_SERVICE=active:omniroute.service

HERMES_TOPOLOGY=OMNIROUTE_DOWNSTREAM
HERMES_BASELINE=FAIL_EXISTING
HERMES_ROOT_CAUSE=PROVIDER_HEALTH (Z.AI upstream overload/rate-limit behavior)
HERMES_REPAIR=NOT_PERFORMED_NO_SAFE_OMNIROUTE_SIDE_REPAIR
HERMES_REPAIR_REQUIRES_CLIENT_CHANGE=NO

OPENCODE_TOPOLOGY=OMNIROUTE_DOWNSTREAM
OPENCODE_BASELINE=PASS
OPENCODE_ROUTE_TYPE=AUTO_CONFIGURED_SAFE_PINNED_PROBE
OPENCODE_STREAMING=PASS
OPENCODE_TOOL_CALLING=NOT_USED

DEEPSEEK_HARNESS_TOPOLOGY=OMNIROUTE_INDIRECT
HARNESS_ROUTE_CHAIN=:9901 A2A -> :3080 DSh -> :20128 OmniRoute; :9900 Hermes auxiliary health
DEEPSEEK_HARNESS_BASELINE=PASS

FCC_NVIDIA_TOPOLOGY=OUT_OF_PATH

OPENAI_COMPAT_BASELINE=PASS
OPENAI_STREAMING=PASS
OPENAI_TOOL_CALLING=PASS

PINNED_MODEL_BASELINE=PASS
PINNED_PROVIDER_BASELINE=PASS
AUTO_ROUTE_BASELINE=READ_ONLY_ONLY_POLICY_OFF

CLIENT_CONFIG_CHANGED=NO
HERMES_CODE_CHANGED=NO
DEEPSEEK_HARNESS_CODE_CHANGED=NO
OPENCODE_CODE_CHANGED=NO

OMNIROUTE_ROUTING_FEATURES_CHANGED=NO

PAID_INFERENCE_TRIGGERED=NO
PAID_SPEND_TRIGGERED=NO
SECRETS_EXPOSED=NO

R1_RELEASE_GATE=BLOCKED

COMMIT=NOT_CREATED_DIRTY_REPO
PUSH=NOT_ATTEMPTED

FINAL_RESULT=BLOCKED
```
