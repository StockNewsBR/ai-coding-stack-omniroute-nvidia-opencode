/**
 * Generic paid image provider adapter interface (R0).
 *
 * R0 intentionally ships no AWS/Meta/etc. adapter. Future provider adapters
 * implement this interface and register with paidImageRouting.ts; the router
 * itself contains no provider-specific logic and no hardcoded cost constants.
 *
 * Capability wall: paid image infrastructure may only ever execute for
 * `image-generation`. Every other capability is rejected before any adapter
 * is consulted.
 */

export type PaidImageCapability = "image-generation";

/** Capabilities that must never reach a paid image provider. */
export const PAID_NON_IMAGE_CAPABILITIES = [
  "chat",
  "text",
  "coding",
  "search",
  "vision-understanding",
  "embeddings",
  "tools",
] as const;

export type PaidNonImageCapability = (typeof PAID_NON_IMAGE_CAPABILITIES)[number];

export type PaidImageRequestCapability = PaidImageCapability | PaidNonImageCapability;

export interface PaidImageGenerationRequest {
  readonly capability: PaidImageCapability;
  readonly requestId: string;
  readonly modelId?: string;
  readonly prompt?: string;
  readonly n?: number;
}

export interface PaidImageQuote {
  readonly estimatedCostUsd: number;
  readonly currency?: "USD";
  readonly qualityScore?: number;
  readonly expiresAt?: string;
}

export type PaidImageProviderHealth = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface PaidImageQuotaState {
  readonly status: "available" | "exhausted" | "unknown";
  readonly remaining?: number;
  readonly limit?: number;
  readonly resetAt?: string;
}

export interface PaidImageGenerationResult {
  readonly ok: boolean;
  readonly providerId: string;
  readonly modelId?: string;
  readonly actualCostUsd?: number;
  readonly imageUrls?: readonly string[];
  readonly latencyMs?: number;
  readonly error?: string;
}

export interface PaidImageProviderAdapter {
  readonly providerId: string;

  /** Declared paid capabilities; a paid image adapter declares image-generation only. */
  capabilities(): readonly PaidImageCapability[];

  isConfigured(): boolean | Promise<boolean>;
  isAvailable(): boolean | Promise<boolean>;
  healthStatus(): PaidImageProviderHealth | Promise<PaidImageProviderHealth>;

  /** Current factual cost evidence for this request; never a stored constant. */
  quoteCost(
    request: PaidImageGenerationRequest
  ): PaidImageQuote | null | Promise<PaidImageQuote | null>;

  quotaState(): PaidImageQuotaState | Promise<PaidImageQuotaState>;

  generateImage(request: PaidImageGenerationRequest): Promise<PaidImageGenerationResult>;

  reportUsage?(result: PaidImageGenerationResult): void | Promise<void>;
}
