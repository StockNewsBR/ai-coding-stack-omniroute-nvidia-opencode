# OMNIROUTE_FREE_AUTOPILOT_R1_9_POST_RECOVERY_STATE_AUDIT_AND_CONTINUATION

- Date: 2026-09-21
- Model: DeepSeek V4.1 (manual paid, frozen OpenCode runtime)
- Runtime: OpenCode Linux
- Scope: Post-reboot, read-only state audit + continuation closure for OmniRoute R1
- Mutations performed: NONE (no OpenCode change, no ACL write, no service change, no promotion, no R2)

---

## 1. Executive summary

OpenCode Linux was manually recovered and frozen. This mission only **read back**
state. The OmniRoute R1 candidate code (LAB) is functionally sound: every scoped
gate passes, no static free-provider allowlist exists, and manual/pinned paid
selection is preserved while auto/free denies paid and credit-backed routes.

However, the environment left after the last report is **not promotion-ready**:

1. The OpenCode OmniRoute key was changed from `restricted` to `model_access_mode=all`
   (fully unrestricted) by an "opencode-unrestrict" operation that ran **after** the
   R1.7 report. This is not the vetted EXACT_MODEL_ONLY repair R1.7 recommended.
2. The R1.6 secret exposure is still un-remediated (rotation pending).
3. The LAB worktree's git metadata was destroyed by the reboot (parent repo lived in `/tmp`).

The live install still runs the **pre-candidate baseline** (build `dea6bb8`), so no
promotion occurred. Classification: **NEEDS_OMNIROUTE_ONLY_FIX** (not BLOCKED; the
candidate code itself passes). No fix was applied — human approval is required before
any ACL write.

---

## 2. Phase A — Mission reports recovered

| Report | Size | mtime |
|---|---|---|
| OMNIROUTE_FREE_AUTOPILOT_R0_AUDIT_2026-09-21.md | 34560 B | 01:23 |
| OMNIROUTE_FREE_AUTOPILOT_R0_5_CLIENT_COMPATIBILITY_2026-09-21.md | 12920 B | 04:43 |
| FREE_AI_STACK_KILO_OMNIROUTE_OPENCODE_OMO_2026-09-21.md | 7907 B | 06:01 |
| OMNIROUTE_FREE_AUTOPILOT_R1_SENTINEL_FREE_ONLY_2026-09-21.md | 11638 B | 06:11 |
| OMNIROUTE_FREE_AUTOPILOT_R1_5_HARNESS_CATALOG_DRIFT_2026-09-21.md | 15630 B | 11:21 |
| OMNIROUTE_FREE_AUTOPILOT_R1_6_CANARY_PROMOTION_2026-09-21.md | 12470 B | 12:48 |
| OMNIROUTE_FREE_AUTOPILOT_R1_7_RESTRICTED_KEY_ACL_SECURITY_2026-09-21.md | 13110 B | 14:28 |

No R1.8 report exists. Last session artifact = R1.7 at 14:28.
Findings were taken from the files, not from conversation memory.

---

## 3. Phase B — Live service after reboot

| Check | Value |
|---|---|
| systemctl --user is-active omniroute.service | active |
| Active since | 2026-09-21 15:36:25 -03 |
| MainPID | 411 |
| Live version | **3.8.50** |
| Live build SHA (`dist/BUILD_SHA`) | **dea6bb8** (= pre-candidate / rollback baseline) |
| ExecStart | /home/dcima/.local/bin/omniroute-systemd-run |
| Exec target | `env HOSTNAME=127.0.0.1 .../pnpm/bin/omniroute serve --no-open --no-recovery` |
| Port 127.0.0.1:20128 | LISTENING |
| GET /api/health | HTTP 200 `{"status":"ok"}` |

Note: live build `dea6bb8` is the **rollback baseline**, NOT the R1.5 candidate
`95e7147`. No live promotion has happened. The rollback target is therefore already
in place.

---

## 4. Phase C — OpenCode read-only verification

| Item | Value |
|---|---|
| opencode executable | /home/dcima/.opencode/bin/opencode (version 1.18.31) |
| OPENCODE_LINUX_STATUS | WORKING |
| DEEPSEEK_V41_VISIBLE | YES |
| DEEPSEEK_V41_MANUAL_REQUEST | YES (manual only) |

`DeepSeek V4.1` maps to the OmniRoute/Zen model id **`oc/deepseek-v4-pro`**
(display "DeepSeek V4 Pro · PAID"). It is present in the manual `~/.config/opencode`
model whitelist. The default model remains the free
`omniroute/oc/deepseek-v4-flash-free`. `oc/deepseek-v4-pro` is catalogued as
credit-backed (one-time-initial), so it is denied from auto/free while remaining
manually selectable.

No config was rewritten, no sync run, no catalog regenerated, no credential rotated.

---

## 5. Phase D — Previous-session side effects

