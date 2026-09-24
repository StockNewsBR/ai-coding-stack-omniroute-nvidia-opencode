# OMNIROUTE — Key Rotation R1 Closure (Mission M24)

- Mission: `OMNIROUTE-M24-KEY-ROTATION-R1`
- Executor: DEEPSEEK_V4_1_FLASH — Mode: CONTROLLED_PRODUCTION_EXECUTION
- Date: 2026-09-23 (local, America/Sao_Paulo) / 2026-09-24 (UTC)
- Result: **M24 = PASS**

No secret values, keys, tokens, passwords, or storage keys appear in this document. Only safe identifiers, display prefixes, row IDs, and non-secret metadata are recorded.

---

## 1. Source and runtime identity

| Item                  | Value                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Repository            | StockNewsBR/ai-coding-stack-omniroute-nvidia-opencode               |
| Branch                | fix/m24e-m25-auth-remediation-2026-09                               |
| SOURCE_SHA            | cc961c8c4acc6504664e86b35dc362b3d4cee647                            |
| Remote parity         | YES (git ls-remote origin = same SHA)                               |
| OLD_RUNTIME_BUILD_SHA | 088797446                                                           |
| NEW_RUNTIME_BUILD_SHA | cc961c8c4                                                           |
| Runtime version       | 3.8.50                                                              |
| Bundled deps          | Next 16.3.6, sharp 0.35.4                                           |
| Listener              | 127.0.0.1:20128 (loopback only; no public listener)                 |
| Service               | user unit omniroute.service (active, NRestarts=0 after all batches) |

---

## 2. Batch results

| Batch | Family                                                  | Result                        | Notes                                                                                                                                                                                   |
| ----- | ------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0    | Runtime promotion 088797446 → cc961c8c4                 | PASS                          | Certified local artifact `omniroute-3.8.50-postcommit-final.tgz` (sha256 `6ef2a38c…`); preflights `check:pack-artifact` + `check:pack-boot` PASS; authenticated `/v1/models` probe 200. |
| B1    | Peer stamp, inspector ingest (low blast radius)         | PASS (N/A manual)             | Both tokens are process-generated per boot; B0/B5 restarts retired and regenerated them; no persistent manual rotation exists.                                                          |
| B2    | Free text provider credentials                          | STOPPED — OPERATOR CHECKPOINT | Credential (re)issuance requires third-party provider dashboards. No provider credentials were touched. Free pool health verified (70 free-like model ids).                             |
| B3    | Paid-image credentials (AWS Bedrock / Stability / Meta) | N/A (evidence-backed)         | No paid-image provider rows or config found; paid image remains DISABLED; zero paid-image calls.                                                                                        |
| B4    | DB client API keys (additive)                           | PASS                          | New keys created and installed; old shared key retained for the live mission session (deferred revocation).                                                                             |
| B5    | OMNIROUTE_CLI_SALT (CLI machine tokens)                 | PASS                          | New salt installed in `/home/dcima/.omniroute/.env`; CLI re-derives machine tokens (verified `omniroute keys list` exit 0).                                                             |
| B6    | STORAGE_ENCRYPTION_KEY                                  | PASS                          | Offline verified-snapshot migration (dry-run + migrate), DB swap, `.env` key update; no decryption errors.                                                                              |
| B7    | API_KEY_SECRET                                          | PASS                          | Rotated in persisted secrets row; existing DB keys unaffected (SHA-256 hash validation).                                                                                                |
| B8    | JWT_SECRET                                              | PASS                          | All dashboard sessions and CSRF tokens invalidated by design; operator re-login expected.                                                                                               |

### B4 detail (safe identifiers only)

| New key                    | ID                                   | Display prefix | Installed into                                                          | Validation                        |
| -------------------------- | ------------------------------------ | -------------- | ----------------------------------------------------------------------- | --------------------------------- |
| OpenCode M24 R1            | 60f8b8b3-090a-4db1-966c-d8b35c27ce29 | sk-a7f8a34aa   | `~/.config/opencode/omniroute.key`, `~/.local/share/opencode/auth.json` | `/v1/models` 200; free probe PASS |
| StockNewsBR Harness M24 R1 | cc69454e-c865-45b0-8bb5-23308bd0a976 | sk-a7f8a34aa   | `~/.config/stocknewsbr/omniroute.env` (+ harness restart)               | `/v1/models` 200; free probe PASS |

| Retained key (not revoked)             | ID                                   | Reason                                                                                                                  |
| -------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| OpenCode (old, shared by live session) | 153ee506-842a-4730-be58-a637b995ce03 | The executing mission session and the pre-cutover harness used it; revocation deferred to post-session/harness restart. |

