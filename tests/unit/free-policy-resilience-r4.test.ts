/**
 * R4 verification — FREE_ONLY quota / circuit / cooldown / workload isolation.
 *
 * Node:test scope. These tests drive the SAME native components the live
 * routing path uses (freeProviderSentinel, resilienceCandidateFilter,
 * candidateOverrides, circuitBreaker) with deterministic injected state, so the
 * R4 matrix is reproducible offline and without production history.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_FREE_ALLOWED_COST_CLASSES,
  classifyFreeCost,
  evaluateFreeSentinel,
  type FreeQuotaReading,
} from "../../open-sse/services/autoCombo/freeProviderSentinel.ts";
import { filterResilienceBlockedCandidates } from "../../open-sse/services/autoCombo/resilienceCandidateFilter.ts";
import { filterExcludedCandidates } from "../../open-sse/services/autoCombo/candidateOverrides.ts";
import { getCircuitBreaker } from "../../src/shared/utils/circuitBreaker.ts";
import {
  FREE_MODEL_BUDGETS,
  type FreeModelBudget,
} from "../../open-sse/config/freeModelCatalog.ts";

const NOW = "2026-08-20T00:00:00.000Z";
const REAL_CONN = "r4-conn-1";
const HARD_STOP = { provider: "groq", model: "llama-3.3-70b-versatile" };
const OPTIONS = { minRemainingAllowance: 1, maxStateAgeMs: 180_000, now: () => Date.parse(NOW) };

function entryFor(provider: string, modelId: string): FreeModelBudget {
  const entry = FREE_MODEL_BUDGETS.find(
    (row) => row.provider === provider && row.modelId === modelId
  );
  assert.ok(entry, `catalog entry ${provider}/${modelId} must exist`);
  return entry;
}

function unprovenEntry(): FreeModelBudget {
  return {
    ...entryFor(HARD_STOP.provider, HARD_STOP.model),
    provider: "synthetic-unproven",
    modelId: "synthetic-model",
    freeType: "recurring-daily",
    hardStopGuaranteed: undefined,
  };
}

function reading(overrides: Partial<FreeQuotaReading> = {}): FreeQuotaReading {
  return {
    status: overrides.status ?? "SAFE",
    remainingFreeAllowance:
      overrides.remainingFreeAllowance === undefined ? 40 : overrides.remainingFreeAllowance,
    resetAt: null,
    checkedAt: overrides.checkedAt ?? NOW,
  };
}

test("quota: positive EXHAUSTED evidence denies the connection", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: entryFor(HARD_STOP.provider, HARD_STOP.model),
      resolveFreeAccessState: () => reading({ status: "EXHAUSTED", remainingFreeAllowance: 0 }),
      ...OPTIONS,
    }
  );
  assert.deepEqual(facts.safeConnectionIds, []);
  assert.equal(facts.quotaStatus, "EXHAUSTED");
  assert.equal(facts.reason, "QUOTA_EXHAUSTED");
});

test("quota: fresh SAFE telemetry with headroom is kept and reported", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: entryFor(HARD_STOP.provider, HARD_STOP.model),
      resolveFreeAccessState: () => reading({ remainingFreeAllowance: 40 }),
      ...OPTIONS,
    }
  );
  assert.deepEqual(facts.safeConnectionIds, [REAL_CONN]);
  assert.equal(facts.quotaStatus, "SAFE");
  assert.equal(facts.quotaRemaining, 40);
});

test("quota: missing telemetry stays eligible for a provably hard-free route", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: entryFor(HARD_STOP.provider, HARD_STOP.model),
      resolveFreeAccessState: () => undefined,
      ...OPTIONS,
    }
  );
  assert.deepEqual(facts.safeConnectionIds, [REAL_CONN]);
  assert.equal(facts.quotaStatus, "UNKNOWN");
  assert.equal(facts.reason, "HARD_STOP_FREE_TIER_VERIFIED");
});

test("quota: stale telemetry is advisory only for a hard-free route", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: entryFor(HARD_STOP.provider, HARD_STOP.model),
      resolveFreeAccessState: () => reading({ checkedAt: "2026-08-19T00:00:00.000Z" }),
      ...OPTIONS,
    }
  );
  assert.deepEqual(facts.safeConnectionIds, [REAL_CONN]);
  assert.equal(facts.quotaStatus, "UNKNOWN");
});

test("quota: missing telemetry never upgrades an unproven route", () => {
  const facts = evaluateFreeSentinel(
    { provider: "synthetic-unproven", model: "synthetic-model", connectionId: REAL_CONN },
    {
      entry: unprovenEntry(),
      resolveFreeAccessState: () => undefined,
      ...OPTIONS,
    }
  );
  assert.equal(facts.autoFreeAllowed, false);
  assert.equal(facts.costClass, "FREE_UNKNOWN");
  assert.deepEqual(facts.safeConnectionIds, []);
  assert.equal(facts.reason, "FREE_UNKNOWN_NO_HARD_STOP_PROOF");
});

test("circuit: breakers are keyed per provider and stay independently CLOSED", () => {
  const providerA = getCircuitBreaker("r4-provider-a");
  const providerB = getCircuitBreaker("r4-provider-b");
  assert.notEqual(providerA, providerB);
  assert.equal(String(providerA.getStatus().state), "CLOSED");
  assert.equal(String(providerB.getStatus().state), "CLOSED");
  assert.equal(providerA.canExecute(), true);
  assert.equal(providerB.canExecute(), true);
  providerA.reset();
  assert.equal(String(providerA.getStatus().state), "CLOSED");
  assert.equal(String(providerB.getStatus().state), "CLOSED");
});

test("cooldown: one connection's rate limit does not block an unrelated provider", () => {
  const pool = [
    { provider: "prov-a", connectionId: "conn-a", model: "m-a" },
    { provider: "prov-b", connectionId: "conn-b", model: "m-b" },
  ];
  const connections = new Map([
    [
      "conn-a",
      { id: "conn-a", rateLimitedUntil: "2099-01-01T00:00:00.000Z", testStatus: "active" },
    ],
    ["conn-b", { id: "conn-b", rateLimitedUntil: null, testStatus: "active" }],
  ]);
  const filtered = filterResilienceBlockedCandidates(pool, connections);
  assert.deepEqual(
    filtered.map((candidate) => candidate.provider),
    ["prov-b"]
  );
});

test("cooldown: a terminal connection status drops only its own connection", () => {
  const pool = [
    { provider: "prov-a", connectionId: "conn-a", model: "m-a" },
    { provider: "prov-b", connectionId: "conn-b", model: "m-b" },
  ];
  const connections = new Map([
    ["conn-a", { id: "conn-a", rateLimitedUntil: null, testStatus: "unavailable" }],
    ["conn-b", { id: "conn-b", rateLimitedUntil: null, testStatus: "active" }],
  ]);
  const filtered = filterResilienceBlockedCandidates(pool, connections);
  assert.deepEqual(
    filtered.map((candidate) => candidate.provider),
    ["prov-b"]
  );
});

test("cooldown: a healthy connection set preserves the pool reference", () => {
  const pool = [
    { provider: "prov-a", connectionId: "conn-a", model: "m-a" },
    { provider: "prov-b", connectionId: "conn-b", model: "m-b" },
  ];
  const connections = new Map([
    ["conn-a", { id: "conn-a", rateLimitedUntil: null, testStatus: "active" }],
    ["conn-b", { id: "conn-b", rateLimitedUntil: null, testStatus: "active" }],
  ]);
  assert.equal(filterResilienceBlockedCandidates(pool, connections), pool);
});

test("workload isolation: per-caller exclusions are scoped, never global", () => {
  const pool = [
    { connectionId: "conn-a", model: "m" },
    { connectionId: "conn-b", model: "m" },
  ];
  const iammView = filterExcludedCandidates(pool, new Set(["conn-a"]));
  const stocknewsbrView = filterExcludedCandidates(pool, new Set(["conn-b"]));
  const legacyView = filterExcludedCandidates(pool, new Set());
  assert.deepEqual(
    iammView.map((candidate) => candidate.connectionId),
    ["conn-b"]
  );
  assert.deepEqual(
    stocknewsbrView.map((candidate) => candidate.connectionId),
    ["conn-a"]
  );
  assert.equal(legacyView, pool);
  assert.deepEqual(
    pool.map((candidate) => candidate.connectionId),
    ["conn-a", "conn-b"],
    "the shared pool must not be mutated"
  );
});

test("workload isolation: allowlist candidates narrow per caller without touching the input", () => {
  const shared = [{ connectionId: null, allowedConnectionIds: ["conn-a", "conn-b"], model: "m" }];
  const narrowed = filterExcludedCandidates(shared, new Set(["conn-a"]));
  assert.deepEqual(narrowed[0].allowedConnectionIds, ["conn-b"]);
  assert.deepEqual(shared[0].allowedConnectionIds, ["conn-a", "conn-b"]);
});

test("profiles: FREE_ONLY admission ignores profile identity markers", () => {
  const base = { ...HARD_STOP, connectionId: REAL_CONN };
  const candidates = [
    { ...base, profile: "IAMM" },
    { ...base, profile: "StockNewsBR" },
    { ...base, profile: "default" },
  ];
  const facts = candidates.map((candidate) =>
    evaluateFreeSentinel(candidate, {
      entry: entryFor(HARD_STOP.provider, HARD_STOP.model),
      resolveFreeAccessState: () => reading(),
      ...OPTIONS,
    })
  );
  for (const fact of facts) {
    assert.equal(fact.autoFreeAllowed, true);
    assert.equal(fact.costClass, "FREE_VERIFIED");
    assert.deepEqual(fact.safeConnectionIds, [REAL_CONN]);
  }
});

test("profiles: no profile can make a paid, credit or unknown class auto-eligible", () => {
  const creditEntry: FreeModelBudget = {
    ...entryFor(HARD_STOP.provider, HARD_STOP.model),
    provider: "synthetic-credit",
    modelId: "credit-model",
    freeType: "one-time-initial",
  };
  const verdicts = [
    classifyFreeCost({ provider: "synthetic-credit", model: "credit-model" }, creditEntry),
    classifyFreeCost({ provider: "synthetic-paid", model: "paid-model", costPer1MTokens: 15 }),
    classifyFreeCost({ provider: "synthetic-null", model: "null-model", costPer1MTokens: null }),
    classifyFreeCost({ provider: "unlisted", model: "unlisted-model" }),
  ];
  assert.deepEqual(
    verdicts.map((verdict) => verdict.costClass),
    ["CREDIT_BACKED", "PAID", "NULL_COST", "UNKNOWN_COST"]
  );
  for (const verdict of verdicts) {
    assert.equal(verdict.autoFreeAllowed, false);
    assert.equal(AUTO_FREE_ALLOWED_COST_CLASSES.has(verdict.costClass), false);
  }
});

test("manual/pinned: the admission set is exactly FREE_VERIFIED and SELF_HOSTED", () => {
  assert.deepEqual([...AUTO_FREE_ALLOWED_COST_CLASSES].sort(), ["FREE_VERIFIED", "SELF_HOSTED"]);
});
