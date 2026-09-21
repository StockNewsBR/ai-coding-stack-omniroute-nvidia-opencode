/**
 * R1 reconstruction — policy matrix for the AUTO FREE cost sentinel.
 *
 * `tests/unit/autoCombo/` is a vitest-only scope (see vitest.mcp.config.ts).
 *
 * The sentinel is the single source of truth for AUTO FREE admission: only
 * FREE_VERIFIED (a keyless hard-free endpoint, or a recurring free tier whose
 * provider terms document a hard stop) and SELF_HOSTED may be auto-selected.
 * Paid, credit-backed, unknown-cost, null-cost, free-unknown and discontinued
 * candidates are always excluded, and there is no paid fallback.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  AUTO_FREE_ALLOWED_COST_CLASSES,
  classifyFreeCost,
  evaluateFreeSentinel,
  findFreeCatalogEntry,
  isSelfHostedFreeProvider,
  type FreeCostClass,
  type FreeQuotaReading,
} from "../../../open-sse/services/autoCombo/freeProviderSentinel.ts";
import {
  FREE_MODEL_BUDGETS,
  type FreeModelBudget,
} from "../../../open-sse/config/freeModelCatalog.ts";
import { SYNTHETIC_NOAUTH_CONNECTION_ID } from "../../../open-sse/services/autoCombo/resilienceCandidateFilter.ts";

const NOW = "2026-08-20T00:00:00.000Z";
const REAL_CONN = "sentinel-conn-1";
const OPTIONS = { minRemainingAllowance: 1, maxStateAgeMs: 180_000, now: () => Date.parse(NOW) };

const HARD_STOP = { provider: "groq", model: "llama-3.3-70b-versatile" } as const;
const KEYLESS = { provider: "felo-web", model: "felo-chat" } as const;

function entryFor(provider: string, modelId: string): FreeModelBudget {
  const entry = FREE_MODEL_BUDGETS.find((m) => m.provider === provider && m.modelId === modelId);
  assert.ok(entry, `catalog entry ${provider}/${modelId} must exist`);
  return entry;
}

function syntheticEntry(overrides: Partial<FreeModelBudget>): FreeModelBudget {
  return { ...entryFor("groq", "llama-3.3-70b-versatile"), ...overrides };
}

function reading(
  overrides: {
    status?: FreeQuotaReading["status"];
    remainingFreeAllowance?: number | null;
    checkedAt?: string;
  } = {}
): FreeQuotaReading {
  return {
    status: overrides.status ?? "SAFE",
    remainingFreeAllowance:
      overrides.remainingFreeAllowance === undefined ? 40 : overrides.remainingFreeAllowance,
    resetAt: null,
    checkedAt: overrides.checkedAt ?? NOW,
  };
}

const GROQ_ENTRY = entryFor("groq", "llama-3.3-70b-versatile");
const FELO_ENTRY = entryFor("felo-web", "felo-chat");

test("fixtures: the catalog entries used by this suite keep their documented shape", () => {
  assert.equal(GROQ_ENTRY.hardStopGuaranteed, true);
  assert.equal(GROQ_ENTRY.freeType, "recurring-daily");
  assert.equal(FELO_ENTRY.freeType, "keyless");
});

test("classify: recurring free tier with a documented hard stop is FREE_VERIFIED", () => {
  const verdict = classifyFreeCost(HARD_STOP, GROQ_ENTRY);
  assert.equal(verdict.costClass, "FREE_VERIFIED");
  assert.equal(verdict.autoFreeAllowed, true);
  assert.equal(verdict.hardStopProven, true);
  assert.equal(verdict.telemetryAdvisory, true);
  assert.equal(verdict.reason, "HARD_STOP_FREE_TIER_VERIFIED");
});

test("classify: keyless endpoint is FREE_VERIFIED only through the no-auth connection", () => {
  const noauth = classifyFreeCost(
    { ...KEYLESS, connectionId: SYNTHETIC_NOAUTH_CONNECTION_ID },
    FELO_ENTRY
  );
  assert.equal(noauth.costClass, "FREE_VERIFIED");
  assert.equal(noauth.autoFreeAllowed, true);
  assert.equal(noauth.telemetryAdvisory, false);
  assert.equal(noauth.reason, "KEYLESS_HARD_FREE_ENDPOINT");

  const credentialed = classifyFreeCost({ ...KEYLESS, connectionId: REAL_CONN }, FELO_ENTRY);
  assert.equal(credentialed.costClass, "FREE_UNKNOWN");
  assert.equal(credentialed.autoFreeAllowed, false);
  assert.equal(credentialed.reason, "KEYLESS_REQUIRES_NOAUTH_CONNECTION");
});

test("classify: signup and recurring credit grants are CREDIT_BACKED", () => {
  const trial = classifyFreeCost(
    { provider: "synthetic-trial", model: "trial-model" },
    syntheticEntry({ freeType: "one-time-initial" })
  );
  assert.equal(trial.costClass, "CREDIT_BACKED");
  assert.equal(trial.autoFreeAllowed, false);
  assert.equal(trial.reason, "CREDIT_BACKED_EXCLUDED");

  const credit = classifyFreeCost(
    { provider: "synthetic-credit", model: "credit-model" },
    syntheticEntry({ freeType: "recurring-credit" })
  );
  assert.equal(credit.costClass, "CREDIT_BACKED");
  assert.equal(credit.reason, "CREDIT_BACKED_EXCLUDED");
});

test("classify: recurring free tier without a hard-stop proof is FREE_UNKNOWN", () => {
  for (const hardStopGuaranteed of [undefined, false]) {
    const verdict = classifyFreeCost(
      { provider: "synthetic-unproven", model: "unproven-model" },
      syntheticEntry({ freeType: "recurring-monthly", hardStopGuaranteed })
    );
    assert.equal(verdict.costClass, "FREE_UNKNOWN");
    assert.equal(verdict.autoFreeAllowed, false);
    assert.equal(verdict.reason, "FREE_UNKNOWN_NO_HARD_STOP_PROOF");
  }
});

test("classify: discontinued free tiers are DISCONTINUED", () => {
  const verdict = classifyFreeCost(
    { provider: "synthetic-dead", model: "dead-model" },
    syntheticEntry({ freeType: "discontinued" })
  );
  assert.equal(verdict.costClass, "DISCONTINUED");
  assert.equal(verdict.autoFreeAllowed, false);
  assert.equal(verdict.reason, "DISCONTINUED_EXCLUDED");
});

test("classify: unknown, null and paid costs are excluded", () => {
  const unknown = classifyFreeCost({ provider: "unlisted-provider", model: "unlisted-model" });
  assert.equal(unknown.costClass, "UNKNOWN_COST");
  assert.equal(unknown.autoFreeAllowed, false);
  assert.equal(unknown.reason, "UNKNOWN_COST_EXCLUDED");

  const nullCost = classifyFreeCost({
    provider: "unlisted-provider",
    model: "unlisted-model",
    costPer1MTokens: null,
  });
  assert.equal(nullCost.costClass, "NULL_COST");
  assert.equal(nullCost.reason, "NULL_COST_EXCLUDED");

  const paid = classifyFreeCost({
    provider: "unlisted-provider",
    model: "unlisted-model",
    costPer1MTokens: 15,
  });
  assert.equal(paid.costClass, "PAID");
  assert.equal(paid.reason, "PAID_COST_EXCLUDED");
});

test("classify: no-auth connection carrying non-keyless metadata fails closed", () => {
  const verdict = classifyFreeCost(
    { ...HARD_STOP, connectionId: SYNTHETIC_NOAUTH_CONNECTION_ID },
    GROQ_ENTRY
  );
  assert.equal(verdict.costClass, "FREE_UNKNOWN");
  assert.equal(verdict.autoFreeAllowed, false);
  assert.equal(verdict.reason, "NOAUTH_METADATA_CONFLICT_EXCLUDED");
});

test("classify: self-hosted and local providers are SELF_HOSTED without quota telemetry", () => {
  for (const provider of ["ollama-local", "lm-studio", "llama-cpp", "vllm"]) {
    assert.equal(isSelfHostedFreeProvider(provider), true);
    const verdict = classifyFreeCost({ provider, model: "any-local-model" });
    assert.equal(verdict.costClass, "SELF_HOSTED");
    assert.equal(verdict.autoFreeAllowed, true);
    assert.equal(verdict.telemetryAdvisory, false);
    assert.equal(verdict.reason, "SELF_HOSTED_NO_BILLING");
  }
  assert.equal(isSelfHostedFreeProvider("totally-unheard-of-provider-xyz"), false);
});

test("AUTO FREE admission set is exactly FREE_VERIFIED and SELF_HOSTED", () => {
  assert.deepEqual([...AUTO_FREE_ALLOWED_COST_CLASSES].sort(), ["FREE_VERIFIED", "SELF_HOSTED"]);
  const denied: FreeCostClass[] = [
    "FREE_UNKNOWN",
    "UNKNOWN_COST",
    "NULL_COST",
    "PAID",
    "CREDIT_BACKED",
    "DISCONTINUED",
  ];
  for (const costClass of denied) {
    assert.equal(AUTO_FREE_ALLOWED_COST_CLASSES.has(costClass), false);
  }
});

test("sentinel: hard-stop route without telemetry stays eligible", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    { entry: GROQ_ENTRY, resolveFreeAccessState: () => undefined, ...OPTIONS }
  );
  assert.equal(facts.autoFreeAllowed, true);
  assert.deepEqual(facts.safeConnectionIds, [REAL_CONN]);
  assert.equal(facts.quotaStatus, "UNKNOWN");
  assert.equal(facts.quotaRemaining, null);
  assert.equal(facts.reason, "HARD_STOP_FREE_TIER_VERIFIED");
});

test("sentinel: EXHAUSTED telemetry empties the safe set", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: GROQ_ENTRY,
      resolveFreeAccessState: () => reading({ status: "EXHAUSTED", remainingFreeAllowance: 0 }),
      ...OPTIONS,
    }
  );
  assert.deepEqual(facts.safeConnectionIds, []);
  assert.equal(facts.quotaStatus, "EXHAUSTED");
  assert.equal(facts.quotaRemaining, 0);
  assert.equal(facts.reason, "QUOTA_EXHAUSTED");
});

test("sentinel: SAFE telemetry with headroom is reported", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: GROQ_ENTRY,
      resolveFreeAccessState: () => reading({ remainingFreeAllowance: 40 }),
      ...OPTIONS,
    }
  );
  assert.deepEqual(facts.safeConnectionIds, [REAL_CONN]);
  assert.equal(facts.quotaStatus, "SAFE");
  assert.equal(facts.quotaRemaining, 40);
  assert.equal(facts.reason, "HARD_STOP_FREE_TIER_VERIFIED");
});

test("sentinel: SAFE telemetry below the headroom margin is not dispatchable", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: GROQ_ENTRY,
      resolveFreeAccessState: () => reading({ remainingFreeAllowance: 0.5 }),
      ...OPTIONS,
    }
  );
  assert.deepEqual(facts.safeConnectionIds, []);
  assert.equal(facts.quotaStatus, "ABSENT");
  assert.equal(facts.quotaRemaining, null);
  assert.equal(facts.reason, "NO_SAFE_CONNECTION");
});

test("sentinel: stale or UNKNOWN telemetry is advisory only for a hard-stop route", () => {
  const stale = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: GROQ_ENTRY,
      resolveFreeAccessState: () => reading({ checkedAt: "2026-08-19T00:00:00.000Z" }),
      ...OPTIONS,
    }
  );
  assert.deepEqual(stale.safeConnectionIds, [REAL_CONN]);
  assert.equal(stale.quotaStatus, "UNKNOWN");

  const unknown = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    {
      entry: GROQ_ENTRY,
      resolveFreeAccessState: () => reading({ status: "UNKNOWN", remainingFreeAllowance: null }),
      ...OPTIONS,
    }
  );
  assert.deepEqual(unknown.safeConnectionIds, [REAL_CONN]);
  assert.equal(unknown.quotaStatus, "UNKNOWN");
});

test("sentinel: only positive EXHAUSTED evidence narrows a multi-account candidate", () => {
  const facts = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: null, allowedConnectionIds: ["A", "B"] },
    {
      entry: GROQ_ENTRY,
      resolveFreeAccessState: (_provider, connectionId) =>
        connectionId === "A"
          ? reading({ status: "EXHAUSTED", remainingFreeAllowance: 0 })
          : undefined,
      ...OPTIONS,
    }
  );
  assert.deepEqual(facts.safeConnectionIds, ["B"]);
  assert.equal(facts.quotaStatus, "UNKNOWN");
  assert.equal(facts.autoFreeAllowed, true);
});

test("sentinel: a self-hosted candidate never reads quota telemetry", () => {
  const facts = evaluateFreeSentinel(
    { provider: "ollama-local", model: "llama3", connectionId: REAL_CONN },
    {
      resolveFreeAccessState: () => {
        throw new Error("quota must not be read for a self-hosted provider");
      },
      ...OPTIONS,
    }
  );
  assert.equal(facts.costClass, "SELF_HOSTED");
  assert.deepEqual(facts.safeConnectionIds, [REAL_CONN]);
  assert.equal(facts.quotaStatus, "ABSENT");
});

test("sentinel: a keyless candidate is admitted with its no-auth connection", () => {
  const facts = evaluateFreeSentinel(
    { ...KEYLESS, connectionId: SYNTHETIC_NOAUTH_CONNECTION_ID },
    { catalog: FREE_MODEL_BUDGETS, ...OPTIONS }
  );
  assert.equal(facts.costClass, "FREE_VERIFIED");
  assert.deepEqual(facts.safeConnectionIds, [SYNTHETIC_NOAUTH_CONNECTION_ID]);
});

test("sentinel: eligibility follows the catalog it is given, not a hardcoded provider list", () => {
  const withCatalog = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    { catalog: FREE_MODEL_BUDGETS, resolveFreeAccessState: () => undefined, ...OPTIONS }
  );
  assert.equal(withCatalog.costClass, "FREE_VERIFIED");
  assert.deepEqual(withCatalog.safeConnectionIds, [REAL_CONN]);

  const withoutCatalog = evaluateFreeSentinel(
    { ...HARD_STOP, connectionId: REAL_CONN },
    { catalog: [], resolveFreeAccessState: () => undefined, ...OPTIONS }
  );
  assert.equal(withoutCatalog.costClass, "UNKNOWN_COST");
  assert.equal(withoutCatalog.autoFreeAllowed, false);
  assert.deepEqual(withoutCatalog.safeConnectionIds, []);
});

test("sentinel: no paid fallback — telemetry never admits a paid or unknown-cost candidate", () => {
  const perfectTelemetry = () => reading({ remainingFreeAllowance: 100 });

  const unknownCost = evaluateFreeSentinel(
    { provider: "openai", model: "gpt-4o", connectionId: REAL_CONN },
    { catalog: FREE_MODEL_BUDGETS, resolveFreeAccessState: perfectTelemetry, ...OPTIONS }
  );
  assert.equal(unknownCost.autoFreeAllowed, false);
  assert.deepEqual(unknownCost.safeConnectionIds, []);
  assert.equal(unknownCost.reason, "UNKNOWN_COST_EXCLUDED");

  const paid = evaluateFreeSentinel(
    { provider: "openai", model: "gpt-4o", connectionId: REAL_CONN, costPer1MTokens: 15 },
    { catalog: FREE_MODEL_BUDGETS, resolveFreeAccessState: perfectTelemetry, ...OPTIONS }
  );
  assert.equal(paid.autoFreeAllowed, false);
  assert.deepEqual(paid.safeConnectionIds, []);
  assert.equal(paid.reason, "PAID_COST_EXCLUDED");
});

test("findFreeCatalogEntry matches provider+model and rejects everything else", () => {
  const match = findFreeCatalogEntry(HARD_STOP, FREE_MODEL_BUDGETS);
  assert.ok(match);
  assert.equal(match.provider, "groq");
  assert.equal(match.modelId, "llama-3.3-70b-versatile");

  assert.equal(
    findFreeCatalogEntry({ provider: "groq", model: "not-cataloged" }, FREE_MODEL_BUDGETS),
    undefined
  );
  assert.equal(findFreeCatalogEntry(HARD_STOP, []), undefined);
});
