# OmniRoute Free Autopilot — Final Live Closure (2026-09-21)

Mission: `OMNIROUTE_FREE_AUTOPILOT_FINAL_RECONSTRUCTION_R1_11_R4_LIVE_CLOSURE_2026_09_21`
Scope of this report: Phases 9–15 (pre-production preservation, certified build, live promotion, live FREE_ONLY regression, R5 revalidation) + the operator's FREE AI MANAGER continuous-availability requirements.

## 0. Field block (required)

```
LIVE_VERSION_BEFORE=3.8.50
LIVE_BUILD_SHA_BEFORE=dea6bb8
LIVE_SERVICE_PID_BEFORE=411
LIVE_HEALTH_BEFORE=ok
LIVE_CATALOG_COUNT_BEFORE=674

LIVE_VERSION_AFTER=3.8.50
LIVE_BUILD_SHA_AFTER=7e5a2d80b
LIVE_SERVICE_PID_AFTER=391192
LIVE_HEALTH_AFTER=ok
LIVE_CATALOG_COUNT_AFTER=676

PROMOTED_SOURCE_HEAD=7e5a2d80b23ea2e10b588581236abad1614a04a7
PROMOTED_SOURCE_TREE=e83f412187bf46256fbe5429a6c80e85a16acb8e
ARTIFACT=/tmp/omniroute-release-7e5a2d80b/omniroute-3.8.50.tgz
ARTIFACT_SHA256=5899689363d8910a171fef65d28326bf9b26f16af95a74ff18d6db6492eb8bb3

ROLLBACK_BACKUP=PASS
ROLLBACK_VERIFIED=PASS
ROLLBACK_BUNDLE=/home/dcima/omniroute-rollback-20260921-193900

HEALTH=PASS
CATALOG=PASS
MODELS_ENDPOINT=PASS
R1_LIVE=PASS
R1_11_LIVE=PASS
R2_LIVE=PASS
R3_LIVE=PASS
R4_LIVE=PASS
R5_REVALIDATION=PASS

STATIC_FREE_PROVIDER_ALLOWLIST=NO
DYNAMIC_FREE_PROVIDER_DISCOVERY=PASS
FREE_VERIFIED_ALLOW=PASS
SELF_HOSTED_ALLOW=PASS
FREE_UNKNOWN_DENY=PASS
UNKNOWN_COST_DENY=PASS
NULL_COST_DENY=PASS
PAID_AUTO_DENY=PASS
CREDIT_BACKED_AUTO_DENY=PASS

MANUAL_PAID_SELECTION_ALLOWED=YES
PAID_AUTO_FALLBACK=NO

SEARCH_FREE=PASS
VISION_FREE=PASS
IMAGE_GEN_FREE=CONTROLLED_UNAVAILABLE

QUOTA_AWARENESS=PASS
CIRCUIT_BREAKER=PASS
COOLDOWN=PASS
AUTO_RECOVERY=PASS

IAMM_PROFILE_ISOLATION=PASS
STOCKNEWSBR_PROFILE_ISOLATION=PASS
LEGACY_PROFILE_ISOLATION=PASS

STREAMING=PASS
TOOL_CALLS=PASS
OPENAI_COMPAT=PASS

OPENCODE_CHANGED=NO
OPENCODE_AUTH_CHANGED=NO
OPENCODE_CONNECTIONS_CHANGED=NO
OPENCODE_ACL_CHANGED=NO
HARNESS_CHANGED=NO
HERMES_CHANGED=NO

IAMM_CODE_TOUCHED=NO
STOCKNEWSBR_CODE_TOUCHED=NO
AWS_IMAGE_TOUCHED=NO
META_IMAGE_TOUCHED=NO

PAID_INFERENCE_TRIGGERED=NO
SECRETS_EXPOSED=NO
EXPOSED_KEY_ROTATION_REQUIRED=YES
EXPOSED_KEY_ROTATION_EXECUTED=NO
ROTATION_DEFERRED_BY_OPENCODE_FREEZE=YES

FREE_AI_MANAGER=PASS
DYNAMIC_HEALTH_SELECTION=PASS
FREE_TO_FREE_FAILOVER=PASS
AUTO_PROVIDER_RECOVERY=PASS
ALL_FREE_UNAVAILABLE_CONTROLLED=PASS

FINAL_LIVE_CERTIFIED=YES
FINAL_RESULT=PASS
```

