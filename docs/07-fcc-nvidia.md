# Claude Code → FCC → NVIDIA NIM

Free Claude Code (FCC) lets Claude Code keep its client protocol while routing model traffic through other providers.

Official project: https://github.com/Alishahryar1/free-claude-code

## Install

Use the current upstream installer. On Linux/macOS, FCC documents:

```bash
curl -fsSL "https://raw.githubusercontent.com/Alishahryar1/free-claude-code/main/scripts/install.sh" | sh
```

## Start

```bash
fcc-server
```

The default Admin UI is:

```text
http://127.0.0.1:8082/admin
```

## Configure NVIDIA NIM

1. Create a NIM API key at NVIDIA Build.
2. Open FCC Admin → **Providers**.
3. Set `NVIDIA_NIM_API_KEY`.
4. Click **Validate**, then **Apply**.
5. Open **Model Config** and select a live NVIDIA model.

Our screenshot shows a historical configuration captured during active experimentation. Do not blindly copy an old override: verify the route still exists before saving it.

## Run Claude Code through FCC

```bash
fcc-claude
```

The launcher reads the current FCC settings and exports the proxy environment for Claude Code.

## Why this path is useful

```text
Claude Code UI/agent behavior
        ↓
FCC protocol translation and routing
        ↓
NVIDIA NIM
        ↓
GLM-5.2 / Nemotron / another supported model
```

You can keep Claude Code's workflow while experimenting with different provider economics and model families.

## Model discovery

FCC supports gateway model discovery. For Claude Code integrations, the relevant environment is:

```text
CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

FCC's launcher also manages its current auto-compaction configuration. Prefer `fcc-claude` over manually reproducing every environment variable unless you have a specific reason.

## Runtime settings that worked well for long tasks

Our Admin UI screenshot captured conservative provider concurrency/rate settings and long read timeouts. The exact numbers are workload-dependent; the lesson is more important than the values:

- cap provider concurrency rather than flooding free endpoints;
- allow long read timeouts for deep reasoning models;
- keep connection timeout much shorter than generation timeout;
- if a provider is cooling down, fail over instead of retrying forever.

## Security

FCC's Admin UI is local. Keep it bound to loopback unless you intentionally secure and expose it. Never commit `~/.fcc/.env` or copy its values into public documentation.
