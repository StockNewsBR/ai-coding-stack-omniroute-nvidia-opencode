/**
 * R2 paid image dynamic ranking — synthetic adapters only.
 *
 * NO network, NO paid inference, NO spend. Proves the R2 ranking contract:
 * FREE_FIRST short-circuit, text/capability isolation, and dynamic selection by
 * health -> rate limit -> recent failures -> latency -> quality -> cost, with
 * rerank-on-failure and no fixed AWS/Meta primary/backup relationship.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  PaidImageProviderAdapter,
  PaidImageProviderHealth,
  PaidImageQuotaState,
  PaidImageRequestCapability,
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

interface FakeOptions {
  providerId: string;
  cost?: number;
  health?: PaidImageProviderHealth;
  quota?: PaidImageQuotaState;
  configured?: boolean;
  available?: boolean;
  qualityScore?: number;
  latencyMs?: number;
  recentFailures?: number;
  rateLimited?: boolean;
  capabilities?: readonly string[];
}

function fake(options: FakeOptions) {
  const calls = { quoteCost: 0, generateImage: 0 };
  const adapter: PaidImageProviderAdapter = {
    providerId: options.providerId,
    capabilities: () => options.capabilities ?? ["image-generation"],
    isConfigured: () => options.configured ?? true,
    isAvailable: () => options.available ?? true,
    healthStatus: () => options.health ?? "healthy",
    quoteCost: () => {
      calls.quoteCost += 1;
      return { estimatedCostUsd: options.cost ?? 0.25, qualityScore: options.qualityScore };
    },
    quotaState: () => options.quota ?? { status: "available" },
    telemetry: () => ({
      latencyMs: options.latencyMs,
      recentFailures: options.recentFailures,
      rateLimited: options.rateLimited,
      qualityScore: options.qualityScore,
    }),
    generateImage: async () => {
      calls.generateImage += 1;
      return {
        ok: true,
        providerId: options.providerId,
        imageUrls: ["data:image/png;base64,AA"],
      };
    },
  };
  return { adapter, calls };
}

const POLICY = {
  imagePaidFallbackEnabled: true,
  maxCostPerImage: 1,
  dailyImageBudget: 10,
  monthlyImageBudget: 100,
};

test("FREE_FIRST: a healthy free route short-circuits with zero paid calls", async () => {
  const aws = fake({ providerId: AWS, cost: 0.01 });
  const meta = fake({ providerId: META, cost: 0.02 });
  const selection = await resolveImageRouteSelection({
    capability: "image-generation",
    free: FREE_AVAILABLE,
    paid: { policy: POLICY,
    ledger: createInMemoryPaidImageLedger(), adapters: [aws.adapter, meta.adapter] },
  });
  assert.equal(selection.ok, true);
  assert.equal(selection.via, "free");
  assert.equal(aws.calls.quoteCost, 0);
  assert.equal(aws.calls.generateImage, 0);
  assert.equal(meta.calls.quoteCost, 0);
  assert.equal(meta.calls.generateImage, 0);
});

test("FREE_FIRST: paid stays denied while the policy is default even if adapters exist", async () => {
  const aws = fake({ providerId: AWS, cost: 0.01 });
  const selection = await resolveImageRouteSelection({
    capability: "image-generation",
    free: FREE_UNAVAILABLE,
    paid: { adapters: [aws.adapter] },
  });
  if (selection.ok) assert.fail("expected an unavailable selection");
  assert.equal(selection.paidFallback.code, "POLICY_DISABLED");
  assert.equal(aws.calls.quoteCost, 0);
});

test("FREE_FIRST: free circuit-open routes to paid only when the policy is enabled", async () => {
  const aws = fake({ providerId: AWS, cost: 0.05 });
  const selection = await resolveImageRouteSelection({
    capability: "image-generation",
    free: FREE_CIRCUIT_OPEN,
    paid: { policy: POLICY,
    ledger: createInMemoryPaidImageLedger(), adapters: [aws.adapter] },
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.via, "paid");
  assert.equal(selection.providerId, AWS);
  assert.ok(selection.paid);
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

for (const capability of NON_IMAGE) {
  test(`TEXT isolation: ${capability} never selects a paid image provider`, async () => {
    const aws = fake({ providerId: AWS, cost: 0.01 });
    const result = await resolvePaidImageProvider({
      capability,
      adapters: [aws.adapter],
      policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
    });
    if (result.ok) assert.fail("non-image capability must not select a paid image provider");
    assert.equal(result.code, "CAPABILITY_NOT_IMAGE_GENERATION");
    assert.equal(aws.calls.quoteCost, 0);
    assert.equal(aws.calls.generateImage, 0);
  });
}

test("ranking: cheaper provider wins regardless of adapter array order", async () => {
  const aws = fake({ providerId: AWS, cost: 0.04 });
  const meta = fake({ providerId: META, cost: 0.1 });
  const forward = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  const reversed = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [meta.adapter, aws.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!forward.ok || !reversed.ok) assert.fail("expected a paid selection");
  assert.equal(forward.providerId, AWS);
  assert.equal(reversed.providerId, AWS);

  const cheapMeta = fake({ providerId: META, cost: 0.01 });
  const metaWins = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter, cheapMeta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!metaWins.ok) assert.fail("expected a paid selection");
  assert.equal(metaWins.providerId, META);
});

test("ranking: lower latency wins when cost ties", async () => {
  const fastAws = fake({ providerId: AWS, cost: 0.05, latencyMs: 120 });
  const slowMeta = fake({ providerId: META, cost: 0.05, latencyMs: 800 });
  const awsWins = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [slowMeta.adapter, fastAws.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!awsWins.ok) assert.fail("expected a paid selection");
  assert.equal(awsWins.providerId, AWS);

  const slowAws = fake({ providerId: AWS, cost: 0.05, latencyMs: 900 });
  const fastMeta = fake({ providerId: META, cost: 0.05, latencyMs: 100 });
  const metaWins = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [slowAws.adapter, fastMeta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!metaWins.ok) assert.fail("expected a paid selection");
  assert.equal(metaWins.providerId, META);
});

test("ranking: higher quality wins when cost and latency tie", async () => {
  const sharpAws = fake({ providerId: AWS, cost: 0.05, latencyMs: 200, qualityScore: 0.99 });
  const softMeta = fake({ providerId: META, cost: 0.05, latencyMs: 200, qualityScore: 0.6 });
  const awsWins = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [softMeta.adapter, sharpAws.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!awsWins.ok) assert.fail("expected a paid selection");
  assert.equal(awsWins.providerId, AWS);

  const softAws = fake({ providerId: AWS, cost: 0.05, latencyMs: 200, qualityScore: 0.55 });
  const sharpMeta = fake({ providerId: META, cost: 0.05, latencyMs: 200, qualityScore: 0.95 });
  const metaWins = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [softAws.adapter, sharpMeta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!metaWins.ok) assert.fail("expected a paid selection");
  assert.equal(metaWins.providerId, META);
});

test("ranking: a degraded provider loses to a healthy one at equal cost", async () => {
  const degradedAws = fake({ providerId: AWS, cost: 0.05, health: "degraded" });
  const healthyMeta = fake({ providerId: META, cost: 0.05 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [degradedAws.adapter, healthyMeta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.providerId, META);
});

test("ranking: a rate-limited provider loses at equal cost", async () => {
  const limitedAws = fake({ providerId: AWS, cost: 0.05, rateLimited: true });
  const meta = fake({ providerId: META, cost: 0.05 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [limitedAws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.providerId, META);
});

test("ranking: a provider with recent failures loses at equal cost", async () => {
  const flakyAws = fake({ providerId: AWS, cost: 0.05, recentFailures: 3 });
  const meta = fake({ providerId: META, cost: 0.05, recentFailures: 0 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [flakyAws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.providerId, META);
});

test("rerank: excluding the current winner selects the remaining eligible provider", async () => {
  const aws = fake({ providerId: AWS, cost: 0.01 });
  const meta = fake({ providerId: META, cost: 0.02 });
  const first = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!first.ok) assert.fail("expected a paid selection");
  assert.equal(first.providerId, AWS);

  const reranked = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
    excludeProviderIds: [first.providerId],
  });
  if (!reranked.ok) assert.fail("expected a reranked paid selection");
  assert.equal(reranked.providerId, META);
});

test("quota: an exhausted provider is skipped for the remaining eligible one", async () => {
  const exhaustedAws = fake({ providerId: AWS, cost: 0.01, quota: { status: "exhausted" } });
  const meta = fake({ providerId: META, cost: 0.02 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [exhaustedAws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.providerId, META);
});

test("quota: both providers exhausted fails closed with a single rejection code", async () => {
  const aws = fake({ providerId: AWS, cost: 0.01, quota: { status: "exhausted" } });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (selection.ok) assert.fail("expected no acceptable paid provider");
  assert.equal(selection.code, "QUOTA_EXHAUSTED");
});

test("circuit: an open circuit removes the provider from the candidate set", async () => {
  const aws = fake({ providerId: AWS, cost: 0.01 });
  const meta = fake({ providerId: META, cost: 0.02 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
    isCircuitOpen: (providerId) => providerId === AWS,
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.providerId, META);
});

test("circuit: all circuits open yields no acceptable paid provider", async () => {
  const aws = fake({ providerId: AWS, cost: 0.01 });
  const meta = fake({ providerId: META, cost: 0.02 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
    isCircuitOpen: () => true,
  });
  if (selection.ok) assert.fail("expected no acceptable paid provider");
  assert.equal(selection.code, "NO_ACCEPTABLE_PAID_PROVIDER");
  assert.equal(aws.calls.generateImage, 0);
  assert.equal(meta.calls.generateImage, 0);
});

test("credentials: an unconfigured provider is rejected for the configured one", async () => {
  const unconfiguredAws = fake({ providerId: AWS, cost: 0.01, configured: false });
  const meta = fake({ providerId: META, cost: 0.02 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [unconfiguredAws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.providerId, META);
});

test("credentials: all providers unconfigured fails closed", async () => {
  const aws = fake({ providerId: AWS, cost: 0.01, configured: false });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (selection.ok) assert.fail("expected no acceptable paid provider");
  assert.equal(selection.code, "PROVIDER_NOT_CONFIGURED");
});

test("availability: a temporarily unavailable provider reranks to the other", async () => {
  const downAws = fake({ providerId: AWS, cost: 0.01, available: false });
  const meta = fake({ providerId: META, cost: 0.02 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [downAws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.providerId, META);
});

test("unavailable: both providers unhealthy yields no acceptable paid provider", async () => {
  const aws = fake({ providerId: AWS, cost: 0.01, health: "unhealthy" });
  const meta = fake({ providerId: META, cost: 0.02, health: "unhealthy" });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (selection.ok) assert.fail("expected no acceptable paid provider");
  assert.equal(selection.code, "NO_ACCEPTABLE_PAID_PROVIDER");
});

test("budget: max cost per image fails closed", async () => {
  const priceyAws = fake({ providerId: AWS, cost: 2 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [priceyAws.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (selection.ok) assert.fail("expected no acceptable paid provider");
  assert.equal(selection.code, "MAX_COST_EXCEEDED");
});

test("budget: daily budget exhaustion fails closed", async () => {
  const ledger = createInMemoryPaidImageLedger();
  await ledger.record({
    requestId: "seed",
    providerId: AWS,
    capability: "image-generation",
    timestamp: new Date().toISOString(),
    estimatedCostUsd: 9.99,
    decisionReason: "SEED",
    outcome: "executed",
  });
  const aws = fake({ providerId: AWS, cost: 0.05 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter],
    policy: POLICY,
    ledger,
  });
  if (selection.ok) assert.fail("expected no acceptable paid provider");
  assert.equal(selection.code, "DAILY_BUDGET_EXCEEDED");
});

test("observability: selection exposes ranked signals and considered rejections", async () => {
  const aws = fake({
    providerId: AWS,
    cost: 0.05,
    health: "degraded",
    latencyMs: 300,
    qualityScore: 0.8,
  });
  const meta = fake({ providerId: META, cost: 0.09, health: "unhealthy", latencyMs: 100 });
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    adapters: [aws.adapter, meta.adapter],
    policy: POLICY,
    ledger: createInMemoryPaidImageLedger(),
  });
  if (!selection.ok) assert.fail("expected a paid selection");
  assert.equal(selection.providerId, AWS);
  assert.equal(selection.rank?.health, "degraded");
  assert.equal(selection.rank?.latencyMs, 300);
  assert.equal(selection.rank?.estimatedCostUsd, 0.05);
  assert.equal(selection.rank?.qualityScore, 0.8);
  assert.equal(
    selection.considered?.some(
      (candidate) => candidate.providerId === META && candidate.code === "PROVIDER_UNHEALTHY"
    ),
    true
  );
});
