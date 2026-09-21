/**
 * OMNIROUTE_FREE_AI_MANAGER_STRESS_AUDIT_R1
 *
 * Deterministic stress / resilience validation of the FREE AI Manager:
 * dynamic free-route discovery, cost-class denial under stress, free-to-free
 * failover and recovery, capability isolation, bounded retry, concurrency.
 *
 * No network calls, no DB writes, no provider inference. Fault injection is
 * local: injected connection views, quota readings, and breaker probes.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTO_FREE_ALLOWED_COST_CLASSES,
  classifyFreeCost,
  evaluateFreeSentinel,
  findFreeCatalogEntry,
} from "../../open-sse/services/autoCombo/freeProviderSentinel.ts";
import type {
  FreeCostCandidate,
  FreeCostClass,
} from "../../open-sse/services/autoCombo/freeProviderSentinel.ts";
import { FREE_MODEL_BUDGETS } from "../../open-sse/config/freeModelCatalog.ts";
import type { FreeModelBudget } from "../../open-sse/config/freeModelCatalog.ts";
import {
  filterStrictZeroCostCandidates,
  filterTosAvoidCandidates,
} from "../../open-sse/services/autoCombo/strictZeroCostFilter.ts";
import type { FreeAccessState } from "../../open-sse/services/autoCombo/strictZeroCostFilter.ts";
import { filterResilienceBlockedCandidates } from "../../open-sse/services/autoCombo/resilienceCandidateFilter.ts";
import { filterExcludedCandidates } from "../../open-sse/services/autoCombo/candidateOverrides.ts";
import { selectWithStrategy } from "../../open-sse/services/autoCombo/routerStrategy.ts";
import type { ProviderCandidate } from "../../open-sse/services/autoCombo/scoring.ts";
import {
  CircuitBreakerOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
} from "../../src/shared/utils/circuitBreaker.ts";
import { applyComboTargetExhaustion } from "../../open-sse/services/combo/targetExhaustion.ts";
import type { ComboExhaustionSets } from "../../open-sse/services/combo/targetExhaustion.ts";
import {
  MAX_GLOBAL_ATTEMPTS,
  MAX_GLOBAL_ATTEMPTS_HARD_CAP,
  clampGlobalAttempts,
  getExhaustedTargetSkipReason,
  shouldRecordProviderBreakerFailure,
} from "../../open-sse/services/combo/comboPredicates.ts";
import {
  buildFreeSearchChain,
  classifySearchProviderFreeStatus,
  isSelfHostedBaseUrl,
  runFreeSearchChain,
} from "../../open-sse/services/searchFreeRouting.ts";
import type { FreeSearchChainEntry } from "../../open-sse/services/searchFreeRouting.ts";
import type { SearchProviderConfig } from "../../open-sse/config/searchRegistry.ts";
import {
  NO_FREE_IMAGE_PROVIDER_AVAILABLE,
  resolveFreeImageProvider,
} from "../../open-sse/config/freeImageRouting.ts";
import { buildAutoCandidateFilter } from "../../open-sse/services/autoCombo/suffixComposition.ts";
import {
  __testing as freeAccessTesting,
  readFreeAccessStateCached,
} from "../../open-sse/services/autoCombo/freeAccessQuota.ts";
import { USAGE_FETCHER_PROVIDERS } from "../../open-sse/services/usage.ts";

const NOW = "2026-09-21T00:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const OPTIONS = {
  minRemainingAllowance: 1,
  maxStateAgeMs: 180_000,
  now: () => NOW_MS,
};

const CEREBRAS = { provider: "cerebras", model: "zai-glm-4.7" };
const GROQ = { provider: "groq", model: "llama-3.3-70b-versatile" };
const CEREBRAS_CONN = "cerebras-conn-1";
const GROQ_CONN = "groq-conn-1";

type Readings = (provider: string, connectionId: string) => FreeAccessState | undefined;
type ConnView = {
  id: string;
  rateLimitedUntil?: string | null;
  testStatus?: string | null;
};
interface PoolCand {
  provider: string;
  model: string;
  connectionId?: string;
  allowedConnectionIds?: string[];
}

function catalogEntry(provider: string, modelId: string): FreeModelBudget {
  const entry = FREE_MODEL_BUDGETS.find(
    (row) => row.provider === provider && row.modelId === modelId,
  );
  assert.ok(entry, `catalog row missing: ${provider}/${modelId}`);
  return entry;
}

function reading(overrides: Partial<FreeAccessState> = {}): FreeAccessState {
  return {
    status: "SAFE",
    remainingFreeAllowance: 40,
    resetAt: null,
    checkedAt: NOW,
    ...overrides,
  };
}

function readingsFor(
  entries: Array<[string, string, FreeAccessState]>,
): Readings {
  const map = new Map(entries.map(([p, c, r]) => [`${p}::${c}`, r]));
  return (provider, connectionId) => map.get(`${provider}::${connectionId}`);
}

function healthyReadings(): Readings {
  return readingsFor([
    [CEREBRAS.provider, CEREBRAS_CONN, reading()],
    [GROQ.provider, GROQ_CONN, reading()],
  ]);
}

function connMap(entries: ConnView[]): Map<string, ConnView> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function healthyConnections(): Map<string, ConnView> {
  return connMap([{ id: CEREBRAS_CONN }, { id: GROQ_CONN }]);
}

function basePool(): PoolCand[] {
  return [
    { ...CEREBRAS, connectionId: CEREBRAS_CONN },
    { ...GROQ, connectionId: GROQ_CONN },
  ];
}

function pipeline(
  pool: PoolCand[],
  connections: Map<string, ConnView>,
  readings: Readings,
  options: {
    minRemainingAllowance?: number;
    maxStateAgeMs?: number;
    now?: () => number;
    catalog?: FreeModelBudget[];
  } = {},
): PoolCand[] {
  const resilienceFiltered = filterResilienceBlockedCandidates(
    pool,
    connections,
  );
  const quotaFiltered = filterStrictZeroCostCandidates(resilienceFiltered, {
    enabled: true,
    resolveFreeAccessState: readings,
    minRemainingAllowance:
      options.minRemainingAllowance ?? OPTIONS.minRemainingAllowance,
    maxStateAgeMs: options.maxStateAgeMs ?? OPTIONS.maxStateAgeMs,
    now: options.now ?? OPTIONS.now,
    catalog: options.catalog,
  });
  return filterTosAvoidCandidates(quotaFiltered, true, options.catalog);
}

function candidate(
  provider: string,
  model: string,
  overrides: Partial<ProviderCandidate> = {},
): ProviderCandidate {
  return {
    provider,
    model,
    quotaRemaining: 100,
    quotaTotal: 100,
    circuitBreakerState: "CLOSED",
    costPer1MTokens: 0,
    p95LatencyMs: 120,
    latencyStdDev: 10,
    errorRate: 0,
    ...overrides,
  };
}

function selectionPool(providers?: string[]): ProviderCandidate[] {
  const pool = [
    candidate(CEREBRAS.provider, CEREBRAS.model, { connectionId: CEREBRAS_CONN }),
    candidate(GROQ.provider, GROQ.model, { connectionId: GROQ_CONN }),
  ];
  return providers ? pool.filter((c) => providers.includes(c.provider)) : pool;
}

type ExhaustionTarget = Parameters<typeof applyComboTargetExhaustion>[0];
type ExhaustionOptions = Parameters<typeof applyComboTargetExhaustion>[1];

function noopLog(): ExhaustionOptions["log"] {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as ExhaustionOptions["log"];
}

function exhaustionSets(): ComboExhaustionSets {
  return {
    exhaustedProviders: new Set<string>(),
    exhaustedConnections: new Set<string>(),
    transientRateLimitedProviders: new Set<string>(),
  };
}

function applyExhaustion(
  target: { provider: string; connectionId?: string; model?: string },
  status: number,
  extra: Partial<ExhaustionOptions> = {},
): boolean {
  return applyComboTargetExhaustion(target as unknown as ExhaustionTarget, {
    result: { status },
    fallbackResult: {} as ExhaustionOptions["fallbackResult"],
    errorText: `upstream status ${status}`,
    rawModel: target.model ?? "unknown",
    isTokenLimitBreach: false,
    allAccountsRateLimited: false,
    requestScopedFailure: false,
    ...extra,
    sets: extra.sets ?? exhaustionSets(),
    log: noopLog(),
    tag: "stress-r1",
    exhaustedLogLevel: "debug",
  });
}

function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function syntheticCatalog(): FreeModelBudget[] {
  const tos = catalogEntry("cerebras", "zai-glm-4.7").tos;
  const row = (
    provider: string,
    modelId: string,
  ): FreeModelBudget => ({
    provider,
    modelId,
    displayName: `${provider} free`,
    monthlyTokens: 1_000_000,
    creditTokens: 0,
    freeType: "recurring-daily",
    poolKey: null,
    tos,
    hardStopGuaranteed: true,
  });
  return [row("free-alpha", "alpha-1"), row("free-beta", "beta-1"), row("free-gamma", "gamma-1")];
}

function syntheticPool(): PoolCand[] {
  return [
    { provider: "free-alpha", model: "alpha-1", connectionId: "alpha-conn" },
    { provider: "free-beta", model: "beta-1", connectionId: "beta-conn" },
    { provider: "free-gamma", model: "gamma-1", connectionId: "gamma-conn" },
  ];
}

test("cost classes: only FREE_VERIFIED and SELF_HOSTED are auto-admissible", () => {
  assert.deepEqual(
    [...AUTO_FREE_ALLOWED_COST_CLASSES].sort(),
    ["FREE_VERIFIED", "SELF_HOSTED"],
  );

  const verified = classifyFreeCost(
    { ...CEREBRAS, connectionId: CEREBRAS_CONN },
    catalogEntry(CEREBRAS.provider, CEREBRAS.model),
  );
  assert.equal(verified.costClass, "FREE_VERIFIED");
  assert.equal(verified.autoFreeAllowed, true);

  const selfHosted = classifyFreeCost({
    provider: "vllm",
    model: "qwen-local",
    connectionId: "vllm-conn",
  });
  assert.equal(selfHosted.costClass, "SELF_HOSTED");
  assert.equal(selfHosted.autoFreeAllowed, true);

  const denied: Array<[FreeCostCandidate, FreeCostClass]> = [
    [
      { provider: "chatgpt-web", model: "gpt-5.6-luna-free" },
      "FREE_UNKNOWN",
    ],
    [{ provider: "synthetic-unknown-cost", model: "x" }, "UNKNOWN_COST"],
    [
      { provider: "synthetic-null-cost", model: "x", costPer1MTokens: null },
      "NULL_COST",
    ],
    [
      { provider: "agentrouter", model: "claude-opus-4-8" },
      "CREDIT_BACKED",
    ],
    [
      { provider: "synthetic-paid", model: "x", costPer1MTokens: 3.5 },
      "PAID",
    ],
  ];

  for (const [cand, expectedClass] of denied) {
    const verdict = classifyFreeCost(
      cand,
      findFreeCatalogEntry(cand, FREE_MODEL_BUDGETS),
    );
    assert.equal(verdict.costClass, expectedClass);
    assert.equal(verdict.autoFreeAllowed, false);
  }
});

test("dynamic discovery: eligibility derives from facts, not provider identity", () => {
  const novel = { provider: "free-alpha-9", model: "m-1", connectionId: "alpha-9-conn" };
  const novelEntry = {
    ...catalogEntry("cerebras", "zai-glm-4.7"),
    provider: "free-alpha-9",
    modelId: "m-1",
  };
  const verdict = classifyFreeCost(novel, novelEntry);
  assert.equal(verdict.costClass, "FREE_VERIFIED");
  assert.equal(verdict.autoFreeAllowed, true);

  const facts = evaluateFreeSentinel(novel, {
    entry: novelEntry,
    resolveFreeAccessState: () => reading(),
    ...OPTIONS,
  });
  assert.deepEqual(facts.safeConnectionIds, ["alpha-9-conn"]);

  const pool = pipeline(
    [novel],
    connMap([{ id: "alpha-9-conn" }]),
    () => reading(),
    { catalog: [novelEntry] },
  );
  assert.deepEqual(pool.map((c) => c.provider), ["free-alpha-9"]);

  const selfHosted = pipeline(
    [{ provider: "vllm", model: "qwen-local", connectionId: "vllm-conn" }],
    connMap([{ id: "vllm-conn" }]),
    () => {
      throw new Error("self-hosted must not need quota readings");
    },
  );
  assert.equal(selfHosted.length, 1);
});

test("STRESS_A: two healthy free providers yield exactly one eligible selection", () => {
  const eligible = pipeline(basePool(), healthyConnections(), healthyReadings());
  assert.deepEqual(
    eligible.map((c) => c.provider).sort(),
    [CEREBRAS.provider, GROQ.provider],
  );

  const decision = selectWithStrategy(
    selectionPool(),
    { taskType: "chat" },
  );
  assert.equal(decision.candidatesConsidered, 2);
  assert.ok(
    [CEREBRAS.provider, GROQ.provider].includes(decision.provider),
  );
  assert.ok(!["PAID", "CREDIT_BACKED"].includes(decision.provider));
});

test("STRESS_B: timeout records failure and leaves the sibling free provider selectable", async () => {
  assert.equal(
    shouldRecordProviderBreakerFailure({
      isStreamReadinessFailure: false,
      status: 408,
      sameProviderNext: false,
    }),
    true,
  );

  const breaker = getCircuitBreaker("stress-r1-b", {
    failureThreshold: 3,
    resetTimeout: 30_000,
    isFailure: () => true,
  });
  breaker.reset();
  await assert.rejects(breaker.execute(async () => {
    throw new Error("socket timeout");
  }));
  const status = breaker.getStatus();
  assert.equal(status.failureCount, 1);

  const sets = exhaustionSets();
  applyExhaustion(
    { ...CEREBRAS, connectionId: CEREBRAS_CONN },
    408,
    { sets },
  );
  assert.ok(sets.exhaustedConnections.has(`${CEREBRAS.provider}:${CEREBRAS_CONN}`));
  assert.equal(sets.exhaustedProviders.has(CEREBRAS.provider), false);
  assert.equal(
    getExhaustedTargetSkipReason(
      { provider: CEREBRAS.provider, connectionId: CEREBRAS_CONN },
      sets.exhaustedProviders,
      sets.exhaustedConnections,
    ) !== null,
    true,
  );
  assert.equal(
    getExhaustedTargetSkipReason(
      { provider: GROQ.provider, connectionId: GROQ_CONN },
      sets.exhaustedProviders,
      sets.exhaustedConnections,
    ),
    null,
  );

  const stillEligible = pipeline(
    basePool(),
    connMap([
      { id: CEREBRAS_CONN, rateLimitedUntil: futureIso(60_000) },
      { id: GROQ_CONN },
    ]),
    healthyReadings(),
  );
  assert.deepEqual(stillEligible.map((c) => c.provider), [GROQ.provider]);

  const decision = selectWithStrategy(
    selectionPool(stillEligible.map((c) => c.provider)),
    { taskType: "chat" },
  );
  assert.equal(decision.provider, GROQ.provider);
});

test("STRESS_C: 429 marks transient cooldown and routes to the other free provider", () => {
  const sets = exhaustionSets();
  const providerExhausted = applyExhaustion(
    { ...CEREBRAS, connectionId: CEREBRAS_CONN },
    429,
    { sets },
  );
  assert.equal(providerExhausted, false);
  assert.ok(sets.transientRateLimitedProviders.has(CEREBRAS.provider));
  assert.equal(
    sets.exhaustedConnections.has(`${CEREBRAS.provider}:${CEREBRAS_CONN}`),
    false,
  );

  const cooledDown = pipeline(
    basePool(),
    connMap([
      { id: CEREBRAS_CONN, rateLimitedUntil: futureIso(30_000) },
      { id: GROQ_CONN },
    ]),
    healthyReadings(),
  );
  assert.deepEqual(cooledDown.map((c) => c.provider), [GROQ.provider]);

  const accepted = applyExhaustion({ ...GROQ, connectionId: GROQ_CONN }, 429, {
    sets,
  });
  assert.equal(accepted, false);
  assert.equal(sets.transientRateLimitedProviders.has(GROQ.provider), true);
});

test("STRESS_D: exhausted free quota excludes only that connection", () => {
  const readings = readingsFor([
    [CEREBRAS.provider, CEREBRAS_CONN, reading({ status: "EXHAUSTED", remainingFreeAllowance: 0 })],
    [GROQ.provider, GROQ_CONN, reading()],
  ]);

  const facts = evaluateFreeSentinel(
    { ...CEREBRAS, connectionId: CEREBRAS_CONN },
    {
      entry: catalogEntry(CEREBRAS.provider, CEREBRAS.model),
      resolveFreeAccessState: readings,
      ...OPTIONS,
    },
  );
  assert.deepEqual(facts.safeConnectionIds, []);
  assert.equal(facts.reason, "QUOTA_EXHAUSTED");

  const eligible = pipeline(basePool(), healthyConnections(), readings);
  assert.deepEqual(eligible.map((c) => c.provider), [GROQ.provider]);

  const decision = selectWithStrategy(
    selectionPool(eligible.map((c) => c.provider)),
    { taskType: "chat" },
  );
  assert.equal(decision.provider, GROQ.provider);
});

test("STRESS_E: 401/403 isolates the affected connection only, never deletes it", () => {
  const pool = basePool();
  const sets = exhaustionSets();

  const first = applyExhaustion(
    { ...CEREBRAS, connectionId: CEREBRAS_CONN },
    401,
    { sets },
  );
  assert.equal(first, true);
  assert.ok(sets.exhaustedConnections.has(`${CEREBRAS.provider}:${CEREBRAS_CONN}`));
  assert.equal(sets.exhaustedProviders.has(CEREBRAS.provider), false);

  applyExhaustion({ ...CEREBRAS, connectionId: CEREBRAS_CONN }, 403, { sets });
  assert.equal(sets.exhaustedConnections.size, 1);
  assert.equal(sets.exhaustedProviders.size, 0);

  assert.equal(
    getExhaustedTargetSkipReason(
      { provider: GROQ.provider, connectionId: GROQ_CONN },
      sets.exhaustedProviders,
      sets.exhaustedConnections,
    ),
    null,
  );

  const eligible = pipeline(pool, healthyConnections(), healthyReadings());
  assert.deepEqual(eligible.map((c) => c.provider).sort(), [CEREBRAS.provider, GROQ.provider]);
  assert.equal(pool[0].connectionId, CEREBRAS_CONN);
  assert.equal(pool.length, 2);

  const decision = selectWithStrategy(selectionPool(), { taskType: "chat" });
  assert.ok([CEREBRAS.provider, GROQ.provider].includes(decision.provider));
});

test("STRESS_F: repeated 5xx opens the circuit and failover picks another free provider", async () => {
  const breaker = getCircuitBreaker("stress-r1-f", {
    failureThreshold: 3,
    resetTimeout: 60_000,
    halfOpenRequests: 1,
    isFailure: () => true,
  });
  breaker.reset();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(
      breaker.execute(async () => {
        throw new Error("upstream 503");
      }),
    );
  }
  const openStatus = breaker.getStatus();
  assert.equal(openStatus.state, "OPEN");

  const decision = selectWithStrategy(
    [
      candidate(CEREBRAS.provider, CEREBRAS.model, {
        circuitBreakerState: "OPEN",
        connectionId: CEREBRAS_CONN,
      }),
      candidate(GROQ.provider, GROQ.model, { connectionId: GROQ_CONN }),
    ],
    { taskType: "chat" },
  );
  assert.equal(decision.provider, GROQ.provider);

  await assert.rejects(
    breaker.execute(async () => "should not run"),
    (error: unknown) => error instanceof CircuitBreakerOpenError,
  );
  const retryAfterMs = breaker.getRetryAfterMs();
  assert.ok(retryAfterMs > 0);
});

test("STRESS_G: cooldown elapses, half-open probe succeeds, provider becomes eligible again", async () => {
  const breaker = getCircuitBreaker("stress-r1-g", {
    failureThreshold: 2,
    resetTimeout: 40,
    halfOpenRequests: 1,
    isFailure: () => true,
  });
  breaker.reset();

  await assert.rejects(breaker.execute(async () => {
    throw new Error("upstream 502");
  }));
  await assert.rejects(breaker.execute(async () => {
    throw new Error("upstream 502");
  }));
  assert.equal(breaker.getStatus().state, "OPEN");

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(breaker.canExecute(), true);
  assert.equal(breaker.getStatus().state, "HALF_OPEN");

  const value = await breaker.execute(async () => "recovered");
  assert.equal(value, "recovered");
  const closed = breaker.getStatus();
  assert.equal(closed.state, "CLOSED");
  assert.equal(closed.failureCount, 0);

  const eligible = pipeline(basePool(), healthyConnections(), healthyReadings());
  assert.ok(eligible.some((c) => c.provider === CEREBRAS.provider));
});

test("STRESS_H: all free routes unavailable produces a controlled empty pool, never PAID", () => {
  const excluded = filterExcludedCandidates(basePool(), new Set([CEREBRAS_CONN, GROQ_CONN]));
  assert.deepEqual(excluded, []);

  const readings = readingsFor([
    [CEREBRAS.provider, CEREBRAS_CONN, reading({ status: "EXHAUSTED", remainingFreeAllowance: 0 })],
  ]);
  const eligible = pipeline(
    basePool(),
    connMap([
      { id: CEREBRAS_CONN, testStatus: "unavailable" },
      { id: GROQ_CONN, rateLimitedUntil: futureIso(60_000) },
    ]),
    readings,
  );
  assert.deepEqual(eligible, []);

  assert.throws(() => selectWithStrategy([], { taskType: "chat" }));

  const mixedPool: ProviderCandidate[] = [
    candidate("synthetic-paid", "p", { costPer1MTokens: 5 }),
    candidate("synthetic-credit", "c"),
    candidate("synthetic-null", "n"),
    candidate("synthetic-unknown", "u"),
  ];
  const decoys = filterStrictZeroCostCandidates(mixedPool, {
    enabled: true,
    resolveFreeAccessState: () => reading(),
    ...OPTIONS,
    catalog: FREE_MODEL_BUDGETS,
  });
  assert.deepEqual(decoys, []);
});

test("free-to-free failover: A fails, B fails, C selected; A recovers and is eligible again", () => {
  const catalog = syntheticCatalog();
  const pool = syntheticPool();
  const allReadings: Readings = readingsFor([
    ["free-alpha", "alpha-conn", reading()],
    ["free-beta", "beta-conn", reading()],
    ["free-gamma", "gamma-conn", reading()],
  ]);
  assert.ok(allReadings("free-beta", "beta-conn"));

  const start = pipeline(pool, connMap([
    { id: "alpha-conn" },
    { id: "beta-conn" },
    { id: "gamma-conn" },
  ]), allReadings, { catalog });
  assert.equal(start.length, 3);

  const afterA = pipeline(pool, connMap([
    { id: "alpha-conn", rateLimitedUntil: futureIso(60_000) },
    { id: "beta-conn" },
    { id: "gamma-conn" },
  ]), allReadings, { catalog });
  assert.deepEqual(afterA.map((c) => c.provider).sort(), ["free-beta", "free-gamma"]);

  const afterB = pipeline(pool, connMap([
    { id: "alpha-conn", rateLimitedUntil: futureIso(60_000) },
    { id: "beta-conn", rateLimitedUntil: futureIso(60_000) },
    { id: "gamma-conn" },
  ]), allReadings, { catalog });
  assert.deepEqual(afterB.map((c) => c.provider), ["free-gamma"]);

  const selected = selectWithStrategy(
    afterB.map((c) => candidate(c.provider, c.model)),
    { taskType: "chat" },
  );
  assert.equal(selected.provider, "free-gamma");

  const recovered = pipeline(pool, connMap([
    { id: "alpha-conn" },
    { id: "beta-conn", rateLimitedUntil: futureIso(60_000) },
    { id: "gamma-conn" },
  ]), allReadings, { catalog });
  assert.ok(recovered.some((c) => c.provider === "free-alpha"));
});

test("stress cost mix: denied classes never become a fallback while allowed routes fail", () => {
  const deniedClasses = [
    "FREE_UNKNOWN",
    "UNKNOWN_COST",
    "NULL_COST",
    "CREDIT_BACKED",
    "PAID",
  ] as const;

  const deniedCandidates: Array<[FreeCostCandidate, FreeCostClass]> = [
    [{ provider: "chatgpt-web", model: "gpt-5.6-luna-free" }, "FREE_UNKNOWN"],
    [{ provider: "api-airforce", model: "x-ai/grok-3" }, "FREE_UNKNOWN"],
    [{ provider: "synthetic-unknown-cost", model: "u" }, "UNKNOWN_COST"],
    [{ provider: "synthetic-null-cost", model: "n", costPer1MTokens: null }, "NULL_COST"],
    [{ provider: "agentrouter", model: "claude-opus-4-8" }, "CREDIT_BACKED"],
    [{ provider: "synthetic-paid", model: "p", costPer1MTokens: 5 }, "PAID"],
  ];

  for (const [cand, expectedClass] of deniedCandidates) {
    const verdict = classifyFreeCost(cand, findFreeCatalogEntry(cand, FREE_MODEL_BUDGETS));
    assert.equal(verdict.costClass, expectedClass);
    assert.equal(verdict.autoFreeAllowed, false);
  }

  const surviving = pipeline(
    basePool(),
    connMap([
      { id: CEREBRAS_CONN, rateLimitedUntil: futureIso(60_000) },
      { id: GROQ_CONN, testStatus: "unavailable" },
    ]),
    readingsFor([
      [CEREBRAS.provider, CEREBRAS_CONN, reading({ status: "EXHAUSTED", remainingFreeAllowance: 0 })],
    ]),
  );
  assert.deepEqual(surviving, []);

  const observed = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    if (surviving.length === 0) {
      observed.add("NO_FREE_PROVIDER_AVAILABLE");
      continue;
    }
    const decision = selectWithStrategy(
      surviving.map((c) => candidate(c.provider, c.model)),
      { taskType: "chat" },
    );
    observed.add(decision.provider);
  }
  assert.deepEqual([...observed], ["NO_FREE_PROVIDER_AVAILABLE"]);
  for (const deniedClass of deniedClasses) {
    assert.ok(!observed.has(deniedClass));
  }
});

test("capability isolation: vision routing filters non-vision candidates", () => {
  const visionFilter = buildAutoCandidateFilter("vision");
  assert.ok(visionFilter);
  assert.equal(
    visionFilter!({ provider: "p", model: "m", resolvedSupportsVision: false }),
    false,
  );
  assert.equal(
    visionFilter!({ provider: "p", model: "m", resolvedSupportsVision: true }),
    true,
  );

  assert.equal(buildAutoCandidateFilter("coding"), null);
  assert.equal(buildAutoCandidateFilter("chat"), null);
});

test("capability isolation: search chain skips unmatched types and denied cost classes", async () => {
  const webFree = searchProvider({ id: "web-free" });
  const newsOnly = searchProvider({ id: "news-only", searchTypes: ["news"] });
  const paid = searchProvider({ id: "paid-search", costPerQuery: 0.005, freeMonthlyQuota: 0 });
  const credit = searchProvider({
    id: "credit-search",
    costPerQuery: 0.001,
    freeMonthlyQuota: 2500,
  });

  assert.equal(classifySearchProviderFreeStatus(webFree), "FREE_VERIFIED");
  assert.equal(classifySearchProviderFreeStatus(paid), "PAID");
  assert.equal(classifySearchProviderFreeStatus(credit), "CREDIT_BACKED");
  assert.equal(isSelfHostedBaseUrl("http://127.0.0.1:8088/search"), true);

  const chain = buildFreeSearchChain([webFree, newsOnly, paid, credit], {
    searchType: "web",
  });
  assert.deepEqual(chain.map((entry) => entry.config.id), ["web-free"]);

  const executed: string[] = [];
  const outcome = await runFreeSearchChain(chain, {
    executeLeg: async (entry: FreeSearchChainEntry) => {
      executed.push(entry.config.id);
      return { kind: "ok", data: { results: [{ url: "https://example.com/a" }] } };
    },
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(executed, ["web-free"]);
  assert.ok(!executed.includes("news-only"));
  assert.ok(!executed.includes("paid-search"));
  assert.ok(!executed.includes("credit-search"));
});

test("capability isolation: image routing only considers the image registry", () => {
  const localFree = imageProvider("none", "http://127.0.0.1:8188", ["comfy-model"]);
  const remoteFree = imageProvider("apikey", "https://img.example.com", ["free-img-model"]);
  const paidOnly = imageProvider("apikey", "https://paid.example.com", ["paid-model"]);

  const picked = resolveFreeImageProvider({
    providers: { "local-free": localFree, "remote-free": remoteFree },
    budgets: [
      imageBudget("remote-free", "free-img-model", "recurring-daily", true),
    ],
    hasActiveConnection: () => true,
    isCircuitOpen: () => false,
  });
  assert.equal(picked.ok, true);
  if (picked.ok) {
    assert.ok(["local-free", "remote-free"].includes(picked.providerId));
    assert.ok(!["paid-model"].includes(picked.modelId));
  }

  const paidDenied = resolveFreeImageProvider({
    providers: { "paid-only": paidOnly },
    budgets: [imageBudget("paid-only", "paid-model", "one-time-initial", false)],
    hasActiveConnection: () => true,
    isCircuitOpen: () => false,
  });
  assert.equal(paidDenied.ok, false);
  if (!paidDenied.ok) {
    assert.equal(paidDenied.code, NO_FREE_IMAGE_PROVIDER_AVAILABLE);
    assert.equal(paidDenied.reason, "NO_ELIGIBLE_FREE_IMAGE_PROVIDER");
  }

  const inactive = resolveFreeImageProvider({
    providers: { "local-free": localFree },
    budgets: [],
    hasActiveConnection: () => false,
    isCircuitOpen: () => false,
  });
  assert.equal(inactive.ok, false);

  const allOpen = resolveFreeImageProvider({
    providers: { "local-free": localFree },
    budgets: [],
    hasActiveConnection: () => true,
    isCircuitOpen: () => true,
  });
  assert.equal(allOpen.ok, false);
  if (!allOpen.ok) {
    assert.equal(allOpen.reason, "ALL_FREE_IMAGE_PROVIDERS_CIRCUIT_OPEN");
  }
});

test("bounded retry: global attempt clamps hold and each free leg runs at most once", async () => {
  assert.equal(clampGlobalAttempts(undefined), MAX_GLOBAL_ATTEMPTS);
  assert.equal(clampGlobalAttempts(0), MAX_GLOBAL_ATTEMPTS);
  assert.equal(clampGlobalAttempts(3), 3);
  assert.equal(clampGlobalAttempts(5000), MAX_GLOBAL_ATTEMPTS_HARD_CAP);
  assert.ok(MAX_GLOBAL_ATTEMPTS <= MAX_GLOBAL_ATTEMPTS_HARD_CAP);

  const legs = ["leg-a", "leg-b", "leg-c", "leg-d", "leg-e"];
  const calls = new Map<string, number>();
  const chain = legs.map((id) =>
    searchEntry(searchProvider({ id })),
  );
  const outcome = await runFreeSearchChain(chain, {
    executeLeg: async (entry: FreeSearchChainEntry) => {
      calls.set(entry.config.id, (calls.get(entry.config.id) ?? 0) + 1);
      return { kind: "failed", error: "upstream down" };
    },
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.exhausted, true);
  assert.equal(outcome.attempts.length, legs.length);
  for (const leg of legs) {
    assert.equal(calls.get(leg), 1);
  }

  const dispatchBudget = clampGlobalAttempts(9999);
  let attempts = 0;
  outer: for (const leg of chain) {
    for (let round = 0; round < 3; round += 1) {
      if (attempts >= dispatchBudget) break outer;
      attempts += 1;
      if (leg.config.id === "leg-z") break;
    }
  }
  assert.ok(attempts <= MAX_GLOBAL_ATTEMPTS_HARD_CAP);
});

test("concurrency: parallel free selections and chains do not escape to paid or deadlock", async () => {
  const pool = selectionPool();

  const selections = await Promise.all(
    Array.from({ length: 12 }, () =>
      Promise.resolve(selectWithStrategy(pool, { taskType: "chat" })),
    ),
  );
  for (const decision of selections) {
    assert.ok([CEREBRAS.provider, GROQ.provider].includes(decision.provider));
  }

  const legCalls = new Map<string, number>();
  const chain = ["a", "b", "c"].map((id) => searchEntry(searchProvider({ id })));
  const chains = await Promise.all(
    Array.from({ length: 8 }, () =>
      runFreeSearchChain(chain, {
        executeLeg: async (entry: FreeSearchChainEntry) => {
          const key = entry.config.id;
          legCalls.set(key, (legCalls.get(key) ?? 0) + 1);
          await Promise.resolve();
          return key === "b"
            ? { kind: "failed" as const, error: "boom" }
            : { kind: "ok" as const, data: { results: [{ url: "https://example.com/x" }] } };
        },
      }),
    ),
  );
  for (const outcome of chains) {
    assert.equal(outcome.ok, true);
    assert.ok(outcome.attempts.length <= chain.length);
  }
  for (const id of ["a", "b", "c"]) {
    assert.ok((legCalls.get(id) ?? 0) <= 8);
  }

  const breaker = getCircuitBreaker("stress-r1-race", {
    failureThreshold: 2,
    resetTimeout: 30_000,
    isFailure: () => true,
  });
  breaker.reset();
  const race = await Promise.allSettled([
    breaker.execute(async () => {
      throw new Error("503");
    }),
    breaker.execute(async () => {
      throw new Error("503");
    }),
    Promise.resolve(selectWithStrategy(pool, { taskType: "chat" })),
  ]);
  assert.equal(race.length, 3);
  assert.equal(race[2].status, "fulfilled");
});

test("concurrency: quota state may change during pool rebuild without admitting denied classes", () => {
  let reads = 0;
  const flaky: Readings = (provider, _connectionId) => {
    reads += 1;
    if (provider === CEREBRAS.provider && reads % 2 === 0) {
      return reading({ status: "EXHAUSTED", remainingFreeAllowance: 0 });
    }
    return reading();
  };

  for (let round = 0; round < 6; round += 1) {
    const eligible = pipeline(basePool(), healthyConnections(), flaky);
    for (const item of eligible) {
      assert.ok(
        [CEREBRAS.provider, GROQ.provider].includes(item.provider),
        `unexpected provider survived rebuild: ${item.provider}`,
      );
    }
    if (eligible.length > 0) {
      const decision = selectWithStrategy(
        eligible.map((c) => candidate(c.provider, c.model)),
        { taskType: "chat" },
      );
      assert.ok(
        [CEREBRAS.provider, GROQ.provider].includes(decision.provider),
      );
    }
  }
  assert.ok(reads > 0);
});

test("read-only inspection: candidate listing reads cache only and never calls a provider", () => {
  const provider = USAGE_FETCHER_PROVIDERS[0];
  assert.ok(provider);
  const key = `${provider}::stress-conn`;

  freeAccessTesting.cache.set(key, {
    state: reading({ remainingFreeAllowance: 77 }),
    fetchedAtMs: Date.now(),
  });

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("PROVIDER_CALL_NOT_ALLOWED_DURING_READ");
  }) as typeof fetch;

  try {
    const cached = readFreeAccessStateCached(provider, "stress-conn");
    assert.ok(cached);
    assert.equal(cached.remainingFreeAllowance, 77);

    assert.equal(readFreeAccessStateCached(provider, "missing-conn"), undefined);
    assert.equal(readFreeAccessStateCached("cerebras", "stress-conn"), undefined);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    freeAccessTesting.cache.delete(key);
  }

  const source = readFileSync(
    new URL("../../open-sse/handlers/autoComboCandidates.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /readFreeAccessStateCached/);
  assert.doesNotMatch(source, /\bresolveFreeAccessState\s*\(/);
});

test("source guard: free eligibility modules contain no provider-brand allowlist", () => {
  const guarded = [
    "../../open-sse/services/autoCombo/freeProviderSentinel.ts",
    "../../open-sse/services/autoCombo/strictZeroCostFilter.ts",
    "../../open-sse/services/autoCombo/resilienceCandidateFilter.ts",
    "../../open-sse/services/autoCombo/candidateOverrides.ts",
    "../../open-sse/services/autoCombo/routerStrategy.ts",
  ];
  for (const relative of guarded) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /\b(nvidia|openrouter|zen)\b/i,
      `static brand priority leaked into ${relative}`,
    );
  }
});

function searchProvider(
  overrides: Partial<SearchProviderConfig> & { id: string },
): SearchProviderConfig {
  return {
    id: overrides.id,
    name: overrides.id,
    baseUrl: `https://${overrides.id}.example.com/search`,
    method: "POST",
    authType: "apikey",
    authHeader: "authorization",
    costPerQuery: 0,
    freeMonthlyQuota: 1000,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 10_000,
    cacheTTLMs: 60_000,
    ...overrides,
  };
}

function searchEntry(config: SearchProviderConfig): FreeSearchChainEntry {
  return { config, freeStatus: classifySearchProviderFreeStatus(config) };
}

interface ImageFixtureModel {
  id: string;
  name: string;
}

function imageProvider(
  authType: string,
  baseUrl: string,
  models: string[],
): {
  id: string;
  name: string;
  baseUrl: string;
  method: string;
  authType: string;
  authHeader: string;
  models: ImageFixtureModel[];
} {
  return {
    id: "synthetic",
    name: "Synthetic",
    baseUrl,
    method: "POST",
    authType,
    authHeader: "authorization",
    models: models.map((id) => ({ id, name: id })),
  };
}

function imageBudget(
  providerId: string,
  modelId: string,
  freeType: FreeModelBudget["freeType"],
  hardStopGuaranteed: boolean,
): FreeModelBudget {
  return {
    provider: providerId,
    modelId,
    displayName: `${providerId} ${modelId}`,
    monthlyTokens: 100_000,
    creditTokens: 0,
    freeType,
    poolKey: null,
    tos: catalogEntry("cerebras", "zai-glm-4.7").tos,
    hardStopGuaranteed,
  };
}

after(() => {
  resetAllCircuitBreakers();
});
