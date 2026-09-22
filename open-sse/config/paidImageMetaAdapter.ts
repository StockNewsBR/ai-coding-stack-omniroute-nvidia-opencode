/**
 * Meta paid image adapter (R1) — Meta Model API "Muse Image".
 *
 * Verified official interface (2026-09, two independent official sources):
 *   POST https://api.meta.ai/v1/images/generations   (OpenAI Images compatible)
 *   Model: "muse-image-1.0"
 *   Auth:  Authorization: Bearer $MODEL_API_KEY
 *   Request:  { model, prompt, n?, size?, response_format?, output_format? }
 *   Response: { created, data: [ { b64_json? , url? } ], output_format? }
 *
 * Base URL + modelId + credentials are configurable; NO price is hardcoded
 * (quotes come from configurable price evidence; absent evidence =>
 * COST_QUOTE_UNAVAILABLE). Capability: image-generation ONLY.
 * No real paid call is made during R1.
 */
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

export const META_IMAGE_PROVIDER_ID = "meta-muse-image";
/** Documented model identifier — exported for configuration convenience, never used as a silent default. */
export const META_MUSE_IMAGE_MODEL_ID = "muse-image-1.0";
export const META_IMAGE_DEFAULT_BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_META_IMAGE_TIMEOUT_MS = 60_000;

const META_IMAGE_MIN_IMAGES = 1;
const META_IMAGE_MAX_IMAGES = 10;
const IMAGE_GENERATION_CAPABILITY: readonly PaidImageCapability[] = ["image-generation"];

export interface NormalizedMetaImageError {
  readonly code: string;
  readonly status: number;
  readonly message: string;
}

function extractProviderMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim() !== "") return message.trim();
  }
  const direct = record.message ?? record.detail;
  return typeof direct === "string" && direct.trim() !== "" ? direct.trim() : undefined;
}

export function normalizeMetaImageError(status: number, body: unknown): NormalizedMetaImageError {
  const message = extractProviderMessage(body) ?? `meta image request failed with status ${status}`;
  const code =
    status === 401 || status === 403
      ? "META_IMAGE_AUTH_ERROR"
      : status === 429
        ? "META_IMAGE_RATE_LIMITED"
        : status === 404
          ? "META_IMAGE_MODEL_NOT_FOUND"
          : status === 400 || status === 422
            ? "META_IMAGE_VALIDATION_ERROR"
            : status >= 500
              ? "META_IMAGE_PROVIDER_ERROR"
              : "META_IMAGE_HTTP_ERROR";
  return { code, status, message };
}

export function buildMetaImageRequestBody(
  modelId: string,
  request: PaidImageGenerationRequest,
  size?: string
): Record<string, unknown> {
  const requested = isFiniteNumber(request.n) && request.n > 0 ? Math.floor(request.n) : 1;
  const n = Math.min(META_IMAGE_MAX_IMAGES, Math.max(META_IMAGE_MIN_IMAGES, requested));
  const body: Record<string, unknown> = { model: modelId, prompt: request.prompt ?? "", n };
  if (typeof size === "string" && size.trim() !== "") body.size = size.trim();
  return body;
}

function mimeForOutputFormat(format: unknown): string {
  if (format === "png") return "image/png";
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  return "image/webp";
}

export type MetaImageParseResult =
  | { readonly ok: true; readonly imageUrls: readonly string[] }
  | { readonly ok: false; readonly error: string };

export function parseMetaImageResponse(payload: unknown): MetaImageParseResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "META_IMAGE_RESPONSE_MALFORMED" };
  }
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "META_IMAGE_RESPONSE_NO_IMAGES" };
  }
  const mime = mimeForOutputFormat(record.output_format);
  const imageUrls: string[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.b64_json === "string" && entry.b64_json.trim() !== "") {
      imageUrls.push(`data:${mime};base64,${entry.b64_json.trim()}`);
    } else if (typeof entry.url === "string" && entry.url.trim() !== "") {
      imageUrls.push(entry.url.trim());
    }
  }
  if (imageUrls.length === 0) {
    return { ok: false, error: "META_IMAGE_RESPONSE_NO_IMAGES" };
  }
  return { ok: true, imageUrls };
}

export interface MetaImageAdapterConfig {
  readonly providerId?: string;
  readonly baseUrl?: string;
  /** Required for the adapter to be configured — no eternal default. */
  readonly modelId?: string;
  /** Reuses the existing OmniRoute credential mechanism (Bearer API key). */
  readonly apiKey?: string | null;
  readonly priceEvidence?: unknown;
  readonly qualityScore?: number;
  readonly quota?: PaidImageQuotaState;
  readonly size?: string;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
}

export function createMetaImageAdapter(
  config: MetaImageAdapterConfig = {}
): PaidImageProviderAdapter {
  const providerId =
    typeof config.providerId === "string" && config.providerId.trim() !== ""
      ? config.providerId.trim()
      : META_IMAGE_PROVIDER_ID;
  const modelId =
    typeof config.modelId === "string" && config.modelId.trim() !== ""
      ? config.modelId.trim()
      : undefined;
  const apiKey =
    typeof config.apiKey === "string" && config.apiKey.trim() !== "" ? config.apiKey : undefined;
  const baseUrl =
    typeof config.baseUrl === "string" && config.baseUrl.trim() !== ""
      ? config.baseUrl.trim().replace(/\/+$/, "")
      : META_IMAGE_DEFAULT_BASE_URL;
  const timeoutMs =
    isFiniteNumber(config.timeoutMs) && config.timeoutMs > 0
      ? config.timeoutMs
      : DEFAULT_META_IMAGE_TIMEOUT_MS;
  const doFetch = config.fetcher ?? fetch;
  const now = config.now ?? (() => new Date());
  const createUrl = `${baseUrl}/images/generations`;

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
          error: "META_IMAGE_CREDENTIALS_MISSING",
          latencyMs: Date.now() - started,
        };
      }
      const effectiveModel = modelId ?? request.modelId;
      if (!effectiveModel) {
        return { ok: false, providerId, error: "META_IMAGE_MODEL_MISSING", latencyMs: Date.now() - started };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(createUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(buildMetaImageRequestBody(effectiveModel, request, config.size)),
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
          const normalized = normalizeMetaImageError(response.status, payload);
          return { ok: false, providerId, modelId: effectiveModel, error: normalized.code, latencyMs };
        }

        const parsed = parseMetaImageResponse(payload);
        if (!parsed.ok) {
          return { ok: false, providerId, modelId: effectiveModel, error: parsed.error, latencyMs };
        }
        return {
          ok: true,
          providerId,
          modelId: effectiveModel,
          imageUrls: parsed.imageUrls,
          latencyMs,
        };
      } catch (error) {
        const latencyMs = Date.now() - started;
        const aborted = error instanceof Error && error.name === "AbortError";
        return {
          ok: false,
          providerId,
          modelId: effectiveModel,
          error: aborted ? "META_IMAGE_TIMEOUT" : "META_IMAGE_NETWORK_ERROR",
          latencyMs,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
