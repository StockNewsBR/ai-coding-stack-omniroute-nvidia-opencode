# Tools, Plugins, Skills and MCPs

The goal is **not** to collect every plugin on GitHub. The goal is to make the coding agent more precise, safer and more independent **while spending less context**.

This stack worked best when each tool had one job:

```text
Graphify     -> architecture and dependency graph
Serena       -> symbol-level semantic navigation
Explore      -> fast repository search
Ponytail     -> YAGNI / smallest-safe-diff discipline
Playwright   -> browser-level proof
SonarQube    -> independent quality/security gate
SkillSpector -> inspect third-party agent skills before trusting them
Specialists  -> bring domain expertise only when the mission needs it
```

> OpenCode MCP servers consume context. Enable only the MCPs needed for the current mission instead of loading everything into every session.

---

## Validated inventory from the working setup

The labels below are intentionally conservative:

- **✅ used/validated** = we exercised it in the working StockNewsBR/OpenCode/OMO environment;
- **◐ installed/configured** = installation/configuration was validated, but it may be disabled in a given profile/session;
- **project-specific** = useful in our repository, not a universal dependency.

### OpenCode / OMO agents

| Agent | Status | Role in the workflow |
|---|---:|---|
| Sisyphus — Ultraworker | ✅ | Main implementation/audit/orchestration agent |
| Prometheus — Plan Builder | ✅ | Planning for ambiguous/large missions |
| Atlas — Plan Executor | ✅ | Executes approved plans via `/start-work` |
| Oracle | ✅ | Read-only architecture/debugging second opinion |
| Explore | ✅ | Fast repository search/discovery |
| Librarian | ✅ | External docs / OSS research |
| Metis | ✅ | Plan gap analysis |
| Momus | ✅ | Plan/result criticism |
| Multimodal Looker | ✅ | Screenshot/visual artifact analysis |
| Sisyphus-Junior | ✅ | Scoped delegated subtasks |
| Hephaestus | ◐ | Optional autonomous deep-worker path |

### OpenCode plugins / skills / MCPs

| Exact name | Kind | Status | Notes |
|---|---|---:|---|
| Graphify | skill/local graph workflow | ✅ | Architecture/dependency aid; build the graph per project |
| `@dietrichgebert/ponytail` | plugin/rules | ◐ | Installed/configured; verify it is present in the **active OpenCode profile** |
| Serena | MCP | ✅ | Semantic navigation |
| Playwright MCP | MCP | ✅ | Browser/E2E proof |
| SonarQube MCP | MCP | ✅ | Independent quality/security evidence |
| NVIDIA SkillSpector | tool / optional MCP | ✅ | Third-party skill trust gate |
| `websearch` (Exa) | OMO/runtime tool | ✅ | External research |
| Context7 | OMO/runtime tool | ✅ | Current docs lookup |
| `grep_app` | OMO/runtime tool | ✅ | Code/pattern search |
| LSP | OMO/runtime tool | ✅ | Language-server diagnostics/navigation |
| `codegraph` | OMO/runtime tool | ✅ | Local graph context; **not Graphify** |
| TradingView | project-specific tool | ✅ | StockNewsBR market/domain work |

### Specialist pack

- **ws-fastapi-pro** — FastAPI/backend specialist;
- **ws-database-optimizer** — database/query/index specialist;
- **ws-performance-engineer** — performance/reliability specialist;
- **ws-error-detective** — systematic runtime debugging;
- **ws-typescript-pro** — TypeScript/Next.js specialist;
- **Vercel React Best Practices** — React/Next performance review;
- **Vercel Web Design Guidelines** — UI/UX/accessibility review;
- **Playwright MCP** — browser-level verification;
- **NVIDIA SkillSpector** — skill supply-chain/security scanning.

These were installed/validated as part of the working specialist pack. Invoke them selectively; do not inject all of them into every mission.

### Audit / review arsenal

The older audit arsenal that remained useful alongside the specialist pack:

1. **SonarQube MCP**
2. **AST Tech Debt Scanner**
3. **codex-grade-coding**
4. **code-reviewer**
5. **Security Reviewer**
6. **Brooks-Lint**
7. **Source-Driven Development**
8. **Debugging & Error Recovery**
9. **env-doctor**

We also used a separate **code-review** skill for an additional review style/pass.

### Custom/project skills

- **stocknewsbr-ai-regression** — provider/AI regression checks;
- **security-and-hardening** — StockNewsBR security invariants;
- **documentation-and-adrs** — docs and ADR discipline;
- **graphify** — project-level graph-first guidance;
- **ponytail** — project-level YAGNI/reuse/small-diff guidance.

### Gemini-side independent audit stack

Used as a second toolchain rather than pretending every tool was OpenCode-native:

- Gemini Docs MCP;
- code-reviewer;
- code-review;
- Security Reviewer;
- SonarQube MCP;
- AST Tech Debt Scanner;
- Brooks-Lint;
- env-doctor.

This separation matters in a public guide: **“worked in our engineering workflow” does not always mean “was an OpenCode plugin.”**

