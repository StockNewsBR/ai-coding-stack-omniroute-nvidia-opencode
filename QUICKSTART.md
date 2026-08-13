# Quick Start

This is the short path. Read the linked guides before using a public or production codebase.

## 1. Install and start OmniRoute

```bash
npm install -g omniroute
omniroute
```

Open `http://localhost:20128`. The OpenAI-compatible API is at `http://localhost:20128/v1`.

Official quick start: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.50/docs/getting-started/QUICK-START.md

## 2. Connect at least two independent providers

Recommended shape:

1. NVIDIA NIM for heavyweight coding/reasoning.
2. OpenCode Free / Zen or OpenRouter for a separate fallback path.
3. Optional Z.AI, Cloudflare Workers AI, Groq or another provider for extra redundancy.

Do not build a fallback chain where every route ultimately depends on the same upstream.

## 3. Create an OmniRoute API key

Dashboard → **API Keys** → create a key.

Test discovery:

```bash
curl -s http://127.0.0.1:20128/v1/models \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY"
```

Then test a real completion. Model discovery is not proof that inference works.

## 4. Configure OpenCode

Use OmniRoute as an OpenAI-compatible provider. Keep the key in an environment variable or private file.

See [`examples/opencode.omniroute.example.json`](examples/opencode.omniroute.example.json).

## 5. Add the agent layer

Install Oh My OpenAgent:

```bash
bunx oh-my-openagent install
```

For a direct implementation task, use **Sisyphus — Ultraworker**. For ambiguous work, plan first with **Prometheus**, then execute with **Atlas** or Sisyphus.

## 6. Add the context/quality layer

Recommended combination:

- Graphify: dependency/relationship map before broad raw reads.
- Serena: symbol-level navigation and precise edits.
- Ponytail: YAGNI, reuse, stdlib/native-first, smallest correct diff.
- Playwright MCP: browser/E2E verification.
- SonarQube MCP + security review: independent quality/security evidence.

## 7. Optional: Claude Code through FCC

```bash
fcc-server
fcc-claude
```

Admin UI: `http://127.0.0.1:8082/admin`.

Use the Admin UI to configure NVIDIA NIM and model-tier overrides.

## 8. Validate before trusting the stack

```bash
bash scripts/health-check.sh
bash scripts/validate-nvidia-models.sh
bash scripts/validate-omniroute-models.sh
bash scripts/verify-opencode-session-isolation.sh
```

A working stack is one that completes real requests, survives a provider failure, and keeps concurrent OpenCode sessions isolated.
