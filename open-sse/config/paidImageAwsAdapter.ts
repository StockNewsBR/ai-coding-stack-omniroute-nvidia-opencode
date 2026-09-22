/**
 * AWS paid image adapter (R1/R2) — Amazon Bedrock Runtime `InvokeModel`.
 *
 * Verified official interfaces (2026-09):
 *   POST https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke
 *
 * Two request/response schemas are supported, selected from the model id:
 *
 *  1. Stability AI (selected R2 route — Stable Image Core):
 *     model id  `stability.stable-image-core-v1:1` (official AWS sample)
 *     request   { prompt, aspect_ratio?, output_format?, seed?, negative_prompt? }
 *     response  { seeds, finish_reasons, images: [ "<base64>" ] }
 *     A non-null `finish_reasons` entry means the request was filtered/failed.
 *
 *  2. Amazon-native (legacy back-compat — Nova Canvas):
 *     request   { taskType: "TEXT_IMAGE",
 *                 textToImageParams: { text },
 *                 imageGenerationConfig: { numberOfImages } }
 *     response  { images: [ "<base64>" ] }
 *
 * Auth: real AWS uses SigV4 + IAM `bedrock:InvokeModel`; OmniRoute's existing
 * Bedrock integration authenticates with a Bearer API key, which this adapter
 * reuses. Region + modelId are configurable — no model is hardcoded as an
 * eternal default, and NO price is hardcoded (quotes come from configurable
 * price evidence; absent evidence => COST_QUOTE_UNAVAILABLE).
 *
 * Capability: image-generation ONLY. No real paid call is made during R2.
 */
import {
  buildBedrockRuntimeBaseUrl,
  normalizeBedrockRegion,
  resolveBedrockRegion,
} from "./bedrock.ts";
import { isFiniteNumber } from "./paidImagePolicy.ts";
import { buildPaidImageQuote } from "./paidImagePriceEvidence.ts";
import type {
  PaidImageCapability,
  PaidImageGenerationRequest,
  PaidImageGenerationResult,
  PaidImageProviderAdapter,
  PaidImageProviderHealth,
  PaidImageQuotaState,
} from "./paidImageProviderAdapter.ts";

export const AWS_IMAGE_PROVIDER_ID = "aws-bedrock-image";
/** Documented model identifiers — exported for configuration convenience, never used as a silent default. */
export const AWS_NOVA_CANVAS_MODEL_ID = "amazon.nova-canvas-v1:0";
export const AWS_TITAN_IMAGE_V2_MODEL_ID = "amazon.titan-image-generator-v2:0";
/** Selected R2 Bedrock Stability text-to-image route (region: us-west-2 only). */
export const AWS_STABLE_IMAGE_CORE_MODEL_ID = "stability.stable-image-core-v1:1";
export const DEFAULT_AWS_IMAGE_TIMEOUT_MS = 60_000;

const AWS_IMAGE_MAX_IMAGES = 5;
const IMAGE_GENERATION_CAPABILITY: readonly PaidImageCapability[] = ["image-generation"];

export interface NormalizedAwsImageError {
  readonly code: string;
  readonly status: number;
  readonly message: string;
}

function extractProviderMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const direct = record.message ?? record.Message;
  return typeof direct === "string" && direct.trim() !== "" ? direct.trim() : undefined;
}

/** Maps an AWS HTTP failure onto a normalized provider error. */
export function normalizeAwsImageError(status: number, body: unknown): NormalizedAwsImageError {
  const message = extractProviderMessage(body) ?? `aws image request failed with status ${status}`;
  const code =
    status === 401 || status === 403
      ? "AWS_IMAGE_AUTH_ERROR"
      : status === 429
        ? "AWS_IMAGE_THROTTLED"
        : status === 404
          ? "AWS_IMAGE_MODEL_NOT_FOUND"
          : status === 400 || status === 422
            ? "AWS_IMAGE_VALIDATION_ERROR"
            : status >= 500
              ? "AWS_IMAGE_PROVIDER_ERROR"
              : "AWS_IMAGE_HTTP_ERROR";
  return { code, status, message };
}

