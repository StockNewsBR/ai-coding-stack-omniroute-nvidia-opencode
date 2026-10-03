# No-Auth Providers R3 Matrix (OmniRoute 3.8.51, VPS production)

Date: 2026-10-03. Method: real E2E against the VPS gateway (`http://127.0.0.1:20128`), **no API keys added or used**, prompt `Reply only with: NOAUTH_OK` (max_tokens 12), image `simple blue circle on white background` 256x256, text candidates repeated 3x. Cost read from `x-omniroute-response-cost`.

| Provider (id) | Modality | Really no key? | Runtime dependency | E2E result | Cost | Status |
|---|---|---|---|---|---|---|
| duckduckgo-web (`ddgw`) | TEXT | Yes | none (TRUE_ZERO_CONFIG) | 3/3 HTTP 200, 0.82-0.96 s, valid completions | $0 | **PROD** |
| AI Horde (`aihorde`) | IMAGE | Yes (anonymous) | none | 4/4 HTTP 200, 13.0-36.4 s queue, RIFF/WEBP 256x256 | $0 | **PROD** |
| AI Horde (`horde`) | TEXT | No | API key required | HTTP 401 "provider requires API key" | - | KEY_REQUIRED (excluded) |
| OpenCode Free (`oc`) | TEXT | No real no-auth | restricted to OpenCode client | 403 FreeTierError "usable only within OpenCode"; 429 model cooldown | - | CLIENT_RESTRICTED |
| UncloseAI (`unc`) | TEXT | Yes | none | HTTP 404 "model does not exist" (unstable) | - | BROKEN |
| Auggie (`aug`) | TEXT/AGENT | Yes | Auggie CLI (`AUGGIE_BIN`) | HTTP 502 "Auggie CLI not found" | - | LOCAL_BRIDGE_REQUIRED |
| Cloudflare Playground (`cfp`) | TEXT (image-capable catalog) | Yes | Playwright browser executable | HTTP 502 "browserType.launch: executable missing" | - | LOCAL_BRIDGE_REQUIRED (TEST_ONLY) |
| Devin CLI (`dva`) | AGENT | Yes | `DEVIN_AGENTIC_HOME` bridge sandbox | HTTP 500 "DEVIN_AGENTIC_HOME must be absolute path inside bridge sandbox" | - | LOCAL_BRIDGE_REQUIRED |
| Codex App-Server (`cxa`) | AGENT | Yes | transport URL/token | HTTP 503 "transport not configured (missing url or token)" | - | LOCAL_BRIDGE_REQUIRED |
| ZCode (`zc`) | TEXT/CODING | Yes | `zcode` CLI on PATH | HTTP 502 "spawn zcode ENOENT" | - | LOCAL_BRIDGE_REQUIRED |
| Veo free (`veo-free`, `veoaifree-web`) | VIDEO | Yes | browser session | HTTP 502 `VIDEO_ARTIFACT_DOWNLOAD_FAILED` (upstream 403) | - | CLIENT_RESTRICTED / BROKEN |

## Classification (mission A-F)

- **A — TRUE_ZERO_CONFIG**: `ddgw` (text), `aihorde` (image). Production approved.
- **B — NO_API_KEY_BUT_LOCAL_BRIDGE_REQUIRED**: `aug`, `cfp`, `dva`, `cxa`, `zc`. Not enabled: no bridge/browser installed on the VPS; enabling would add local runtime dependencies and browser automation to production.
- **C — CLIENT_RESTRICTED**: `oc` (OpenCode client only), `veo`/`veoaifree-web` (artifact 403).
- **D — BROKEN**: `unc` (404 model missing).
- **E — RATE_LIMITED**: none observed persistently; `oc` shows 429 cooldowns while cooling.
- **F — TEST_ONLY**: video route, vision route.

## Notes

- `hidePaidModels=true` and `freeAccessPolicy=strict` remain the exposure gate; this audit did not weaken them.
- The five bridge/browser providers did reach provider dispatch (their own runtime errors were returned), i.e. "No Auth" in the dashboard does not mean usable — exactly the risk this mission targeted.
- AI Horde text models require a key and were removed from `aimm-default` in R2.
- Zero paid calls: every 200 carried `x-omniroute-response-cost: 0.0000000000`.
