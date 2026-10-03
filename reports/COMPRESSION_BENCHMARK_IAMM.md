# Compression Benchmark — IAMM Payloads (OmniRoute 3.8.51)

Date: 2026-10-03
Runtime: VPS production (container `aimmarketmaster-omniroute`, 3.8.51)
Model: `ddgw/gpt-5.4-mini` (free, keyless)
Payload: 7,136 chars (~1,954 tokens) of structured repeated steps ending with a unique verification code (`7391`)
Method: identical request; `GET/PUT /api/settings/compression` toggles; response `usage.prompt_tokens` plus `x-omniroute-compression` header compared; answer correctness checked.

## Results

| Mode | HTTP | Latency | prompt_tokens | Header | Answer |
| --- | --- | --- | --- | --- | --- |
| off (baseline) | 200 | 0.86s | 1954 | `off; source=off` | 7391 correct |
| lite (Caveman lite) | 200 | 1.02s | 1954 | `lite; source=default` | 7391 correct |
| off (reverted, verified) | 200 | 0.83s | 1954 | `off; source=off` | 7391 correct |

## Interpretation

- `lite` produced **zero token reduction** on plain prose/instructions (Caveman lite targets roles/patterns and tool results, not general prose).
- `lite` added ~0.2s latency with no benefit.
- `standard`, `aggressive`, `ultra`, `omniglyph` were not adopted: quality risk for IAMM copy/long-form content is not justified by the measured benefit.
- RTK is intended for terminal/shell/build output compression (coding agents), not for IAMM text jobs.

## Decision

**Keep compression OFF** (`enabled=false`, `defaultMode=off`). Classification: TEST_ONLY / DEFER.
Rollback was exercised: `PUT /api/settings/compression {"enabled":false,"defaultMode":"off"}` responded 200 and the post-revert request showed `off; source=off`.

## Re-evaluation triggers

- If IAMM adopts coding-agent workflows (RTK for tool outputs).
- If OmniRoute ships compression with quality guarantees for prose (benchmark again with a real IAMM post dataset).
