# OMNIROUTE_FREE_AUTOPILOT_R1_10_SECURITY_CONTAINMENT_AND_CREDENTIAL_CLOSURE

- **Date:** 2026-09-21
- **Scope:** Credential-exposure containment and closure for the previously emitted local OmniRoute/OpenCode API credential. Read-only forensics, no client changes, no key rotation executed.
- **Mutations:** NONE
- **Secrets printed this mission:** NO
- **Repo state:** intentionally dirty; no commit created, no push attempted.

---

## 1. Objective

Close the credential-exposure issue recorded in R1.6 and elevated in R1.7, **without breaking the recovered OpenCode Linux environment** and without touching the frozen OpenCode configuration, providers, or connection set.

Required outcomes:

1. Identify affected credential records safely.
2. Confirm current exposure scope.
3. Verify no secret committed into repositories.
4. Verify no secret in mission documentation.
5. Verify no secret in generated artifacts.
6. Prepare a safe rotation path (not executed).
7. Leave the working OpenCode client unchanged.

## 2. Constraints honored

| Constraint | Status |
|---|---|
| OpenCode config/auth frozen (`~/.config/opencode/opencode.json`, `~/.opencode/opencode.json`, `~/.local/share/opencode/auth.json`) | NOT MODIFIED |
| No provider connection deleted/disabled/recreated | 0 deleted |
| No `omniroute setup-opencode` / `configure opencode` / cross-platform sync | NOT RUN |
| FREE_ONLY policy, provider scoring, auto routing, pinned routing unchanged | UNCHANGED |
| Raw secret never printed | CONFIRMED |
| No Git history rewrite | CONFIRMED |
| No rotation executed | CONFIRMED |

## 3. Live environment

- OmniRoute version: **3.8.50**
- Service: `omniroute.service` (`systemctl --user`) **active**; MainPID 411; ActiveEnterTimestamp Mon 2026-09-21 15:36:25 -03.
- Live build SHA (`dist/BUILD_SHA`): **dea6bb8** (pre-candidate rollback baseline; candidate `95e7147` NOT promoted).
- Port: `127.0.0.1:20128` **LISTENING**.
- Health endpoint evidence: `GET /api/health` → **200**.
  - (`/health` is 404 and `/v1/health` is 401 on this build; `/api/health` is the authoritative liveness probe.)

## 4. Key model facts

- Key format: `sk-<machineId>-<keyId>-<crc>` (`src/shared/utils/apiKey.ts:48-53`, `generateApiKeyWithMachine`).
- machineId for all keys in scope: `a7f8a34aa26b5ebd`; full key length 35.
- `key_prefix` is the first 12 chars (`sk-a7f8a34aa`) and is **shared by all machine keys**, so it is not a unique identifier.
- Storage: `api_keys` table in `~/.omniroute/storage.sqlite`; the `key` column stores the **raw plaintext** key, `key_hash` stores plain SHA-256 hex (`src/lib/db/apiKeys.ts:651`).
- `model_access_mode` is constrained to `all` or `restricted`.

### 4.1 Current live key inventory (metadata only; raw `key` column never queried)

| # | KEY_ID | KEY_NAME | KEY_PREFIX | key_hash[:20] | ACTIVE | REVOKED | MODEL_ACCESS_MODE | CREATED |
|---|---|---|---|---|---|---|---|---|
| 1 | admin-antigravity-setup | Antigravity Admin Setup | sk-antigravi | 91aa8d7da1798c836102 | 1 | no | all | 2026-07-24T04:22:25Z |
| 2 | **153ee506-842a-4730-be58-a637b995ce03** | **OpenCode** | sk-a7f8a34aa | **5eef5d97e2961bab4b85** | 1 | no | **all** | 2026-07-25T00:24:43Z |
| 3 | **8c858d32-1627-4c86-8d7a-920e22b1d134** | **OPENCODE WSL** | sk-a7f8a34aa | **013299ca4485a604c075** | 1 | no | all | 2026-07-25T20:04:28Z |
| 4 | d7b8e161-4bd8-41e7-8f03-81554a1f3ea0 | Kimi | sk-a7f8a34aa | 66f0a480fb63149c552e | 1 | no | all | 2026-08-04T15:43:45Z |
| 5 | ffc66035-207f-45d6-9b9b-c553bac2f443 | AI Rorder | sk-a7f8a34aa | 2ab7749bfa86d836ecbc | 1 | no | all | 2026-09-01T02:34:27Z |
| 6 | 79254dba-9b09-4429-9edd-a2794e0b52bf | AIMM OmniRoute FREE_ONLY production | sk-a7f8a34aa | 0bf03c4eddb5da5fdd27 | 1 | no | all | 2026-09-05T04:16:24Z |
| 7 | 6cd278dc-92cd-490e-a8b4-4bf64f32820a | Omniroute route | sk-a7f8a34aa | 1f5fa0198de533216ef6 | 1 | no | all | 2026-09-14T22:09:02Z |
| 8 | 03b398e0-d339-41fc-adc4-cc3662447b13 | aimmarketmaster-r10 | sk-a7f8a34aa | 0dd9741b43d024abe06f | 1 | no | all | 2026-09-19T14:23:08Z |