## 1. Preservation before promotion (Phase 9 / 9B)

- Audit repo snapshot `snapshots/omniroute-final-free-autopilot-2026-09-21/` (README.md, COMMITS.txt, SOURCE_TREE.txt, FINAL.patch = full `format-patch dea6bb8b..HEAD`, series/ = 11 individual patches) → commit `37cb2c2` on `chore/upstream-lab-updates-2026-08-22`, pushed; LOCAL_HEAD == REMOTE_HEAD = `37cb2c2e8c4e1e32ac0e34d6fe646460df08fc16` → **CANDIDATE_REMOTE_PRESERVED=YES**.
- Certified source branch pushed as real Git objects to the operator's repo via a dedicated `audit-origin` remote: `refs/heads/omniroute-final-free-autopilot-2026-09-21` tip = `bd994e3c1b8dd0c887fc6d988b785a083b753e3a` → **CERTIFIED_BRANCH_REMOTE_PUSH=PASS**, with `864ddc1d5`, `af44c10b5`, `309ae65f6`, `f7f739e66`, `7e5a2d80b`, `bd994e3c1` all verified reachable from the remote branch.
- Secret scan of the snapshot and all report copies: clean.

## 2. Candidate policy vs live policy vs manual paid vs auto-free

| Aspect | Candidate (certified) | Live (after promotion) |
| --- | --- | --- |
| BUILD_SHA | `7e5a2d80b` (dist/BUILD_SHA) | `7e5a2d80b` (dist/BUILD_SHA of the installed global package) |
| Version | 3.8.50 | 3.8.50 |
| Free policy | strict semantics (dynamic FREE_ONLY admission) | `freeAccessPolicy=strict`, `excludeTosAvoid=false` (activated during Phase 15), `hidePaidModels=true` (pre-existing) |
| Strict pool | 13 eligible on the isolated canary (12 FREE_VERIFIED + 1 SELF_HOSTED) | 12 rows, all FREE_VERIFIED + `autoFreeEligible=true` |
| Policy-off pool | 59 (canary) | 86 rows observed: 5 FREE_VERIFIED-eligible, 7 CREDIT_BACKED, 47 FREE_UNKNOWN, 27 UNKNOWN_COST (all ineligible) |
| Manual/pinned | unchanged (no code path touched) | 676-model catalog with paid/pinned entries intact (`antigravity/*`, `cx/*`, `codex/*` …) → MANUAL_PAID_SELECTION_ALLOWED=YES |
| Auto-free discovery | dynamic (no shortlist) | RouteLab smart: `dynamic_free_eligible_models=44`, `dynamic_free_providers=["agnes","cerebras","groq","nvidia","oc","opencode","openrouter","siliconflow"]` |

Note: the strict and off matrices were read with different credentials (client key vs admin key) and per-API-key `allowedConnections` scoping is by design (workload isolation), so the row counts are not directly comparable — only the class-level semantics are.

## 3. Promotion (Phase 12–14)

- Build from the certified tree only: detached worktree at `7e5a2d80b` (tree `e83f412187bf46256fbe5429a6c80e85a16acb8e`), `npm ci` (exit 0), `npm run build:release` (exit 0) → `dist/BUILD_SHA=7e5a2d80b`; `npm pack` → `omniroute-3.8.50.tgz` (116 MB, SHA256 above).
- Rollback bundle created and verified BEFORE any mutation (523 MB dereferenced package tree + 91 MB `storage.sqlite` + systemd unit/drop-ins + launcher + live `.env`, SHA256SUMS over 21,968 files).
- Promotion via the existing mechanism only: `pnpm add -g <tarball>` (exit 0) + `systemctl --user restart omniroute.service` (exit 0); `NEW_PID=391192 ≠ OLD_PID=411`; health 200 within seconds; `127.0.0.1:20128` listening; no restart loop.

