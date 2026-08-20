# Hermes Agent — Optional Operator / Audit Layer

> Lab update: **2026-08-20**
>
> Status in our Linux/WSL stack: **installed, configured and exercised as a separate agent/operator layer**. Hermes does not replace OpenCode, OmniRoute or the DeepSeek Harness Agent OS; it adds another independent way to inspect a repository, use tools and delegate analysis.

## Where Hermes fits

```text
Developer
  ├─ OpenCode + OMO/Sisyphus  → primary interactive implementation
  ├─ Gemini / other clients   → independent implementation or review
  └─ Hermes Agent             → independent audit/operator path

OpenCode / compatible clients
  ↓
OmniRoute                     → model routing + fallbacks

DeepSeek Harness / Agent OS   → monitoring + scheduled audits + findings + missions
Hindsight                     → governed cross-agent memory
Graphify + Ponytail           → code graph + small-diff/YAGNI discipline
```

The useful property is **independence**: Hermes can inspect the same repository without forcing every job through the same OpenCode session or the same orchestration context.

## What we validated on 2026-08-20

The lab configuration was exercised with a repository-level, read-only audit mission that required Hermes to:

1. identify the five most important technical problems;
2. use terminal, web research and memory when useful;
3. delegate analysis to sub-agents;
4. avoid modifying files;
5. provide evidence with file paths and line references;
6. separate real bugs from noise;
7. prioritize findings by launch impact.

That mission format is intentionally stricter than a "say hello" smoke test. The objective is to prove that the operator can navigate a real codebase, use tools and return auditable evidence without silently editing the repository.

## Browser/tooling validation

The Hermes environment also validated the `agent-browser` dependency using the already-tested release:

```bash
npm install -g agent-browser@0.27.0
agent-browser --version
```

Then the Hermes Python environment was used to re-check browser, browser-vision and CDP requirements before running `hermes doctor`.

Example diagnostic pattern:

```bash
H="$HOME/.hermes/hermes-agent"

"$H/venv/bin/python" - <<'PY'
import shutil
print("agent-browser =", shutil.which("agent-browser"))

from tools.browser_tool import (
    check_browser_requirements,
    check_browser_vision_requirements,
)

print("browser =", check_browser_requirements())
print("vision  =", check_browser_vision_requirements())

from tools.browser_cdp_tool import _browser_cdp_check
print("cdp     =", _browser_cdp_check())
PY

hermes doctor
```

Do not blindly pin `0.27.0` forever. It is documented here because it was the version validated in this lab on the date above; re-test against current Hermes requirements before upgrading.

## Operational rule

Hermes is an **additional operator**, not a reason to duplicate every task across every agent.

A practical split is:

```text
OpenCode + Sisyphus   → implementation / long coding missions
Harness Agent OS      → continuous control-plane duties and scheduled audits
Hermes                → independent read-only audit / tool-using second path
Hindsight             → shared governed memory
Graphify / Serena     → code understanding
Ponytail              → smallest-safe-diff discipline
```

For high-risk work, independence is more valuable than simply running more agents from the same model/provider.

## Health-check philosophy

After the 2026-08-20 hardening pass, our operational direction is to treat the AI tooling itself as production infrastructure. Health checks should distinguish at least:

- process/port availability;
- real model completion success;
- browser/tool requirements;
- Graphify/Ponytail availability;
- OpenCode session isolation;
- Harness/Agent OS health;
- memory/Hindsight health;
- provider quota or rate-limit failures versus genuinely dead routes.

A model appearing in a catalog, a process merely listening on a port, or an agent CLI starting successfully is **not** by itself enough proof that the complete workflow works.

## Caveats

- Hermes is optional; the core stack remains usable without it.
- Keep repository audits read-only unless the mission explicitly authorizes edits.
- Do not expose local agent dashboards/services publicly without authentication and network hardening.
- Browser and CDP dependencies are version-sensitive; run the doctor/requirements checks after upgrades.
- Parallel agents can share provider quotas. More agent processes do not automatically mean more provider capacity.

## Canonical read-only acceptance mission

```text
Perform a read-only audit of this project.

Objectives:
1. identify the 5 most important technical problems;
2. use terminal, web search and memory when useful;
3. delegate analysis to sub-agents;
4. do not modify files;
5. provide evidence with paths and lines;
6. separate real bugs from noise;
7. prioritize by launch impact.

Do not commit.
Do not modify code.
```

This is the acceptance test we use before treating a Hermes configuration as ready for real repository work.
