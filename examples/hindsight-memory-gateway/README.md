# Hindsight Memory Gateway — Reusable Example

This example turns Hindsight into a governed, project-scoped memory layer for multiple coding agents.

It is intentionally generic: no product names, private architecture facts, provider secrets or proprietary seed memories are included.

## Architecture

```text
Agent OS / coding agents
          |
          v
   Memory Gateway
          |
          v
      Hindsight
```

The gateway adds deterministic controls before memory reaches Hindsight:

- project-scoped banks (`{project}-{domain}`);
- memory taxonomy and confidence levels;
- provenance metadata;
- secret rejection;
- prompt-injection flagging;
- explicit canonical promotion;
- bounded recall;
- circuit-breaker fail-safe behavior.

## Files

```text
docker-compose.yml      local Hindsight deployment
hindsight_client.py     small HTTP adapter
memory_gateway.py       governance/safety layer
test_memory_gateway.py  hermetic unit tests
```

## Start Hindsight

```bash
cd examples/hindsight-memory-gateway
docker compose up -d
```

Expected local endpoints:

```text
REST API:      http://127.0.0.1:8888
Control Plane: http://127.0.0.1:9999
```

The compose file binds both ports to loopback only and persists data in a Docker volume.

## Run tests

```bash
cd examples/hindsight-memory-gateway
python3 -m unittest -v test_memory_gateway.py
```

The unit tests do not require a running Hindsight instance because they use an in-memory dummy client.

## Minimal usage

```python
from memory_gateway import MemoryGateway

memory = MemoryGateway(project="my-project")

memory.retain(
    domain="core",
    text="Background jobs own long-running work.",
    memory_type="DECISION",
    confidence="HIGH",
    source_agent="opencode",
    source="architecture-review",
    repo="org/repo",
    branch="main",
    commit="abc123",
    verified=True,
)

result = memory.recall(
    domain="core",
    query="Where does long-running work execute?",
    top_k=5,
)
```

## Canonical promotion

Canonical memory is intentionally explicit:

```python
memory.retain(
    domain="canonical",
    text="This is a verified invariant.",
    memory_type="CANONICAL",
    confidence="CANONICAL",
    source_agent="human-review",
    source="manual-promotion",
    verified=True,
    allow_canonical=True,
)
```

Without `allow_canonical=True`, canonical retention is rejected.

Untrusted/injection-like content is rejected from canonical promotion even when explicit promotion is requested.

## Recommended domains

```text
canonical
core
agent-os
security
market-data
web-ui
```

Add or remove domains according to the repository. The reusable code never hard-codes a product-specific namespace.

## Important API note

Hindsight evolves quickly. `hindsight_client.py` deliberately isolates endpoint-specific details so upgrades only require changing the adapter. Before production use, compare the adapter paths and payloads with the Hindsight version you deploy.

## Production guidance

Treat memory as auxiliary infrastructure. If Hindsight is unavailable, coding or audit workflows should continue without memory instead of taking unrelated services down.

Do not automatically retain full conversations, shell dumps or unverified model statements. Prefer verified fixes, decisions, constraints, known bugs, rejected findings with evidence and explicitly promoted canonical facts.

For the broader design and validation rationale, see [`../../docs/11-hindsight-memory-gateway.md`](../../docs/11-hindsight-memory-gateway.md).
