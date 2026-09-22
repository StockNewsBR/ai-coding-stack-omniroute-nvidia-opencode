/**
 * R2 offline contract tests — Meta Model API (Muse Image) wire schema.
 *
 * Offline only: no network inference. Every call goes through an injected
 * recording fetcher, and the routing-level circuit test asserts zero fetches.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  META_IMAGE_DEFAULT_BASE_URL,
  META_IMAGE_PROVIDER_ID,
  META_MUSE_IMAGE_MODEL_ID,
  buildMetaImageRequestBody,
  createMetaImageAdapter,
  parseMetaImageResponse,
} from "../../open-sse/config/paidImageMetaAdapter.ts";
import { resolvePaidImageProvider } from "../../open-sse/config/paidImageRouting.ts";

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

function recordingFetcher(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = { url: String(input), init: init ?? {} };
    calls.push(call);
    return impl(call.url, call.init);
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function metaAdapter(overrides: Record<string, unknown> = {}) {
  return createMetaImageAdapter({
    modelId: META_MUSE_IMAGE_MODEL_ID,
    apiKey: MOCK_KEY,
    ...overrides,
  });
}

const REQUEST = {
  capability: "image-generation" as const,
  requestId: "r2-test",
  prompt: "a lighthouse",
};

test("meta r2: adapter is configured and image-generation only", () => {
  const adapter = metaAdapter();
  assert.equal(adapter.providerId, META_IMAGE_PROVIDER_ID);
  assert.equal(adapter.isConfigured(), true);
  assert.equal(adapter.isAvailable(), true);
  assert.equal(adapter.healthStatus(), "healthy");
  assert.deepEqual([...adapter.capabilities()], ["image-generation"]);
});

test("meta r2: request mapping uses the images endpoint, bearer auth and {model,prompt,n}", async () => {
  const { fetcher, calls } = recordingFetcher(() =>
    jsonResponse(200, { data: [{ b64_json: "QUJD" }], output_format: "png" })
  );
  await metaAdapter({ fetcher }).generateImage(REQUEST);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${META_IMAGE_DEFAULT_BASE_URL}/images/generations`);
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${MOCK_KEY}`);
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    model: META_MUSE_IMAGE_MODEL_ID,
    prompt: "a lighthouse",
    n: 1,
  });
});

test("meta r2: base url is configurable and trailing slashes are stripped", async () => {
  const { fetcher, calls } = recordingFetcher(() => jsonResponse(200, { data: [{ b64_json: "QQ" }] }));
  await metaAdapter({ fetcher, baseUrl: "https://example.invalid/v1/" }).generateImage(REQUEST);
  assert.equal(calls[0].url, "https://example.invalid/v1/images/generations");
});

test("meta r2: base64 and url responses are both handled, no actualCostUsd", async () => {
  const b64 = recordingFetcher(() =>
    jsonResponse(200, { data: [{ b64_json: "QUJD" }], output_format: "png" })
  );
  const a = await metaAdapter({ fetcher: b64.fetcher }).generateImage(REQUEST);
  assert.deepEqual(a.imageUrls, ["data:image/png;base64,QUJD"]);
  assert.equal(a.actualCostUsd, undefined);

  const url = recordingFetcher(() =>
    jsonResponse(200, { data: [{ url: "https://example.invalid/x.png" }] })
  );
  const b = await metaAdapter({ fetcher: url.fetcher }).generateImage(REQUEST);
  assert.deepEqual(b.imageUrls, ["https://example.invalid/x.png"]);
});

test("meta r2: malformed and empty payloads fail closed", () => {
  assert.deepEqual(parseMetaImageResponse(null), {
    ok: false,
    error: "META_IMAGE_RESPONSE_MALFORMED",
  });
  assert.deepEqual(parseMetaImageResponse({ data: [] }), {
    ok: false,
    error: "META_IMAGE_RESPONSE_NO_IMAGES",
  });
  assert.deepEqual(parseMetaImageResponse({ data: [{}] }), {
    ok: false,
    error: "META_IMAGE_RESPONSE_NO_IMAGES",
  });
  assert.deepEqual(
    parseMetaImageResponse({ data: [{ b64_json: "AA" }, { b64_json: "BB" }], output_format: "jpeg" }),
    { ok: true, imageUrls: ["data:image/jpeg;base64,AA", "data:image/jpeg;base64,BB"] }
  );
});

test("meta r2: missing credential and missing model fail closed without any fetch", async () => {
  const noKey = recordingFetcher(() => jsonResponse(200, { data: [{ b64_json: "QQ" }] }));
  const a = await createMetaImageAdapter({ modelId: META_MUSE_IMAGE_MODEL_ID, fetcher: noKey.fetcher }).generateImage(
    REQUEST
  );
  assert.equal(a.error, "META_IMAGE_CREDENTIALS_MISSING");
  assert.equal(noKey.calls.length, 0);

  const noModel = recordingFetcher(() => jsonResponse(200, { data: [{ b64_json: "QQ" }] }));
  const b = await createMetaImageAdapter({ apiKey: MOCK_KEY, fetcher: noModel.fetcher }).generateImage(
    { capability: "image-generation", requestId: "r" }
  );
  assert.equal(b.error, "META_IMAGE_MODEL_MISSING");
  assert.equal(noModel.calls.length, 0);
});

test("meta r2: timeout and network failures are normalized", async () => {
  const timeout = recordingFetcher(() => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  });
  assert.equal(
    (await metaAdapter({ fetcher: timeout.fetcher }).generateImage(REQUEST)).error,
    "META_IMAGE_TIMEOUT"
  );

  const network = recordingFetcher(() => {
    throw new Error("socket hang up");
  });
  assert.equal(
    (await metaAdapter({ fetcher: network.fetcher }).generateImage(REQUEST)).error,
    "META_IMAGE_NETWORK_ERROR"
  );
});

test("meta r2: provider HTTP errors are normalized", async () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [401, "META_IMAGE_AUTH_ERROR"],
    [403, "META_IMAGE_AUTH_ERROR"],
    [429, "META_IMAGE_RATE_LIMITED"],
    [404, "META_IMAGE_MODEL_NOT_FOUND"],
    [400, "META_IMAGE_VALIDATION_ERROR"],
    [422, "META_IMAGE_VALIDATION_ERROR"],
    [500, "META_IMAGE_PROVIDER_ERROR"],
    [503, "META_IMAGE_PROVIDER_ERROR"],
  ];
  for (const [status, expected] of cases) {
    const { fetcher } = recordingFetcher(() => jsonResponse(status, { error: { message: "denied" } }));
    const result = await metaAdapter({ fetcher }).generateImage(REQUEST);
    assert.equal(result.ok, false);
    assert.equal(result.error, expected, `status ${status}`);
  }
});

test("meta r2: n is clamped into 1..10", async () => {
  const { fetcher, calls } = recordingFetcher(() => jsonResponse(200, { data: [{ b64_json: "QQ" }] }));
  await metaAdapter({ fetcher }).generateImage({ ...REQUEST, n: 0 });
  assert.equal((JSON.parse(String(calls[0].init.body)) as { n: number }).n, 1);

  const high = recordingFetcher(() => jsonResponse(200, { data: [{ b64_json: "QQ" }] }));
  await metaAdapter({ fetcher: high.fetcher }).generateImage({ ...REQUEST, n: 99 });
  assert.equal((JSON.parse(String(high.calls[0].init.body)) as { n: number }).n, 10);
});

test("meta r2: optional size is only sent when configured", () => {
  assert.deepEqual(buildMetaImageRequestBody(META_MUSE_IMAGE_MODEL_ID, REQUEST), {
    model: META_MUSE_IMAGE_MODEL_ID,
    prompt: "a lighthouse",
    n: 1,
  });
  assert.deepEqual(buildMetaImageRequestBody(META_MUSE_IMAGE_MODEL_ID, REQUEST, "1024x1024"), {
    model: META_MUSE_IMAGE_MODEL_ID,
    prompt: "a lighthouse",
    n: 1,
    size: "1024x1024",
  });
});

test("meta r2: missing price yields no quote, stale price is rejected, fresh price scales", () => {
  assert.equal(metaAdapter().quoteCost(REQUEST), null);

  const stale = metaAdapter({
    now: () => new Date("2026-09-22T00:00:00.000Z"),
    priceEvidence: [
      {
        providerId: META_IMAGE_PROVIDER_ID,
        modelId: META_MUSE_IMAGE_MODEL_ID,
        currency: "USD",
        unit: "image",
        unitPrice: 0.01,
        verifiedAt: "2026-01-01T00:00:00.000Z",
        maxAgeMs: 1000,
      },
    ],
  });
  assert.equal(stale.quoteCost(REQUEST), null);

  const fresh = metaAdapter({
    now: () => new Date("2026-09-22T00:00:00.000Z"),
    priceEvidence: [
      {
        providerId: META_IMAGE_PROVIDER_ID,
        modelId: META_MUSE_IMAGE_MODEL_ID,
        currency: "USD",
        unit: "image",
        unitPrice: 0.01,
        verifiedAt: "2026-09-22T00:00:00.000Z",
      },
    ],
  });
  assert.equal(fresh.quoteCost(REQUEST)?.estimatedCostUsd, 0.01);
});

test("meta r2: quota state is reported and can be exhausted", () => {
  assert.equal(metaAdapter().quotaState().status, "available");
  assert.equal(
    metaAdapter({ quota: { status: "exhausted", remaining: 0 } }).quotaState().status,
    "exhausted"
  );
});

test("meta r2: an open circuit denies routing without ever calling generateImage", async () => {
  const { fetcher, calls } = recordingFetcher(() => jsonResponse(200, { data: [{ b64_json: "QQ" }] }));
  const adapter = metaAdapter({
    fetcher,
    priceEvidence: [
      {
        providerId: META_IMAGE_PROVIDER_ID,
        modelId: META_MUSE_IMAGE_MODEL_ID,
        currency: "USD",
        unit: "image",
        unitPrice: 0.01,
        verifiedAt: "2026-09-22T00:00:00.000Z",
      },
    ],
  });

  const selection = await resolvePaidImageProvider({
    capability: "image-generation",
    requestId: "r2-circuit",
    prompt: "a lighthouse",
    adapters: [adapter],
    policy: {
      imagePaidFallbackEnabled: true,
      maxCostPerImage: 0.1,
      dailyImageBudget: 1,
      monthlyImageBudget: 1,
      allowProviders: [META_IMAGE_PROVIDER_ID],
    },
    isCircuitOpen: () => true,
  });

  assert.equal(selection.ok, false);
  if (selection.ok) return;
  assert.equal(selection.code, "CIRCUIT_OPEN");
  assert.equal(calls.length, 0);
});