---

## 1. Graphify

Official: https://github.com/Graphify-Labs/graphify

Graphify builds a local, queryable knowledge graph from a codebase so the agent can answer architecture/dependency questions without opening half the repository.

### Install

```bash
uv tool install graphifyy
```

The official CLI command is still `graphify` (the PyPI package name has the extra `y`). Register the integration for OpenCode with the current upstream installer:

```bash
graphify install --platform opencode
```

To keep the skill in a repository rather than a user profile, current Graphify releases also document `--project` installs. **Verify the generated paths after installation.** Graphify has had OpenCode path bugs where the installer reported success but placed the plugin in a directory OpenCode did not load.

For OpenCode, the current upstream global config/plugin locations are under `~/.config/opencode/`, while project plugins belong under `.opencode/plugins/`. If a Graphify hook appears installed but never fires, inspect the generated file location before reinstalling everything.

Build the graph from the project:

```text
/graphify .
```

or run the CLI directly:

```bash
graphify .
```

### Why we kept it

- local deterministic code graph;
- dependency relationships and caller/callee reasoning;
- blast-radius questions before edits;
- fewer blind `grep`/`find`/full-file reads;
- lower token/context waste on mature repositories.

### Good questions for Graphify

```text
What calls this function?
What depends on this module?
What is the blast radius if I change this interface?
Which tests exercise this path?
Is this class actually dead code?
```

---

## 2. Ponytail

Official: https://github.com/DietrichGebert/ponytail

Ponytail is the counterweight to over-enthusiastic agents. Its ladder is essentially: YAGNI first, reuse existing code, prefer stdlib/native features, and only then write the minimum new implementation that is actually needed.

### OpenCode install

Merge the plugin into the existing `plugin` array in `opencode.json`:

```json
{
  "plugin": [
    "@dietrichgebert/ponytail"
  ]
}
```

If Oh My OpenAgent is already installed, **append Ponytail**; do not replace the OMO plugin entry.

### Why we kept it

- YAGNI;
- smallest safe diff;
- reuse before abstraction;
- stdlib/native feature preference;
- less speculative architecture;
- easier code review and rollback.

Ponytail's own benchmark claims belong to Ponytail; our reason for keeping it was simpler: it consistently pressured agents to make changes that were easier to review.

---

## 3. Serena

Official: https://github.com/oraios/serena

Serena gives an agent IDE-like semantic navigation: symbols, references, declarations, structured retrieval and symbolic editing.

### Install using the current upstream package

```bash
uv tool install -p 3.13 serena-agent
serena init
```

### OpenCode MCP example

Current Serena releases expose a generic `agent` execution context; do not assume an old `opencode` context name still exists.

```jsonc
{
  "mcp": {
    "serena": {
      "type": "local",
      "command": [
        "serena",
        "start-mcp-server",
        "--project-from-cwd",
        "--context",
        "agent"
      ],
      "enabled": true
    }
  }
}
```

If OpenCode cannot find the `serena` executable, use the absolute path returned by `command -v serena`, or follow Serena's current `uvx` launch instructions.

### Why we kept it

- semantic symbol lookup;
- references and callers;
- declaration/definition navigation;
- targeted edits instead of full-file rewrites;
- precise refactoring context on large repositories.

### Best pairing

```text
Graphify -> “what is connected?”
Serena   -> “where exactly is the symbol and who references it?”
Ponytail -> “what is the smallest safe change?”
```

---

## 4. Playwright MCP

Official: https://github.com/microsoft/playwright-mcp

A code review can say a UI fix looks correct while the actual browser still fails. Playwright gives the agent browser-level evidence.

### OpenCode MCP config

```jsonc
{
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest"],
      "enabled": true
    }
  }
}
```

For projects where browser testing is not needed, set `enabled` to `false` and turn it on only for UI/E2E missions.

### Why we kept it

- browser automation;
- structured accessibility snapshots;
- real end-to-end UI verification;
- navigation/form/state testing;
- catches routing, hydration, CSS, runtime and interaction problems source review misses.

### Security note

A browser automation MCP is powerful. Treat web content as untrusted. Do not let a page, third-party prompt or test fixture persuade the agent to disclose secrets, change accounts, send messages, buy something or perform another sensitive action without review.

---

## 5. SonarQube MCP

Official: https://github.com/SonarSource/sonarqube-mcp-server

SonarQube adds an **independent** static-analysis/quality view instead of asking the same coding agent to grade its own homework.

### Docker-based OpenCode example

Export credentials in the shell instead of placing them in Git:

```bash
export SONARQUBE_TOKEN="YOUR_TOKEN"
export SONARQUBE_ORG="YOUR_ORGANIZATION"
```

Then merge a local MCP entry. Keep it disabled until a quality/security mission needs it:

```jsonc
{
  "mcp": {
    "sonarqube": {
      "type": "local",
      "command": [
        "docker", "run",
        "--init",
        "--pull=always",
        "--rm", "-i",
        "-e", "SONARQUBE_TOKEN",
        "-e", "SONARQUBE_ORG",
        "mcp/sonarqube"
      ],
      "enabled": false,
      "environment": {
        "SONARQUBE_TOKEN": "{env:SONARQUBE_TOKEN}",
        "SONARQUBE_ORG": "{env:SONARQUBE_ORG}"
      }
    }
  }
}
```

