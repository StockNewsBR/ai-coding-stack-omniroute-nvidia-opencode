# Upstream Watchlist 3.8.52 (do not install yet)

Date: 2026-10-03
Policy: PRODUCTION = OFFICIAL_RELEASE_ONLY. Target stays **3.8.51** until an official 3.8.52 release is published.

## Current state

- Upstream branch `release/v3.8.52` exists (head `23a11484862b3bb589a55e85b00e4ac53ffeb234` at audit time) — branch/development only.
- No official GitHub release and no new npm dist-tag beyond `3.8.51` at audit time.
- Do **not** install `@latest` blindly, do not use beta/rc/nightly/dev builds.

## Watch items

1. Official GitHub release for 3.8.52 (release notes + tag commit).
2. `npm view omniroute version` and dist-tags (`latest` must point to the official version).
3. Docker tag `diegosouzapw/omniroute:3.8.52` — record the pull-time digest; repushes have been observed for old tags, so digest-pin after verifying the in-image app version.
4. `.env.example` delta vs 3.8.51 (new/renamed/removed vars) before adoption.
5. DB migrations range (we applied 163-186 on VPS; verify no destructive migrations).
6. Free-tier / strict zero-cost changes (`FREE_MODEL_BUDGETS` classification).
7. Security advisories (GHSA) and management-auth changes.
8. `@omniroute/opencode-plugin-v2` maturity (only relevant when OpenCode 2.x is adopted).
9. DeepSeek / Gemini / NVIDIA / Codex / ChatGPT Web provider registry updates.
10. Compression engine changes (re-run the IAMM benchmark if defaults change).

## Re-evaluation pipeline (when 3.8.52 is released)

1. `npm view omniroute version` -> confirm official 3.8.52.
2. Fresh VPS snapshot (`scripts/omniroute-backup.sh` pattern; sha256 + offsite copy).
3. `scripts/omniroute-upgrade-preflight.sh` on VPS.
4. Pull image, verify in-image app version, update bootstrap pin (digest), run install, restart.
5. `scripts/omniroute-post-upgrade-verify.sh` (version, single listener, healthz, authed /v1/models, free chat) + contract `health`.
6. Re-run FREE E2E (text + image) and confirm `PAID_CALLS=0`.
7. Update docs/reports and repeat delivery pipeline (commit -> push -> parity -> health).
