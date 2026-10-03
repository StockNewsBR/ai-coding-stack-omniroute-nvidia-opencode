# No-Auth Image Candidates (OmniRoute 3.8.51, VPS production)

Date: 2026-10-03. Also referred to as `NOAUTH_IMAGE_MATRIX.md` in mission R3. Method: real E2E `POST /v1/images/generations` on the VPS gateway, no API keys.

## Verified candidates

| Provider | Models | Auth | E2E | Latency | Output | Cost | Decision |
|---|---|---|---|---|---|---|---|
| AI Horde (`aihorde`) | 146 exposed (`aihorde/Deliberate`, ...) | anonymous (no key) | 4/4 HTTP 200 | 13.0-36.4 s (queue) | RIFF/WEBP, 256x256, ~6.2 KB | `0.0000000000` | **PROD** (already in `aimm-image`) |
| Cloudflare Playground (`cfp`) | catalog image-capable | no key | HTTP 502 browser session | - | - | - | NOT USABLE (browser executable missing) |
| Veo free (`veo-free`, `veoaifree-web`) | `veo`, `seedance` | no key | HTTP 502 `VIDEO_ARTIFACT_DOWNLOAD_FAILED` (upstream 403) | ~21.7 s | none | - | NOT USABLE (video, session-restricted) |

No other image-capable no-auth provider exists in this runtime's catalog (system providers: aihorde, auggie, cloudflare-playground, devin-cli-agentic, duckduckgo-web, codex-app-server, opencode, uncloseai, veoaifree-web, zcode).

## AI Horde anonymous evidence

- Validation decode: base64 payload 8324 chars -> 6242 bytes; magic `RIFF`, format `WEBP`, dimensions 256x256.
- Repeats: 23.9 s / 13.0 s / 13.4 s / 14.5 s; all `x-omniroute-provider: horde`, `x-omniroute-response-cost: 0.0000000000`, `x-omniroute-version: 3.8.51`.
- No key was created or used (mission constraint). AI Horde text models are key-required (401) and are excluded from production pools.

## Final image pool

1. VERIFIED FREE: `aihorde` (anonymous).
2. Fallback: none other verified -> fail cleanly.
3. Never an automatic paid image route (`hidePaidModels=true`, `freeAccessPolicy=strict`).