export type AwsImageRequestSchema = "stability" | "amazon-native";

/**
 * Selects the wire schema for a model id. Only Stability AI models (`stability.*`)
 * use the Stability text-to-image schema; everything else keeps the Amazon-native
 * schema so existing Nova/Titan wiring is unaffected.
 */
export function resolveAwsImageRequestSchema(modelId?: string): AwsImageRequestSchema {
  if (typeof modelId === "string" && modelId.trim().toLowerCase().startsWith("stability.")) {
    return "stability";
  }
  return "amazon-native";
}

export function buildAwsImageRequestBody(
  request: PaidImageGenerationRequest
): Record<string, unknown> {
  const requested = isFiniteNumber(request.n) && request.n > 0 ? Math.floor(request.n) : 1;
  const numberOfImages = Math.min(AWS_IMAGE_MAX_IMAGES, Math.max(1, requested));
  return {
    taskType: "TEXT_IMAGE",
    textToImageParams: { text: request.prompt ?? "" },
    imageGenerationConfig: { numberOfImages },
  };
}

/**
 * Stability AI text-to-image body for `stability.stable-image-core-v1:1`.
 * `prompt` is the only required field; optional params are omitted unless the
 * request actually carries them (no invented defaults).
 */
export function buildAwsStabilityImageRequestBody(
  request: PaidImageGenerationRequest
): Record<string, unknown> {
  return { prompt: request.prompt ?? "" };
}

export type AwsImageParseResult =
  | { readonly ok: true; readonly imageUrls: readonly string[] }
  | { readonly ok: false; readonly error: string };

export function parseAwsImageResponse(payload: unknown): AwsImageParseResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "AWS_IMAGE_RESPONSE_MALFORMED" };
  }
  const images = (payload as Record<string, unknown>).images;
  if (!Array.isArray(images) || images.length === 0) {
    return { ok: false, error: "AWS_IMAGE_RESPONSE_NO_IMAGES" };
  }
  const imageUrls: string[] = [];
  for (const image of images) {
    if (typeof image === "string" && image.trim() !== "") {
      imageUrls.push(`data:image/png;base64,${image.trim()}`);
    }
  }
  if (imageUrls.length === 0) {
    return { ok: false, error: "AWS_IMAGE_RESPONSE_NO_IMAGES" };
  }
  return { ok: true, imageUrls };
}

/**
 * Stability AI response parser: `{ seeds, finish_reasons, images: ["<base64>"] }`.
 * An empty `images` array with a non-empty `finish_reasons` entry means the
 * provider filtered the request or failed inference.
 */
export function parseAwsStabilityImageResponse(payload: unknown): AwsImageParseResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "AWS_IMAGE_RESPONSE_MALFORMED" };
  }
  const record = payload as Record<string, unknown>;
  const images = record.images;
  if (!Array.isArray(images)) {
    return { ok: false, error: "AWS_IMAGE_RESPONSE_MALFORMED" };
  }
  const imageUrls: string[] = [];
  for (const image of images) {
    if (typeof image === "string" && image.trim() !== "") {
      imageUrls.push(`data:image/png;base64,${image.trim()}`);
    }
  }
  if (imageUrls.length === 0) {
    const reasons = record.finish_reasons;
    const filtered =
      Array.isArray(reasons) &&
      reasons.some((reason) => typeof reason === "string" && reason.trim() !== "");
    return {
      ok: false,
      error: filtered ? "AWS_IMAGE_RESPONSE_FILTERED" : "AWS_IMAGE_RESPONSE_NO_IMAGES",
    };
  }
  return { ok: true, imageUrls };
}

export interface AwsImageAdapterConfig {
  readonly providerId?: string;
  readonly region?: unknown;
  readonly providerSpecificData?: unknown;
  /** Required for the adapter to be configured — no eternal default. */
  readonly modelId?: string;
  /** Reuses the existing OmniRoute credential mechanism (Bearer API key). */
  readonly apiKey?: string | null;
  /** Configurable price evidence (see paidImagePriceEvidence.ts). */
  readonly priceEvidence?: unknown;
  readonly qualityScore?: number;
  readonly quota?: PaidImageQuotaState;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
}

