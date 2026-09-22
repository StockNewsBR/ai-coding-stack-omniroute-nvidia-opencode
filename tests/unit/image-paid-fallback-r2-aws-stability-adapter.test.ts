/**
 * R2 offline contract tests — AWS Stability AI (Stable Image Core) wire schema.
 *
 * Offline only: no network inference. Every call goes through an injected
 * recording fetcher, and the routing-level circuit test asserts zero fetches.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AWS_IMAGE_PROVIDER_ID,
  AWS_NOVA_CANVAS_MODEL_ID,
  AWS_STABLE_IMAGE_CORE_MODEL_ID,
  buildAwsStabilityImageRequestBody,
  createAwsImageAdapter,
  parseAwsStabilityImageResponse,
  resolveAwsImageRequestSchema,
} from "../../open-sse/config/paidImageAwsAdapter.ts";
import { resolvePaidImageProvider } from "../../open-sse/config/paidImageRouting.ts";

const MOCK_KEY = "test-key-not-a-secret";
const STABILITY_URL = `https://bedrock-runtime.us-west-2.amazonaws.com/model/${encodeURIComponent(
  AWS_STABLE_IMAGE_CORE_MODEL_ID
)}/invoke`;

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

function stabilityAdapter(overrides: Record<string, unknown> = {}) {
  return createAwsImageAdapter({
    modelId: AWS_STABLE_IMAGE_CORE_MODEL_ID,
    apiKey: MOCK_KEY,
    region: "us-west-2",
    ...overrides,
  });
}

const REQUEST = {
  capability: "image-generation" as const,
  requestId: "r2-test",
  prompt: "a lighthouse",
};

test("aws r2: resolveAwsImageRequestSchema selects stability only for stability.* ids", () => {
  assert.equal(
    resolveAwsImageRequestSchema(AWS_STABLE_IMAGE_CORE_MODEL_ID),
    "stability"
  );
  assert.equal(resolveAwsImageRequestSchema("STABILITY.STABLE-IMAGE-CORE-V1:1"), "stability");
  assert.equal(resolveAwsImageRequestSchema(AWS_NOVA_CANVAS_MODEL_ID), "amazon-native");
  assert.equal(resolveAwsImageRequestSchema(undefined), "amazon-native");
});

test("aws r2: buildAwsStabilityImageRequestBody carries only the prompt", () => {
  assert.deepEqual(buildAwsStabilityImageRequestBody(REQUEST), { prompt: "a lighthouse" });
  assert.deepEqual(
    buildAwsStabilityImageRequestBody({ capability: "image-generation", requestId: "r" }),
    { prompt: "" }
  );
});

test("aws r2: stability adapter is configured and image-generation only", () => {
  const adapter = stabilityAdapter();
  assert.equal(adapter.providerId, AWS_IMAGE_PROVIDER_ID);
  assert.equal(adapter.isConfigured(), true);
  assert.equal(adapter.isAvailable(), true);
  assert.equal(adapter.healthStatus(), "healthy");
  assert.deepEqual([...adapter.capabilities()], ["image-generation"]);
});

test("aws r2: stability request mapping uses the runtime URL, bearer auth and prompt-only body", async () => {
  const { fetcher, calls } = recordingFetcher(() =>
    jsonResponse(200, { seeds: [1], finish_reasons: [null], images: ["QUJD"] })
  );
  const adapter = stabilityAdapter({ fetcher });
  await adapter.generateImage(REQUEST);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, STABILITY_URL);
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${MOCK_KEY}`);
  assert.equal(headers["Content-Type"], "application/json");
  const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
  assert.deepEqual(body, { prompt: "a lighthouse" });
  assert.equal(body.taskType, undefined);
});

test("aws r2: request id is propagated as X-Request-Id when present", async () => {
  const { fetcher, calls } = recordingFetcher(() =>
    jsonResponse(200, { images: ["QUJD"] })
  );
  const adapter = stabilityAdapter({ fetcher });
  await adapter.generateImage({ ...REQUEST, requestId: "req-123" });
  assert.equal((calls[0].init.headers as Record<string, string>)["X-Request-Id"], "req-123");

  const second = recordingFetcher(() => jsonResponse(200, { images: ["QUJD"] }));
  await stabilityAdapter({ fetcher: second.fetcher }).generateImage({
    capability: "image-generation",
    requestId: "",
    prompt: "x",
  });
  assert.equal(
    (second.calls[0].init.headers as Record<string, string>)["X-Request-Id"],
    undefined
  );
});

test("aws r2: base64 stability response becomes a data url with no actualCostUsd", async () => {
  const { fetcher } = recordingFetcher(() =>
    jsonResponse(200, { seeds: [2130420379], finish_reasons: [null], images: ["QUJD"] })
  );
  const result = await stabilityAdapter({ fetcher }).generateImage(REQUEST);
  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ["data:image/png;base64,QUJD"]);
  assert.equal(result.actualCostUsd, undefined);
  assert.equal(typeof result.latencyMs, "number");
});

test("aws r2: filtered stability response fails closed", async () => {
  const { fetcher } = recordingFetcher(() =>
    jsonResponse(200, { seeds: [], finish_reasons: ["Filter reason: prompt"], images: [] })
  );
  const result = await stabilityAdapter({ fetcher }).generateImage(REQUEST);
  assert.equal(result.ok, false);
  assert.equal(result.error, "AWS_IMAGE_RESPONSE_FILTERED");
});

test("aws r2: empty images with a null finish reason is NO_IMAGES", () => {
  assert.deepEqual(parseAwsStabilityImageResponse({ images: [], finish_reasons: [null] }), {
    ok: false,
    error: "AWS_IMAGE_RESPONSE_NO_IMAGES",
  });
});

test("aws r2: malformed stability payloads fail closed", () => {
  assert.deepEqual(parseAwsStabilityImageResponse(null), {
    ok: false,
    error: "AWS_IMAGE_RESPONSE_MALFORMED",
  });
  assert.deepEqual(parseAwsStabilityImageResponse({ seeds: [] }), {
    ok: false,
    error: "AWS_IMAGE_RESPONSE_MALFORMED",
  });
  assert.deepEqual(parseAwsStabilityImageResponse({ images: null }), {
    ok: false,
    error: "AWS_IMAGE_RESPONSE_MALFORMED",
  });
  assert.deepEqual(parseAwsStabilityImageResponse({ images: ["AA", "BB"] }), {
    ok: true,
    imageUrls: ["data:image/png;base64,AA", "data:image/png;base64,BB"],
  });
});

test("aws r2: missing credential and missing model fail closed without any fetch", async () => {
  const noKey = recordingFetcher(() => jsonResponse(200, { images: ["QUJD"] }));
  const a = await createAwsImageAdapter({
    modelId: AWS_STABLE_IMAGE_CORE_MODEL_ID,
    region: "us-west-2",
    fetcher: noKey.fetcher,
  }).generateImage(REQUEST);
  assert.equal(a.ok, false);
  assert.equal(a.error, "AWS_IMAGE_CREDENTIALS_MISSING");
  assert.equal(noKey.calls.length, 0);

  const noModel = recordingFetcher(() => jsonResponse(200, { images: ["QUJD"] }));
  const b = await createAwsImageAdapter({
    apiKey: MOCK_KEY,
    region: "us-west-2",
    fetcher: noModel.fetcher,
  }).generateImage(REQUEST);
  assert.equal(b.ok, false);
  assert.equal(b.error, "AWS_IMAGE_MODEL_MISSING");
  assert.equal(noModel.calls.length, 0);
});

test("aws r2: timeout and network failures are normalized", async () => {
  const timeout = recordingFetcher(() => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  });
  const t = await stabilityAdapter({ fetcher: timeout.fetcher }).generateImage(REQUEST);
  assert.equal(t.error, "AWS_IMAGE_TIMEOUT");

  const network = recordingFetcher(() => {
    throw new Error("socket hang up");
  });
  const n = await stabilityAdapter({ fetcher: network.fetcher }).generateImage(REQUEST);
  assert.equal(n.error, "AWS_IMAGE_NETWORK_ERROR");
});

test("aws r2: provider HTTP errors are normalized", async () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [401, "AWS_IMAGE_AUTH_ERROR"],
    [403, "AWS_IMAGE_AUTH_ERROR"],
    [429, "AWS_IMAGE_THROTTLED"],
    [400, "AWS_IMAGE_VALIDATION_ERROR"],
    [404, "AWS_IMAGE_MODEL_NOT_FOUND"],
    [500, "AWS_IMAGE_PROVIDER_ERROR"],
    [503, "AWS_IMAGE_PROVIDER_ERROR"],
  ];
  for (const [status, expected] of cases) {
    const { fetcher } = recordingFetcher(() => jsonResponse(status, { message: "denied" }));
    const result = await stabilityAdapter({ fetcher }).generateImage(REQUEST);
    assert.equal(result.ok, false);
    assert.equal(result.error, expected, `status ${status}`);
  }
});

test("aws r2: missing price yields no quote, stale price is rejected, fresh price scales", () => {
  const noEvidence = stabilityAdapter();
  assert.equal(noEvidence.quoteCost(REQUEST), null);

  const stale = stabilityAdapter({
    now: () => new Date("2026-09-22T00:00:00.000Z"),
    priceEvidence: [
      {
        providerId: AWS_IMAGE_PROVIDER_ID,
        modelId: AWS_STABLE_IMAGE_CORE_MODEL_ID,
        currency: "USD",
        unit: "image",
        unitPrice: 0.04,
        verifiedAt: "2026-01-01T00:00:00.000Z",
        maxAgeMs: 1000,
      },
    ],
  });
  assert.equal(stale.quoteCost(REQUEST), null);

  const fresh = stabilityAdapter({
    now: () => new Date("2026-09-22T00:00:00.000Z"),
    priceEvidence: [
      {
        providerId: AWS_IMAGE_PROVIDER_ID,
        modelId: AWS_STABLE_IMAGE_CORE_MODEL_ID,
        currency: "USD",
        unit: "image",
        unitPrice: 0.04,
        verifiedAt: "2026-09-22T00:00:00.000Z",
      },
    ],
  });
  const quote = fresh.quoteCost(REQUEST);
  assert.equal(quote?.estimatedCostUsd, 0.04);
  assert.equal(fresh.quoteCost({ ...REQUEST, n: 3 })?.estimatedCostUsd, 0.12);
});

test("aws r2: quota state is reported and can be exhausted", () => {
  assert.equal(stabilityAdapter().quotaState().status, "available");
  assert.equal(
    stabilityAdapter({ quota: { status: "exhausted", remaining: 0 } }).quotaState().status,
    "exhausted"
  );
});

test("aws r2: an open circuit denies routing without ever calling generateImage", async () => {
  const { fetcher, calls } = recordingFetcher(() =>
    jsonResponse(200, { seeds: [], finish_reasons: [null], images: ["QUJD"] })
  );
  const adapter = stabilityAdapter({
    fetcher,
    priceEvidence: [
      {
        providerId: AWS_IMAGE_PROVIDER_ID,
        modelId: AWS_STABLE_IMAGE_CORE_MODEL_ID,
        currency: "USD",
        unit: "image",
        unitPrice: 0.04,
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
      allowProviders: [AWS_IMAGE_PROVIDER_ID],
    },
    isCircuitOpen: () => true,
  });

  assert.equal(selection.ok, false);
  if (selection.ok) return;
  assert.equal(selection.code, "CIRCUIT_OPEN");
  assert.equal(selection.considered[0]?.code, "CIRCUIT_OPEN");
  assert.equal(calls.length, 0);
});