**UNFINISHED_SIDE_EFFECTS_FOUND = YES**

Evidence: three directories created **after** the R1.7 report (14:28):

- /home/dcima/omniroute-opencode-recovery-20260921-144236 (14:42)
- /home/dcima/omniroute-opencode-recovery-20260921-144341 (14:43)
- /home/dcima/omniroute-opencode-recovery-20260921-145017 (14:50)

Each holds: `.opencode-opencode.json` (1363 B), `opencode-opencode.json` (3154 B),
and `storage.sqlite.before-opencode-unrestrict` (88.8–89.2 MB).

Exact state change found in live DB `/home/dcima/.omniroute/storage.sqlite`, table
`api_keys`:

| id | name | model_access_mode | allowed_models |
|---|---|---|---|
| 153ee506-842a-4730-be58-a637b995ce03 | OpenCode | **all** (was `restricted` per R1.7) | **[]** (was 2 entries) |
| 8c858d32-1627-4c86-8d7a-920e22b1d134 | OPENCODE WSL (Hermes) | all | [] |

All 8 keys are now `mode=all` / `allowed_models=[]` (the schema default). The OpenCode
key's ACL restriction was **removed entirely** (an "unrestrict"), not narrowed to the
vetted exact-model allow-list. This widens access beyond the R1.7 recommendation and
is the reason a rotation-first security gate was raised.

OpenCode config drift: the newest recovery copy of `opencode-opencode.json` is
byte-identical to the current `~/.config/opencode/opencode.json` **except** it also
carries top-level `enabled_providers: ["omniroute"]`. `oc/deepseek-v4-pro` (PAID) was
added to the manual model whitelist. No secret values were read or printed.

Per operator decision this recovered state is FROZEN — this mission did not revert or
re-apply anything.

---

## 6. Phase E — LAB candidate verification

Path: `/home/dcima/omniroute-lab-r1-v3.8.50`

**LAB git provenance is broken.** `.git` is a pointer file:
`gitdir: /tmp/omniroute-r0-v3.8.50/.git/worktrees/omniroute-lab-r1-v3.8.50`.
The parent repo lived under `/tmp` and was cleared by the reboot; `/tmp` no longer
contains any omniroute dirs. `git rev-parse HEAD` fails ("not a git repository").
No history/objects/refs remain, so HEAD cannot be proven by git.

- Known baseline candidate: `95e714773bc37b6eed863b93bb6d16cbd3d0c3a4` (R1.5).
- LAB_HEAD (git): **UNVERIFIABLE_BROKEN_WORKTREE** (files intact, history absent).
- Working tree present and consistent with R1/R1.5: package.json version 3.8.50;
  `autoComboCandidates.ts` 8567 B; `freeAccessQuota.ts` 9690 B;
  `strictZeroCostFilter.ts` 21287 B; `virtualFactory.ts` 42217 B;
  `freeModelCatalog.data.ts` 94033 B with the R1.5 repair row at line 447:
  `{ provider: "zai", modelId: "glm-4.7-flash", ... freeType: "recurring-uncapped" }`.
- No reset was attempted (would be unsafe and pointless without history).

---

## 7. Phase F — Scoped R1 validation (re-run)

Run in the LAB with `node_modules` present.

| Suite | Result |
|---|---|
| node:test focused run, 7 files | 34 tests, 30 pass; 4 "fail" = the 4 vitest-style files mis-run under node:test (harness mismatch, not logic) |
| vitest (`vitest.mcp.config.ts`) on those 4 files | 4 files passed, 35 tests passed |
| vitest (`vitest.mcp.config.ts`) full `tests/unit/autoCombo/` | 12 files passed, 79 tests passed (1 file uncollectable = the node:test sentinel, expected) |
| eslint on R1 sources + catalog + 3 test files | exit 0 |
| `npm run typecheck:core` | exit 0 |

Required gate mapping (all PASS):

| Gate | Result |
|---|---|
| FREE_ONLY | PASS |
| FREE_VERIFIED_ALLOW | PASS |
| SELF_HOSTED_ALLOW | PASS |
| UNKNOWN_COST_DENY | PASS |
| NULL_COST_DENY | PASS |
| PAID_AUTO_DENY | PASS |
| CREDIT_BACKED_AUTO_DENY | PASS |
| HEALTH_FILTER | PASS |
| QUOTA_FILTER | PASS |
| CIRCUIT_BREAKER | PASS |
| AUTO_RECOVERY | PASS |
| PAID_AUTO_FALLBACK | NO |
| Catalog regression (R1.5 exact identity) | PASS |
| Pinned routing no-op | PASS |

No live provider quota was consumed; all assertions ran against mocks/local seams.

---

## 8. Phase G — Provider discovery principle

`STATIC_FREE_PROVIDER_ALLOWLIST = NO`.

