/**
 * R1 AWS paid image adapter — offline provider contract tests.
 *
 * NO network / NO paid inference: every request runs through an injected mock
 * fetcher. Verifies request mapping, response mapping, provider error mapping,
 * timeout handling, auth-missing, model-missing, price-missing and health/quota.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AWS_IMAGE_PROVIDER_ID,
  AWS_NOVA_CANVAS_MODEL_ID,
  buildAwsImageRequestBody,
  createAwsImageAdapter,
  normalizeAwsImageError,
  parseAwsImageResponse,
} from "../../open-sse/config/paidImageAwsAdapter.ts";

const MOCK_KEY = "test-key-not-a-secret";

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

function recordingFetcher(
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

function priceEvidence(unitPrice: number, overrides: Record<string, unknown> = {}) {
  return [
    {
      providerId: AWS_IMAGE_PROVIDER_ID,
      modelId: AWS_NOVA_CANVAS_MODEL_ID,
      currency: "USD",
      unit: "image",
      unitPrice,
      verifiedAt: "2026-09-01T00:00:00.000Z",
      source: "configured-fixture",
      ...overrides,
    },
  ];
}

test("aws: not configured without modelId", () => {
  const adapter = createAwsImageAdapter({ apiKey: MOCK_KEY });
  assert.equal(adapter.isConfigured(), false);
  assert.equal(adapter.isAvailable(), false);
  assert.equal(adapter.healthStatus(), "unknown");
});

test("aws: not configured without apiKey", () => {
  const adapter = createAwsImageAdapter({ modelId: AWS_NOVA_CANVAS_MODEL_ID });
  assert.equal(adapter.isConfigured(), false);
  assert.equal(adapter.healthStatus(), "unknown");
});

test("aws: configured with apiKey + modelId", () => {
  const adapter = createAwsImageAdapter({ apiKey: MOCK_KEY, modelId: AWS_NOVA_CANVAS_MODEL_ID });
  assert.equal(adapter.isConfigured(), true);
  assert.equal(adapter.isAvailable(), true);
  assert.equal(adapter.healthStatus(), "healthy");
  assert.equal(adapter.providerId, AWS_IMAGE_PROVIDER_ID);
});

test("aws: capability is image-generation only", () => {
  const adapter = createAwsImageAdapter({ apiKey: MOCK_KEY, modelId: AWS_NOVA_CANVAS_MODEL_ID });
  assert.deepEqual([...adapter.capabilities()], ["image-generation"]);
});

test("aws: quota defaults to available when configured, unknown otherwise, respects override", () => {
  const configured = createAwsImageAdapter({ apiKey: MOCK_KEY, modelId: AWS_NOVA_CANVAS_MODEL_ID });
  assert.equal(configured.quotaState().status, "available");
  const unconfigured = createAwsImageAdapter({ apiKey: MOCK_KEY });
  assert.equal(unconfigured.quotaState().status, "unknown");
  const overridden = createAwsImageAdapter({
    apiKey: MOCK_KEY,
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    quota: { status: "exhausted", remaining: 0 },
  });
  assert.equal(overridden.quotaState().status, "exhausted");
});

test("aws: price-missing yields null quote", () => {
  const adapter = createAwsImageAdapter({ apiKey: MOCK_KEY, modelId: AWS_NOVA_CANVAS_MODEL_ID });
  const quote = adapter.quoteCost({ capability: "image-generation", requestId: "r1", prompt: "x" });
  assert.equal(quote, null);
});

test("aws: quote uses configurable price evidence and scales by n", () => {
  const adapter = createAwsImageAdapter({
    apiKey: MOCK_KEY,
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    priceEvidence: priceEvidence(0.04),
  });
  const one = adapter.quoteCost({ capability: "image-generation", requestId: "r1", prompt: "x" });
  assert.ok(one);
  assert.equal(one?.estimatedCostUsd, 0.04);
  const three = adapter.quoteCost({ capability: "image-generation", requestId: "r2", prompt: "x", n: 3 });
  assert.equal(three?.estimatedCostUsd, 0.12);
});

test("aws: stale price evidence (maxAgeMs exceeded) yields null quote", () => {
  const adapter = createAwsImageAdapter({
    apiKey: MOCK_KEY,
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    priceEvidence: priceEvidence(0.04, { verifiedAt: "2026-01-01T00:00:00.000Z", maxAgeMs: 1000 }),
    now: () => new Date("2026-09-22T00:00:00.000Z"),
  });
  assert.equal(adapter.quoteCost({ capability: "image-generation", requestId: "r1", prompt: "x" }), null);
});

test("aws: buildAwsImageRequestBody maps prompt and clamps numberOfImages", () => {
  assert.deepEqual(buildAwsImageRequestBody({ capability: "image-generation", requestId: "r", prompt: "hello" }), {
    taskType: "TEXT_IMAGE",
    textToImageParams: { text: "hello" },
    imageGenerationConfig: { numberOfImages: 1 },
  });
  const many = buildAwsImageRequestBody({ capability: "image-generation", requestId: "r", prompt: "p", n: 9 });
  assert.equal((many.imageGenerationConfig as Record<string, unknown>).numberOfImages, 5);
});

test("aws: generateImage without apiKey fails closed", async () => {
  const adapter = createAwsImageAdapter({ modelId: AWS_NOVA_CANVAS_MODEL_ID });
  const result = await adapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "p" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "AWS_IMAGE_CREDENTIALS_MISSING");
});

test("aws: generateImage without modelId fails closed", async () => {
  const adapter = createAwsImageAdapter({ apiKey: MOCK_KEY });
  const result = await adapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "p" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "AWS_IMAGE_MODEL_MISSING");
});

test("aws: request mapping uses runtime URL, bearer auth and TEXT_IMAGE body", async () => {
  const { fetcher, calls } = recordingFetcher(() => jsonResponse(200, { images: ["QUJD"] }));
  const adapter = createAwsImageAdapter({
    apiKey: MOCK_KEY,
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    region: "us-east-1",
    fetcher,
  });
  await adapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "a cat" });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(AWS_NOVA_CANVAS_MODEL_ID)}/invoke`
  );
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${MOCK_KEY}`);
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.taskType, "TEXT_IMAGE");
  assert.equal(body.textToImageParams.text, "a cat");
});

test("aws: region is configurable", async () => {
  const { fetcher, calls } = recordingFetcher(() => jsonResponse(200, { images: ["QUJD"] }));
  const adapter = createAwsImageAdapter({
    apiKey: MOCK_KEY,
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    region: "eu-west-1",
    fetcher,
  });
  await adapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "p" });
  assert.match(calls[0].url, /^https:\/\/bedrock-runtime\.eu-west-1\.amazonaws\.com\//);
});

test("aws: response mapping extracts base64 into a data url and no actualCostUsd", async () => {
  const { fetcher } = recordingFetcher(() => jsonResponse(200, { images: ["QUJD"] }));
  const adapter = createAwsImageAdapter({
    apiKey: MOCK_KEY,
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    fetcher,
  });
  const result = await adapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "p" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ["data:image/png;base64,QUJD"]);
  assert.equal(result.actualCostUsd, undefined);
  assert.equal(typeof result.latencyMs, "number");
});

test("aws: malformed success payload fails closed", async () => {
  const { fetcher } = recordingFetcher(() => jsonResponse(200, {}));
  const adapter = createAwsImageAdapter({ apiKey: MOCK_KEY, modelId: AWS_NOVA_CANVAS_MODEL_ID, fetcher });
  const result = await adapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "p" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "AWS_IMAGE_RESPONSE_NO_IMAGES");
});

test("aws: provider error mapping for auth, throttle, validation, server", async () => {
  const cases: Array<[number, string]> = [
    [403, "AWS_IMAGE_AUTH_ERROR"],
    [429, "AWS_IMAGE_THROTTLED"],
    [400, "AWS_IMAGE_VALIDATION_ERROR"],
    [500, "AWS_IMAGE_PROVIDER_ERROR"],
    [404, "AWS_IMAGE_MODEL_NOT_FOUND"],
  ];
  for (const [status, code] of cases) {
    const { fetcher } = recordingFetcher(() => jsonResponse(status, { message: "denied" }));
    const adapter = createAwsImageAdapter({ apiKey: MOCK_KEY, modelId: AWS_NOVA_CANVAS_MODEL_ID, fetcher });
    const result = await adapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "p" });
    assert.equal(result.ok, false);
    assert.equal(result.error, code);
  }
});

test("aws: timeout and network failures are normalized", async () => {
  const abortFetcher = (async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }) as unknown as typeof fetch;
  const timeoutAdapter = createAwsImageAdapter({
    apiKey: MOCK_KEY,
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    fetcher: abortFetcher,
  });
  const timeout = await timeoutAdapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "p" });
  assert.equal(timeout.error, "AWS_IMAGE_TIMEOUT");

  const boomFetcher = (async () => {
    throw new Error("socket reset");
  }) as unknown as typeof fetch;
  const netAdapter = createAwsImageAdapter({
    apiKey: MOCK_KEY,
    modelId: AWS_NOVA_CANVAS_MODEL_ID,
    fetcher: boomFetcher,
  });
  const net = await netAdapter.generateImage({ capability: "image-generation", requestId: "r", prompt: "p" });
  assert.equal(net.error, "AWS_IMAGE_NETWORK_ERROR");
});

test("aws: normalizeAwsImageError + parseAwsImageResponse units", () => {
  assert.equal(normalizeAwsImageError(503, null).code, "AWS_IMAGE_PROVIDER_ERROR");
  assert.equal(normalizeAwsImageError(418, null).code, "AWS_IMAGE_HTTP_ERROR");
  assert.deepEqual(parseAwsImageResponse(null), { ok: false, error: "AWS_IMAGE_RESPONSE_MALFORMED" });
  assert.deepEqual(parseAwsImageResponse({ images: [] }), { ok: false, error: "AWS_IMAGE_RESPONSE_NO_IMAGES" });
  assert.deepEqual(parseAwsImageResponse({ images: ["AA", "BB"] }), {
    ok: true,
    imageUrls: ["data:image/png;base64,AA", "data:image/png;base64,BB"],
  });
});
