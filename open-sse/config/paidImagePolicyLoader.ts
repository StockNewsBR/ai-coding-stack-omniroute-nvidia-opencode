/**
 * Safe runtime policy loading for paid image fallback (R1).
 *
 * Guarantees:
 *   - DEFAULT is DISABLED (imagePaidFallbackEnabled=false, no budgets).
 *   - Budget values are externally configurable (object or env).
 *   - Missing or malformed budget config FAILS CLOSED (policy is never funded,
 *     so the router denies with BUDGET_CONFIG_MISSING).
 *   - No implicit default can ever spend money.
 *
 * This loader only *parses/normalizes* configuration; all enforcement lives in
 * paidImagePolicy.ts + paidImageRouting.ts.
 */
import {
  DEFAULT_PAID_IMAGE_POLICY,
  normalizePaidImagePolicy,
  type PaidImagePolicy,
} from "./paidImagePolicy.ts";

export type PaidImagePolicySource = Record<string, unknown> | undefined;

function parseNumber(value: unknown, min: number): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return parsed >= min ? parsed : undefined;
}

function parseList(value: unknown): readonly string[] | undefined {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const cleaned: string[] = [];
  for (const item of items) {
    if (typeof item === "string" && item.trim() !== "") cleaned.push(item.trim());
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1;
}

/** Normalizes an untrusted object into a PaidImagePolicy. Never throws. */
export function loadPaidImagePolicy(source: PaidImagePolicySource): PaidImagePolicy {
  if (!source || typeof source !== "object") return DEFAULT_PAID_IMAGE_POLICY;

  const maxCostPerImage = parseNumber(source.maxCostPerImage, Number.MIN_VALUE);
  const dailyImageBudget = parseNumber(source.dailyImageBudget, Number.MIN_VALUE);
  const monthlyImageBudget = parseNumber(source.monthlyImageBudget, Number.MIN_VALUE);
  const qualityFloor = parseNumber(source.qualityFloor, 0);
  const allowProviders = parseList(source.allowProviders);
  const denyProviders = parseList(source.denyProviders);

  return normalizePaidImagePolicy({
    imagePaidFallbackEnabled: parseBoolean(source.imagePaidFallbackEnabled),
    ...(maxCostPerImage !== undefined ? { maxCostPerImage } : {}),
    ...(dailyImageBudget !== undefined ? { dailyImageBudget } : {}),
    ...(monthlyImageBudget !== undefined ? { monthlyImageBudget } : {}),
    ...(qualityFloor !== undefined ? { qualityFloor } : {}),
    ...(allowProviders !== undefined ? { allowProviders } : {}),
    ...(denyProviders !== undefined ? { denyProviders } : {}),
  });
}

export const PAID_IMAGE_POLICY_ENV_KEYS = {
  enabled: "IMAGE_PAID_FALLBACK_ENABLED",
  maxCostPerImage: "IMAGE_PAID_MAX_COST_PER_IMAGE",
  dailyImageBudget: "IMAGE_PAID_DAILY_BUDGET",
  monthlyImageBudget: "IMAGE_PAID_MONTHLY_BUDGET",
  allowProviders: "IMAGE_PAID_ALLOW_PROVIDERS",
  denyProviders: "IMAGE_PAID_DENY_PROVIDERS",
  qualityFloor: "IMAGE_PAID_QUALITY_FLOOR",
} as const;

export function loadPaidImagePolicyFromEnv(
  env: Record<string, string | undefined> = process.env
): PaidImagePolicy {
  const keys = PAID_IMAGE_POLICY_ENV_KEYS;
  return loadPaidImagePolicy({
    imagePaidFallbackEnabled: env[keys.enabled],
    maxCostPerImage: env[keys.maxCostPerImage],
    dailyImageBudget: env[keys.dailyImageBudget],
    monthlyImageBudget: env[keys.monthlyImageBudget],
    allowProviders: env[keys.allowProviders],
    denyProviders: env[keys.denyProviders],
    qualityFloor: env[keys.qualityFloor],
  });
}
