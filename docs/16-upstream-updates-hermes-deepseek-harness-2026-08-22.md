# Upstream update radar — Hermes Agent + DeepSeek Harness

> Checked: **2026-08-22**
>
> Scope: upstream changes that are relevant to the validated StockNewsBR / AI coding stack. This is a **radar / adoption note**, not an instruction to blindly upgrade production. The existing rule remains: test in LAB first, keep rollback paths, pin immutable versions/SHAs where possible, and never auto-install ecosystem plugins.

## Executive summary

There are meaningful upstream changes worth tracking.

- **Hermes Agent** has advanced rapidly beyond the version documented in the August 20 operator-layer note. The latest stable GitHub release checked on 2026-08-22 is **v0.20.5 (`v2026.8.19`)**.
- **DeepSeek Harness** is still explicitly a **developer preview** and warns that compatibility-breaking changes are expected. The project currently does not publish normal GitHub Releases, so npm/package/version checks and source inspection matter more than the GitHub Releases tab.
- Our existing production philosophy remains correct: **do not chase upstream `main`**. For Harness especially, keep the tested `0.1.0-rc.7` line pinned until a LAB validation proves an upgrade is safer/better.

---

## Hermes Agent — relevant upstream delta

### Latest stable release checked

**Hermes Agent v0.20.5 (`v2026.8.19`)** — released on GitHub on 2026-08-21, release date 2026-08-19.

Important additions/fixes in the v0.20.x line that are relevant to this stack include:

- **OpenCode-free zero-auth provider** support, useful for experimentation with free-model routing without adding another paid dependency.
- **`hermes worktree list/prune`**, useful for repository/operator workflows and cleanup.
- **`hermes update` receipts and `--plan` verification**, useful for making upgrades more auditable instead of treating self-update as a black box.
- **persistent cron memory + per-job reasoning effort**, relevant to scheduled audit/operator workflows.
- **runtime stall guards / execution-discipline hardening**, useful for long-running autonomous jobs.
- **multi-question clarify**, improving human-in-the-loop operator interactions.
- **keyless web tier with free-vendor rotation**, potentially useful for fresh installs and low-friction research, but should still be treated as an external service path with normal privacy/reliability cautions.
- Earlier v0.20.x patches also added **MCP 2.x / stateless protocol support**, **Bot Mode**, **plugin-install security scanning**, **cron self-heal**, **SessionDB contention fixes**, **kanban/worktree improvements**, and multiple session-handoff/reliability fixes.

### Recommendation for our stack

**Status: TEST IN LAB, not blind production upgrade.**

The Hermes operator layer is already useful in our architecture. The strongest reasons to test v0.20.5 are:

1. worktree lifecycle commands;
2. update receipts / plan verification;
3. cron persistence improvements;
4. runtime-stall hardening;
5. plugin-install security scanning from the v0.20.x wave.

Suggested acceptance sequence after upgrading in LAB:

```text
hermes update --check / inspect available update
        ↓
upgrade LAB Hermes only
        ↓
hermes doctor
        ↓
browser / browser-vision / CDP checks
        ↓
canonical read-only repository audit mission
        ↓
subagent delegation check
        ↓
cron + memory + gateway smoke checks
        ↓
only then consider production promotion
```

Do not treat a successful CLI launch as enough evidence.

---

## DeepSeek Harness — current upstream state

### Still developer preview

DeepSeek continues to describe Harness (`dsh`) as a **developer preview** and explicitly warns that compatibility-breaking changes will happen.

The official repository currently does **not** publish ordinary GitHub Releases. That makes this rule important:

```text
GitHub Releases tab == not a reliable update source for Harness
```

Use the npm package/version, source history, changelog/package metadata, and real regression testing instead.

### `npx` cache/update visibility caveat

A recent upstream discussion points out that:

```bash
npx @deepseek-ai/dsh web
```

can run a cached/stale package without clearly telling the operator that a newer package exists. Global installs also do not self-upgrade.

**Operational consequence for our Agent OS:** record the actual `dsh --version` / package version in health diagnostics and Plugin Radar output instead of assuming that invoking `npx` means "latest".

### rc.7 Windows PTY regression report

