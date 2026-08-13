# OpenCode Setup

OpenCode is the primary coding platform in this stack. OmniRoute is the provider gateway underneath it; OMO/Sisyphus is the orchestration layer above it.

Official documentation: https://opencode.ai/docs/

## Install OpenCode

Use the current official installer from OpenCode documentation. Verify your binary before building custom launchers around it:

```bash
opencode --version
```

## Connect OpenCode to OmniRoute

Use an OpenAI-compatible custom provider that points to:

```text
http://127.0.0.1:20128/v1
```

Store the OmniRoute key in an environment variable or a private file. OpenCode supports config substitution such as `{env:VARIABLE_NAME}` and `{file:path}`; use that instead of committing secrets.

See [`../examples/opencode.omniroute.example.json`](../examples/opencode.omniroute.example.json).

## Keep provider noise under control

OpenCode supports `enabled_providers` and `disabled_providers`. If your model picker contains hundreds of providers you never use, allowlisting the small set you actually use makes the interface easier to reason about and reduces accidental selection.

## Plugins

OpenCode currently supports:

- project plugins under `.opencode/plugins/`
- global plugins under `~/.config/opencode/plugins/`
- npm plugins through the `plugin` array in `opencode.json`

Official plugin docs: https://opencode.ai/docs/plugins/

Our useful plugin/tool layer includes Oh My OpenAgent, Ponytail, Graphify, Serena and MCP-based validation tools. See [`06-tools-and-plugins.md`](06-tools-and-plugins.md).

## OpenCode Free / Zen

Do not treat a screenshot or stale model list as a permanent contract. Run `/models` in your installed OpenCode and test a real completion.

Current official Zen documentation checked on 2026-08-12 lists these free entries:

- DeepSeek V4 Flash Free
- Nemotron 3 Ultra Free
- MiMo-V2.5 Free
- North Mini Code Free
- Big Pickle

The screenshot in this repository is a historical lab capture and may show additional free models that have since rotated out. Free catalogs change quickly, so `/models` plus a real completion request is always the source of truth for your own account.

Some free catalog entries are temporary. Use them as opportunistic fallback capacity, not as the only dependency in a critical workflow.

## Context management

A context percentage is not a provider quota percentage. Our custom HUD explicitly separates session context usage from provider rate/quota concepts. See [`13-opencode-session-isolation.md`](13-opencode-session-isolation.md).

## Multi-session rule

If you run several OpenCode terminals concurrently:

- unique tmux session per terminal;
- unique OpenCode PID;
- unique `OPENCODE_DB` per session;
- HUD must read the exact DB used by its corresponding OpenCode process.

That design fixed terminal mirroring while preserving the same project and the same OMO/plugin configuration.
