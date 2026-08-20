# Quick Start

This is the short path. Read the linked guides before using a public or production codebase.

> Latest stack verification: **2026-08-20**. Free-model evidence: [`docs/14-verified-free-models.md`](docs/14-verified-free-models.md). Hermes operator layer: [`docs/15-hermes-agent-operator-layer.md`](docs/15-hermes-agent-operator-layer.md).

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

### Current lab-verified priority pool

The current `OmniRoute Pro Coding` pool is intentionally small:

```text
1. GLM-5.2 — NVIDIA
2. Nemotron 3 Ultra 550B A55B — NVIDIA
3. Inkling — NVIDIA
4. DeepSeek V4 Flash Free — OpenCode Zen / OmniRoute
5. MiMo-V2.5 Free — OpenCode Zen / OmniRoute
6. Nemotron 3 Super 120B A12B — NVIDIA
7. Nemotron 3.5 Lightning 30B A3B — NVIDIA
8. Step 3.7 Flash — NVIDIA
```

All eight routes passed the lab smoke-test criteria used for the pool. **Nemotron 3.5 Lightning and DeepSeek V4 Flash Free were also exercised in real work on 2026-08-20.** Full IDs, caveats, notable failed routes and audit counts are in [`docs/14-verified-free-models.md`](docs/14-verified-free-models.md) and [`BEST_FREE_AI_MODELS.md`](BEST_FREE_AI_MODELS.md).

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

Do not point every concurrent agent at the same heavyweight combo by default. Our 2026-08-20 profile distributes agents across **Pro Coding / Coding / Coding Cheap / Best Coding Fast** classes. See [`docs/05-omo-agents.md`](docs/05-omo-agents.md).

## 6. Add the context/quality layer

Recommended combination:

- Graphify: dependency/relationship map before broad raw reads.
- Serena: symbol-level navigation and precise edits.
- Ponytail: YAGNI, reuse, stdlib/native-first, smallest correct diff.
- Playwright MCP: browser/E2E verification.
- SonarQube MCP + security review: independent quality/security evidence.

Treat these as operational dependencies: after upgrades, re-run the relevant health checks rather than assuming the plugin is active because it is installed.

## 7. Optional: Claude Code through FCC

```bash
fcc-server
fcc-claude
```

Admin UI: `http://127.0.0.1:8082/admin`.

Use the Admin UI to configure NVIDIA NIM and model-tier overrides.

## 8. Optional: Hermes Agent as an independent audit/operator path

Hermes can sit beside OpenCode rather than replacing it. We use it for independent, tool-using repository audits and sub-agent delegation.

A useful acceptance test is a **read-only real-repository audit** that must return evidence with paths/lines and must not edit files. The browser/tool path was revalidated on 2026-08-20 with `agent-browser@0.27.0` and Hermes doctor/requirements checks.

See [`docs/15-hermes-agent-operator-layer.md`](docs/15-hermes-agent-operator-layer.md).

## 9. Validate before trusting the stack

```bash
bash scripts/health-check.sh
bash scripts/validate-nvidia-models.sh
bash scripts/validate-omniroute-models.sh
bash scripts/verify-opencode-session-isolation.sh
```

A working stack is one that completes real requests, survives a provider failure, and keeps concurrent OpenCode sessions isolated.

Do not infer provider rate limits or safe parallel-agent counts from the number of models that appear in `/models`. Those are separate measurements and can vary by account/provider.

**2026-08-20 concurrency lesson:** a combo working in one chat does not prove that several concurrent agents can share the same provider bucket safely. Keep direct fallback routes available and test parallel capacity separately.
