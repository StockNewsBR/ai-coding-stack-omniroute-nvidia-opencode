# Audit Recipes

These recipes are patterns that worked well in real multi-agent repository work. They are intentionally evidence-driven: every audit should end with tests, diffs and reproducible commands, not only prose.

## 1. Full repository audit

```text
Explore + Graphify + Serena
  → identify architecture, entry points, state, concurrency and external calls
Prometheus
  → convert observations into an explicit audit plan
Sisyphus
  → execute findings one by one
Specialists
  → DB / FastAPI / performance / TypeScript / security
Oracle
  → independent review of high-risk findings
Tests + SonarQube + Playwright
  → evidence
Ponytail
  → reject unnecessary abstractions and keep remediation diffs small
```

Deliverable: findings with severity, evidence, affected paths, fix, tests and residual risk.

## 2. Production bug

1. Reproduce before editing.
2. Use Serena/Graphify to trace the real call path.
3. Ask Explore to find existing tests and sibling implementations.
4. Implement the smallest safe fix with Ponytail constraints.
5. Add a regression test that fails before the fix.
6. Run targeted tests, then a broader relevant suite.
7. Ask Oracle or a separate model/provider to review the diff.

## 3. Performance/reliability campaign

Have a performance specialist inspect:

- accidental synchronous network calls in request paths;
- duplicate provider calls;
- locks and cross-process state;
- cooldown behavior;
- unnecessary thread pools;
- expensive per-request recomputation;
- database query multiplicity;
- retry storms.

Do not accept "faster" without measurements or at least a clear reduction in work performed.

## 4. Security hardening

Use a dedicated security reviewer plus SonarQube or another independent scanner. Look for:

- secrets;
- injection;
- unsafe subprocess usage;
- broken authorization boundaries;
- SSRF/private-network exposure;
- unsafe HTML rendering;
- insecure deserialization;
- missing idempotency/locking on financial or billing state;
- credentials leaking through logs.

Then verify the remediation independently.

## 5. FastAPI/backend review

Combine `fastapi-pro`, database specialists and security review. Focus on:

- async correctness;
- transaction boundaries;
- startup/shutdown lifecycle;
- background tasks;
- connection pooling;
- validation;
- request-level caching;
- ORM query shape;
- error mapping.

## 6. Next.js / React UI review

Use Vercel React Best Practices + Web Design Guidelines + Playwright MCP.

Check:

- waterfalls;
- bundle size;
- server/client boundaries;
- unnecessary re-renders;
- accessibility;
- keyboard/focus behavior;
- responsive layouts;
- E2E behavior, not only screenshots.

## 7. Provider outage drill

The best time to test fallback is before you need it.

1. Put provider A first and provider B second.
2. Confirm A serves a real request.
3. Disable/break A deliberately.
4. Send the same request.
5. Confirm B serves it.
6. Inspect OmniRoute logs to ensure you did not simply hit a hidden retry on A.

That is a real fallback test.