Searches for `ALLOWLIST|ALLOWED_PROVIDERS|PREFERRED|nvidia|cerebras|groq` across
`strictZeroCostFilter.ts`, `freeAccessQuota.ts`, `autoComboCandidates.ts` returned
nothing. The free candidate set is built by dynamic discovery and filtered by
free-status / health / quota / capability / circuit-open / auth. No fixed provider
shortlist is imposed.

`DYNAMIC_FREE_PROVIDER_DISCOVERY = YES (discovery-based, no hardcoded roster)`.

---

## 9. Phase H — Manual paid access principle

- `MANUAL_PAID_SELECTION_ALLOWED = YES`
- `AUTO_PAID_SELECTION_ALLOWED = NO`
- `DEEPSEEK_V41_MANUAL_ACCESS_PRESERVED = YES`

The strict zero-cost filter applies only to the auto/free adaptive pool. Explicit /
pinned requests bypass it (test: "strict policy is a no-op for explicit/pinned paths
when not enabled"). Auto/free admits only FREE_VERIFIED or SELF_HOSTED; PAID and
CREDIT_BACKED are denied with no paid fallback. `oc/deepseek-v4-pro` stays manually
selectable. No OpenCode config change was made to test this (policy evidence only).

Environment caveat: the current live key is `mode=all`, which is *broader* than both
the free-only policy and the manual-paid intent. Correct restricted remediation must
keep `oc/deepseek-v4-pro` (and the free models) in `allowed_models` under
`mode=restricted` so manual paid selection still works.

---

## 10. Phase I — Client safety (read-only smoke)

| Client | Result |
|---|---|
| OpenCode | WORKING (recovered state; DeepSeek V4.1 manual visible) |
| Harness (shares key 153ee506, name "OpenCode") | PASS — no local regression; note: key ACL was broadened to `all` |
| Hermes (separate key 8c858d32) | PASS or same external-provider baseline (Z.AI 529/429 = provider-health only) |

No client config was modified. IAMM, StockNewsBR, FCC untouched.

---

## 11. Phase J — Secret safety

- `SECRET_OUTPUT_THIS_MISSION = NO`.
- Only key IDs, names, counts, `model_access_mode`, and redacted field lengths were
  printed. No raw credential, token, or `.env` value was emitted.
- Nothing was rotated in this mission. Rotation remains a future controlled op.

---

## 12. Phase K — Promotion status

`READY_FOR_PROMOTION` criteria check:

| Criterion | Status |
|---|---|
| FREE_ONLY tests pass | YES |
| No fixed provider shortlist | YES |
| Manual paid semantics preserved | YES |
| Pinned semantics unchanged | YES |
| No new client regression | YES |
| Live rollback path known | YES (live already at baseline build dea6bb8) |
| No OpenCode changes required | **NO** — key ACL is in an unreviewed unrestricted state; rotation pending |

Therefore:

**R1_STATUS = NEEDS_OMNIROUTE_ONLY_FIX**

Reasons (OmniRoute side only, no client or R2 involvement):

1. OpenCode key `153ee506` is `model_access_mode=all` / `[]` — must be replaced by a
   reviewed ACL (restricted exact allow-list that still includes the manual paid model).
2. R1.6 secret exposure remediation (key rotation) is still outstanding.
3. LAB git provenance is lost — re-establish a verifiable candidate HEAD before promotion.

---

## 13. Next action (exact)

Before any promotion, obtain explicit human approval, then perform only, in order:

1. Rotate exposed keys per the R1.7 plan (Harness/OpenCode + Hermes).
2. Apply the reviewed ACL on the new OpenCode key: `model_access_mode=restricted` with
   an exact `allowed_models` list = the two free models + `oc/deepseek-v4-pro`
   (+ `zai/glm-4.7-flash` if intended), replacing the current `all`.
3. Re-run the R1 gate matrix and confirm all PASS.
4. Promote candidate build `95e7147` to live 3.8.50, with known rollback to `dea6bb8`.

No live promotion, no ACL write, no client change, and no R2 work in this mission.

---

## 14. Rollback path (unchanged, known)

- Live is already at baseline build `dea6bb8`; no promotion applied.
- R1.6 artifacts recorded: RELEASE `omniroute-3.8.50.tgz` sha256
  `d73c741e7d6b0e63b5fe91eaed27d688d6675985faeb185c05bd4cfaf6ab5e09` (build `95e7147`);
  ROLLBACK `omniroute-3.8.50.tgz` sha256
  `7e7ec2c6f3960d1fb5227087af21e450499fd144248af6672ba887e1131ff2ef` (build `dea6bb8`).
- ACL rollback proof + metadata-only backup from R1.7 remain available.

---

## 15. Final result

`FINAL_RESULT = PASS` (audit completed, no mutations, no secrets, candidate code verified;
environment remediation deferred to a human-approved OmniRoute-only fix).
