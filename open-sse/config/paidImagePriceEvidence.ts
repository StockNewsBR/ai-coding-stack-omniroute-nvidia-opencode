/**
 * Configurable paid image price evidence (R1).
 *
 * Prices are NEVER hardcoded as source constants. Every quote is derived from a
 * verified, externally supplied evidence record that carries audit metadata
 * (providerId, modelId, currency, unit, unitPrice, verifiedAt, source).
 *
 * Fail-closed rules:
 *   - malformed evidence   -> dropped (no quote)
 *   - stale evidence       -> dropped (no quote)
 *   - no matching evidence -> COST_QUOTE_UNAVAILABLE (buildPaidImageQuote returns null)
 *
 * There is NO fallback to a remembered/historical price.
 */
import { isFiniteNumber } from "./paidImagePolicy.ts";
import type {
  PaidImageGenerationRequest,
  PaidImageQuote,
} from "./paidImageProviderAdapter.ts";

export type PaidImagePriceUnit = "image";

export interface PaidImagePriceEvidence {
  readonly providerId: string;
  /** Omitted => wildcard that applies to any model of the provider. */
  readonly modelId?: string;
  readonly currency: "USD";
  readonly unit: PaidImagePriceUnit;
  /** USD per image. */
  readonly unitPrice: number;
  /** ISO timestamp at which the price was verified against the provider. */
  readonly verifiedAt: string;
  /** ISO timestamp at which the price takes effect (optional). */
  readonly effectiveAt?: string;
  /** Human-auditable reference (doc URL / ticket id). */
  readonly source?: string;
  /** Freshness window in ms; when absent the evidence never goes stale. */
  readonly maxAgeMs?: number;
}

export interface NormalizedPriceEvidence {
  readonly providerId: string;
  readonly modelId?: string;
  readonly currency: "USD";
  readonly unit: PaidImagePriceUnit;
  readonly unitPrice: number;
  readonly verifiedAt: string;
  readonly effectiveAt?: string;
  readonly source?: string;
  readonly maxAgeMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Returns null for any malformed record. Never throws. */
export function normalizePriceEvidence(raw: unknown): NormalizedPriceEvidence | null {
  if (!isRecord(raw)) return null;
  if (!isNonEmptyString(raw.providerId)) return null;
  if (raw.currency !== "USD") return null;
  if (raw.unit !== "image") return null;
  if (!isFiniteNumber(raw.unitPrice) || raw.unitPrice < 0) return null;
  const verifiedAt = parseIsoTimestamp(raw.verifiedAt);
  if (!verifiedAt) return null;

  const modelId = isNonEmptyString(raw.modelId) ? raw.modelId : undefined;
  const effectiveAt = parseIsoTimestamp(raw.effectiveAt);
  const source = isNonEmptyString(raw.source) ? raw.source : undefined;
  const maxAgeMs = isFiniteNumber(raw.maxAgeMs) && raw.maxAgeMs > 0 ? raw.maxAgeMs : undefined;

  return {
    providerId: raw.providerId,
    ...(modelId !== undefined ? { modelId } : {}),
    currency: "USD",
    unit: "image",
    unitPrice: raw.unitPrice,
    verifiedAt,
    ...(effectiveAt !== undefined ? { effectiveAt } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(maxAgeMs !== undefined ? { maxAgeMs } : {}),
  };
}

/** Drops every malformed entry. */
export function normalizePriceEvidenceList(raw: unknown): readonly NormalizedPriceEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedPriceEvidence[] = [];
  for (const item of raw) {
    const parsed = normalizePriceEvidence(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function isPriceEvidenceFresh(entry: NormalizedPriceEvidence, now: Date): boolean {
  if (entry.maxAgeMs === undefined) return true;
  const verified = Date.parse(entry.verifiedAt);
  if (!Number.isFinite(verified)) return false;
  if (now.getTime() < verified) return true; // clock skew is not staleness
  return now.getTime() - verified <= entry.maxAgeMs;
}

export function selectPriceEvidence(
  evidence: readonly NormalizedPriceEvidence[],
  providerId: string,
  modelId: string | undefined,
  now: Date
): NormalizedPriceEvidence | null {
  const fresh = evidence.filter(
    (entry) => entry.providerId === providerId && isPriceEvidenceFresh(entry, now)
  );
  const exact = modelId !== undefined ? fresh.filter((entry) => entry.modelId === modelId) : [];
  const pool = exact.length > 0 ? exact : fresh.filter((entry) => entry.modelId === undefined);
  if (pool.length === 0) return null;
  return pool
    .slice()
    .sort((a, b) => a.unitPrice - b.unitPrice || a.verifiedAt.localeCompare(b.verifiedAt))[0];
}

export interface BuildPaidImageQuoteInput {
  readonly providerId: string;
  readonly request: PaidImageGenerationRequest;
  /** Raw (untrusted) evidence config. */
  readonly evidence: unknown;
  readonly now?: Date;
  readonly qualityScore?: number;
}

/**
 * Factual estimated cost for a request, or null (=> COST_QUOTE_UNAVAILABLE).
 * Cost = unitPrice * requested image count (default 1).
 */
export function buildPaidImageQuote(input: BuildPaidImageQuoteInput): PaidImageQuote | null {
  const now = input.now ?? new Date();
  const evidence = normalizePriceEvidenceList(input.evidence);
  const entry = selectPriceEvidence(evidence, input.providerId, input.request.modelId, now);
  if (!entry) return null;

  const n =
    isFiniteNumber(input.request.n) && input.request.n > 0 ? Math.floor(input.request.n) : 1;
  const estimatedCostUsd = entry.unitPrice * n;
  if (!isFiniteNumber(estimatedCostUsd) || estimatedCostUsd < 0) return null;

  const quote: PaidImageQuote = {
    estimatedCostUsd,
    currency: "USD",
    ...(isFiniteNumber(input.qualityScore) ? { qualityScore: input.qualityScore } : {}),
  };
  if (entry.maxAgeMs !== undefined) {
    const verified = Date.parse(entry.verifiedAt);
    return { ...quote, expiresAt: new Date(verified + entry.maxAgeMs).toISOString() };
  }
  return quote;
}
