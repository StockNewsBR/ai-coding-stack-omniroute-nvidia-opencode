/**
 * R1 paid image provider failover matrix — synthetic adapters only.
 *
 * Every paid candidate here is an in-process synthetic adapter; NO network,
 * NO paid inference, NO spend. Validates dynamic cost-based selection through
 * the R0 router: cheapest acceptable provider wins, health/quota/circuit/max
 * cost/budget/price-evidence gates each remove a candidate, and free-first
 * resolution short-circuits before any paid adapter is consulted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  type PaidImageCapability,
  type PaidImageProviderAdapter,
  type PaidImageProviderHealth,
  type PaidImageQuotaState,
  type PaidImageRequestCapability,
} from "../../open-sse/config/paidImageProviderAdapter.ts";
import { createInMemoryPaidImageLedger } from "../../open-sse/config/paidImageLedger.ts";
import {
  resolveImageRouteSelection,
  resolvePaidImageProvider,
} from "../../open-sse/config/paidImageRouting.ts";
import type {
  FreeImageSelection,
  FreeImageUnavailable,
} from "../../open-sse/config/freeImageRouting.ts";

const NOW = new Date("2026-09-21T12:00:00.000Z");
const AWS = "aws-bedrock-image";
const META = "meta-muse-image";

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

interface Calls {
  isConfigured: number;
  quoteCost: number;
  generateImage: number;
}

type Synthetic = PaidImageProviderAdapter & { calls: Calls };

interface Options {
  providerId: string;
  cost?: number;
  health?: PaidImageProviderHealth;
  quota?: PaidImageQuotaState;
  quoteNull?: boolean;
  capabilities?: readonly PaidImageCapability[];
}

function syntheticAdapter(options: Options): Synthetic {
  const calls: Calls = { isConfigured: 0, quoteCost: 0, generateImage: 0 };
  return {
    providerId: options.providerId,
    calls,
    capabilities: () => options.capabilities ?? ["image-generation"],
    isConfigured: () => {
      calls.isConfigured += 1;
      return true;
    },
    isAvailable: () => true,
    healthStatus: () => options.health ?? "healthy",
    quoteCost: () => {
      calls.quoteCost += 1;
      return options.quoteNull ? null : { estimatedCostUsd: options.cost ?? 0.25 };
    },
    quotaState: () => options.quota ?? { status: "available" },
    generateImage: async () => {
      calls.generateImage += 1;
      return {
        ok: true,
        providerId: options.providerId,
        actualCostUsd: options.cost ?? 0.25,
        imageUrls: ["https://example.test/generated.png"],
        latencyMs: 5,
      };
    },
  };
}

function enabledPolicy(overrides: Record<string, unknown> = {}) {
  return {
    imagePaidFallbackEnabled: true,
    maxCostPerImage: 1,
    dailyImageBudget: 10,
    monthlyImageBudget: 100,
    ...overrides,
  };
}

function paidDeps(adapters: readonly PaidImageProviderAdapter[], extra: Record<string, unknown> = {}) {
  return {
    capability: "image-generation" as PaidImageRequestCapability,
    requestId: "req-1",
    prompt: "a lighthouse",
    policy: enabledPolicy(),
    adapters,
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
    ...extra,
  };
}

test("r1: FREE available short-circuits and never consults paid adapters", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.01 });
  const meta = syntheticAdapter({ providerId: META, cost: 0.02 });
  const result = await resolveImageRouteSelection({
    capability: "image-generation",
    requestId: "req-free",
    free: FREE_AVAILABLE,
    paid: { policy: enabledPolicy(), adapters: [aws, meta], ledger: createInMemoryPaidImageLedger(), now: NOW },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.via, "free");
  assert.equal(aws.calls.isConfigured, 0);
  assert.equal(aws.calls.quoteCost, 0);
  assert.equal(meta.calls.isConfigured, 0);
  assert.equal(meta.calls.quoteCost, 0);
});

test("r1: FREE unavailable + paid disabled is a controlled unavailable", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.01 });
  const result = await resolveImageRouteSelection({
    capability: "image-generation",
    requestId: "req-disabled",
    free: FREE_UNAVAILABLE,
    paid: { policy: { imagePaidFallbackEnabled: false }, adapters: [aws], ledger: createInMemoryPaidImageLedger(), now: NOW },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.paidFallback.evaluated, true);
    assert.equal(result.paidFallback.code, "POLICY_DISABLED");
  }
  assert.equal(aws.calls.quoteCost, 0);
});

test("r1: FREE circuit open records the explicit fallback reason", async () => {
  const result = await resolveImageRouteSelection({
    capability: "image-generation",
    requestId: "req-circuit",
    free: FREE_CIRCUIT_OPEN,
    paid: { policy: { imagePaidFallbackEnabled: false }, adapters: [syntheticAdapter({ providerId: AWS })], ledger: createInMemoryPaidImageLedger(), now: NOW },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.paidFallback.fallbackReason, "FREE_IMAGE_CIRCUIT_OPEN");
});

test("r1: cheapest factual quote wins (aws cheaper than meta)", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.01 });
  const meta = syntheticAdapter({ providerId: META, cost: 0.02 });
  const result = await resolvePaidImageProvider(paidDeps([meta, aws]));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.providerId, AWS);
    assert.equal(result.estimatedCostUsd, 0.01);
  }
});

test("r1: cheaper-provider-first ordering is irrelevant (meta cheaper than aws wins)", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.5 });
  const meta = syntheticAdapter({ providerId: META, cost: 0.01 });
  const result = await resolvePaidImageProvider(paidDeps([aws, meta]));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.providerId, META);
});

test("r1: cheaper but unhealthy aws is skipped in favor of meta", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.01, health: "unhealthy" });
  const meta = syntheticAdapter({ providerId: META, cost: 0.02 });
  const result = await resolvePaidImageProvider(paidDeps([aws, meta]));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.providerId, META);
});

test("r1: cheaper meta with exhausted quota is skipped in favor of aws", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.05 });
  const meta = syntheticAdapter({ providerId: META, cost: 0.01, quota: { status: "exhausted", remaining: 0 } });
  const result = await resolvePaidImageProvider(paidDeps([aws, meta]));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.providerId, AWS);
});

test("r1: aws circuit open routes to meta", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.01 });
  const meta = syntheticAdapter({ providerId: META, cost: 0.02 });
  const result = await resolvePaidImageProvider(
    paidDeps([aws, meta], { isCircuitOpen: (id: string) => id === AWS })
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.providerId, META);
});

test("r1: meta circuit open routes to aws", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.05 });
  const meta = syntheticAdapter({ providerId: META, cost: 0.01 });
  const result = await resolvePaidImageProvider(
    paidDeps([aws, meta], { isCircuitOpen: (id: string) => id === META })
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.providerId, AWS);
});

test("r1: aws above max cost per image is rejected", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 2 });
  const result = await resolvePaidImageProvider(
    paidDeps([aws], { policy: enabledPolicy({ maxCostPerImage: 0.5 }) })
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "MAX_COST_EXCEEDED");
});

test("r1: meta above max cost per image is rejected", async () => {
  const meta = syntheticAdapter({ providerId: META, cost: 3 });
  const result = await resolvePaidImageProvider(
    paidDeps([meta], { policy: enabledPolicy({ maxCostPerImage: 1 }) })
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "MAX_COST_EXCEEDED");
});

test("r1: daily budget exhaustion blocks all paid providers", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.2 });
  const ledger = createInMemoryPaidImageLedger();
  await ledger.record({
    requestId: "seed",
    providerId: AWS,
    capability: "image-generation",
    timestamp: NOW.toISOString(),
    estimatedCostUsd: 1,
    actualCostUsd: 1,
    decisionReason: "seed",
    outcome: "executed",
  });
  const result = await resolvePaidImageProvider(
    paidDeps([aws], { ledger, policy: enabledPolicy({ dailyImageBudget: 1, monthlyImageBudget: 100 }) })
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "DAILY_BUDGET_EXCEEDED");
});

test("r1: monthly budget exhaustion blocks all paid providers", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.2 });
  const ledger = createInMemoryPaidImageLedger();
  await ledger.record({
    requestId: "seed",
    providerId: AWS,
    capability: "image-generation",
    timestamp: NOW.toISOString(),
    estimatedCostUsd: 5,
    actualCostUsd: 5,
    decisionReason: "seed",
    outcome: "executed",
  });
  const result = await resolvePaidImageProvider(
    paidDeps([aws], { ledger, policy: enabledPolicy({ dailyImageBudget: 100, monthlyImageBudget: 5 }) })
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "MONTHLY_BUDGET_EXCEEDED");
});

test("r1: missing/stale price evidence rejects the provider (fail closed)", async () => {
  const aws = syntheticAdapter({ providerId: AWS, quoteNull: true });
  const meta = syntheticAdapter({ providerId: META, cost: 0.01 });
  const result = await resolvePaidImageProvider(paidDeps([aws, meta]));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.providerId, META);

  const only = await resolvePaidImageProvider(paidDeps([aws]));
  assert.equal(only.ok, false);
  if (!only.ok) assert.equal(only.code, "COST_QUOTE_UNAVAILABLE");
});

test("r1: all paid candidates invalid yields controlled unavailable", async () => {
  const aws = syntheticAdapter({ providerId: AWS, quoteNull: true });
  const meta = syntheticAdapter({ providerId: META, health: "unhealthy" });
  const result = await resolvePaidImageProvider(paidDeps([aws, meta]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "NO_ACCEPTABLE_PAID_PROVIDER");
});

const NON_IMAGE: readonly PaidImageRequestCapability[] = [
  "chat",
  "text",
  "coding",
  "search",
  "vision-understanding",
  "embeddings",
  "tools",
];

test("r1: non-image capabilities are hard-denied by the image capability wall", async () => {
  for (const capability of NON_IMAGE) {
    const aws = syntheticAdapter({ providerId: AWS, cost: 0.01 });
    const result = await resolvePaidImageProvider(
      paidDeps([aws], { capability, policy: enabledPolicy() })
    );
    assert.equal(result.ok, false, `expected ${capability} to be denied`);
    if (!result.ok) assert.equal(result.code, "CAPABILITY_NOT_IMAGE_GENERATION");
    assert.equal(aws.calls.quoteCost, 0, `${capability} must not quote`);
  }
});

test("r1: text/search/vision requests never silently fall back to a paid image provider", async () => {
  for (const capability of ["text", "search", "vision-understanding"] as const) {
    const aws = syntheticAdapter({ providerId: AWS, cost: 0.01 });
    const result = await resolveImageRouteSelection({
      capability,
      requestId: `req-${capability}`,
      free: FREE_UNAVAILABLE,
      paid: { policy: enabledPolicy(), adapters: [aws], ledger: createInMemoryPaidImageLedger(), now: NOW },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.paidFallback.code, "CAPABILITY_NOT_IMAGE_GENERATION");
    assert.equal(aws.calls.generateImage, 0);
  }
});

test("r1: a non-image-capability adapter is rejected even when named aws/meta", async () => {
  const aws = syntheticAdapter({ providerId: AWS, cost: 0.01, capabilities: ["chat"] as readonly PaidImageCapability[] });
  const result = await resolvePaidImageProvider(paidDeps([aws]));
  assert.equal(result.ok, false);
});