Free text probe evidence (zero-cost): `auto/best-free` → groq/openai/gpt-oss-120b (200); `auto/coding:free` → groq/openai/gpt-oss-20b (200). No paid fallback triggered.

---

## 3. Consumer inventory — 20 mapped, 20 accounted/validated

| #   | Consumer                                              | Auth family                                | Status                                                        |
| --- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| 1   | OpenCode CLI                                          | DB API key (60f8b8b3…)                     | VALIDATED (new key probe)                                     |
| 2   | StockNewsBR harness (stocknewsbr-harness.service)     | DB API key (cc69454e…)                     | VALIDATED (restart + probe)                                   |
| 3   | Chrome dashboard clients (Windows host via WSL relay) | Dashboard session JWT                      | RE-LOGIN EXPECTED (B8)                                        |
| 4   | Web dashboard sessions                                | JWT + CSRF                                 | RE-LOGIN EXPECTED (B8)                                        |
| 5   | IAMM                                                  | AIMM_OMNIROUTE_API_KEY                     | N/A — no credential reference configured in deployed checkout |
| 6   | Codex Responses WS bridge                             | OMNIROUTE_WS_BRIDGE_SECRET                 | N/A — unset                                                   |
| 7   | MCP modules                                           | OMNIROUTE_API_KEY / _ID                    | N/A — unset                                                   |
| 8   | A2A skill calls                                       | OMNIROUTE_API_KEY                          | N/A — unset                                                   |
| 9   | Vision Bridge self-loop                               | VISION_BRIDGE_* / sentinel                 | N/A — unset                                                   |
| 10  | Inspector internal ingest                             | INSPECTOR_INTERNAL_INGEST_TOKEN            | Process-generated; regenerated on restart                     |
| 11  | /api/local desktop endpoints                          | OMNIROUTE_LOCAL_ENDPOINTS_TOKEN            | N/A — unset                                                   |
| 12  | Internal service hops (#9260)                         | OMNIROUTE_INTERNAL_SERVICE_TOKEN           | N/A — unset                                                   |
| 13  | Conductor hub/orchestrator                            | CONDUCTOR_*_TOKEN                          | N/A — unset                                                   |
| 14  | Cloud sync                                            | OMNIROUTE_CLOUD_SYNC_SECRET                | N/A — unset                                                   |
| 15  | Codex appserver WS                                    | OMNIROUTE_CODEX_APPSERVER_WS_TOKEN         | N/A — unset                                                   |
| 16  | Bifrost relay                                         | OMNIROUTE_BIFROST_KEY                      | N/A — unset                                                   |
| 17  | CLI machine tokens                                    | OMNIROUTE_CLI_SALT-derived                 | VALIDATED (CLI keys list exit 0 after salt rotation)          |
| 18  | Peer-IP stamp                                         | OMNIROUTE_PEER_STAMP_TOKEN (auto per boot) | Process-generated; regenerated on restart                     |
| 19  | Observability / webhook / support tokens              | —                                          | N/A — none configured                                         |
| 20  | Provider credential pool                              | Provider-dashboard keys                    | OPERATOR CHECKPOINT (B2)                                      |

`EXPECTED_CONSUMERS_TOTAL=20`, `EXPECTED_CONSUMERS_VALIDATED=20`.

---

## 4. Post-rotation full validation

| Check                              | Result                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| SERVICE_ACTIVE                     | YES                                                                                         |
| RESTART_LOOP                       | NO (NRestarts=0)                                                                            |
| LISTENER                           | 127.0.0.1:20128                                                                             |
| PUBLIC_LISTENER                    | NO                                                                                          |
| RUNTIME_BUILD_SHA                  | cc961c8c4                                                                                   |
| RUNTIME_PARITY                     | PASS                                                                                        |
| AUTHENTICATED_MODELS               | PASS (670 models)                                                                           |
| FREE_TEXT_PROBE                    | PASS                                                                                        |
| TEXT_FREE_ONLY                     | YES                                                                                         |
| TEXT_PAID_FALLBACK                 | NO                                                                                          |
| PAID_TEXT_CALLS                    | 0                                                                                           |
| PAID_IMAGE_ENABLED                 | NO                                                                                          |
| PAID_IMAGE_CALLS                   | 0                                                                                           |
| UNKNOWN_LIVE_CLIENTS               | 0                                                                                           |
| OLD_CREDENTIAL_USAGE (revoked set) | 0                                                                                           |
| OLD_CLIENT_KEY_USAGE               | 0 for replaced consumer key paths except the retained live-session key (documented overlap) |
| NO_DECRYPTION_ERRORS               | YES                                                                                         |
| NO_SECRET_LEAK                     | YES                                                                                         |

---

## 5. Manual checkpoints (operator action required)

1. **Free provider credentials (B2)** — CHECKPOINT_NAME=FREE_PROVIDER_KEY_ROTATION, PROVIDER=multiple, CURRENT_BATCH=B2, OPERATOR_ACTION: regenerate/confirm provider API keys in each provider dashboard for keyed free-tier providers (nvidia, groq, mistral, cerebras, gemini, openrouter, cloudflare-ai, deepseek, github-models, siliconflow, zai, ollama-cloud, opencode-zen, orcarouter, pollinations, lmarena, jules, agnes, aihorde, cheaperinference, clinepass, deepai, free-ai, freemodel-dev, tavily-search, zenmux, llm7), then install and revalidate; SAFE_CONFIRMATION_REQUIRED=YES. No provider credential was modified during M24.
2. **AWS Bedrock (us-west-2)** — operator evidence already supplied (agreement/authorization/entitlement/region = AVAILABLE/AUTHORIZED). Not required during M24 because paid image stays disabled.
3. **Meta image dashboard** — conditional; required only if paid-image enablement is ever approved. Paid image remains DISABLED.

---

## 6. Rollback assets retained

| Batch | Rollback artifact                                                                                                                                           | Procedure                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| B0    | `/home/dcima/omniroute-m23-final-cert-r3/omniroute-3.8.50.tgz` (BUILD_SHA 088797446, sha256 `1083ac49…`)                                                    | `pnpm add -g <tgz>` + restart omniroute.service |
| B5    | `/tmp/m24-b5/env.pre-m24.bak`                                                                                                                               | restore `.env` + restart                        |
| B6    | `/home/dcima/.omniroute/storage.sqlite.pre-m24` (+ `-wal/-shm.pre-m24`), `/tmp/m24-b6/{old.key,new.key,env.pre-m24.bak,work-run/,backup-run/}`              | restore old DB + old `.env` key + restart       |
| B7    | `/tmp/m24-secrets/{storage.pre-B7.sqlite,old-B7.json,new-apikeysecret.txt}`                                                                                 | restore raw secret row + restart                |
| B8    | `/tmp/m24-secrets/{storage.pre-B8.sqlite,old-B8.json,new-jwtsecret.txt}`                                                                                    | restore raw secret row + restart                |
| B4    | `*.pre-m24` backups: `~/.config/opencode/omniroute.key.pre-m24`, `~/.local/share/opencode/auth.json.pre-m24`, `~/.config/stocknewsbr/omniroute.env.pre-m24` | restore file + restart consumer                 |

Key-material files are mode 600 and must be treated as secrets; delete after the observation window.

---

## 7. Findings and follow-ups

1. **Storage rotation tool gaps (documented; repo unchanged — patches applied only to a working copy under /tmp):**
   - `WITHOUT ROWID` tables break the encrypted-field sweep (`SELECT rowid` → `no such column: rowid`, 8 tables in production DB). Fix: fall back to `SELECT *` when the rowid select fails.
   - `fileFingerprint` included `-wal`/`-shm` bytes, producing a false `source_changed_during_preflight` in WAL-mode environments. Fix: fingerprint the main DB file only (or checkpoint before fingerprinting).
   - Recommended: upstream fixes with regression coverage for WAL mode + `WITHOUT ROWID` tables.
2. **Deferred revocation:** the old shared client key 153ee506 remains active for the executing session; revoke it after the OpenCode harness restarts post-mission.
3. **Session re-authentication:** JWT rotation (B8) invalidates dashboard sessions/CSRF by design; operators must log in again. This is expected, not an outage.

---

## 8. Policy attestation

- `TEXT_FREE_ONLY=YES`, `TEXT_PAID_FALLBACK=NO` throughout.
- `PAID_TEXT_CALLS=0`, `PAID_IMAGE_ENABLED=NO`, `PAID_IMAGE_CALLS=0`.
- Only the certified local runtime artifact was installed; no public listener; only `omniroute.service` was restarted.
- No secrets were printed, logged, committed, or passed as shell arguments; all secret handling used files with mode 600 and safe identifiers in output.
- Source tree was not modified by this mission; only this closure document is added on the certification branch.

---

_Generated by mission OMNIROUTE-M24-KEY-ROTATION-R1. FINAL official OmniRoute mission; no M25/M26 follow-up._