SonarQube Server users should follow the upstream server-specific environment variables rather than copying Cloud settings blindly.

### Why we kept it

- independent issue list;
- quality gates;
- bugs and vulnerabilities;
- security hotspots/code smells;
- coverage/quality context;
- a second opinion after implementation.

---

## 6. NVIDIA SkillSpector

Official: https://github.com/NVIDIA/skillspector

Agent skills are executable instructions from a trust perspective even when they are “just Markdown.” SkillSpector lets you inspect a skill before giving it authority inside your coding workflow.

### Install

Follow NVIDIA's current upstream installation path:

```bash
git clone https://github.com/NVIDIA/skillspector.git
cd skillspector
uv venv .venv
source .venv/bin/activate
make install
```

For a disposable evaluation, read the repository first and use an isolated virtual environment rather than installing unreviewed code globally.

### Scan a skill or directory

```bash
skillspector scan ./my-skill/
skillspector scan ./SKILL.md
skillspector scan https://github.com/user/some-skill
```

Static-only mode:

```bash
skillspector scan ./my-skill/ --no-llm
```

### Why we kept it

- catches suspicious skill instructions;
- helps detect prompt injection/exfiltration patterns;
- reduces supply-chain risk before installing random community skills;
- creates a useful “trust gate” before a tool becomes part of the agent stack.

> `--no-llm` is the safer choice when skill contents must remain local. Read the current SkillSpector privacy/network behavior before scanning sensitive private skills with an external semantic provider.

---

## 7. Vercel agent skills

Official: https://github.com/vercel-labs/agent-skills

Install with the Skills CLI:

```bash
npx skills add vercel-labs/agent-skills
```

Choose only the skills you actually need.

### React Best Practices

Useful for React/Next.js performance: waterfalls, bundle size, server performance, client fetching and render efficiency.

### Web Design Guidelines

Useful for UI review, accessibility, performance and UX consistency.

### Why they mattered

The value was not “another AI.” These skills gave the coding model a concise checklist written for a specific domain, which made front-end reviews more consistent and reduced the chance that a backend-oriented agent would miss UX/performance details.

---

## 8. wshobson/agents specialist pack

Official: https://github.com/wshobson/agents

The project provides a large catalog of specialist agents/skills and supports OpenCode installation.

### Generate the OpenCode harness

The current upstream marketplace uses one source tree and generates harness-native artifacts:

```bash
gh repo clone wshobson/agents ~/agents
cd ~/agents
make generate HARNESS=opencode
```

Review the generated `.opencode/agents/`, `.opencode/commands/` and `.opencode/skills/` content before copying/enabling the pieces you want. Do not load the entire marketplace into every session.

### Specialists that brought value in our workflow

- FastAPI / Python specialist;
- TypeScript specialist;
- database optimizer;
- performance engineer;
- error detective / systematic debugging.

### Why we kept them

A general coding model becomes much more consistent when a difficult mission is given the right domain lens. A database-concurrency audit should not use the same minimal context as a CSS review.

> Do **not** dump the entire marketplace into every prompt. Install broadly if you want, but invoke narrowly. Progressive disclosure is the difference between “more tools” and “more noise.”

---

## 9. Our custom/local review roles

We also used local roles/skills such as:

- **Security Reviewer** — secrets, injection, unsafe subprocess/eval, dangerous web patterns;
- **AST Tech Debt Scanner** — structural debt and suspicious code patterns;
- **Brooks-Lint** — engineering discipline / complexity pressure;
- **env-doctor** — dependency, runtime and environment mismatch diagnosis;
- **code-reviewer / code-review** — independent post-change review passes.

These are best understood as **workflow roles**, not magic packages. Their value came from forcing separate passes: security, structural debt, environment health and independent review.

---

## 10. A practical OpenCode MCP merge template

This repository includes:

```text
examples/opencode.mcp-tools.example.jsonc
```

It contains Serena, Playwright and an opt-in SonarQube entry.

Do **not** replace a working `opencode.json` with the example. Merge only the `mcp` entries you need.

---

## 11. Best combinations

| Mission | Recommended tools |
|---|---|
| Architecture | Graphify + Serena + Oracle |
| Performance | Graphify + performance specialist + DB optimizer |
| FastAPI backend | FastAPI specialist + Serena + tests |
| Next.js UI | TypeScript + React Best Practices + Web Design + Playwright |
| Security | Security Reviewer + SonarQube + SkillSpector |
| Minimal bug fix | Explore + Serena + Ponytail |
| Difficult runtime bug | Explore + error detective + Oracle + targeted logs |
| Large audited implementation | Prometheus → Atlas/Sisyphus + Graphify + Serena → tests → Sonar/reviewer |

The common pattern is simple:

```text
understand narrowly -> change narrowly -> prove broadly
```
