# Upstream 3.8.52 Watchlist — R3

Date: 2026-10-03. Rechecked `git ls-remote https://github.com/diegosouzapw/OmniRoute`:

- `release/v3.8.52` head: `23a11484862b3bb589a55e85b00e4ac53ffeb234` (unchanged since R2).
- No `v3.8.52` tag exists; no npm release; Docker tag not published.
- `release/v3.8.51` head unchanged: `2f42a9ac19d1a247ec9ce5473b790843724b3061`; tag `v3.8.51` = `770faa7144f58ada625afc6efe572c8335484ec4`.

## Decision

**DO NOT INSTALL 3.8.52.** Production stays on official 3.8.51 (VPS digest `sha256:8bd462c9…`). Version policy: official releases only, explicit version/digest, never `@latest`.

## Watch items for the next official release

1. Release publication (GitHub release + npm dist-tag + Docker tag with verified digest).
2. No-auth lane fixes: Auggie CLI detection, Cloudflare Playground browser dependency, Devin bridge sandbox, Codex app-server transport, ZCode spawn, OpenCode free-tier client restriction.
3. Vision/multimodal routing fixes (DDGW ERR_BAD_REQUEST; empty `auto/vision` pool).
4. Video bridge artifact 403 (Veo free) — usability or clear removal.
5. Routing/proxy/tool-calling fixes and error-semantics changes.
6. Security advisories (GHSA) and management-auth changes.
7. Compression engine defaults (RTK/Caveman/OmniGlyph/stacked) — re-benchmark before adoption.
8. Env contract delta and migrations (schema gates; snapshot before any upgrade).
9. Model-visibility semantics (allowlist providerId matching, video bypass) — check if fixed.
10. OpenCode plugin-v2 / OpenCode 2.x readiness (still DEFER).

## Re-evaluation pipeline (unchanged)

`npm view omniroute version` -> snapshot (`scripts/omniroute-backup.sh`) -> `scripts/omniroute-upgrade-preflight.sh` -> pull + verify in-image version/digest -> pin + install via canonical bootstrap -> `scripts/omniroute-post-upgrade-verify.sh` -> real FREE E2E -> delivery/parity.

See also: `reports/UPSTREAM_WATCHLIST_3_8_52.md` (R2).
