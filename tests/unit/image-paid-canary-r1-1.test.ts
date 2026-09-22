/**
 * Canary R1.1 — real paid-image provider factories under synthetic execution.
 *
 * NO network, NO paid inference, NO spend: the AWS and Meta adapters are built
 * through their REAL factories (createAwsImageAdapter / createMetaImageAdapter)
 * with an injected synthetic fetcher, so the production code paths for request
 * mapping, capability gating, dynamic selection, failover and ledger accounting
 * run end to end without a single provider call.
 *
 * This complements the R1 suites (which use hand-rolled stand-in adapters) by
 * proving the same routing/failover expectations against the real adapters, and
 * by recording the credential-blocked posture of the unprovisioned providers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AWS_IMAGE_PROVIDER_ID,
  AWS_NOVA_CANVAS_MODEL_ID,
  createAwsImageAdapter,
} from "../../open-sse/config/paidImageAwsAdapter.ts";
import {
  META_IMAGE_PROVIDER_ID,
  META_MUSE_IMAGE_MODEL_ID,
  createMetaImageAdapter,
} from "../../open-sse/config/paidImageMetaAdapter.ts";
import {
  PAID_NON_IMAGE_CAPABILITIES,
  type PaidImageProviderAdapter,
} from "../../open-sse/config/paidImageProviderAdapter.ts";
import {
  createInMemoryPaidImageLedger,
  type InMemoryPaidImageLedger,
} from "../../open-sse/config/paidImageLedger.ts";
import {
  executePaidImageProvider,
  resolveImageRouteSelection,
  resolvePaidImageProvider,
} from "../../open-sse/config/paidImageRouting.ts";
import type {
  FreeImageSelection,
  FreeImageUnavailable,
} from "../../open-sse/config/freeImageRouting.ts";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const PROMPT = "Simple blue circle centered on a plain white background.";
const UNIT_PRICE_AWS = 0.04;
const UNIT_PRICE_META = 0.06;

/* Synthetic, non-secret key: exercises the configured path with zero real auth. */
const SYNTHETIC_KEY = "canary-synthetic-key-not-a-secret";

/* Adapter configs take a clock function; router deps take a Date. */
const adapterClock = () => NOW;

const POLICY = {
  imagePaidFallbackEnabled: true,
  maxCostPerImage: 0.08,
  dailyImageBudget: 1,
  monthlyImageBudget: 5,
};

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

interface FetchCall {
  url: string;
  init: RequestInit;
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (payload === undefined ? "" : JSON.stringify(payload)),
  } as unknown as Response;
}

function syntheticFetcher(
  impl: (url: string, init: RequestInit) => Response | Promise<Response>
): { fetcher: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return impl(url, init ?? {});
  };
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

function awsImagesPayload(count = 1): { images: string[] } {
  return { images: Array.from({ length: count }, () => "AAAAsyntheticbase64payload") };
}

function metaImagesPayload(count = 1): { data: { b64_json: string }[] } {
  return { data: Array.from({ length: count }, () => ({ b64_json: "AAAAsyntheticbase64payload" })) };
}

function evidence(providerId: string, modelId: string, unitPrice: number) {
  return [
    {
      providerId,
      modelId,
      currency: "USD",
      unit: "image",
      unitPrice,
      verifiedAt: "2026-09-22T00:00:00.000Z",
      source: "canary-fixture-not-a-price-claim",
    },
  ];
}

function realAwsAdapter(calls: FetchCall[], unitPrice = UNIT_PRICE_AWS): PaidImageProviderAdapter {
  const { fetcher } = syntheticFetcher((url, init) => {
    calls.push({ url, init });
    return jsonResponse(200, awsImagesPayload());
  });
  return createAwsImageAdapter({
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    region: "us-east-1",
    apiKey: SYNTHETIC_KEY,
    priceEvidence: evidence(AWS_IMAGE_PROVIDER_ID, AWS_NOVA_CANVAS_MODEL_ID, unitPrice),
    timeoutMs: 5_000,
    fetcher,
    now: adapterClock,
  });
}

function realMetaAdapter(calls: FetchCall[], unitPrice = UNIT_PRICE_META): PaidImageProviderAdapter {
  const { fetcher } = syntheticFetcher((url, init) => {
    calls.push({ url, init });
    return jsonResponse(200, metaImagesPayload());
  });
  return createMetaImageAdapter({
    modelId: META_MUSE_IMAGE_MODEL_ID,
    apiKey: SYNTHETIC_KEY,
    priceEvidence: evidence(META_IMAGE_PROVIDER_ID, META_MUSE_IMAGE_MODEL_ID, unitPrice),
    timeoutMs: 5_000,
    fetcher,
    now: adapterClock,
  });
}

