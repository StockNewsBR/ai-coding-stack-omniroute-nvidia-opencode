# Claude Code + FCC Field Guide

> This chapter is for developers who like the Claude Code client/workflow but want the model/provider layer to stay replaceable. In this stack, Claude Code is **not the primary platform** — OpenCode is — but Claude Code remains a very useful secondary client through **Free Claude Code (FCC)** and NVIDIA NIM.
>
> Verified against Claude Code and FCC upstream documentation on **2026-08-12**. Claude Code evolves quickly; confirm commands against the current official docs before automating production workflows.

---

## 1. Understand the four layers

Do not debug Claude Code, FCC, NVIDIA, and your repository as if they were one thing.

```text
Claude Code client
      ↓
Free Claude Code (FCC) proxy :8082
      ↓
provider adapter / routing
      ↓
NVIDIA NIM (or another provider)
      ↓
GLM-5.2 / Nemotron / other model
```

A request can fail at any layer. Test from the bottom upward.

### Bottom-up debug order

```text
1. NVIDIA direct completion
2. FCC provider validation
3. FCC /v1/models or model picker
4. fcc-claude tiny completion
5. repository/tool workflow
```

If NVIDIA direct works but `fcc-claude` fails, stop rotating NVIDIA keys: the failure is higher in the stack.

---

## 2. Install the real Claude Code client first

Anthropic currently recommends the native installer rather than the old npm package.

Linux/macOS:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

Check:

```bash
claude --version
```

Then install FCC separately. FCC launches the real `claude` client with proxy environment variables; it does not replace the value of learning Claude Code's own memory, worktree, permissions, hooks, MCP and subagent features.

---

## 3. Install and run Free Claude Code (FCC)

Official project: https://github.com/Alishahryar1/free-claude-code

Linux/macOS:

```bash
curl -fsSL "https://raw.githubusercontent.com/Alishahryar1/free-claude-code/main/scripts/install.sh" | sh
```

Start the proxy:

```bash
fcc-server
```

Typical Admin UI:

```text
http://127.0.0.1:8082/admin
```

Launch Claude Code through FCC:

```bash
fcc-claude
```

Explicit route:

```bash
fcc-claude --model "nvidia_nim/z-ai/glm-5.2"
```

### A useful FCC detail

Current FCC launchers set the gateway environment for you each time they start. Upstream FCC also sets a `CLAUDE_CODE_AUTO_COMPACT_WINDOW` around **190k tokens** for its Claude Code launcher. That is useful because the proxy/provider may expose a model with a context window very different from Anthropic's native tiers.

Treat this as **FCC behavior**, not a universal Claude Code default.

---

## 4. The NVIDIA model map we recommend

Start from this conservative map and change only after real completion tests:

| Claude tier seen by the client | FCC route | Why |
|---|---|---|
| Default | `nvidia_nim/z-ai/glm-5.2` | Long-horizon coding, reasoning, agentic work |
| Opus override | `nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b` | Heavy review / independent reasoning |
| Sonnet override | `nvidia_nim/z-ai/glm-5.2` | Strong general coding route |
| Haiku override | `nvidia_nim/nvidia/nemotron-3-super-120b-a12b` | Faster high-quality fallback |

Why the map is useful: Claude Code still thinks in client tiers, while FCC translates those tiers to provider-prefixed models.

### Never trust an old screenshot as a current model map

Models disappear. Provider IDs change. A route that once returned 200 can later return quota, 404, 410, compatibility or cooldown errors.

Always refresh FCC models and make a tiny completion before starting a large mission.

---

# Claude Code power-user techniques

## 5. `CLAUDE.md`: put stable project rules where every session can see them

Claude Code loads `CLAUDE.md` instructions as project context. Use it for rules you would otherwise repeat in every session:

- canonical repository/worktree;
- build/test commands;
- architecture invariants;
- forbidden files or directories;
- coding conventions;
- proof required before calling work complete.

A good `CLAUDE.md` is **short and operational**, not a 100-page handbook.

Example: `examples/claude/CLAUDE.md.example`.

### Useful scoping pattern

```text
repo/CLAUDE.md                 shared project rules
repo/CLAUDE.local.md           your local/private overrides
repo/.claude/rules/*.md        focused/path-specific rules
```

Use `CLAUDE.local.md` for machine-specific or personal instructions you do not want committed.

### Rule of thumb

If Claude makes the same avoidable mistake twice, either:

