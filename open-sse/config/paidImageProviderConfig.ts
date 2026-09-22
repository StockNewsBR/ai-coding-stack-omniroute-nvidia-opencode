/**
 * Paid image provider runtime configuration (R2) — NON-SECRET only.
 *
 * Reads the non-secret knobs an operator may set to point the paid image
 * adapters at a concrete Bedrock Stability / Meta Muse model.
 *
 * Credentials are NEVER read, stored, returned or logged here. The credential
 * env var NAMES are exported for operator instructions and for a value-free
 * presence check (`readPaidImageCredentialPresence`) that returns booleans
 * only — never the secret itself.
 *
 * This module is intentionally NOT wired into any production route. Paid image
 * fallback stays disabled unless `IMAGE_PAID_FALLBACK_ENABLED` is set
 * explicitly (see paidImagePolicyLoader.ts / paidImagePolicy.ts).
 */

export const PAID_IMAGE_PROVIDER_ENV_KEYS = {
  awsImageModelId: "AWS_IMAGE_MODEL_ID",
  awsImageRegion: "AWS_IMAGE_REGION",
  metaImageModelId: "META_IMAGE_MODEL_ID",
  metaImageBaseUrl: "META_IMAGE_BASE_URL",
} as const;

/**
 * Accepted credential env var names, in operator preference order.
 * Names only — this module never reads their VALUES except to test presence.
 */
export const PAID_IMAGE_CREDENTIAL_ENV_NAMES = {
  aws: ["AWS_BEARER_TOKEN_BEDROCK", "BEDROCK_API_KEY"],
  meta: ["MODEL_API_KEY", "META_API_KEY"],
} as const;

export interface PaidImageProviderRuntimeConfig {
  readonly aws: {
    readonly modelId?: string;
    readonly region?: string;
  };
  readonly meta: {
    readonly modelId?: string;
    readonly baseUrl?: string;
  };
}

type EnvLike = Record<string, string | undefined>;

function readString(env: EnvLike, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Loads the non-secret provider knobs. Absent keys stay undefined — no silent model default. */
export function loadPaidImageProviderRuntimeConfig(
  env: EnvLike = process.env
): PaidImageProviderRuntimeConfig {
  return {
    aws: {
      modelId: readString(env, PAID_IMAGE_PROVIDER_ENV_KEYS.awsImageModelId),
      region: readString(env, PAID_IMAGE_PROVIDER_ENV_KEYS.awsImageRegion),
    },
    meta: {
      modelId: readString(env, PAID_IMAGE_PROVIDER_ENV_KEYS.metaImageModelId),
      baseUrl: readString(env, PAID_IMAGE_PROVIDER_ENV_KEYS.metaImageBaseUrl),
    },
  };
}

export interface PaidImageCredentialPresence {
  readonly aws: boolean;
  readonly meta: boolean;
}

/**
 * Value-free credential check: reports whether a credential is PRESENT.
 * Returns booleans only so callers can print setup status without ever
 * touching the secret material.
 */
export function readPaidImageCredentialPresence(
  env: EnvLike = process.env
): PaidImageCredentialPresence {
  const has = (names: readonly string[]): boolean =>
    names.some((name) => {
      const raw = env[name];
      return typeof raw === "string" && raw.trim() !== "";
    });
  return {
    aws: has(PAID_IMAGE_CREDENTIAL_ENV_NAMES.aws),
    meta: has(PAID_IMAGE_CREDENTIAL_ENV_NAMES.meta),
  };
}
