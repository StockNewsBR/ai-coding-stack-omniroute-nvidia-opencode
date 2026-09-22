/**
 * Paid image fallback deps assembly (R2).
 *
 * Builds the optional `paid` deps consumed by `resolveImageRouteSelection` from
 * non-secret environment configuration, only when the paid image policy is
 * explicitly enabled and funded. Returns `undefined` otherwise so the router
 * keeps its default-disabled (FREE_ONLY image) behavior.
 *
 * The adapter array carries NO priority: candidate ranking is owned by the
 * router and is recomputed per request from live health/quota/telemetry
 * signals. Credential values are read only to configure the adapters and are
 * never logged, returned or persisted.
 */
import type { PaidImageProviderAdapter } from "./paidImageProviderAdapter.ts";
import type { PaidImageBudgetLedger } from "./paidImageLedger.ts";
import { createInMemoryPaidImageLedger } from "./paidImageLedger.ts";
import { isPaidImagePolicyFunded, normalizePaidImagePolicy } from "./paidImagePolicy.ts";
import { loadPaidImagePolicyFromEnv } from "./paidImagePolicyLoader.ts";
import {
  PAID_IMAGE_CREDENTIAL_ENV_NAMES,
  loadPaidImageProviderRuntimeConfig,
} from "./paidImageProviderConfig.ts";
import { createAwsImageAdapter } from "./paidImageAwsAdapter.ts";
import { createMetaImageAdapter } from "./paidImageMetaAdapter.ts";
import type { ImageRouteSelectionRequest } from "./paidImageRouting.ts";

export type PaidImageRoutingDepsBundle = NonNullable<ImageRouteSelectionRequest["paid"]>;

export interface PaidImageRouteFallbackOptions {
  readonly env?: Record<string, string | undefined>;
  readonly ledger?: PaidImageBudgetLedger;
  readonly isCircuitOpen?: (providerId: string) => boolean;
  readonly priceEvidence?: unknown;
  readonly now?: () => Date;
  readonly fetcher?: typeof fetch;
}

function readFirstSecret(
  env: Record<string, string | undefined>,
  names: readonly string[]
): string {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function buildPaidImageAdapters(
  env: Record<string, string | undefined>,
  options: PaidImageRouteFallbackOptions
): PaidImageProviderAdapter[] {
  const runtime = loadPaidImageProviderRuntimeConfig(env);
  const adapters: PaidImageProviderAdapter[] = [];

  const awsApiKey = readFirstSecret(env, PAID_IMAGE_CREDENTIAL_ENV_NAMES.aws);
  if (runtime.aws.modelId !== undefined && awsApiKey !== "") {
    adapters.push(
      createAwsImageAdapter({
        modelId: runtime.aws.modelId,
        region: runtime.aws.region,
        apiKey: awsApiKey,
        priceEvidence: options.priceEvidence,
        fetcher: options.fetcher,
        now: options.now,
      })
    );
  }

  const metaApiKey = readFirstSecret(env, PAID_IMAGE_CREDENTIAL_ENV_NAMES.meta);
  if (runtime.meta.modelId !== undefined && metaApiKey !== "") {
    adapters.push(
      createMetaImageAdapter({
        modelId: runtime.meta.modelId,
        baseUrl: runtime.meta.baseUrl,
        apiKey: metaApiKey,
        priceEvidence: options.priceEvidence,
        fetcher: options.fetcher,
        now: options.now,
      })
    );
  }

  return adapters;
}

export function buildPaidImageRoutingDeps(
  options: PaidImageRouteFallbackOptions = {}
): PaidImageRoutingDepsBundle | undefined {
  const env = options.env ?? process.env;
  const policy = normalizePaidImagePolicy(loadPaidImagePolicyFromEnv(env));
  if (policy.imagePaidFallbackEnabled !== true || !isPaidImagePolicyFunded(policy)) {
    return undefined;
  }

  const adapters = buildPaidImageAdapters(env, options);
  if (adapters.length === 0) return undefined;

  return {
    policy,
    adapters,
    ledger: options.ledger ?? createInMemoryPaidImageLedger(),
    isCircuitOpen: options.isCircuitOpen,
    now: options.now?.(),
  };
}