/* ------------------------------------------------------------------ *
 * Credential-blocked posture (real factories, no key, no fetch)
 * ------------------------------------------------------------------ */

test("canary: real aws factory without credentials fails closed and never fetches", async () => {
  const { fetcher, calls } = syntheticFetcher(() => jsonResponse(200, awsImagesPayload()));
  const adapter = createAwsImageAdapter({
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    region: "us-east-1",
    fetcher,
    now: adapterClock,
  });
  assert.equal(adapter.isConfigured(), false);
  assert.equal(adapter.isAvailable(), false);
  const result = await adapter.generateImage({
    capability: "image-generation",
    requestId: "canary-aws-nokey",
    prompt: PROMPT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "AWS_IMAGE_CREDENTIALS_MISSING");
  assert.equal(calls.length, 0, "no network attempt may occur without credentials");
});

test("canary: real meta factory without credentials fails closed and never fetches", async () => {
  const { fetcher, calls } = syntheticFetcher(() => jsonResponse(200, metaImagesPayload()));
  const adapter = createMetaImageAdapter({
    modelId: META_MUSE_IMAGE_MODEL_ID,
    fetcher,
    now: adapterClock,
  });
  assert.equal(adapter.isConfigured(), false);
  const result = await adapter.generateImage({
    capability: "image-generation",
    requestId: "canary-meta-nokey",
    prompt: PROMPT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "META_IMAGE_CREDENTIALS_MISSING");
  assert.equal(calls.length, 0, "no network attempt may occur without credentials");
});

/* ------------------------------------------------------------------ *
 * Dynamic selection + failover across the real adapters
 * ------------------------------------------------------------------ */

test("canary: both healthy -> cheapest acceptable real quote selected", async () => {
  const aws = realAwsAdapter([]);
  const meta = realMetaAdapter([]);
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    requestId: "canary-both-healthy",
    prompt: PROMPT,
    policy: POLICY,
    adapters: [meta, aws],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assert.equal(selection.ok, true);
  if (selection.ok) {
    assert.equal(selection.providerId, AWS_IMAGE_PROVIDER_ID);
    assert.equal(selection.estimatedCostUsd, UNIT_PRICE_AWS);
  }
});

test("canary: cheapest unhealthy -> other real provider selected", async () => {
  const aws: PaidImageProviderAdapter = { ...realAwsAdapter([]), healthStatus: () => "unhealthy" };
  const meta = realMetaAdapter([]);
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    requestId: "canary-cheapest-unhealthy",
    prompt: PROMPT,
    policy: POLICY,
    adapters: [aws, meta],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assert.equal(selection.ok, true);
  if (selection.ok) assert.equal(selection.providerId, META_IMAGE_PROVIDER_ID);
});

test("canary: cheapest quota exhausted -> other real provider selected", async () => {
  const aws: PaidImageProviderAdapter = {
    ...realAwsAdapter([]),
    quotaState: () => ({ status: "exhausted" }),
  };
  const meta = realMetaAdapter([]);
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    requestId: "canary-cheapest-quota",
    prompt: PROMPT,
    policy: POLICY,
    adapters: [aws, meta],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assert.equal(selection.ok, true);
  if (selection.ok) assert.equal(selection.providerId, META_IMAGE_PROVIDER_ID);
});

test("canary: cheapest circuit open -> other real provider selected", async () => {
  const aws = realAwsAdapter([]);
  const meta = realMetaAdapter([]);
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    requestId: "canary-cheapest-circuit",
    prompt: PROMPT,
    policy: POLICY,
    adapters: [aws, meta],
    ledger: createInMemoryPaidImageLedger(),
    isCircuitOpen: (providerId) => providerId === AWS_IMAGE_PROVIDER_ID,
    now: NOW,
  });
  assert.equal(selection.ok, true);
  if (selection.ok) assert.equal(selection.providerId, META_IMAGE_PROVIDER_ID);
});

test("canary: budget insufficient -> no real provider selected", async () => {
  const aws = realAwsAdapter([]);
  const meta = realMetaAdapter([]);
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    requestId: "canary-budget-insufficient",
    prompt: PROMPT,
    policy: { ...POLICY, maxCostPerImage: 0.01 },
    adapters: [aws, meta],
    ledger: createInMemoryPaidImageLedger(),
    now: NOW,
  });
  assert.equal(selection.ok, false);
});

