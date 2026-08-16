# OmniRoute Setup

Verified against the OmniRoute v3.8.50 release line, with the coding pool re-validated on **2026-08-16**.

Official README: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.50/README.md

## Install

```bash
npm install -g omniroute
omniroute
```

OmniRoute's current quick start documents:

- dashboard: `http://localhost:20128`
- API: `http://localhost:20128/v1`
- header authentication with an OmniRoute API key
- automatic routing/fallback through model aliases such as `auto`

## First provider

In the dashboard:

1. Open **Providers**.
2. Connect a provider.
3. Refresh models if the provider requires it.
4. Create an OmniRoute key under **API Keys**.
5. Do not expose provider keys to clients; clients should normally use the OmniRoute key.

## Test discovery

```bash
curl -s http://127.0.0.1:20128/v1/models \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY"
```

## Test inference

Replace the model with one shown by your own `/v1/models` output:

```bash
curl -s http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"auto",
    "messages":[{"role":"user","content":"Reply only with OMNIROUTE_OK"}],
    "max_tokens":32
  }'
```

**Do not call a route working until this succeeds.** A model can be present in discovery while inference fails because of quota, auth, retirement, provider-specific metadata, or a bad upstream endpoint.

## Current `OmniRoute Pro Coding` priority pool

After the 2026-08-16 runtime sweep, the lab combo was reduced to a deliberately small eight-model pool.

Strategy: **`priority`**

```text
1. nvidia/z-ai/glm-5.2
2. nvidia/nvidia/nemotron-3-ultra-550b-a55b
3. nvidia/thinkingmachines/inkling
4. oc/deepseek-v4-flash-free
5. oc/mimo-v2.5-free
6. nvidia/nvidia/nemotron-3-super-120b-a12b
7. nvidia/nvidia/nemotron-3.5-lightning-30b-a3b
8. nvidia/stepfun-ai/step-3.7-flash
```

Role split:

```text
BRAINS
GLM-5.2 → Nemotron 3 Ultra → Inkling

HEAVY CODING
DeepSeek V4 Flash Free → MiMo-V2.5 Free

AGENTS / WORKERS
Nemotron 3 Super → Nemotron 3.5 Lightning → Step 3.7 Flash
```

Why this shape:

- **GLM-5.2** is the first-choice long-horizon coding/architecture brain;
- **Nemotron 3 Ultra** is the preferred deep-audit/reasoning fallback;
- **Inkling** adds a second strong NVIDIA reasoning/tool-use path with multimodal capability;
- **DeepSeek V4 Flash Free** and **MiMo-V2.5 Free** give the combo independent OpenCode Zen free routes;
- **Nemotron 3 Super** is well suited to high-volume agent/worker tasks;
- **Nemotron 3.5 Lightning** is a fast worker route;
- **Step 3.7 Flash** adds text+image/frontend/GUI capability.

The exact provider prefix exposed to an OpenCode client can differ. For example, an internal OmniRoute route such as:

```text
oc/deepseek-v4-flash-free
```

may appear in OpenCode as:

```text
omniroute/oc/deepseek-v4-flash-free
```

**Always read the IDs from your live catalog before copying them.**

Detailed audit results: [`14-verified-free-models.md`](14-verified-free-models.md).

## Why we stopped keeping every discovered model

Our NVIDIA direct sweep found **98 catalog entries**, but only **15 passed 3/3**, 2 passed 2/3, and 81 failed 0/3 in the same OpenCode harness.

The right objective is not to collect model names. It is to keep a small set of routes that are:

1. actually reachable;
2. useful for coding/agents;
3. sufficiently different in role/provider to add redundancy;
4. repeatedly re-testable.

## Identity and quota caveat

A friendly alias is not proof of the exact physical upstream checkpoint, and two different aliases are not automatically two independent quotas.

For direct NVIDIA IDs, the upstream route is explicit. For hosted aliases such as OpenCode Zen Free, we separately track:

```text
friendly alias → provider route → upstream identity (when exposed) → quota bucket
```

We have not yet published fixed RPM/TPM or safe parallel-agent counts for this pool. Those require a dedicated concurrency test rather than guessing from catalog names.

## Cloudflare-specific lesson

A Cloudflare connection can appear configured and still fail if provider-specific account metadata is missing or wrong. In our setup, correcting the Cloudflare `accountId` changed routes from repeated 404/502-style failures to successful completions.

General rule: when a provider discovers models but every inference call fails, inspect provider-specific metadata before assuming the models themselves are bad.

## Cooldown / fallback lesson

Provider cooldown should cause the router to move on, not trap a coding session in repeated retries against the same unavailable path. Test your combo by intentionally disabling or exhausting the first route and checking that a later independent provider actually serves the request.

## Service operation

For a long-running WSL/Linux setup, run OmniRoute as a user service rather than relying on a terminal that can be closed accidentally. See [`examples/systemd/omniroute.service.example`](../examples/systemd/omniroute.service.example).

Useful checks:

```bash
ss -ltnp | grep ':20128'
curl -fsS http://127.0.0.1:20128/ >/dev/null && echo OK
```

If you use systemd:

```bash
systemctl --user status omniroute.service
journalctl --user -u omniroute.service -n 100 --no-pager
```
