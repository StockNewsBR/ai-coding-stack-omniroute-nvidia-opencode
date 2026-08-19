# Hindsight Memory Gateway — Cross-Agent Persistent Memory

> **Lab-validated: 2026-08-19** — Hindsight v0.9.1, self-hosted with Docker, persistent storage, multi-bank memory, safety gating, recall/retain/reflect, restart persistence and fail-safe isolation.

## Public reusable implementation

A sanitized, project-agnostic implementation is included in this repository:

```text
examples/hindsight-memory-gateway/
├── README.md
├── docker-compose.yml
├── hindsight_client.py
├── memory_gateway.py
└── test_memory_gateway.py
```

It intentionally contains no product-specific names, private seed memories, proprietary architecture facts or credentials. Project banks are derived from a configurable namespace such as `{project}-core` and `{project}-canonical`.

## Why add a memory gateway?

Coding agents are good at solving the task in front of them, but independent sessions and different agents repeatedly rediscover the same architecture decisions, known bugs, rejected findings and operational constraints.

A shared memory layer changes the topology:

```text
                 Agent OS
                    |
              Memory Gateway
                    |
                Hindsight
                    |
      +-------------+-------------+
      |             |             |
   OpenCode       Claude       Gemini/Codex
      |             |             |
      +-------- DeepSeek Harness -+
```

Hindsight provides the persistence and semantic retrieval. The **Memory Gateway** provides governance: what may be stored, what may become canonical, how provenance is attached, and how untrusted or sensitive content is rejected.

## Validated deployment

The lab deployment used the official Hindsight container with:

- Hindsight **v0.9.1**;
- REST API bound to **127.0.0.1:8888** only;
- Control Plane / Web UI bound to **127.0.0.1:9999** only;
- embedded PostgreSQL/pgvector persistence in a Docker volume;
- local `bge-small-en-v1.5` embeddings;
- persistence verified across a full container stop/start cycle;
- no dependency from the application runtime on memory availability.

The key design rule is simple: **memory is auxiliary infrastructure**. If it fails, coding/audit workflows should continue without memory rather than fail closed or stall indefinitely.

## Memory operations

The gateway exposes the three core Hindsight operations:

### Retain

Store a verified fact or experience together with provenance and confidence metadata.

### Recall

Retrieve a small, relevant set of memories before an agent begins work. Do not dump the entire memory bank into the prompt; use a conservative top-K and a context-size budget.

### Reflect

Ask Hindsight to synthesize an insight from existing memories. Reflections are derived inference, **not canonical truth**, until independently validated.

## Memory taxonomy

A useful governance taxonomy is:

```text
OBSERVATION
EXPERIENCE
DECISION
CONSTRAINT
KNOWN_BUG
FIX_VERIFIED
REJECTED_FINDING
CANONICAL
```

Suggested confidence levels:

```text
LOW
MEDIUM
HIGH
CANONICAL
```

`CANONICAL` should never be promoted automatically from a single model response.

## Multi-bank partitioning

Avoid one giant memory bank. Partition memory by concern, with the project namespace supplied through configuration rather than hard-coded into the gateway.

Example:

```text
{project}-canonical
{project}-core
{project}-agent-os
{project}-security
{project}-market-data
{project}-web-ui
```

This keeps the gateway reusable across repositories while preventing unrelated memories from dominating semantic recall.

## Provenance envelope

Every retained memory should carry enough metadata to explain where it came from:

```json
{
  "project": "<project-namespace>",
  "bank": "<bank>",
  "type": "FIX_VERIFIED",
  "confidence": "HIGH",
  "source_agent": "opencode",
  "source": "mission-or-command",
  "repo": "<repo>",
  "branch": "<branch>",
  "commit": "<commit>",
  "timestamp": "<timestamp>",
  "verified": true
}
```

Use native metadata when available; otherwise use structured tags or a small envelope around the retained fact.

## Safety gate

The lab implementation placed a deterministic gate **before** Hindsight retention.

### Secret rejection

Incoming memories are scanned for common credentials and high-risk material such as:

- API keys;
- GitHub tokens;
- Bearer tokens;
- JWTs;
- private keys;
- database URLs containing credentials.

Rejected content never reaches Hindsight. Logs record only a generic rejection event and never echo the detected secret.

### Prompt-injection flagging

Memories derived from untrusted external content are tagged as untrusted when they contain attempts to override instructions, exfiltrate data or disable security controls.

Untrusted content must never be automatically promoted to canonical memory.

### Canonical promotion gate

Canonical memory requires an explicit promotion action. A normal agent retain operation cannot silently convert an observation into a permanent architectural rule.

This prevents the failure mode:

```text
false positive
    -> retained as fact
    -> recalled by another agent
    -> repeated as truth
    -> unnecessary remediation
```

## Stale and superseded memory

Persistent memory needs lifecycle semantics. A practical overlay is:

```text
ACTIVE
SUPERSEDED
STALE
REJECTED
```

Recall should prefer active, verified and higher-confidence memories. New decisions should supersede old ones rather than leaving contradictory facts equally authoritative.

## Circuit breaker and timeouts

Memory must not become a new single point of failure.

The validated gateway uses:

- request timeouts;
- graceful recall failure;
- non-blocking retain failure after a completed task;
- a circuit breaker that opens after repeated API failures;
- workflow continuation while memory is unavailable.

## Validation results

The initial lab validation completed:

```text
13/13 unit tests PASS
5/5 live smoke tests PASS
```

The live smoke suite covered:

1. secret rejection before storage;
2. canonical-gate rejection;
3. real retain;
4. real recall;
5. real reflect.

Restart persistence was also validated by retaining memory, stopping the container, starting it again and recalling the same verified fact with provenance intact.

## Backup

Persistent memory should be backed up independently from application data. The validated setup creates an archive of the Hindsight persistent volume/state and keeps backup/restore procedures separate from application deployment.

Do not include environment secrets in memory backups.

## Recommended agent workflow

```text
TASK
  |
  v
derive a narrow memory query
  |
  v
recall 3-8 relevant memories
  |
  v
agent executes task
  |
  v
extract candidate memories
  |
  v
secret + injection scan
  |
  v
classification + provenance
  |
  v
Memory Gate
  |       |
 reject   retain
           |
           v
       Hindsight
```

Do **not** automatically retain complete conversations, shell logs or every model observation. Good candidates are verified fixes, confirmed constraints, architectural decisions, important known bugs and rejected findings backed by evidence.

## Agent OS integration

For an orchestration layer such as DeepSeek Harness, the safest integration points are:

```text
pre-task hook  -> recall
post-task hook -> candidate retain -> Memory Gate
```

Start behind a feature flag and keep memory optional until live tests pass.

A single gateway is preferable to independent direct integrations because it gives OpenCode, Claude, Gemini, Codex and Harness the same retention and security policy.

## Health checks

A useful permanent health probe checks:

```text
service reachable
API responding
persistent storage available
configured banks available
```

Memory health should be visible in the Agent OS status output, but a failed memory probe must not restart or degrade unrelated services.

## Public-repo hygiene

Keep the gateway generic by design:

- use `{project}` namespaces instead of product names in reusable code;
- do not publish private architecture facts as seed memories;
- do not publish provider credentials, internal URLs or proprietary business rules;
- keep project-specific seed data outside the reusable gateway;
- publish policies, interfaces and examples rather than private memory contents.

## Bottom line

Hindsight solves **persistent semantic memory**. The Memory Gateway solves **trust and governance**.

Together they turn a collection of independent coding agents into a system that can reuse verified knowledge across sessions without treating every previous model statement as permanent truth.
