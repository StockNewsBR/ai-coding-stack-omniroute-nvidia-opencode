/**
 * R1 budget reservation / concurrency safety tests.
 *
 * Proves the paid image budget cap cannot be overspent when two requests are
 * evaluated and executed concurrently near the boundary. Uses the in-memory
 * ledger and synthetic adapters only — NO network, NO paid inference.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { PaidImageProviderAdapter } from "../../open-sse/config/paidImageProviderAdapter.ts";
import { createInMemoryPaidImageLedger } from "../../open-sse/config/paidImageLedger.ts";
import {
  executePaidImageProvider,
  resolvePaidImageProvider,
} from "../../open-sse/config/paidImageRouting.ts";

const NOW = new Date("2026-09-21T12:00:00.000Z");
const AWS = "aws-bedrock-image";

function adapter(cost: number, providerId = AWS): PaidImageProviderAdapter {
  return {
    providerId,
    capabilities: () => ["image-generation"],
    isConfigured: () => true,
    isAvailable: () => true,
    healthStatus: () => "healthy",
    quoteCost: () => ({ estimatedCostUsd: cost }),
    quotaState: () => ({ status: "available" }),
    generateImage: async () => ({
      ok: true,
      providerId,
      actualCostUsd: cost,
      imageUrls: ["https://example.test/one.png"],
      latencyMs: 3,
    }),
  };
}

function policy(dailyBudget: number, overrides: Record<string, unknown> = {}) {
  return {
    imagePaidFallbackEnabled: true,
    maxCostPerImage: 1,
    dailyImageBudget: dailyBudget,
    monthlyImageBudget: 100,
    ...overrides,
  };
}

test("r1: two concurrent $0.04 requests against a $0.05 daily cap cannot overspend", async () => {
  const ledger = createInMemoryPaidImageLedger();
  const adapters = [adapter(0.04)];
  const deps = {
    capability: "image-generation" as const,
    policy: policy(0.05),
    adapters,
    ledger,
    now: NOW,
  };

  // Both requests pass the read-only selection stage before either spends.
  const selectionA = await resolvePaidImageProvider({ ...deps, requestId: "A" });
  const selectionB = await resolvePaidImageProvider({ ...deps, requestId: "B" });
  if (!selectionA.ok || !selectionB.ok) assert.fail("both selections must be acceptable before spending");

  // Execute concurrently: the atomic reservation must admit exactly one.
  const [resultA, resultB] = await Promise.all([
    executePaidImageProvider({ ...deps, requestId: "A", selection: selectionA }),
    executePaidImageProvider({ ...deps, requestId: "B", selection: selectionB }),
  ]);

  const successes = [resultA, resultB].filter((r) => r.ok).length;
  assert.equal(successes, 1, "exactly one concurrent request may spend");
  const dailySpend = Number(await ledger.getDailySpendUsd(NOW));
  assert.ok(dailySpend <= 0.05, `daily spend ${dailySpend} must not exceed 0.05`);
  assert.equal(dailySpend, 0.04);
});

test("r1: the rejected concurrent request reports a budget denial code", async () => {
  const ledger = createInMemoryPaidImageLedger();
  const adapters = [adapter(0.04)];
  const deps = {
    capability: "image-generation" as const,
    policy: policy(0.05),
    adapters,
    ledger,
    now: NOW,
  };
  const selection = await resolvePaidImageProvider({ ...deps, requestId: "A" });
  if (!selection.ok) assert.fail("selection must be acceptable before spending");
  const [first, second] = await Promise.all([
    executePaidImageProvider({ ...deps, requestId: "A", selection }),
    executePaidImageProvider({ ...deps, requestId: "B", selection }),
  ]);
  const denied = [first, second].find((r) => !r.ok);
  assert.ok(denied);
  assert.equal(denied?.code, "DAILY_BUDGET_EXCEEDED");
});

test("r1: an outstanding reservation is visible to spend reads", async () => {
  const ledger = createInMemoryPaidImageLedger();
  const reserve = ledger.tryReserve;
  assert.ok(reserve, "in-memory ledger must implement tryReserve");
  const verdict = await reserve.call(ledger, {
    requestId: "r1",
    estimatedCostUsd: 0.04,
    maxCostPerImage: 1,
    dailyImageBudget: 0.05,
    monthlyImageBudget: 100,
    now: NOW,
  });
  assert.equal(verdict.reserved, true);
  assert.equal(Number(await ledger.getDailySpendUsd(NOW)), 0.04);
});

test("r1: recording releases the reservation and books the actual cost once", async () => {
  const ledger = createInMemoryPaidImageLedger();
  const reserve = ledger.tryReserve;
  assert.ok(reserve);
  await reserve.call(ledger, {
    requestId: "r1",
    estimatedCostUsd: 0.04,
    maxCostPerImage: 1,
    dailyImageBudget: 10,
    monthlyImageBudget: 100,
    now: NOW,
  });
  await ledger.record({
    requestId: "r1",
    providerId: AWS,
    capability: "image-generation",
    timestamp: NOW.toISOString(),
    estimatedCostUsd: 0.04,
    actualCostUsd: 0.04,
    decisionReason: "PAID_IMAGE_EXECUTED",
    outcome: "executed",
  });
  assert.equal(Number(await ledger.getDailySpendUsd(NOW)), 0.04);
  assert.equal(ledger.entries.length, 1);
});

test("r1: reservation still enforces the per-image max cost guard", async () => {
  const ledger = createInMemoryPaidImageLedger();
  const reserve = ledger.tryReserve;
  assert.ok(reserve);
  const verdict = await reserve.call(ledger, {
    requestId: "r1",
    estimatedCostUsd: 2,
    maxCostPerImage: 0.5,
    dailyImageBudget: 100,
    monthlyImageBudget: 1000,
    now: NOW,
  });
  assert.equal(verdict.reserved, false);
  assert.equal(verdict.code, "MAX_COST_EXCEEDED");
});

test("r1: sequential spend still respects the cap (no regression to fail-closed)", async () => {
  const ledger = createInMemoryPaidImageLedger();
  const adapters = [adapter(0.04)];
  const deps = {
    capability: "image-generation" as const,
    policy: policy(0.05),
    adapters,
    ledger,
    now: NOW,
  };
  const first = await resolvePaidImageProvider({ ...deps, requestId: "A" });
  if (!first.ok) assert.fail("first selection must be acceptable");
  const firstResult = await executePaidImageProvider({ ...deps, requestId: "A", selection: first });
  assert.equal(firstResult.ok, true);

  const second = await resolvePaidImageProvider({ ...deps, requestId: "B" });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, "DAILY_BUDGET_EXCEEDED");
});