export function createAwsImageAdapter(config: AwsImageAdapterConfig = {}): PaidImageProviderAdapter {
  const providerId =
    typeof config.providerId === "string" && config.providerId.trim() !== ""
      ? config.providerId.trim()
      : AWS_IMAGE_PROVIDER_ID;
  const modelId =
    typeof config.modelId === "string" && config.modelId.trim() !== ""
      ? config.modelId.trim()
      : undefined;
  const apiKey =
    typeof config.apiKey === "string" && config.apiKey.trim() !== "" ? config.apiKey : undefined;
  const region =
    config.region !== undefined
      ? normalizeBedrockRegion(config.region)
      : resolveBedrockRegion(config.providerSpecificData);
  const baseUrl = buildBedrockRuntimeBaseUrl(region);
  const timeoutMs =
    isFiniteNumber(config.timeoutMs) && config.timeoutMs > 0
      ? config.timeoutMs
      : DEFAULT_AWS_IMAGE_TIMEOUT_MS;
  const doFetch = config.fetcher ?? fetch;
  const now = config.now ?? (() => new Date());
  const invokeUrl = modelId ? `${baseUrl}/model/${encodeURIComponent(modelId)}/invoke` : baseUrl;
  const requestSchema = resolveAwsImageRequestSchema(modelId);
  const buildRequestBody =
    requestSchema === "stability" ? buildAwsStabilityImageRequestBody : buildAwsImageRequestBody;
  const parseResponse =
    requestSchema === "stability" ? parseAwsStabilityImageResponse : parseAwsImageResponse;

  const configured = (): boolean => Boolean(apiKey && modelId);

  return {
    providerId,
    capabilities: () => IMAGE_GENERATION_CAPABILITY,
    isConfigured: () => configured(),
    isAvailable: () => configured(),
    healthStatus: (): PaidImageProviderHealth => (configured() ? "healthy" : "unknown"),
    quotaState: (): PaidImageQuotaState =>
      config.quota ?? { status: configured() ? "available" : "unknown" },
    quoteCost: (request: PaidImageGenerationRequest) =>
      buildPaidImageQuote({
        providerId,
        request: { ...request, modelId: request.modelId ?? modelId },
        evidence: config.priceEvidence,
        now: now(),
        qualityScore: config.qualityScore,
      }),
    async generateImage(request: PaidImageGenerationRequest): Promise<PaidImageGenerationResult> {
      const started = Date.now();
      if (!apiKey) {
        return {
          ok: false,
          providerId,
          modelId,
          error: "AWS_IMAGE_CREDENTIALS_MISSING",
          latencyMs: Date.now() - started,
        };
      }
      if (!modelId) {
        return { ok: false, providerId, error: "AWS_IMAGE_MODEL_MISSING", latencyMs: Date.now() - started };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      const requestId =
        typeof request.requestId === "string" && request.requestId.trim() !== ""
          ? request.requestId.trim()
          : undefined;
      if (requestId) {
        headers["X-Request-Id"] = requestId;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(invokeUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(buildRequestBody(request)),
          signal: controller.signal,
        });
        const text = await response.text();
        let payload: unknown = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = null;
        }
        const latencyMs = Date.now() - started;

        if (!response.ok) {
          const normalized = normalizeAwsImageError(response.status, payload);
          return { ok: false, providerId, modelId, error: normalized.code, latencyMs };
        }

        const parsed = parseResponse(payload);
        if (!parsed.ok) {
          return { ok: false, providerId, modelId, error: parsed.error, latencyMs };
        }
        return { ok: true, providerId, modelId, imageUrls: parsed.imageUrls, latencyMs };
      } catch (error) {
        const latencyMs = Date.now() - started;
        const aborted = error instanceof Error && error.name === "AbortError";
        return {
          ok: false,
          providerId,
          modelId,
          error: aborted ? "AWS_IMAGE_TIMEOUT" : "AWS_IMAGE_NETWORK_ERROR",
          latencyMs,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
