# OmniRoute Setup

Verified against the OmniRoute v3.8.50 release line on 2026-08-12.

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

## Build a useful coding combo

A practical priority chain from our lab used independent routes similar to:

1. NVIDIA `z-ai/glm-5.2`
2. OpenRouter Nemotron Ultra free route
3. OpenCode DeepSeek V4 Flash Free
4. another OpenCode/Zen free route
5. NVIDIA Nemotron 3 Super
6. `auto/coding:free`
7. `auto/best-coding`

The exact IDs are intentionally not presented as permanent. **Read the IDs from your live OmniRoute catalog.** Provider slugs change.

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
