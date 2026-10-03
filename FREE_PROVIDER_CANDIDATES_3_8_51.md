# FREE Provider Candidates — OmniRoute 3.8.51 (audited 2026-10-03)

Audit basis: production VPS OmniRoute 3.8.51 (FREE_ONLY strict, zero configured connections) + local workstation mirror. Every candidate below was observed in the live catalog; only items with a real E2E keep their tier claim.

| Candidate | Kind | Models | Auth | Real E2E | Cost proof | Recommendation |
|---|---|---|---|---|---|---|
| `ddgw` keyless web models | text | 6 (ctx up to 1,050,000) | none required | PASS — `gpt-5.4-mini`, HTTP 200, ~1.2 s | `x-omniroute-response-cost: 0.0000000000` | **ADOPT_NOW** as free text route |
| AI Horde (`aihorde/*`) | image | 146 | none required | PASS — `Deliberate`, HTTP 200, ~35 s, b64 WebP | `x-omniroute-response-cost: 0.0000000000` | **ADOPT** (already live) |
| Veo free web (`veo-free/*`, `veoaifree-web/*`) | video | 4 | none required | not tested | — | TEST_ONLY |
| uncloseai (`unc/*`) | text | 1 (`Qwen3.6-27B-int4`) | none required | FAILED — 404 model missing | — | MONITOR |
| OpenCode Zen keyless (`oc/*`) | text | 2 | none, but restricted | 403 `FreeTierError` outside OpenCode; sibling model in 30-min cooldown | — | CONDITIONAL (OpenCode clients only) |

Rules applied (unchanged):
1. Only adopt a provider with proven zero real cost, secure auth, stable health and a passing REAL E2E.
2. Never introduce an automatic paid fallback; `PAID_FALLBACK=0` stays enforced.
3. Keep production `hidePaidModels=true` and `freeAccessPolicy=strict`.
4. Verify pull-time image digests and provider catalog changes before promoting anything.

Suggested next steps (not enabled by this mission):
- Promote `ddgw` to a named free combo (e.g. `stocknewsbr-free-text`) once a second candidate exists to make free→free failover meaningful.
- Re-test `veo-free` video paths with a small, explicit workload.
- Re-check `unc/*` periodically; keep it disabled meanwhile.