ACL for the two affected rows:

- **Key #2 (OpenCode):** `allowed_models=[]`, `blocked_models=NULL`, `allowed_connections=NULL`, `allowed_combos=[]`, `disable_non_public_models=0`, `is_active=1`, `revoked_at` empty.
- **Key #3 (OPENCODE WSL):** `allowed_models=[]`, `blocked_models=NULL`, `allowed_connections=[]`, `allowed_combos=["combo/*"]`, `disable_non_public_models=0`, `is_active=1`, `revoked_at` empty.

### 4.2 ACL drift (R1.7 → R1.9)

R1.7 recorded the OpenCode key as `model_access_mode=restricted` with two allowed models. R1.9 documented that an `opencode-unrestrict` operation executed after the R1.7 report (14:28) reset the OpenCode key `153ee506` to `mode=all` / `allowed_models=[]`, and that **all 8 keys now sit at the schema default** (`all` / `[]`). This is **not** the vetted `EXACT_MODEL_ONLY` repair R1.7 recommended — it widens access. This is the reason R1.9 raised a rotation-first gate and the reason the containment work below pairs rotation with an explicit restricted-ACL re-application step.

## 5. Phase A — Secret forensics

Method: a secret-safe scanner, `/tmp/opencode/secret_scan.py`, self-tested against a synthetic fixture and verified to redact output and never emit raw values. It walks only named roots, skips `node_modules/.git/__pycache__/venv/dist/build/.next/coverage`/caches, binary extensions, and files over 5MB. Patterns: OmniRoute key shape (`sk-<machineId>-...`), generic `sk-` tokens, `Bearer <token>`, `apiKey=`/`apikey:` key-value forms, and `Authorization` header forms. For each hit it emits FILE, LINE, SECRET_TYPE, REDACTED_PREFIX (first 8 chars), LEN, and a SHA-256 fingerprint; it flags a match when the SHA-256 starts with the affected fingerprint.

Results:

- **Repo** `/home/dcima/ai-coding-stack-omniroute-nvidia-opencode`: 10 candidate hits, **all placeholders** (`YOUR_OMNIROUTE_KEY`, `YOUR_OPENCODE_KEY`, `YOUR_FIREWORKS`, `YOUR_MISTRAL`, `YOUR_DEEPSEEK`) in `README.md`, `README.es.md`, `README.ru.md`, `README.pt-BR.md`, and `.env.example`. **Zero fingerprint matches. Zero occurrences of the machine id** anywhere in the repo, including git objects.
- **`~/.config/opencode`:** 139 candidate hits. The affected key #2 fingerprint appears in exactly **4 files**:
  1. `opencode.json` (live config)
  2. `omniroute.key`
  3. `opencode.json.bak-desktop-sync-20260921-145941`
  4. `opencode.json.bak-before-deepseek-paid-20260921-144234`

  All other backups hold a different, non-affected key; `omniroute.key.revoked-20260920` holds a different non-matching key; `secrets.env` holds an unrelated `AQ.Ab8RN…` token (len 53).
- **`~/.local/share/opencode`:** 150 candidate hits, **no fingerprint matches** (env-var names such as `POSTHOG_`, `AIMM_POS_`, `OPENROUT_` inside session JSON).
- **`~/.omniroute/call_logs`:** 6 `apiKey` key-value hits, all `process.<env>` references; **no raw secrets**; some records carry an `Authorization` header key but not a raw bearer value.
- **`~/.omniroute/logs`:** 0 hits.
- **`~/.omniroute/{server,supervisor,backups,db_backups,mitm,oauth,tls-client,.env}`:** 0 fingerprint matches.
- **Recovery dirs** `omniroute-opencode-recovery-20260921-144236|144341|145017`: the affected key #2 appears in each dir, in both `opencode-opencode.json` (LINE=9) and `.opencode-opencode.json` (LINE=9), all flagged as `FINGERPRINT_MATCH=OPENCODE_KEY(153ee506)`. The ~89MB `storage.sqlite.before-opencode-unrestrict` copies in those dirs necessarily also contain all 8 keys in plaintext because `api_keys.key` is stored raw — this is expected DB-backup content, not a new leak.
- **LAB working tree** `/home/dcima/omniroute-lab-r1-v3.8.50` (excl. node_modules/.git): grep for the machine id / key shape returned **nothing**. LAB has no scannable git history (its `.git` is a broken worktree pointer to a `/tmp` path cleared by reboot).
- **Shell histories** (`~/.bash_history`, `~/.zsh_history`, `~/.python_history`): 0 fingerprint matches. **`/tmp`:** 0. **`~/.omo`:** 0.

