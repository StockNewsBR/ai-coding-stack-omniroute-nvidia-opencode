# Oh My OpenAgent / OMO Agents

Official project: https://github.com/code-yeongyu/oh-my-openagent

## Install

The current upstream installation guide recommends:

```bash
bunx oh-my-openagent install
```

The installer asks which subscriptions/providers you have and builds agent-specific fallback chains.

## Why Sisyphus — Ultraworker became our default

Sisyphus gave us a repeatable execution loop instead of a single large prompt that mixed exploration, editing, testing and review in one context.

For a clear mission, the pattern was:

```text
Sisyphus
  → inspect
  → delegate targeted research
  → implement
  → run tests
  → fix failures
  → produce evidence
```

That mattered most in long reliability/security audits where we wanted the main agent to keep the mission state while cheaper/faster agents handled search or narrow investigation.

Use `ultrawork` / `ulw` when that matches your installed OMO version and workflow.

## Agent roles we found useful

| Agent | Role | Use it when |
|---|---|---|
| **Sisyphus — Ultraworker** | primary executor/orchestrator | task is clear and should be carried to completion |
| **Prometheus** | plan builder | task is large, ambiguous or multi-phase |
| **Atlas** | plan executor | a plan already exists and should be executed systematically |
| **Oracle** | independent high-level reasoning/review | architecture, hard debugging, second opinion |
| **Explore** | repository discovery | locating implementation paths, callers, tests, configuration |
| **Librarian** | external/reference research | docs, APIs, upstream behavior |
| **Metis** | plan critique | checking Prometheus plans for missing assumptions/gaps |
| **Momus** | adversarial/quality critique | challenging a proposed implementation before expensive edits |
| **Multimodal Looker** | image/UI evidence | screenshots, visual regressions, browser state |
| **Hephaestus** | deep implementation option | autonomous implementation where your OMO version exposes it |

Agent names and default model chains can change between OMO versions. Treat the table as a workflow map, not a promise about upstream defaults.

## The workflow that gave us the best results

```text
UNDERSTAND
  Graphify + Serena + Explore

PLAN
  Prometheus + Metis + Momus

IMPLEMENT
  Sisyphus / Atlas

KEEP THE DIFF SMALL
  Ponytail

SPECIALIST CHECKS
  FastAPI / DB / Performance / TypeScript agents and skills

PROVE
  Tests + Playwright + SonarQube + Security Reviewer + Oracle
```

The important lesson is not "use every agent." It is **give each agent a narrow job** so you do not waste context having five agents rediscover the same code.

## Suggested model strategy

Do not hard-code one expensive model for every agent. A practical pattern is:

- main executor: strongest reliable coding route you can afford or access;
- Explore/Librarian: fast, lower-cost model;
- Oracle: reasoning-oriented model/provider independent from the implementer when possible;
- planner/reviewer: enough reasoning to catch architecture gaps, but not necessarily the same provider as the executor.

In our free-heavy stack, GLM-5.2 and Nemotron were high-value heavyweight routes while DeepSeek V4 Flash Free was useful for fast implementation/search work.