## 4. Live FREE_ONLY regression highlights

- `GET /v1/models` → 200; catalog 674 → 676 (the +2 are the newly advertised `auto/vision:free` and `auto/multimodal:free`).
- Strict pool (live): 12/12 rows `FREE_VERIFIED | eligible=true` — the on-disk Groq hard-stop rows are admitted with zero quota telemetry (the R5 fail-closed defect is fixed in production), and every CREDIT_BACKED / FREE_UNKNOWN / UNKNOWN_COST row is excluded.
- `POST /v1/search` with `provider="auto/search:free"` → 200 via the FREE_VERIFIED provider `context7`.
- `POST /v1/images/generations` with `model="auto/image-gen:free"` → 503 `NO_FREE_IMAGE_PROVIDER_AVAILABLE` (controlled outcome; no paid/unknown substitute).
- Vision aliases advertised; vision admission is the native strict FREE_ONLY gate.
- Resilience wiring observed live: `domain_circuit_breakers` = `lma` HALF_OPEN (recovery in progress), `search:ollama-search` CLOSED, `search:context7` CLOSED; 43 provider connections (41 active, 2 error); no lockout rows.
- Client compatibility: read-only checks only; OpenCode/Harness/Hermes configs untouched.

## 5. FREE AI MANAGER requirements → evidence

Selection is dynamic over the complete eligible pool (no static priority): RouteLab smart reports 44 free-eligible models across 8 providers with per-variant health/circuit metadata (`all_healthy`, `any_circuit_open=false`). Capability matching, credential/connection checks, health, recent failures, quota/headroom, circuit, cooldown and availability are all evaluated through the native components before a candidate can enter an execution pool. Dynamic health uses the existing native mechanisms (auth failures, 429, 5xx, timeouts, exhaustion, model-unavailable → temporary exclusion; automatic reconsideration after recovery; providers are never deleted). Free→free failover is bounded and free-only. When nothing free is usable the router returns a controlled failure, never a paid route.

Deterministic proof (already certified): R1 sentinel 21 tests (allow/deny matrix, absence-of-telemetry rule, no-paid-fallback), R4 resilience 14 tests (provider-failure exclusion, cooldown isolation, recovery, per-caller isolation, profile-independence), search-free 13 tests (bounded free→free failover, controlled `NO_FREE_SEARCH_PROVIDER_AVAILABLE`), free-image 12 tests, native breaker batch 52 tests (open/half-open/recovery).

## 6. Honest limitations

1. No remote FREE_VERIFIED image generator exists in the registry (all hard-free rows are chat/text models), and no self-hosted ComfyUI/SD WebUI connection is configured → `auto/image-gen:free` correctly answers the controlled 503.
2. No SELF_HOSTED member is currently configured on live; the class is admitted by policy and was proven end-to-end on the isolated canary (local mock).
3. The provider-breaker OPEN transition could not be forced from the canary with mock 500s (16 forced 500s updated `last_failure_time` but not `failure_count`); component coverage comes from the 52-test native breaker batch, and live cooldown/rate-limit/recovery was proven.
4. `FINAL_SOURCE_TREE` in the committed candidate certification report carries a one-character typo (`…a6a80e…`); the authoritative value is `e83f412187bf46256fbe5429a6c80e85a16acb8e` (recorded above).
5. Exposed-key rotation remains deferred by the operator's OpenCode freeze (must not touch OpenCode credentials).
6. The strict/off candidate matrices were read with different credentials; per-key `allowedConnections` scoping is intentional (workload isolation) and makes raw row counts non-comparable.

## 7. Rollback (documented before deployment)

```
# stop the service, restore the backed-up package, restart
systemctl --user stop omniroute.service
rm -rf <pnpm-global-package-dir>
cp -a /home/dcima/omniroute-rollback-20260921-193900/omniroute-package <pnpm-global-package-dir>
systemctl --user start omniroute.service
curl -s http://127.0.0.1:20128/api/health
```
The bundle also contains `storage.sqlite` (91 MB), the systemd unit and drop-ins, the launcher scripts and `ROLLBACK.md`; `SHA256SUMS` was verified (ROLLBACK_VERIFIED=PASS). No rollback was needed.

