/**
 * R0 paid image fallback policy.
 *
 * Typed, fail-closed policy surface for the paid image provider router.
 * The committed default is DISABLED: no paid image provider may execute unless
 * an operator explicitly enables fallback AND supplies complete budget limits.
 *
 * Costs are never defined here: adapters return live quotes and the router
 * compares them against the numbers configured below.
 */

export type PaidImageFallbackReason =
  | "NO_FREE_IMAGE_PROVIDER_AVAILABLE"
  | "FREE_IMAGE_QUOTA_EXHAUSTED"
  | "FREE_IMAGE_PROVIDER_UNHEALTHY"
  | "FREE_IMAGE_PROVIDER_TIMEOUT"
  | "FREE_IMAGE_CIRCUIT_OPEN";

export type PaidImageDenyCode =
  | "POLICY_DISABLED"
  | "CAPABILITY_NOT_IMAGE_GENERATION"
  | "BUDGET_CONFIG_MISSING"
  | "BUDGET_STATE_UNVERIFIED"
  | "PROVIDER_NOT_ALLOWED"
  | "PROVIDER_DENIED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_UNHEALTHY"
  | "CIRCUIT_OPEN"
  | "QUOTA_EXHAUSTED"
  | "QUOTA_UNKNOWN"
  | "COST_QUOTE_UNAVAILABLE"
  | "MAX_COST_EXCEEDED"
  | "QUALITY_FLOOR_UNVERIFIED"
  | "QUALITY_BELOW_FLOOR"
  | "DAILY_BUDGET_EXCEEDED"
  | "MONTHLY_BUDGET_EXCEEDED"
  | "NO_ACCEPTABLE_PAID_PROVIDER";

export interface PaidImagePolicy {
  readonly imagePaidFallbackEnabled: boolean;
  readonly maxCostPerImage?: number;
  readonly dailyImageBudget?: number;
  readonly monthlyImageBudget?: number;
  readonly allowProviders?: readonly string[];
  readonly denyProviders?: readonly string[];
  readonly qualityFloor?: number;
}

export const DEFAULT_PAID_IMAGE_POLICY: PaidImagePolicy = Object.freeze({
  imagePaidFallbackEnabled: false,
});

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveFiniteNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) && value > 0 ? value : undefined;
}

function nonNegativeFiniteNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) && value >= 0 ? value : undefined;
}

function providerIdList(value: unknown): readonly string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );
}

/**
 * Normalize an untrusted policy object. Anything malformed fails closed:
 * fallback stays disabled, budgets stay absent, allow-lists empty out.
 */
export function normalizePaidImagePolicy(raw: unknown): PaidImagePolicy {
  if (raw === null || typeof raw !== "object") return DEFAULT_PAID_IMAGE_POLICY;
  const candidate = raw as Record<string, unknown>;
  return {
    imagePaidFallbackEnabled: candidate.imagePaidFallbackEnabled === true,
    maxCostPerImage: positiveFiniteNumber(candidate.maxCostPerImage),
    dailyImageBudget: positiveFiniteNumber(candidate.dailyImageBudget),
    monthlyImageBudget: positiveFiniteNumber(candidate.monthlyImageBudget),
    allowProviders: providerIdList(candidate.allowProviders),
    denyProviders: providerIdList(candidate.denyProviders),
    qualityFloor: nonNegativeFiniteNumber(candidate.qualityFloor),
  };
}

/**
 * A policy is funded only when fallback is enabled and every budget limit is a
 * positive finite number. Missing config denies paid execution.
 */
export function isPaidImagePolicyFunded(policy: PaidImagePolicy): boolean {
  return (
    policy.imagePaidFallbackEnabled === true &&
    policy.maxCostPerImage !== undefined &&
    policy.dailyImageBudget !== undefined &&
    policy.monthlyImageBudget !== undefined
  );
}

export interface PaidImageProviderAllowVerdict {
  readonly allowed: boolean;
  readonly code?: PaidImageDenyCode;
  readonly reason: string;
}

export function isPaidImageProviderAllowed(
  policy: PaidImagePolicy,
  providerId: string
): PaidImageProviderAllowVerdict {
  if (policy.denyProviders?.includes(providerId)) {
    return {
      allowed: false,
      code: "PROVIDER_DENIED",
      reason: `provider ${providerId} is on the paid image deny list`,
    };
  }
  if (policy.allowProviders && !policy.allowProviders.includes(providerId)) {
    return {
      allowed: false,
      code: "PROVIDER_NOT_ALLOWED",
      reason: `provider ${providerId} is not on the paid image allow list`,
    };
  }
  return { allowed: true, reason: `provider ${providerId} is allowed by paid image policy` };
}

export interface PaidImageBudgetSnapshot {
  readonly estimatedCostUsd: number;
  readonly dailySpendUsd: number;
  readonly monthlySpendUsd: number;
}

export interface PaidImageBudgetVerdict {
  readonly decision: "allow" | "deny";
  readonly code?: PaidImageDenyCode;
  readonly reason: string;
}

/**
 * Fail-closed budget evaluation. Order: policy gate, config gate, quote gate,
 * per-image cap, spend-state gate, daily cap, monthly cap. Quoted cost is the
 * adapter's current evidence; no cost constants live here.
 */
export function evaluatePaidImageBudget(
  policy: PaidImagePolicy,
  snapshot: PaidImageBudgetSnapshot
): PaidImageBudgetVerdict {
  if (policy.imagePaidFallbackEnabled !== true) {
    return {
      decision: "deny",
      code: "POLICY_DISABLED",
      reason: "paid image fallback is disabled by policy",
    };
  }
  const maxCostPerImage = policy.maxCostPerImage;
  const dailyImageBudget = policy.dailyImageBudget;
  const monthlyImageBudget = policy.monthlyImageBudget;
  if (
    maxCostPerImage === undefined ||
    dailyImageBudget === undefined ||
    monthlyImageBudget === undefined
  ) {
    return {
      decision: "deny",
      code: "BUDGET_CONFIG_MISSING",
      reason: "paid image budgets are not fully configured; paid execution fails closed",
    };
  }
  const estimated = snapshot.estimatedCostUsd;
  if (!isFiniteNumber(estimated) || estimated < 0) {
    return {
      decision: "deny",
      code: "COST_QUOTE_UNAVAILABLE",
      reason: "paid image cost quote is missing or invalid",
    };
  }
  if (estimated > maxCostPerImage) {
    return {
      decision: "deny",
      code: "MAX_COST_EXCEEDED",
      reason: `quoted cost ${estimated} exceeds maxCostPerImage ${maxCostPerImage}`,
    };
  }
  if (!isFiniteNumber(snapshot.dailySpendUsd) || !isFiniteNumber(snapshot.monthlySpendUsd)) {
    return {
      decision: "deny",
      code: "BUDGET_STATE_UNVERIFIED",
      reason: "paid image spend state is unavailable",
    };
  }
  if (snapshot.dailySpendUsd + estimated > dailyImageBudget) {
    return {
      decision: "deny",
      code: "DAILY_BUDGET_EXCEEDED",
      reason: `paid image daily budget ${dailyImageBudget} would be exceeded`,
    };
  }
  if (snapshot.monthlySpendUsd + estimated > monthlyImageBudget) {
    return {
      decision: "deny",
      code: "MONTHLY_BUDGET_EXCEEDED",
      reason: `paid image monthly budget ${monthlyImageBudget} would be exceeded`,
    };
  }
  return { decision: "allow", reason: "within paid image cost and budget limits" };
}
