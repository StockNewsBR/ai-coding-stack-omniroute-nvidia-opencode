/**
 * FREE_ONLY image-generation routing.
 *
 * Image generation is a capability of its own: this module only ever inspects
 * `IMAGE_PROVIDERS` registry entries (plus the free-budget catalog), so a chat or
 * vision model can never be selected as an image generator. A remote provider is
 * FREE_VERIFIED only when the catalog carries an explicit hard-free budget row
 * (`hardStopGuaranteed === true`); a local self-hosted endpoint (`authType:
 * "none"`) with an active connection is SELF_HOSTED. Everything else — including
 * a remote provider that merely reports price 0 without hard-free evidence — is
 * denied, which is why `auto/image-gen:free` may legitimately answer
 * `NO_FREE_IMAGE_PROVIDER_AVAILABLE` instead of falling back to a paid generator.
 */
import { IMAGE_PROVIDERS } from "./imageRegistry.ts";
import { FREE_MODEL_BUDGETS, type FreeModelBudget } from "./freeModelCatalog.ts";
import { isSelfHostedBaseUrl } from "../services/searchFreeRouting.ts";

type ImageProviderEntry = (typeof IMAGE_PROVIDERS)[string];
import type { FreeCostClass } from "../services/autoCombo/freeProviderSentinel.ts";

export const FREE_IMAGE_ROUTE_ID = "auto/image-gen";
export const FREE_IMAGE_ROUTE_ID_FREE = "auto/image-gen:free";
export const NO_FREE_IMAGE_PROVIDER_AVAILABLE = "NO_FREE_IMAGE_PROVIDER_AVAILABLE";

export const FREE_IMAGE_ELIGIBLE_STATUSES: readonly FreeCostClass[] = [
  "FREE_VERIFIED",
  "SELF_HOSTED",
];

const HARD_FREE_BUDGET_TYPES = new Set([
  "keyless",
  "recurring-daily",
  "recurring-monthly",
  "recurring-uncapped",
]);

const CREDIT_BACKED_BUDGET_TYPES = new Set(["one-time-initial", "recurring-credit"]);

export type ImageFreeReason =
  | "SELF_HOSTED_LOCAL_IMAGE_ENDPOINT"
  | "HARD_STOP_FREE_TIER_VERIFIED"
  | "CREDIT_BACKED_IMAGE_EXCLUDED"
  | "DISCONTINUED_IMAGE_EXCLUDED"
  | "NO_HARD_FREE_IMAGE_EVIDENCE";

export interface ImageFreeVerdict {
  status: FreeCostClass;
  reason: ImageFreeReason;
}

export function isFreeImageEligibleStatus(status: FreeCostClass): boolean {
  return FREE_IMAGE_ELIGIBLE_STATUSES.includes(status);
}

export function classifyImageProviderFreeStatus(params: {
  providerId: string;
  authType?: string | null;
  baseUrl?: string | null;
  modelId: string;
  budgets?: readonly FreeModelBudget[];
  hasActiveConnection: boolean;
}): ImageFreeVerdict {
  if (
    params.authType === "none" &&
    params.hasActiveConnection &&
    isSelfHostedBaseUrl(params.baseUrl)
  ) {
    return { status: "SELF_HOSTED", reason: "SELF_HOSTED_LOCAL_IMAGE_ENDPOINT" };
  }

  const budgets = params.budgets ?? FREE_MODEL_BUDGETS;
  const row = budgets.find(
    (budget) => budget.provider === params.providerId && budget.modelId === params.modelId
  );

  if (!row) return { status: "FREE_UNKNOWN", reason: "NO_HARD_FREE_IMAGE_EVIDENCE" };
  if (CREDIT_BACKED_BUDGET_TYPES.has(row.freeType)) {
    return { status: "CREDIT_BACKED", reason: "CREDIT_BACKED_IMAGE_EXCLUDED" };
  }
  if (row.freeType === "discontinued") {
    return { status: "DISCONTINUED", reason: "DISCONTINUED_IMAGE_EXCLUDED" };
  }
  if (HARD_FREE_BUDGET_TYPES.has(row.freeType)) {
    return row.hardStopGuaranteed === true
      ? { status: "FREE_VERIFIED", reason: "HARD_STOP_FREE_TIER_VERIFIED" }
      : { status: "FREE_UNKNOWN", reason: "NO_HARD_FREE_IMAGE_EVIDENCE" };
  }
  return { status: "FREE_UNKNOWN", reason: "NO_HARD_FREE_IMAGE_EVIDENCE" };
}

export interface FreeImageSelection {
  ok: true;
  providerId: string;
  modelId: string;
  status: Extract<FreeCostClass, "FREE_VERIFIED" | "SELF_HOSTED">;
  reason: ImageFreeReason;
}

export interface FreeImageUnavailable {
  ok: false;
  code: typeof NO_FREE_IMAGE_PROVIDER_AVAILABLE;
  reason: "NO_ELIGIBLE_FREE_IMAGE_PROVIDER" | "ALL_FREE_IMAGE_PROVIDERS_CIRCUIT_OPEN";
  considered: Array<{ providerId: string; modelId: string; status: FreeCostClass }>;
}

export function resolveFreeImageProvider(deps: {
  providers?: Record<string, ImageProviderEntry>;
  budgets?: readonly FreeModelBudget[];
  hasActiveConnection: (providerId: string) => boolean;
  isCircuitOpen?: (providerId: string) => boolean;
}): FreeImageSelection | FreeImageUnavailable {
  const providers = deps.providers ?? IMAGE_PROVIDERS;
  const budgets = deps.budgets ?? FREE_MODEL_BUDGETS;
  const considered: FreeImageUnavailable["considered"] = [];
  let sawCircuitOpen = false;

  for (const [providerId, config] of Object.entries(providers)) {
    if (deps.isCircuitOpen?.(providerId)) {
      sawCircuitOpen = true;
      continue;
    }
    if (!deps.hasActiveConnection(providerId)) continue;

    const models = Array.isArray(config?.models) ? config.models : [];
    for (const model of models) {
      const modelId = typeof model === "string" ? model : model?.id;
      if (!modelId) continue;

      const verdict = classifyImageProviderFreeStatus({
        providerId,
        authType: config?.authType,
        baseUrl: config?.baseUrl,
        modelId,
        budgets,
        hasActiveConnection: true,
      });
      considered.push({ providerId, modelId, status: verdict.status });

      if (isFreeImageEligibleStatus(verdict.status)) {
        return {
          ok: true,
          providerId,
          modelId,
          status: verdict.status as FreeImageSelection["status"],
          reason: verdict.reason,
        };
      }
    }
  }

  return {
    ok: false,
    code: NO_FREE_IMAGE_PROVIDER_AVAILABLE,
    reason: sawCircuitOpen
      ? "ALL_FREE_IMAGE_PROVIDERS_CIRCUIT_OPEN"
      : "NO_ELIGIBLE_FREE_IMAGE_PROVIDER",
    considered,
  };
}
