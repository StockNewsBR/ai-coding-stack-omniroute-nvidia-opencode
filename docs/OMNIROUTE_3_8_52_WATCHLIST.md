# OmniRoute 3.8.52 Watchlist (research only — DO NOT INSTALL)

- Status as of 2026-10-03: upstream branch `release/v3.8.52` exists at head `23a11484862b3bb589a55e85b00e4ac53ffeb234`. There is **no official 3.8.52 npm release** (`npm view omniroute version` = `3.8.51`). The v3.8.51 GitHub release even pointed `target_commitish` at `release/v3.8.52`, which only reflects release-engineering branching.
- Policy: production = official releases only (user policy, 2026-10-03). Target stays `3.8.51`. Never install beta/rc/nightly/branch builds; never `@latest` blindly.

## What to watch when 3.8.52 is officially published

1. npm dist-tag `latest` moving to 3.8.52 **and** an official GitHub release page.
2. Docker Hub `diegosouzapw/omniroute:3.8.52` tag with a pull-time digest; verify app version + Node version inside the image before pinning.
3. `.env.example` delta vs 3.8.51 (new/removed/default-changed variables).
4. Migrations added after `196_token_limits_unique_per_window` and whether automatic pre-migration backups remain in place.
5. Free-tier / routing changes (eligibility buckets, `customModels[].isFree`, expiry-first fallback, 429 semantics, breaker logic).
6. Security advisories/GHSAs fixed in the release.
7. `@omniroute/opencode-plugin-v2` maturity (track OpenCode 2.x availability locally — currently 1.18.34).
8. DeepSeek / GLM / Gemini / NVIDIA model-registry updates and context-window changes.

## Re-evaluation trigger

When items 1–2 are satisfied, run the same safe pipeline as this mission (R2):

```
preflight → backup (sha256 + offsite) → rollback proof → digest-pinned pull
→ verify image contents → patch pin → install → restart via supervisor
→ post-upgrade verify → free E2E → zero-paid confirmation → reports
```

No action from this watchlist is adopted automatically; each item is classified before use.