**Exposure scope:** the credential is present only in local operational copies (live config + key file), two local config backups, three post-recovery dirs, and the live/backup SQLite DBs. No network publication, no git publication, no doc publication.

## 6. Phase B — Git secret audit

- `git log --all -p` grep for the key shape and machine id: **none**.
- Staged diff: **none**. Working-tree diff: **none**.
- Repo contains **no occurrence** of the machine id (tracked files and git objects).
- LAB candidate diff: LAB working tree clean; LAB history unavailable (broken worktree pointer).

**`SECRET_COMMITTED_TO_GIT=NO`.** No history rewrite performed or needed.

## 7. Phase C — Documentation audit

- Repo docs and READMEs contain only placeholders.
- R1.6 records the exposure as a marker only: `SECRETS_EXPOSED=YES_UNINTENTIONAL_LOCAL_TOOL_OUTPUT` (no raw value).
- R1.7 records `PRIMARY_EXPOSED_KEY_ID` / `SECONDARY_EXPOSED_KEY_ID` and SHA-256 **fingerprints** only (no raw value).
- R0_AUDIT, R0_5, R1_SENTINEL carry `SECRETS_EXPOSED=NO`.
- R1.9 carries `SECRET_OUTPUT_THIS_MISSION=NO`.

**`RAW_SECRET_IN_DOCS=NO`.** No redaction required; no doc file modified.

## 8. Phase D — Key inventory and client mapping

| Client | KEY_ID | KEY_NAME | Fingerprint |
|---|---|---|---|
| OpenCode | 153ee506-842a-4730-be58-a637b995ce03 | OpenCode | sha256:5eef5d97e296 |
| DeepSeek Harness (via StockNewsBR A2A bridge :9901 → Harness :3080 → OmniRoute :20128) | 153ee506-842a-4730-be58-a637b995ce03 | OpenCode | sha256:5eef5d97e296 |
| Hermes | 8c858d32-1627-4c86-8d7a-920e22b1d134 | OPENCODE WSL | sha256:013299ca4485 |

- **`OPENCODE_KEY_IDENTIFIED=153ee506-842a-4730-be58-a637b995ce03`**
- **`HARNESS_KEY_IDENTIFIED=153ee506-842a-4730-be58-a637b995ce03`** (same key as OpenCode; Harness reaches OmniRoute through the StockNewsBR bridge)
- **`HERMES_KEY_IDENTIFIED=8c858d32-1627-4c86-8d7a-920e22b1d134`**
- **`AFFECTED_KEY_COUNT=2`** — only these two keys were ever reported exposed. The remaining 6 keys were not in any exposure report and are out of scope.
- No key was created, modified, restricted, or revoked during this mission.

## 9. Phase E — Rotation procedure (prepared, NOT executed)

Executed only when the OpenCode freeze is lifted by the operator, and only with a maintenance window.

### Step 0 — Preconditions

- Confirm the live build to keep (`dea6bb8`) and the reviewed candidate (`95e7147`) plus rollback artifacts:
  - RELEASE `omniroute-3.8.50.tgz` sha256 `d73c741e7d6b0e63b5fe91eaed27d688d6675985faeb185c05bd4cfaf6ab5e09`
  - ROLLBACK `omniroute-3.8.50.tgz` sha256 `7e7ec2c6f3960d1fb5227087af21e450499fd144248af6672ba887e1131ff2ef`
- Snapshot `~/.omniroute/storage.sqlite` before any write.
- Confirm FREE_ONLY policy, provider scoring, auto routing, pinned routing remain unchanged.

### Step 1 — Create replacement keys

- Create a new key **`OpenCode R1.10`** for OpenCode + Harness.
- Create a new key **`OPENCODE WSL R1.10`** for Hermes.
- Record KEY_ID, KEY_NAME, KEY_PREFIX, ACTIVE, REVOKED, MODEL_ACCESS_MODE for each. Never print the raw value.

### Step 2 — Clone ACL (exact-model, not `all`)

On the new `OpenCode R1.10` key apply the reviewed restricted ACL:

- `model_access_mode=restricted`
- `allowed_models` = the two free models in use **plus** `oc/deepseek-v4-pro` (manual paid, preserving DeepSeek V4.1 access) **plus** `zai/glm-4.7-flash` if intended.
- Preserve the connection/rate/endpoint/lifecycle settings of the old key.
- Keep FREE_UNKNOWN semantics for auto/free routing so free auto-selection continues to work.
- Do **not** reintroduce `mode=all` / `allowed_models=[]`.