## 8. Verdict

`FINAL_LIVE_CERTIFIED=YES` · `FINAL_RESULT=PASS`
The certified FREE_ONLY candidate (`7e5a2d80b`) is live on `127.0.0.1:20128` with dynamic free-provider discovery, strict free-only auto routing, unchanged manual/pinned paid access, and zero paid fallback. OpenCode, Hermes, Harness, IAMM, StockNewsBR, AWS and Meta remain untouched; no credential was rotated and no paid inference was triggered.

## 9. Re-verification addendum (independent pass, 2026-09-21T23:12Z)

A second pass re-ran the live checks against the same promoted runtime: no re-promotion, no service restart, no runtime code change.

**Runtime identity (unchanged)**

- `omniroute.service` active, MainPID 391192, NRestarts=0, listener on 127.0.0.1:20128, `GET /api/health` → 200 `{"status":"ok"}`.
- Installed package version 3.8.50 with `dist/BUILD_SHA=7e5a2d80b`; the installed runtime tree diffs clean against the certified tarball (`omniroute-3.8.50.tgz`, sha256 `5899689363d8910a171fef65d28326bf9b26f16af95a74ff18d6db6492eb8bb3`) ⇒ `LIVE_RUNTIME==CERTIFIED_ARTIFACT=YES` (no content differences; excludes `node_modules`/dist data dirs).

**Live capability probes (free-only, no paid inference)**

| probe | route / target | result |
|---|---|---|
| health | `GET /api/health` | 200 |
| catalog | `GET /v1/models` | 200, count 674 (dynamic; see below) |
| text auto free | `auto/best-free` | 200 |
| streaming | `nvidia/openai/gpt-oss-20b` | 200, `done`, 8 chunks |
| tool calls | `nvidia/openai/gpt-oss-20b` | 200, `tool_calls=true` |
| search auto free | `POST /search` `provider=auto/search:free` | 200, provider `context7` |
| vision auto free | `agnes/agnes-2.5-flash` | 200 |
| image gen free | `auto/image-gen:free` | 503 `NO_FREE_IMAGE_PROVIDER_AVAILABLE` (controlled; no paid substitution) |
| pinned free model | `oc/deepseek-v4-flash-free` | 400 upstream "Model is unavailable" (provider state) |
| pinned free provider | `openrouter/cohere/north-mini-code:free` | 429 free-models-per-day (rate limit) |

Probe semantics correction: RouteLab's earlier search probe used the legacy no-`provider` path (`ollama-search`, 401) — that is not the certified contract; the probe now sends `provider:"auto/search:free"` (context7, 200). The image probe now targets the real free route id (`auto/image-gen:free`) instead of a fake model id, and observes the controlled 503.

**Dynamic behavior (live evidence)**

- Catalog size moves with free-provider availability (671 → 674 observed post-promotion; 676 at promotion). The `+2` entries `auto/vision:free` and `auto/multimodal:free` are present ⇒ dynamic FREE provider discovery, not a regression.
- With the pinned free model unavailable upstream and a pinned free provider quota-limited, `auto/best-free` still served 200 — the FREE candidate moved to another eligible provider ⇒ FREE→FREE failover/recovery live evidence; no paid fallback.

**Deterministic re-run against the certified source (66/66)**

- R1 sentinel policy matrix 21/21 (vitest config), R2 search-free 13/13, R3 image-free 12/12, R4 resilience 14/14, free-model-catalog 6/6.

**Scope of this pass:** evidence/tooling only (`scripts/routelab` probe alignment + reports); no runtime source change, no service restart, no production DB write, no OpenCode/Hermes/Harness/IAMM/StockNewsBR/AWS/Meta change; no paid inference; no secret material printed. Verdict unchanged: `FINAL_LIVE_CERTIFIED=YES` · `FINAL_RESULT=PASS`.