1. improve the relevant `CLAUDE.md` rule;
2. create a scoped rule/skill; or
3. automate the check with a hook/test instead of relying on memory.

---

## 6. Auto memory: useful, but inspect it

Claude Code has machine-local auto memory for repository learnings. It can retain build commands, debugging lessons and preferences across sessions.

Useful commands:

```text
/memory
```

Use auto memory for things learned during work; keep non-negotiable project rules in `CLAUDE.md`.

### Why this matters with FCC

FCC changes the **model/provider**, not the client-side project memory feature. A GLM/Nemotron-backed Claude Code session can still benefit from Claude Code's project instructions and memory workflow.

### Hygiene

Periodically review memory. Do not let obsolete ports, branch names, commands or provider IDs live forever just because an agent once discovered them.

---

## 7. Keep context clean: delegate noisy work

Claude Code subagents run in separate context windows and return summaries to the main session. This is one of the most valuable context-management techniques for large repositories.

Good tasks to delegate:

- search through large logs;
- scan many test failures;
- inspect a subsystem;
- code review;
- docs/API research;
- security review;
- compare two candidate implementations.

### Explicit invocation

You can name or @-mention a configured subagent. You can also start a whole session with a custom agent:

```bash
claude --agent code-reviewer
```

Subagents should be scoped. They cannot recursively spawn more subagents, so keep orchestration in the parent session.

### Practical pattern

```text
Main session: owns goal and decisions
  ├─ explorer: repository search
  ├─ test-runner: noisy test output
  ├─ reviewer: read-only review
  └─ security-reviewer: focused risk pass
```

This mirrors the reason we like Sisyphus/Oracle/Explore in OpenCode: **separate discovery, implementation and judgment instead of making one context do everything**.

---

## 8. Parallel work without file collisions: worktrees

Claude Code can create isolated git worktrees:

```bash
claude --worktree feature-auth
claude --worktree bugfix-123
```

This is ideal when two sessions might edit overlapping files.

Add Claude-created worktrees to `.gitignore` if you use the default project-local location:

```gitignore
.claude/worktrees/
```

### Important `.env` trick

A fresh worktree does not automatically contain gitignored `.env` files. Claude Code supports `.worktreeinclude` for gitignored files you intentionally want copied into new worktrees.

Example:

```text
.env.local
```

Use this carefully: convenience is not a reason to replicate secrets into unnecessary worktrees.

### High-value parallel pattern

```text
Terminal 1: feature implementation worktree
Terminal 2: independent audit/review worktree
Terminal 3: reproduction/benchmark worktree
```

Then compare diffs before merging anything.

---

## 9. Permissions: allow boring-safe operations, keep dangerous operations gated

Claude Code supports allow / ask / deny permission rules.

Good candidates for allow rules in a development repository:

```text
git status
git diff
git log
read-only test discovery
safe lint/typecheck commands
```

Keep destructive or publication actions gated:

```text
rm -rf
git push
force push
release/publish commands
cloud deletion
secret rotation
production DB writes
```

Use:

```text
/permissions
```

to inspect the effective rules.

### Key principle

Do not solve approval fatigue by globally auto-approving everything. Use narrowly-scoped allow rules plus sandboxing.

---

## 10. Sandbox Bash on Linux/WSL2

Claude Code supports OS-level sandboxing for Bash on Linux, macOS and WSL2.

Open:

```text
/sandbox
```

A project settings example is included at `examples/claude/settings.json.example`.

The most important idea is defense in depth:

```text
permission rules -> what Claude is allowed to attempt
sandbox          -> what subprocesses can actually reach
```

For sensitive repositories, consider denying reads of credential locations and `.env` files and keeping the network allowlist narrow.

Do not copy a restrictive example blindly if your build/test tooling genuinely needs Docker sockets, package registries, local services or cloud CLIs. Add exceptions intentionally.

---

## 11. Hooks: turn “please remember to…” into deterministic automation

Hooks run at specific Claude Code lifecycle events. This is how you enforce actions that should not depend on model judgment.

High-value uses:

- run formatter after edits;
- prevent edits to generated files;
- run a targeted test after a critical file changes;
- validate a command before execution;
- inject current branch/issue context at session start;
- notify when a long mission finishes.

Inspect hooks with:

```text
/hooks
```

### Our rule

If a safety/quality action must **always** happen, prefer a hook, CI rule or test over prose in a prompt.