/* ------------------------------------------------------------------ *
 * Free-first + non-image capability wall
 * ------------------------------------------------------------------ */

test("canary: FREE available never consults the real paid adapters", async () => {
  const awsCalls: FetchCall[] = [];
  const metaCalls: FetchCall[] = [];
  let quotes = 0;
  const aws = realAwsAdapter(awsCalls);
  const meta = realMetaAdapter(metaCalls);
  const counted: PaidImageProviderAdapter[] = [aws, meta].map((adapter) => ({
    ...adapter,
    quoteCost: (request) => {
      quotes += 1;
      return adapter.quoteCost(request);
    },
  }));

  const route = await resolveImageRouteSelection({
    capability: "image-generation",
    requestId: "canary-free-first",
    prompt: PROMPT,
    free: FREE_AVAILABLE,
    paid: { policy: POLICY, adapters: counted, ledger: createInMemoryPaidImageLedger(), now: () => NOW },
  });
  assert.equal(route.ok, true);
  if (route.ok) assert.equal(route.via, "free");
  assert.equal(quotes, 0, "paid adapters must not be consulted when free is available");
  assert.equal(awsCalls.length + metaCalls.length, 0);
});

test("canary: FREE unavailable + paid disabled is a controlled unavailable", async () => {
  const route = await resolveImageRouteSelection({
    capability: "image-generation",
    requestId: "canary-free-unavailable-paid-disabled",
    prompt: PROMPT,
    free: FREE_UNAVAILABLE,
    paid: {
      policy: { imagePaidFallbackEnabled: false },
      adapters: [realAwsAdapter([]), realMetaAdapter([])],
      ledger: createInMemoryPaidImageLedger(),
      now: NOW,
    },
  });
  assert.equal(route.ok, false);
  if (!route.ok) {
    assert.equal(route.code, "NO_FREE_IMAGE_PROVIDER_AVAILABLE");
    assert.equal(route.paidFallback.code, "POLICY_DISABLED");
  }
});

test("canary: non-image capabilities never execute paid image adapters", async () => {
  const awsCalls: FetchCall[] = [];
  const metaCalls: FetchCall[] = [];
  const aws = realAwsAdapter(awsCalls);
  const meta = realMetaAdapter(metaCalls);

  for (const capability of PAID_NON_IMAGE_CAPABILITIES) {
    const selection = await resolvePaidImageProvider({
      capability,
      requestId: `canary-non-image-${capability}`,
      prompt: PROMPT,
      policy: POLICY,
      adapters: [aws, meta],
      ledger: createInMemoryPaidImageLedger(),
      now: NOW,
    });
    assert.equal(selection.ok, false, `${capability} must not select a paid image provider`);
    if (!selection.ok) assert.equal(selection.code, "CAPABILITY_NOT_IMAGE_GENERATION");

    const execution = await executePaidImageProvider({
      capability,
      requestId: `canary-non-image-exec-${capability}`,
      prompt: PROMPT,
      policy: POLICY,
      selection: { ok: true, providerId: AWS_IMAGE_PROVIDER_ID, adapter: aws, estimatedCostUsd: UNIT_PRICE_AWS },
      ledger: createInMemoryPaidImageLedger(),
      now: NOW,
    });
    assert.equal(execution.ok, false);
    if (!execution.ok) assert.equal(execution.code, "CAPABILITY_NOT_IMAGE_GENERATION");
  }
  assert.equal(awsCalls.length + metaCalls.length, 0, "no paid image request may be issued");
});

/* ------------------------------------------------------------------ *
 * Ledger accounting under synthetic execution
 * ------------------------------------------------------------------ */

test("canary: one executed call is accounted exactly once in the ledger", async () => {
  const ledger: InMemoryPaidImageLedger = createInMemoryPaidImageLedger();
  const aws = realAwsAdapter([]);
  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    requestId: "canary-ledger-once",
    prompt: PROMPT,
    policy: POLICY,
    adapters: [aws],
    ledger,
    now: NOW,
  });
  assert.equal(selection.ok, true);

  const execution = await executePaidImageProvider({
    capability: "image-generation",
    requestId: "canary-ledger-once",
    prompt: PROMPT,
    policy: POLICY,
    selection,
    ledger,
    now: NOW,
  });
  assert.equal(execution.ok, true);
  assert.equal(ledger.entries.length, 1, "exactly one ledger entry per executed call");
  assert.equal(ledger.entries[0]?.outcome, "executed");
  assert.equal(ledger.getDailySpendUsd(NOW), UNIT_PRICE_AWS, "no duplicate or leaked accounting");
});
