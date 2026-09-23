/**
 * R0 paid image fallback framework — deterministic offline tests.
 *
 * Node:test scope: top-level tests/unit/*.test.ts run under the built-in test
 * runner. No network calls, no paid provider spend: every paid candidate is a
 * synthetic in-process adapter and every budget is a deterministic in-memory
 * ledger.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PAID_IMAGE_POLICY,
  evaluatePaidImageBudget,
  normalizePaidImagePolicy,
  type PaidImagePolicy,
} from "../../open-sse/config/paidImagePolicy.ts";
import {
  PAID_NON_IMAGE_CAPABILITIES,
  type PaidImageCapability,
  type PaidImageProviderAdapter,
  type PaidImageProviderHealth,
  type PaidImageQuotaState,
  type PaidImageRequestCapability,
} from "../../open-sse/config/paidImageProviderAdapter.ts";
import {
  createInMemoryPaidImageLedger,
  type InMemoryPaidImageLedger,
  type PaidImageLedgerOutcome,
} from "../../open-sse/config/paidImageLedger.ts";
import {
  executePaidImageProvider,
  resolveImageRouteSelection,
  resolvePaidImageProvider,
  type PaidImageSelection,
} from "../../open-sse/config/paidImageRouting.ts";
import type {
  FreeImageSelection,
  FreeImageUnavailable,
} from "../../open-sse/config/freeImageRouting.ts";

const NOW = new Date("2026-09-21T12:00:00.000Z");

const FREE_AVAILABLE: FreeImageSelection = {
  ok: true,
  providerId: "local-comfy",
  modelId: "sdxl",
  status: "SELF_HOSTED",
  reason: "SELF_HOSTED_LOCAL_IMAGE_ENDPOINT",
};

const FREE_UNAVAILABLE: FreeImageUnavailable = {
  ok: false,
  code: "NO_FREE_IMAGE_PROVIDER_AVAILABLE",
  reason: "NO_ELIGIBLE_FREE_IMAGE_PROVIDER",
  considered: [],
};

const FREE_CIRCUIT_OPEN: FreeImageUnavailable = {
  ok: false,
  code: "NO_FREE_IMAGE_PROVIDER_AVAILABLE",
  reason: "ALL_FREE_IMAGE_PROVIDERS_CIRCUIT_OPEN",
  considered: [],
};

interface FakeAdapterCalls {
  isConfigured: number;
  isAvailable: number;
  healthStatus: number;
  quoteCost: number;
  quotaState: number;
  generateImage: number;
  reportUsage: number;
}

interface FakeAdapterOptions {
  providerId: string;
  cost?: number;
  health?: PaidImageProviderHealth;
  quota?: PaidImageQuotaState;
  configured?: boolean;
  available?: boolean;
  qualityScore?: number;
  capabilities?: readonly PaidImageCapability[];
  quoteNull?: boolean;
  failGeneration?: boolean;
}

type FakePaidAdapter = PaidImageProviderAdapter & { calls: FakeAdapterCalls };

function fakeAdapter(options: FakeAdapterOptions): FakePaidAdapter {
  const calls: FakeAdapterCalls = {
    isConfigured: 0,
    isAvailable: 0,
    healthStatus: 0,
    quoteCost: 0,
    quotaState: 0,
    generateImage: 0,
    reportUsage: 0,
  };
  return {
    providerId: options.providerId,
    calls,
    capabilities: () => options.capabilities ?? ["image-generation"],
    isConfigured: () => {
      calls.isConfigured += 1;
      return options.configured ?? true;
    },
    isAvailable: () => {
      calls.isAvailable += 1;
      return options.available ?? true;
    },
    healthStatus: () => {
      calls.healthStatus += 1;
      return options.health ?? "healthy";
    },
    quoteCost: () => {
      calls.quoteCost += 1;
      return options.quoteNull
        ? null
        : { estimatedCostUsd: options.cost ?? 0.25, qualityScore: options.qualityScore };
    },
    quotaState: () => {
      calls.quotaState += 1;
      return options.quota ?? { status: "available" };
    },
    generateImage: async () => {
      calls.generateImage += 1;
      if (options.failGeneration) {
        return { ok: false, providerId: options.providerId, error: "synthetic generation failure" };
      }
      return {
        ok: true,
        providerId: options.providerId,
        actualCostUsd: options.cost ?? 0.25,
        imageUrls: ["https://example.test/generated.png"],
        latencyMs: 12,
      };
    },
    reportUsage: () => {
      calls.reportUsage += 1;
    },
  };
}

function enabledPolicy(overrides: Partial<PaidImagePolicy> = {}): PaidImagePolicy {
  return {
    imagePaidFallbackEnabled: true,
    maxCostPerImage: 1,
    dailyImageBudget: 10,
    monthlyImageBudget: 100,
    ...overrides,
  };
}

function seedSpend(
  ledger: InMemoryPaidImageLedger,
  cost: number,
  outcome: PaidImageLedgerOutcome = "executed"
): void {
  ledger.record({
    requestId: `seed-${cost}`,
    providerId: "seed-provider",
    capability: "image-generation",
    timestamp: NOW.toISOString(),
    estimatedCostUsd: cost,
    outcome,
    decisionReason: "test seed",
  });
}

function assertPaidUnavailable(result: Awaited<ReturnType<typeof resolvePaidImageProvider>>): void {
  if (result.ok) throw new Error(`expected paid denial, got provider ${result.providerId}`);
}

test("default production-safe state: paid fallback disabled", () => {
  assert.equal(DEFAULT_PAID_IMAGE_POLICY.imagePaidFallbackEnabled, false);
  assert.equal(normalizePaidImagePolicy(undefined).imagePaidFallbackEnabled, false);
  assert.equal(
    normalizePaidImagePolicy({ imagePaidFallbackEnabled: "yes" }).imagePaidFallbackEnabled,
    false
  );
  const coerced = normalizePaidImagePolicy({
    imagePaidFallbackEnabled: true,
    dailyImageBudget: -5,
    maxCostPerImage: 0,
  });
  assert.equal(coerced.dailyImageBudget, undefined);
  assert.equal(coerced.maxCostPerImage, undefined);
});

test("FREE image available: paid router is never consulted", async () => {
  const adapter = fakeAdapter({ providerId: "synthetic-paid", cost: 0.5 });
  const selection = await resolveImageRouteSelection({
    capability: "image-generation",
    free: FREE_AVAILABLE,
    paid: {
      policy: enabledPolicy(),
      adapters: [adapter],
      ledger: createInMemoryPaidImageLedger(),
      now: NOW,
    },
  });
  assert.equal(selection.ok, true);
  if (!selection.ok) throw new Error("expected free selection");
  assert.equal(selection.via, "free");
  assert.equal(selection.providerId, "local-comfy");
  assert.equal(adapter.calls.isConfigured, 0);
  assert.equal(adapter.calls.quoteCost, 0);
  assert.equal(adapter.calls.generateImage, 0);
});

test("FREE unavailable + paid fallback disabled: controlled unavailable", async () => {
  const adapter = fakeAdapter({ providerId: "synthetic-paid" });
  const selection = await resolveImageRouteSelection({
    capability: "image-generation",
    free: FREE_UNAVAILABLE,
    paid: { adapters: [adapter], ledger: createInMemoryPaidImageLedger(), now: NOW },
  });
  assert.equal(selection.ok, false);
  if (selection.ok) throw new Error("expected controlled unavailable");
  assert.equal(selection.code, "NO_FREE_IMAGE_PROVIDER_AVAILABLE");
  assert.equal(selection.paidFallback.evaluated, true);
  assert.equal(selection.paidFallback.code, "POLICY_DISABLED");
  assert.equal(adapter.calls.isConfigured, 0);
  assert.equal(adapter.calls.generateImage, 0);
});

test("FREE circuit open maps to FREE_IMAGE_CIRCUIT_OPEN fallback reason", async () => {
  const selection = await resolveImageRouteSelection({
    capability: "image-generation",
    free: FREE_CIRCUIT_OPEN,
  });
  assert.equal(selection.ok, false);
  if (selection.ok) throw new Error("expected controlled unavailable");
  assert.equal(selection.paidFallback.fallbackReason, "FREE_IMAGE_CIRCUIT_OPEN");
  assert.equal(selection.paidFallback.code, "POLICY_DISABLED");
});

test("FREE unavailable + paid fallback enabled synthetically: candidate evaluated, cheapest acceptable chosen", async () => {
  const expensive = fakeAdapter({ providerId: "paid-expensive", cost: 0.9 });
  const cheap = fakeAdapter({ providerId: "paid-cheap", cost: 0.1 });
  const policy = enabledPolicy();
  const ledger = createInMemoryPaidImageLedger();
  const selection = await resolveImageRouteSelection({
    capability: "image-generation",
    requestId: "req-paid-1",
    free: FREE_UNAVAILABLE,
    paid: {
      policy,
      adapters: [expensive, cheap],
      ledger,
      now: NOW,
    },
  });
  assert.equal(selection.ok, true);
  if (!selection.ok) throw new Error(`expected paid selection: ${selection.paidFallback.code}`);
  assert.equal(selection.via, "paid");
  assert.equal(selection.providerId, "paid-cheap");
  assert.equal(selection.estimatedCostUsd, 0.1);
  assert.equal(selection.paidExecution?.policy, policy);
  assert.equal(selection.paidExecution?.ledger, ledger);
  assert.equal(expensive.calls.quoteCost, 1);
  assert.equal(cheap.calls.quoteCost, 1);
  assert.equal(expensive.calls.generateImage, 0);
  assert.equal(cheap.calls.generateImage, 0);
});

test("cheapest unhealthy: next acceptable paid provider is chosen", async () => {
  const cheapUnhealthy = fakeAdapter({ providerId: "paid-cheap", cost: 0.1, health: "unhealthy" });
  const fallback = fakeAdapter({ providerId: "paid-next", cost: 0.4 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy(),
    adapters: [cheapUnhealthy, fallback],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assert.equal(selection.ok, true);
  if (!selection.ok) throw new Error("expected fallback provider");
  assert.equal(selection.providerId, "paid-next");
  assert.equal(cheapUnhealthy.calls.generateImage, 0);
});

test("all paid candidates rejected: controlled unavailable with per-candidate reasons", async () => {
  const unhealthy = fakeAdapter({ providerId: "paid-a", cost: 0.1, health: "unhealthy" });
  const exhausted = fakeAdapter({
    providerId: "paid-b",
    cost: 0.2,
    quota: { status: "exhausted" },
  });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy(),
    adapters: [unhealthy, exhausted],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "NO_ACCEPTABLE_PAID_PROVIDER");
  assert.deepEqual(
    selection.considered.map((entry) => entry.code),
    ["PROVIDER_UNHEALTHY", "QUOTA_EXHAUSTED"]
  );
});

test("paid provider over maxCostPerImage: deny", async () => {
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy({ maxCostPerImage: 0.2 }),
    adapters: [fakeAdapter({ providerId: "paid-pricey", cost: 0.5 })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "MAX_COST_EXCEEDED");
});

test("daily budget exceeded: deny", async () => {
  const ledger = createInMemoryPaidImageLedger();
  seedSpend(ledger, 9.5);
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy({ dailyImageBudget: 10, monthlyImageBudget: 1000 }),
    adapters: [fakeAdapter({ providerId: "paid-daily", cost: 1 })],
    ledger,
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "DAILY_BUDGET_EXCEEDED");
});

test("monthly budget exceeded: deny", async () => {
  const ledger = createInMemoryPaidImageLedger();
  seedSpend(ledger, 9.6);
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy({ dailyImageBudget: 100, monthlyImageBudget: 10 }),
    adapters: [fakeAdapter({ providerId: "paid-monthly", cost: 0.5 })],
    ledger,
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "MONTHLY_BUDGET_EXCEEDED");
});

test("budget config absent: paid execution denied", async () => {
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: { imagePaidFallbackEnabled: true },
    adapters: [fakeAdapter({ providerId: "paid-unfunded", cost: 0.01 })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "BUDGET_CONFIG_MISSING");
});

test("budget state unverified: fail closed", async () => {
  const brokenLedger = {
    record: () => undefined,
    getDailySpendUsd: () => Number.NaN,
    getMonthlySpendUsd: () => 0,
  };
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy(),
    adapters: [fakeAdapter({ providerId: "paid-nostate", cost: 0.1 })],
    ledger: brokenLedger,
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "BUDGET_STATE_UNVERIFIED");
});

test("budget boundary: spend plus quote exactly at daily budget is allowed", () => {
  const verdict = evaluatePaidImageBudget(
    enabledPolicy({ dailyImageBudget: 1, monthlyImageBudget: 10 }),
    {
      estimatedCostUsd: 0.5,
      dailySpendUsd: 0.5,
      monthlySpendUsd: 0.5,
    }
  );
  assert.equal(verdict.decision, "allow");
});

test("budget evaluation orders config, quote and caps fail-closed", () => {
  const disabled = evaluatePaidImageBudget(DEFAULT_PAID_IMAGE_POLICY, {
    estimatedCostUsd: 0.1,
    dailySpendUsd: 0,
    monthlySpendUsd: 0,
  });
  assert.equal(disabled.code, "POLICY_DISABLED");

  const unfunded = evaluatePaidImageBudget(
    { imagePaidFallbackEnabled: true },
    { estimatedCostUsd: 0.1, dailySpendUsd: 0, monthlySpendUsd: 0 }
  );
  assert.equal(unfunded.code, "BUDGET_CONFIG_MISSING");

  const invalidQuote = evaluatePaidImageBudget(enabledPolicy(), {
    estimatedCostUsd: Number.NaN,
    dailySpendUsd: 0,
    monthlySpendUsd: 0,
  });
  assert.equal(invalidQuote.code, "COST_QUOTE_UNAVAILABLE");
});

test("provider unhealthy: deny", async () => {
  for (const health of ["unhealthy", "unknown"] as const) {
    const selection = await resolvePaidImageProvider({
      capability: "image-generation",
      policy: enabledPolicy(),
      adapters: [fakeAdapter({ providerId: `paid-${health}`, cost: 0.1, health })],
      ledger: createInMemoryPaidImageLedger(),
      now: NOW,
    });
    assertPaidUnavailable(selection);
    if (selection.ok) throw new Error("unreachable");
    assert.equal(selection.code, "PROVIDER_UNHEALTHY");
  }
});

test("circuit open: deny without consulting the paid provider", async () => {
  const adapter = fakeAdapter({ providerId: "paid-circuited", cost: 0.1 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy(),
    adapters: [adapter],
    ledger: createInMemoryPaidImageLedger(),
    isCircuitOpen: () => true,
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "CIRCUIT_OPEN");
  assert.equal(adapter.calls.quoteCost, 0);
  assert.equal(adapter.calls.generateImage, 0);
});

test("quota unavailable or exhausted: deny", async () => {
  const exhausted = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy(),
    adapters: [
      fakeAdapter({ providerId: "paid-quota", cost: 0.1, quota: { status: "exhausted" } }),
    ],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(exhausted);
  if (exhausted.ok) throw new Error("unreachable");
  assert.equal(exhausted.code, "QUOTA_EXHAUSTED");

  const unknown = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy(),
    adapters: [
      fakeAdapter({ providerId: "paid-quota-unknown", cost: 0.1, quota: { status: "unknown" } }),
    ],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(unknown);
  if (unknown.ok) throw new Error("unreachable");
  assert.equal(unknown.code, "QUOTA_UNKNOWN");
});

test("cost quote unavailable: deny", async () => {
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy(),
    adapters: [fakeAdapter({ providerId: "paid-noquote", cost: 0.1, quoteNull: true })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "COST_QUOTE_UNAVAILABLE");
});

test("quality floor: below floor and unverified quality are denied, verified passes", async () => {
  const belowFloor = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy({ qualityFloor: 0.8 }),
    adapters: [fakeAdapter({ providerId: "paid-quality", cost: 0.1, qualityScore: 0.5 })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(belowFloor);
  if (belowFloor.ok) throw new Error("unreachable");
  assert.equal(belowFloor.code, "QUALITY_BELOW_FLOOR");

  const unverified = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy({ qualityFloor: 0.8 }),
    adapters: [fakeAdapter({ providerId: "paid-quality-unknown", cost: 0.1 })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(unverified);
  if (unverified.ok) throw new Error("unreachable");
  assert.equal(unverified.code, "QUALITY_FLOOR_UNVERIFIED");

  const passing = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy({ qualityFloor: 0.8 }),
    adapters: [fakeAdapter({ providerId: "paid-quality-ok", cost: 0.1, qualityScore: 0.95 })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assert.equal(passing.ok, true);
  if (!passing.ok) throw new Error("expected quality-verified provider");
});

test("allow and deny provider lists are honored", async () => {
  const denied = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy({ denyProviders: ["paid-blocked"] }),
    adapters: [fakeAdapter({ providerId: "paid-blocked", cost: 0.1 })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(denied);
  if (denied.ok) throw new Error("unreachable");
  assert.equal(denied.code, "PROVIDER_DENIED");

  const notAllowed = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy({ allowProviders: ["paid-other"] }),
    adapters: [fakeAdapter({ providerId: "paid-blocked", cost: 0.1 })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(notAllowed);
  if (notAllowed.ok) throw new Error("unreachable");
  assert.equal(notAllowed.code, "PROVIDER_NOT_ALLOWED");
});

test("adapter that does not declare image-generation is rejected", async () => {
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    policy: enabledPolicy(),
    adapters: [fakeAdapter({ providerId: "paid-not-image", cost: 0.1, capabilities: [] })],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assertPaidUnavailable(selection);
  if (selection.ok) throw new Error("unreachable");
  assert.equal(selection.code, "CAPABILITY_NOT_IMAGE_GENERATION");
  assert.equal(selection.considered[0]?.code, "CAPABILITY_NOT_IMAGE_GENERATION");
});

for (const capability of PAID_NON_IMAGE_CAPABILITIES) {
  test(`paid ${capability} request: hard deny with capability wall`, async () => {
    const adapter = fakeAdapter({ providerId: `paid-${capability}`, cost: 0.1 });
    const selection = await resolvePaidImageProvider({
      capability,
      policy: enabledPolicy(),
      adapters: [adapter],
      ledger: createInMemoryPaidImageLedger(),
      now: NOW,
    });
    assertPaidUnavailable(selection);
    if (selection.ok) throw new Error("unreachable");
    assert.equal(selection.code, "CAPABILITY_NOT_IMAGE_GENERATION");
    assert.equal(adapter.calls.isConfigured, 0);
    assert.equal(adapter.calls.generateImage, 0);
  });
}

for (const capability of PAID_NON_IMAGE_CAPABILITIES) {
  test(`no silent paid fallback outside image: ${capability}`, async () => {
    const adapter = fakeAdapter({ providerId: `paid-${capability}`, cost: 0.1 });
    const selection = await resolveImageRouteSelection({
      capability: capability as PaidImageRequestCapability,
      free: FREE_UNAVAILABLE,
      paid: {
        policy: enabledPolicy(),
        adapters: [adapter],
        ledger: createInMemoryPaidImageLedger(),
        now: NOW,
      },
    });
    assert.equal(selection.ok, false);
    if (selection.ok) throw new Error("expected controlled unavailable");
    assert.equal(selection.paidFallback.code, "CAPABILITY_NOT_IMAGE_GENERATION");
    assert.equal(adapter.calls.isConfigured, 0);
    assert.equal(adapter.calls.generateImage, 0);
  });
}

test("execute: paid provider only runs when policy is enabled and funded, then ledger records usage", async () => {
  const adapter = fakeAdapter({ providerId: "paid-exec", cost: 0.4 });
  const ledger = createInMemoryPaidImageLedger();
  const resolved = await resolvePaidImageProvider({
    capability: "image-generation",
    requestId: "req-exec-1",
    policy: enabledPolicy(),
    adapters: [adapter],
    ledger,
    now: NOW,
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) throw new Error("expected paid selection");

  const execution = await executePaidImageProvider({
    capability: "image-generation",
    requestId: "req-exec-1",
    policy: enabledPolicy(),
    selection: resolved,
    ledger,
    now: NOW,
  });
  assert.equal(execution.ok, true);
  if (!execution.ok) throw new Error(`expected execution: ${execution.code}`);
  assert.equal(adapter.calls.generateImage, 1);
  assert.equal(adapter.calls.reportUsage, 1);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].providerId, "paid-exec");
  assert.equal(ledger.entries[0].requestId, "req-exec-1");
  assert.equal(ledger.entries[0].capability, "image-generation");
  assert.equal(ledger.entries[0].outcome, "executed");
  assert.equal(ledger.entries[0].estimatedCostUsd, 0.4);
  assert.equal(ledger.entries[0].actualCostUsd, 0.4);
  assert.equal(ledger.entries[0].fallbackReason, "NO_FREE_IMAGE_PROVIDER_AVAILABLE");
  assert.equal(await ledger.getDailySpendUsd(NOW), 0.4);
  assert.equal(await ledger.getMonthlySpendUsd(NOW), 0.4);
});

test("execute: disabled policy or non-image capability never calls generateImage", async () => {
  const adapter = fakeAdapter({ providerId: "paid-exec-guard", cost: 0.4 });
  const selection: PaidImageSelection = {
    ok: true,
    providerId: "paid-exec-guard",
    adapter,
    estimatedCostUsd: 0.4,
  };
  const ledger = createInMemoryPaidImageLedger();

  const disabled = await executePaidImageProvider({
    capability: "image-generation",
    requestId: "req-guard-1",
    selection,
    ledger,
    now: NOW,
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.code, "POLICY_DISABLED");

  for (const capability of PAID_NON_IMAGE_CAPABILITIES) {
    const denied = await executePaidImageProvider({
      capability,
      requestId: `req-guard-${capability}`,
      policy: enabledPolicy(),
      selection,
      ledger,
      now: NOW,
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "CAPABILITY_NOT_IMAGE_GENERATION");
  }

  assert.equal(adapter.calls.generateImage, 0);
  assert.equal(ledger.entries.length, 0);
});

test("execute: adapter failure is recorded as failed, never silently swallowed", async () => {
  const adapter = fakeAdapter({ providerId: "paid-failing", cost: 0.4, failGeneration: true });
  const ledger = createInMemoryPaidImageLedger();
  const selection: PaidImageSelection = {
    ok: true,
    providerId: "paid-failing",
    adapter,
    estimatedCostUsd: 0.4,
  };
  const execution = await executePaidImageProvider({
    capability: "image-generation",
    requestId: "req-fail-1",
    policy: enabledPolicy(),
    selection,
    ledger,
    now: NOW,
  });
  assert.equal(execution.ok, false);
  assert.equal(execution.code, "PAID_IMAGE_EXECUTION_FAILED");
  assert.equal(execution.reason, "synthetic generation failure");
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].outcome, "failed");
  assert.equal(ledger.entries[0].decisionReason, "synthetic generation failure");
  assert.equal(await ledger.getDailySpendUsd(NOW), 0.4);
});