Prompts are advice. Hooks/tests are enforcement.

---

## 12. MCP: powerful, but every server has a context and trust cost

Claude Code can connect remote HTTP and local stdio MCP servers.

Example remote install pattern:

```bash
claude mcp add --transport http NAME https://example.com/mcp
```

Use MCP for data you would otherwise repeatedly copy into the chat: issue trackers, docs systems, monitoring, databases or internal tools.

### Do not enable everything

An MCP server can add:

- tool schemas to context;
- more network reach;
- more credentials;
- another prompt-injection/supply-chain surface.

The same principle we use in OpenCode applies here: **progressive disclosure**. Enable only the MCPs needed for the current mission.

---

## 13. Plugins, skills and custom agents

Claude Code plugins can bundle:

- skills;
- agents;
- hooks;
- MCP servers;
- LSP servers;
- monitors.

The official Anthropic marketplace is available from `/plugin`.

Use project-local `.claude/` customization for one repository. Use a plugin when the capability should be versioned and reused across projects/teams.

### Security rule

Treat third-party plugins/skills as code. Read manifests, skills, hooks and scripts before granting them access to a private repository or secrets.

This is exactly why NVIDIA SkillSpector is part of the broader stack.

---

## 14. Headless / CI mode

Claude Code supports non-interactive execution with `-p`:

```bash
claude -p "Explain the auth module"
```

Useful options include:

```text
--continue
--allowedTools
--output-format
```

For startup-sensitive automation, Claude Code also has `--bare`, which skips discovery of hooks, skills, plugins, MCPs, auto memory and `CLAUDE.md`.

### Critical distinction

Use `--bare` only when you intentionally want that clean/minimal environment. It also removes exactly the project intelligence and guardrails you may depend on interactively.

### Good CI use

Ask for structured/read-only analysis, not autonomous production deployment.

Example pattern:

```bash
claude -p "Review the current diff for correctness and output JSON" \
  --output-format json
```

Pin tool permissions. Never use broad auto-approval in an untrusted pull request context.

---

# FCC-specific tricks that saved time

## 15. Use the native model picker when FCC gateway discovery is enabled

FCC can expose its gateway model catalog to Claude Code. Current FCC documentation uses:

```text
CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

`fcc-claude` handles the environment for normal terminal use. If wiring the Claude Code VS Code extension manually, make sure the extension receives the same base URL, auth token and model-discovery environment.

This makes the proxy feel much less like a hidden compatibility shim and more like a real multi-provider gateway.

---

## 16. VS Code + FCC manual environment

FCC's current documentation shows a pattern like this in VS Code user settings:

```json
"claudeCode.disableLoginPrompt": true,
"claudeCode.environmentVariables": [
  { "name": "ANTHROPIC_BASE_URL", "value": "http://localhost:8082" },
  { "name": "ANTHROPIC_AUTH_TOKEN", "value": "YOUR_FCC_LOCAL_TOKEN" },
  { "name": "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY", "value": "1" },
  { "name": "CLAUDE_CODE_AUTO_COMPACT_WINDOW", "value": "190000" }
]
```

Use your own configured port/token. Do not publish the real token.

FCC upstream also documents optional environment flags that suppress updater/feedback/error-reporting behavior in proxy-driven editor use. Treat those as **FCC integration choices**, not mandatory Claude Code settings.

---

## 17. Do not confuse provider context with client compaction

NVIDIA GLM-5.2 and Nemotron models may advertise very large context windows, but the Claude Code/FCC client path can intentionally compact earlier.

That is not necessarily a bug.

Large-context models still benefit because:

- pre-compaction tasks can be larger;
- subagent work can use independent windows;
- repository/memory instructions remain structured;
- you avoid pushing every session to the absolute model limit.

A 1M-token model is not an invitation to dump a monorepo into one conversation.

---

## 18. Separate client features from model capabilities

Claude Code features such as worktrees, permissions, hooks and memory are largely client-side. Model-dependent behavior includes:

- quality of tool-use decisions;
- reasoning format compatibility;
- vision/image support;
- structured outputs;
- latency;
- long-context quality;
- provider-specific tool semantics.

When swapping Claude-native models for GLM/Nemotron through FCC, test the workflows you care about instead of assuming every model behaves identically.

---

## 19. Stable FCC runtime starting point

Our lab used:

| Setting | Starting value |
|---|---:|
| Provider rate limit | 3 |
| Provider rate window | 5 |
| Provider max concurrency | 3 |
| HTTP read timeout | 900 s |
| HTTP write timeout | 120 s |
| HTTP connect timeout | 30 s |
| Server port | 8082 |

These are **lab values, not universal optimums**. If a provider documents stricter limits, follow the provider.

For single-machine use bind to:

```text
127.0.0.1
```

not `0.0.0.0`.

---

## 20. A Claude Code audit workflow that works well through FCC

```text
1. Start fcc-server
2. Validate NVIDIA provider
3. Launch fcc-claude with GLM-5.2
4. Read CLAUDE.md + git status/diff
5. Delegate noisy repository exploration to a subagent
6. Reproduce the bug before editing
7. Make the smallest fix
8. Run targeted tests
9. Delegate an independent review
10. Run the full quality gate
11. Inspect git diff manually
12. Human approves commit/push
```

For high-risk work, use Nemotron Ultra as the independent reviewer rather than asking the same GLM session to grade itself.

---

## 21. Fast troubleshooting matrix

| Symptom | Most likely layer | First check |
|---|---|---|
| `fcc-server` not reachable | FCC process | `ss -ltnp | grep 8082` |
| NVIDIA validate fails | Provider/key | direct NVIDIA curl |
| Model appears but prompt fails | Provider/model | tiny completion outside Claude Code |
| Claude Code asks for login unexpectedly | launcher/env | confirm you started with `fcc-claude` or editor env |
| Model picker lacks FCC models | gateway discovery | verify model discovery env + FCC `/v1/models` |
| Long task dies | timeout / provider / client compaction | FCC logs, provider logs, context behavior |
| Tool use is poor on one model | model compatibility | compare with GLM/Nemotron route |
| Two agents edit same files | workflow isolation | use worktrees |
| Agent keeps forgetting project rule | instruction scope | `CLAUDE.md` / `.claude/rules/` / hook |
| Too many permission prompts | permissions/sandbox | narrow allow rules + `/sandbox` |
| Too much context overhead | MCP/plugins/subagents | disable unused servers, delegate noisy tasks |

---

## 22. What we would *not* do

- Do not bind FCC publicly unless you intentionally secure it.
- Do not commit FCC auth tokens or provider keys.
- Do not assume a model is healthy because the dropdown lists it.
- Do not use `--bare` and then wonder why project instructions/hooks disappeared.
- Do not auto-approve destructive shell commands to save clicks.
- Do not let three parallel sessions edit the same checkout.
- Do not put every learned fact into `CLAUDE.md`; keep it concise.
- Do not turn on every MCP/plugin at startup.
- Do not call a free/trial endpoint private without reading its data terms.
- Do not push/release merely because an agent says “tests look good.” Verify evidence yourself.

---

## 23. Why we still use OpenCode as the primary platform

Claude Code + FCC is an excellent compatibility path, but this repository keeps **OpenCode → OmniRoute** as the center because:

- OmniRoute already owns provider routing/fallback;
- OpenCode works naturally with OpenAI-compatible providers;
- Oh My OpenAgent gives us explicit multi-agent orchestration;
- the Free catalog gives cheap discovery/exploration routes;
- GLM-5.2/Nemotron can still come through NVIDIA;
- Claude Code remains available when we specifically want its client workflow, worktrees, hooks, subagents, memory, IDE integration or plugin ecosystem.

The point is not to declare one client “best.” The point is to keep **client, orchestration, gateway and model provider independent**.

---

## Primary upstream references

- Claude Code: https://github.com/anthropics/claude-code
- Claude Code docs: https://code.claude.com/docs/en/overview
- Memory / CLAUDE.md: https://code.claude.com/docs/en/memory
- Permissions: https://code.claude.com/docs/en/permissions
- Sandboxing: https://code.claude.com/docs/en/sandboxing
- Hooks: https://code.claude.com/docs/en/hooks-guide
- MCP: https://code.claude.com/docs/en/mcp
- Subagents: https://code.claude.com/docs/en/sub-agents
- Parallel agents: https://code.claude.com/docs/en/agents
- Worktrees: https://code.claude.com/docs/en/worktrees
- Headless/Agent SDK CLI: https://code.claude.com/docs/en/headless
- Plugins: https://code.claude.com/docs/en/plugins
- FCC: https://github.com/Alishahryar1/free-claude-code
