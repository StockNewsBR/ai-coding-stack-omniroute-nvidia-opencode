/**
 * Meta paid image adapter contract tests (R1) — OFFLINE ONLY.
 *
 * Uses an injected fake fetcher; NO network and NO paid inference. Verifies
 * request mapping, response mapping, provider-error mapping, timeout handling,
 * auth-missing / model-missing behavior, price-evidence behavior, health and
 * quota mapping for the Meta Model API "Muse Image" adapter.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_META_IMAGE_TIMEOUT_MS,
  META_IMAGE_DEFAULT_BASE_URL,
  META_IMAGE_PROVIDER_ID,
  META_MUSE_IMAGE_MODEL_ID,
  buildMetaImageRequestBody,
  createMetaImageAdapter,
  normalizeMetaImageError,
  parseMetaImageResponse,
} from "../../open-sse/config/paidImageMetaAdapter.ts";

const MOCK_KEY = "test-key-not-a-secret";

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (payload === undefined ? "" : JSON.stringify(payload)),
  } as unknown as Response;
}

function recordingFetcher(impl: (url: string, init?: RequestInit) => Promise<Response>): {
  fetcher: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return impl(url, init);
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function priceEvidence(unitPrice: number, overrides: Record<string, unknown> = {}) {
  return [
    {
      providerId: META_IMAGE_PROVIDER_ID,
      modelId: META_MUSE_IMAGE_MODEL_ID,
      currency: "USD",
      unit: "image",
      unitPrice,
      verifiedAt: "2026-09-01T00:00:00.000Z",
      source: "configured-fixture",
      ...overrides,
    },
  ];
}

const REQUEST = {
  capability: "image-generation" as const,
  requestId: "req-meta-1",
  prompt: "a lighthouse at dusk",
};

test("meta: not configured without a configured modelId", () => {
  const adapter = createMetaImageAdapter({ apiKey: MOCK_KEY });
  assert.equal(adapter.isConfigured(), false);
});

test("meta: not configured without an apiKey", () => {
  const adapter = createMetaImageAdapter({ modelId: META_MUSE_IMAGE_MODEL_ID });
  assert.equal(adapter.isConfigured(), false);
});

test("meta: configured adapter is available and healthy", () => {
  const adapter = createMetaImageAdapter({ apiKey: MOCK_KEY, modelId: META_MUSE_IMAGE_MODEL_ID });
  assert.equal(adapter.providerId, META_IMAGE_PROVIDER_ID);
  assert.equal(adapter.isConfigured(), true);
  assert.equal(adapter.isAvailable(), true);
  assert.equal(adapter.healthStatus(), "healthy");
});

test("meta: capabilities are image-generation only", () => {
  const adapter = createMetaImageAdapter({ apiKey: MOCK_KEY, modelId: META_MUSE_IMAGE_MODEL_ID });
  assert.deepEqual([...adapter.capabilities()], ["image-generation"]);
});

test("meta: quota mapping defaults and override", () => {
  const configured = createMetaImageAdapter({ apiKey: MOCK_KEY, modelId: META_MUSE_IMAGE_MODEL_ID });
  assert.deepEqual(configured.quotaState(), { status: "available" });
  const unconfigured = createMetaImageAdapter({});
  assert.deepEqual(unconfigured.quotaState(), { status: "unknown" });
  const overridden = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    quota: { status: "exhausted", remaining: 0 },
  });
  assert.deepEqual(overridden.quotaState(), { status: "exhausted", remaining: 0 });
});

test("meta: missing price evidence yields a null quote (fail closed)", () => {
  const adapter = createMetaImageAdapter({ apiKey: MOCK_KEY, modelId: META_MUSE_IMAGE_MODEL_ID });
  assert.equal(adapter.quoteCost(REQUEST), null);
});

test("meta: quote uses configurable price evidence and scales by n", () => {
  const adapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    priceEvidence: priceEvidence(0.01),
  });
  const one = adapter.quoteCost({ ...REQUEST, n: 1 });
  assert.ok(one);
  assert.equal((one as { estimatedCostUsd: number }).estimatedCostUsd, 0.01);

  const three = adapter.quoteCost({ ...REQUEST, n: 3 });
  assert.ok(three);
  assert.equal((three as { estimatedCostUsd: number }).estimatedCostUsd, 0.03);
});

test("meta: stale price evidence yields a null quote", () => {
  const adapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    priceEvidence: priceEvidence(0.01, { verifiedAt: "2026-01-01T00:00:00.000Z", maxAgeMs: 1000 }),
    now: () => new Date("2026-09-22T00:00:00.000Z"),
  });
  assert.equal(adapter.quoteCost(REQUEST), null);
});

test("meta: buildMetaImageRequestBody maps prompt and clamps n", () => {
  assert.deepEqual(buildMetaImageRequestBody("muse-image-1.0", REQUEST), {
    model: "muse-image-1.0",
    prompt: "a lighthouse at dusk",
    n: 1,
  });
  assert.equal((buildMetaImageRequestBody("m", { ...REQUEST, n: 3 }) as { n: number }).n, 3);
  assert.equal((buildMetaImageRequestBody("m", { ...REQUEST, n: 99 }) as { n: number }).n, 10);
  assert.equal((buildMetaImageRequestBody("m", { ...REQUEST, n: 0 }) as { n: number }).n, 1);
  assert.equal((buildMetaImageRequestBody("m", REQUEST, "1024x1024") as { size?: string }).size, "1024x1024");
});

test("meta: generateImage without apiKey reports credentials missing", async () => {
  const { fetcher, calls } = recordingFetcher(async () => jsonResponse(200, {}));
  const adapter = createMetaImageAdapter({ modelId: META_MUSE_IMAGE_MODEL_ID, fetcher });
  const result = await adapter.generateImage(REQUEST);
  assert.equal(result.ok, false);
  assert.equal(result.error, "META_IMAGE_CREDENTIALS_MISSING");
  assert.equal(calls.length, 0);
});

test("meta: generateImage without a model reports model missing", async () => {
  const { fetcher, calls } = recordingFetcher(async () => jsonResponse(200, {}));
  const adapter = createMetaImageAdapter({ apiKey: MOCK_KEY, fetcher });
  const result = await adapter.generateImage(REQUEST);
  assert.equal(result.ok, false);
  assert.equal(result.error, "META_IMAGE_MODEL_MISSING");
  assert.equal(calls.length, 0);
});

test("meta: request mapping targets the official endpoint with bearer auth", async () => {
  const { fetcher, calls } = recordingFetcher(async () =>
    jsonResponse(200, { data: [{ b64_json: "QUJD" }] })
  );
  const adapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    fetcher,
  });
  await adapter.generateImage({ ...REQUEST, n: 2 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${META_IMAGE_DEFAULT_BASE_URL}/images/generations`);
  assert.equal(calls[0].init?.method, "POST");
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${MOCK_KEY}`);
  const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
  assert.equal(body.model, META_MUSE_IMAGE_MODEL_ID);
  assert.equal(body.prompt, "a lighthouse at dusk");
  assert.equal(body.n, 2);
});

test("meta: custom baseUrl is respected and trailing slashes trimmed", async () => {
  const { fetcher, calls } = recordingFetcher(async () =>
    jsonResponse(200, { data: [{ b64_json: "QUJD" }] })
  );
  const adapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    baseUrl: "https://proxy.internal/meta/v1/",
    fetcher,
  });
  await adapter.generateImage(REQUEST);
  assert.equal(calls[0].url, "https://proxy.internal/meta/v1/images/generations");
});

test("meta: response mapping decodes b64 images and never fabricates actualCostUsd", async () => {
  const { fetcher } = recordingFetcher(async () =>
    jsonResponse(200, { created: 1, data: [{ b64_json: "QUJD" }] })
  );
  const adapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    fetcher,
  });
  const result = await adapter.generateImage(REQUEST);
  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ["data:image/webp;base64,QUJD"]);
  assert.equal(result.actualCostUsd, undefined);
  assert.equal(result.modelId, META_MUSE_IMAGE_MODEL_ID);
});

test("meta: response mapping honors output_format and url fallback", async () => {
  const png = recordingFetcher(async () =>
    jsonResponse(200, { output_format: "png", data: [{ b64_json: "QUJD" }] })
  );
  const pngAdapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    fetcher: png.fetcher,
  });
  const pngResult = await pngAdapter.generateImage(REQUEST);
  assert.deepEqual(pngResult.imageUrls, ["data:image/png;base64,QUJD"]);

  const url = recordingFetcher(async () =>
    jsonResponse(200, { data: [{ url: "https://cdn.example/img.png" }] })
  );
  const urlAdapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    fetcher: url.fetcher,
  });
  const urlResult = await urlAdapter.generateImage(REQUEST);
  assert.deepEqual(urlResult.imageUrls, ["https://cdn.example/img.png"]);
});

test("meta: malformed and empty payloads are rejected", async () => {
  const missing = recordingFetcher(async () => jsonResponse(200, { created: 1 }));
  const adapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    fetcher: missing.fetcher,
  });
  const result = await adapter.generateImage(REQUEST);
  assert.equal(result.ok, false);
  assert.equal(result.error, "META_IMAGE_RESPONSE_NO_IMAGES");

  assert.deepEqual(parseMetaImageResponse(null), { ok: false, error: "META_IMAGE_RESPONSE_MALFORMED" });
  assert.deepEqual(parseMetaImageResponse({ data: [] }), {
    ok: false,
    error: "META_IMAGE_RESPONSE_NO_IMAGES",
  });
});

test("meta: provider errors are normalized without leaking secrets", async () => {
  const cases: Array<[number, string]> = [
    [401, "META_IMAGE_AUTH_ERROR"],
    [403, "META_IMAGE_AUTH_ERROR"],
    [429, "META_IMAGE_RATE_LIMITED"],
    [400, "META_IMAGE_VALIDATION_ERROR"],
    [404, "META_IMAGE_MODEL_NOT_FOUND"],
    [500, "META_IMAGE_PROVIDER_ERROR"],
  ];
  for (const [status, code] of cases) {
    const { fetcher } = recordingFetcher(async () => jsonResponse(status, { error: { message: "nope" } }));
    const adapter = createMetaImageAdapter({
      apiKey: MOCK_KEY,
      modelId: META_MUSE_IMAGE_MODEL_ID,
      fetcher,
    });
    const result = await adapter.generateImage(REQUEST);
    assert.equal(result.ok, false);
    assert.equal(result.error, code);
    assert.ok(!String(result.error).includes(MOCK_KEY));
  }
  assert.equal(normalizeMetaImageError(503, undefined).code, "META_IMAGE_PROVIDER_ERROR");
  assert.equal(normalizeMetaImageError(418, undefined).code, "META_IMAGE_HTTP_ERROR");
  assert.equal(normalizeMetaImageError(400, { error: { message: "bad" } }).message, "bad");
});

test("meta: timeouts and network failures are normalized", async () => {
  const timeout = recordingFetcher(async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  });
  const timeoutAdapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    fetcher: timeout.fetcher,
  });
  const timeoutResult = await timeoutAdapter.generateImage(REQUEST);
  assert.equal(timeoutResult.ok, false);
  assert.equal(timeoutResult.error, "META_IMAGE_TIMEOUT");

  const network = recordingFetcher(async () => {
    throw new Error("socket hang up");
  });
  const networkAdapter = createMetaImageAdapter({
    apiKey: MOCK_KEY,
    modelId: META_MUSE_IMAGE_MODEL_ID,
    fetcher: network.fetcher,
  });
  const networkResult = await networkAdapter.generateImage(REQUEST);
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error, "META_IMAGE_NETWORK_ERROR");
});

test("meta: default timeout constant is bounded", () => {
  assert.ok(DEFAULT_META_IMAGE_TIMEOUT_MS > 0 && DEFAULT_META_IMAGE_TIMEOUT_MS <= 120_000);
});