On the new `OPENCODE WSL R1.10` key apply the reviewed ACL for Hermes (including the `combo/*` allowance if still required).

### Step 3 — Client cutover (one client at a time)

- Cut over the **Harness** path first (StockNewsBR bridge → Harness), validate, then cut over **OpenCode**.
- Cut over **Hermes** separately with its own key.
- Client-side cutover necessarily edits `~/.config/opencode/opencode.json` and `~/.config/opencode/omniroute.key`; **this is the step blocked by the current OpenCode freeze.**

### Step 4 — Validation per client

- OpenCode: complete one free-model request and one manual paid DeepSeek V4.1 request; confirm success.
- Harness: complete one request through the StockNewsBR bridge.
- Hermes: complete one request (accounting for external Z.AI 529/429 baseline noise).

### Step 5 — Old-key traffic verification

- Observe `~/.omniroute/call_logs` and the `api_keys.last_used_at` values; confirm the old keys show **no new traffic** after cutover.

### Step 6 — Revoke old keys

- Revoke the old OpenCode key `153ee506…` and the old OPENCODE WSL key `8c858d32…`.
- Verify each subsequent request using an old key is rejected (auth failure), not merely unused.

### Step 7 — Post-revocation verification and gates

- Re-run the R1 gate matrix: FREE_ONLY, FREE_VERIFIED_ALLOW, SELF_HOSTED_ALLOW, UNKNOWN_COST_DENY, NULL_COST_DENY, PAID_AUTO_DENY, CREDIT_BACKED_AUTO_DENY, HEALTH_FILTER, QUOTA_FILTER, CIRCUIT_BREAKER, AUTO_RECOVERY, catalog regression, pinned routing.
- Confirm `MANUAL_PAID_SELECTION_ALLOWED=YES`, `AUTO_PAID_FALLBACK=NO`.
- Audit the newly produced logs/configs with the secret-safe scanner; confirm the old credential no longer appears in any new artifact.
- Promotion of candidate `95e7147` (rollback to `dea6bb8`) is a separate decision and is **not** part of this procedure.

### Deferral rationale

Cutover requires editing `~/.config/opencode/opencode.json` and `~/.config/opencode/omniroute.key`, both under the absolute OpenCode freeze. Per the mission's rotation rule, rotation is therefore not executed and is documented as deferred.

## 10. Deliverables and artifacts

- Secret-safe scanner: `/tmp/opencode/secret_scan.py` (mission-local; read-only tool, no repo/staging mutation).
- This report. No other file created or modified.
- Repo remains intentionally dirty; no commit created.

## 11. Final report

```
OMNIROUTE_FREE_AUTOPILOT_R1_10_SECURITY_CONTAINMENT_AND_CREDENTIAL_CLOSURE
LIVE_HEALTH=200
LIVE_PORT_20128=LISTENING
SECRET_COMMITTED_TO_GIT=NO
RAW_SECRET_IN_DOCS=NO
RAW_SECRET_IN_ARTIFACTS=NO
AFFECTED_KEY_COUNT=2
OPENCODE_KEY_IDENTIFIED=153ee506-842a-4730-be58-a637b995ce03
HARNESS_KEY_IDENTIFIED=153ee506-842a-4730-be58-a637b995ce03
HERMES_KEY_IDENTIFIED=8c858d32-1627-4c86-8d7a-920e22b1d134
ROTATION_REQUIRED=YES
ROTATION_EXECUTED=NO
ROTATION_DEFERRED_DUE_TO_OPENCODE_FREEZE=YES
OPENCODE_CONFIG_CHANGED=NO
OPENCODE_AUTH_CHANGED=NO
OPENCODE_PROVIDERS_CHANGED=NO
OPENCODE_CONNECTIONS_CHANGED=NO
PROVIDERS_DELETED=0
CONNECTIONS_DELETED=0
MANUAL_PAID_SELECTION_ALLOWED=YES
AUTO_PAID_FALLBACK=NO
SECRETS_PRINTED_THIS_MISSION=NO
NEXT_ACTION=Operator lifts OpenCode freeze in a maintenance window, then execute the Phase E rotation procedure (new keys -> restricted ACL clone -> Harness then OpenCode then Hermes cutover -> validation -> old-key traffic stop -> revoke -> post-revocation gate matrix), and optionally purge the local exposures: the two ~/.config/opencode key-bearing backups and the three omniroute-opencode-recovery-* dirs (including their plaintext storage.sqlite.before-opencode-unrestrict copies).
FINAL_RESULT=PASS
```