A recent upstream report identifies a Windows-specific regression in **`0.1.0-rc.7`** affecting the persistent PTY shell. The report traces the behavior to the `node-pty` move from `^1.1.0` to `1.2.0-beta.15`: on Windows the PTY can return PID 0 and terminate on first write, while Linux/macOS pass the same smoke test.

Our current production use is primarily **WSL/Linux**, so this does not automatically invalidate the validated rc.7 Agent OS. It does mean that we should **not claim rc.7 is universally safe on native Windows** without a separate Windows PTY test.

Add this distinction to future validation reports:

```text
Harness web/control plane on WSL/Linux   → validated in our lab
native Windows persistent PTY on rc.7    → upstream regression reported; re-test before relying on it
```

### Plugin/UI ecosystem signals worth watching

Recent ecosystem discussions also surfaced useful ideas, but they should remain under our existing Plugin Gate / LAB policy:

- workspace file tree + in-app preview for the Web UI;
- GitHub intelligence/reporting plugins;
- observability plugins;
- large community plugin registries / subscription tools.

These are **radar candidates**, not production dependencies. Our current policy remains superior to one-click auto-install:

```text
discover
  ↓
source/security review
  ↓
LAB profile
  ↓
compatibility + regression tests
  ↓
immutable SHA pin
  ↓
production only if justified
```

---

## Changes to our operational policy from this radar

### 1. Keep Harness production pinned

No automatic bump from the validated `0.1.0-rc.7` line.

Before any Harness upgrade:

- capture current package/source version;
- clone/test in LAB;
- run Agent OS 76/76 suite;
- run original 43/43 regression suite;
- verify all production plugin SHAs and drift state;
- verify watch scheduler + Plugin Radar;
- verify Windows notifier seam;
- verify OmniRoute semantic audits;
- verify no unintended source mutation;
- explicitly test native Windows PTY if that path will be used.

### 2. Add explicit Harness version freshness to health checks

Health should distinguish:

```text
process alive
package/version known
upstream delta known
upgrade approved? yes/no
runtime smoke passed
```

This avoids confusing "service is running" with "service is current and healthy".

### 3. Hermes can move faster than Harness

Hermes now has tagged stable releases and a first-party update command, so it can be evaluated on a faster cadence than Harness — **but still only through LAB acceptance testing**.

### 4. Keep auto-install = NEVER

Nothing discovered in this update changes the Plugin Radar safety policy. Community growth makes review/pinning more important, not less.

---

## Current adoption verdict

| Upstream item | Verdict | Why |
|---|---|---|
| Hermes v0.20.5 | 🧪 **TEST IN LAB** | meaningful reliability/operator features; tagged stable release |
| Hermes worktree/update-receipt features | ✅ **HIGH-VALUE CANDIDATE** | directly useful to our repository/operator workflow |
| Hermes cron memory/stall guards | ✅ **HIGH-VALUE CANDIDATE** | relevant to autonomous/scheduled operation |
| Harness newer moving source | ⛔ **DO NOT TRACK `main` IN PROD** | developer preview + breaking-change warning |
| Harness rc.7 on WSL/Linux | ✅ **KEEP CURRENT VALIDATED PIN** | already production-tested in our stack |
| Harness rc.7 native Windows PTY | ⚠️ **RE-TEST / CAUTION** | upstream persistent-PTY regression report |
| Community Harness plugins | 🔎 **PLUGIN RADAR / LAB ONLY** | useful ideas, but supply-chain and compatibility risk |
| Automatic plugin installation | ❌ **NEVER** | unchanged policy |

---

## Upstream references checked

- NousResearch/hermes-agent — GitHub Releases, latest checked: **v0.20.5 (`v2026.8.19`)**.
- deepseek-ai/deepseek-harness — official repository/README: developer-preview and breaking-change warning.
- DeepSeek Harness Discussions — update-notification / stale `npx` cache proposal.
- DeepSeek Harness Discussions — rc.7 native-Windows persistent PTY regression report.
- DeepSeek Harness community discussions — workspace file preview, observability, GitHub intelligence, and plugin-marketplace ideas.

The intent of this document is to preserve a dated, evidence-oriented upstream snapshot so future upgrades can be compared against what was actually known on **2026-08-22**.
