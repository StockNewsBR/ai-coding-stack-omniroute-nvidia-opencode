# OmniRoute Free-First Routing Profiles (IAMM)

Date: 2026-10-03
Runtime: VPS production OmniRoute 3.8.51 (image digest `sha256:8bd462c9f60d8eda79329cfbb6ea7ea723505fe7721beb944f3d43835409e218`)
Policy: `freeAccessPolicy=strict`, `hidePaidModels=true`, paid fallback flags false, `AIMM_AI_POLICY=FREE_ONLY`

## Philosophy

1. FREE VERIFIED provider first (ddgw keyless text; aihorde keyless image)
2. FREE VERIFIED alternate model second
3. Fail cleanly if no free target is usable

Paid/trial/credit providers are excluded by the strict zero-cost policy and are never selected.
Every custom profile is a `priority` combo so dispatch is deterministic and explainable.

## Custom combos created (2026-10-03)

| Profile | Combo id | Models (priority order) | IAMM workload |
| --- | --- | --- | --- |
| `aimm-default` | 4cc457fb-db6d-4e43-a785-87a92d1640e3 | ddgw/gpt-5.4-mini, ddgw/gpt-5.6-luna | A) copy / social text, general chat |
| `aimm-quality` | ecc9cdd0-f3b2-4b4b-93e7-fe8869f011fd | ddgw/gpt-5.6-luna (1.05M ctx), ddgw/gpt-5.4-mini, ddgw/claude-haiku-4-5 | B) long-form / reasoning |
| `aimm-fast` | 1b221de2-62e5-456d-9ea4-a671c965b88d | ddgw/gpt-5.4-mini, ddgw/claude-haiku-4-5 | latency-sensitive jobs |
| `aimm-coding` | 1b747e78-104a-4de2-84b0-66995fa3e944 | ddgw/gpt-5.6-luna, ddgw/gpt-5.4-mini, ddgw/tinfoil/gpt-oss-120b | C) coding / admin automation |
| `aimm-image` | 0df71b6e-31a9-41f8-91e1-6794847c2a8a | aihorde/Deliberate | D) image generation (`/v1/images/generations`) |
| `aimm-failover-proof` | dce18c85-9e9d-4e4e-b4cd-04fb68275908 | oc/deepseek-v4-flash-free, ddgw/gpt-5.4-mini | regression test: FREE -> FREE failover |

Usage: send `model` = profile name (e.g. `aimm-default`) to `POST /v1/chat/completions`; `aimm-image` to `POST /v1/images/generations`.

## Evidence (VPS, 2026-10-03)

| Test | Result |
| --- | --- |
| `aimm-failover-proof` | HTTP 200, `x-omniroute-fallback-attempts: 1`, provider ddgw, cost 0.0000000000 -> oc cooldown (429) failed over to ddgw |
| `aimm-default` | HTTP 200 in 0.86s, provider ddgw, cost 0.0000000000 |
| `aimm-image` | HTTP 200 in 23.9s, provider horde, cost 0.0000000000 (b64 WebP) |
| horde text (direct) | HTTP 401 key required -> removed from `aimm-default` |

## Failure semantics (upstream 3.8.51)

- Transient failures (timeout, network, 429, provider 5xx) are retried across providers (default policy up to 3 provider attempts).
- Auth/permission/invalid-request/unavailable-model errors are not retried blindly.
- Circuit breaker states: closed / open / half-open; cooldown schedules a bounded probe; success closes.

## Not adopted

- `auto/*` built-ins stay available but their pools are starved on this VPS (they resolve to keyless `opencode`, which cools down and is OpenCode-client-gated). Custom `aimm-*` combos avoid that.
- Vision profile: no free vision route is currently exposed under strict policy (`auto/vision` pool empty); ddgw vision-capable models exist but vision E2E is not verified. Status: TEST_ONLY.
- Video: `veo-free/*` keyless models exist (4) but are untested. Status: TEST_ONLY.

## Rollback

Delete individual combos:

```
curl -X DELETE -b <admin-cookie> http://127.0.0.1:20128/api/combos/<id>
```

Or delete all six ids listed above. No routing policy settings were changed for profiles.
