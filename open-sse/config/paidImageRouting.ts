/**
 * Paid image fallback router (R0, disabled by default).
 *
 * Flow: free image pool -> only when no acceptable free route exists AND policy
 * enables paid fallback -> paid candidates pass configured / available /
 * circuit / health / quota / live-quote / quality-floor / budget gates ->
 * cheapest acceptable provider wins.
 *
 * The router owns no health, breaker or quota engine: callers inject the native
 * OmniRoute circuit predicate and adapters report native health/quota state.
 * No provider names and no cost constants live here.
 */

import {
  NO_FREE_IMAGE_PROVIDER_AVAILABLE,
  type FreeImageSelection,
  type FreeImageUnavailable,
} from "./freeImageRouting.ts";
import {
  DEFAULT_PAID_IMAGE_POLICY,
  evaluatePaidImageBudget,
  isFiniteNumber,
  isPaidImagePolicyFunded,
  isPaidImageProviderAllowed,
  normalizePaidImagePolicy,
  type PaidImageDenyCode,
  type PaidImageFallbackReason,
} from "./paidImagePolicy.ts";
import type {
  PaidImageGenerationRequest,
  PaidImageProviderAdapter,
  PaidImageProviderHealth,
  PaidImageProviderTelemetry,
  PaidImageRequestCapability,
} from "./paidImageProviderAdapter.ts";
import type { PaidImageBudgetLedger, PaidImageLedgerEntry } from "./paidImageLedger.ts";

export interface PaidImageCandidateRejection {
  readonly providerId: string;
  readonly code: PaidImageDenyCode;
  readonly reason: string;
  readonly estimatedCostUsd?: number;
}

export interface PaidImageRankingSignals {
  readonly providerId: string;
  readonly health: PaidImageProviderHealth;
  readonly rateLimited: boolean;
  readonly recentFailures: number;
  readonly latencyMs?: number;
  readonly qualityScore?: number;
  readonly estimatedCostUsd: number;
}

const HEALTH_RANK: Record<PaidImageProviderHealth, number> = {
  healthy: 0,
  degraded: 1,
  unhealthy: 2,
  unknown: 3,
};

function latencyRank(value: number | undefined): number {
  return isFiniteNumber(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}

function qualityRank(value: number | undefined): number {
  return isFiniteNumber(value) ? value : Number.NEGATIVE_INFINITY;
}

/**
 * Health, then rate limiting, then recent failures, then latency, then quality,
 * then cost, then providerId. Cost stays the decider when every other signal ties.
 */
function compareRankingSignals(left: PaidImageRankingSignals, right: PaidImageRankingSignals): number {
  return (
    HEALTH_RANK[left.health] - HEALTH_RANK[right.health] ||
    Number(left.rateLimited) - Number(right.rateLimited) ||
    left.recentFailures - right.recentFailures ||
    latencyRank(left.latencyMs) - latencyRank(right.latencyMs) ||
    qualityRank(right.qualityScore) - qualityRank(left.qualityScore) ||
    left.estimatedCostUsd - right.estimatedCostUsd ||
    left.providerId.localeCompare(right.providerId)
  );
}

export interface PaidImageSelection {
  readonly ok: true;
  readonly providerId: string;
  readonly modelId?: string;
  readonly adapter: PaidImageProviderAdapter;
  readonly estimatedCostUsd: number;
  readonly qualityScore?: number;
  readonly rank?: PaidImageRankingSignals;
  readonly considered?: readonly PaidImageCandidateRejection[];
}

export interface PaidImageUnavailable {
  readonly ok: false;
  readonly code: PaidImageDenyCode;
  readonly reason: string;
  readonly fallbackReason: PaidImageFallbackReason;
  readonly considered: readonly PaidImageCandidateRejection[];
}

export interface PaidImageRoutingDeps {
  readonly capability: PaidImageRequestCapability;
  readonly requestId?: string;
  readonly modelId?: string;
  readonly prompt?: string;
  readonly n?: number;
  readonly policy?: unknown;
  readonly adapters?: readonly PaidImageProviderAdapter[];
  readonly ledger?: PaidImageBudgetLedger;
  readonly isCircuitOpen?: (providerId: string) => boolean;
  readonly excludeProviderIds?: readonly string[];
  readonly now?: Date;
  readonly fallbackReason?: PaidImageFallbackReason;
}

function buildImageRequest(deps: PaidImageRoutingDeps): PaidImageGenerationRequest {
  return {
    capability: "image-generation",
    requestId: deps.requestId ?? "unassigned",
    modelId: deps.modelId,
    prompt: deps.prompt,
    n: deps.n,
  };
}

/**
 * Evaluate paid image providers for an image-generation request.
 * Resolution is never execution: generateImage() is not called here.
 */
export async function resolvePaidImageProvider(
  deps: PaidImageRoutingDeps
): Promise<PaidImageSelection | PaidImageUnavailable> {
  const fallbackReason = deps.fallbackReason ?? "NO_FREE_IMAGE_PROVIDER_AVAILABLE";
  const denied = (
    code: PaidImageDenyCode,
    reason: string,
    considered: PaidImageCandidateRejection[] = []
  ): PaidImageUnavailable => ({ ok: false, code, reason, fallbackReason, considered });

  if (deps.capability !== "image-generation") {
    return denied(
      "CAPABILITY_NOT_IMAGE_GENERATION",
      `paid image provider router refuses capability ${deps.capability}`
    );
  }

  const policy = normalizePaidImagePolicy(deps.policy);
  if (policy.imagePaidFallbackEnabled !== true) {
    return denied("POLICY_DISABLED", "paid image fallback is disabled by policy");
  }
  if (!isPaidImagePolicyFunded(policy)) {
    return denied(
      "BUDGET_CONFIG_MISSING",
      "paid image budgets are not fully configured; paid execution fails closed"
    );
  }

  const adapters = deps.adapters ?? [];
  if (adapters.length === 0) {
    return denied("NO_ACCEPTABLE_PAID_PROVIDER", "no paid image provider adapters are registered");
  }

  const request = buildImageRequest(deps);
  const now = deps.now ?? new Date();
  const considered: PaidImageCandidateRejection[] = [];
  const acceptable: PaidImageSelection[] = [];

  for (const adapter of adapters) {
    const providerId = adapter.providerId;
    const reject = (code: PaidImageDenyCode, reason: string, estimatedCostUsd?: number): void => {
      considered.push({ providerId, code, reason, estimatedCostUsd });
    };

    const allowed = isPaidImageProviderAllowed(policy, providerId);
    if (!allowed.allowed) {
      reject(allowed.code ?? "PROVIDER_NOT_ALLOWED", allowed.reason);
      continue;
    }
    if (deps.excludeProviderIds?.includes(providerId) === true) {
      reject("PROVIDER_DENIED", `paid image provider ${providerId} is excluded for this request`);
      continue;
    }
    if (!(await adapter.capabilities()).includes("image-generation")) {
      reject(
        "CAPABILITY_NOT_IMAGE_GENERATION",
        `adapter ${providerId} does not declare image-generation`
      );
      continue;
    }
    if ((await adapter.isConfigured()) !== true) {
      reject("PROVIDER_NOT_CONFIGURED", `paid image provider ${providerId} is not configured`);
      continue;
    }
    if ((await adapter.isAvailable()) !== true) {
      reject("PROVIDER_UNAVAILABLE", `paid image provider ${providerId} is unavailable`);
      continue;
    }
    if (deps.isCircuitOpen?.(providerId) === true) {
      reject("CIRCUIT_OPEN", `native circuit breaker is open for ${providerId}`);
      continue;
    }
    const health = await adapter.healthStatus();
    if (health !== "healthy" && health !== "degraded") {
      reject("PROVIDER_UNHEALTHY", `paid image provider ${providerId} health is ${health}`);
      continue;
    }
    const telemetry: PaidImageProviderTelemetry = (await adapter.telemetry?.()) ?? {};
    const quota = await adapter.quotaState();
    if (quota.status !== "available") {
      reject(
        quota.status === "exhausted" ? "QUOTA_EXHAUSTED" : "QUOTA_UNKNOWN",
        `paid image provider ${providerId} quota is ${quota.status}`
      );
      continue;
    }

    let quote: Awaited<ReturnType<PaidImageProviderAdapter["quoteCost"]>>;
    try {
      quote = await adapter.quoteCost(request);
    } catch {
      reject("COST_QUOTE_UNAVAILABLE", `paid image provider ${providerId} failed to quote cost`);
      continue;
    }
    const estimatedCostUsd = quote?.estimatedCostUsd;
    if (
      quote === null ||
      quote === undefined ||
      !isFiniteNumber(estimatedCostUsd) ||
      estimatedCostUsd < 0
    ) {
      reject(
        "COST_QUOTE_UNAVAILABLE",
        `paid image provider ${providerId} returned no usable cost quote`
      );
      continue;
    }

    const effectiveQualityScore = isFiniteNumber(telemetry.qualityScore)
      ? telemetry.qualityScore
      : quote.qualityScore;

    const qualityFloor = policy.qualityFloor;
    if (qualityFloor !== undefined) {
      const qualityScore = effectiveQualityScore;
      if (!isFiniteNumber(qualityScore)) {
        reject(
          "QUALITY_FLOOR_UNVERIFIED",
          `paid image provider ${providerId} exposes no quality telemetry`,
          estimatedCostUsd
        );
        continue;
      }
      if (qualityScore < qualityFloor) {
        reject(
          "QUALITY_BELOW_FLOOR",
          `paid image provider ${providerId} quality ${qualityScore} is below floor ${qualityFloor}`,
          estimatedCostUsd
        );
        continue;
      }
    }

    const dailySpendUsd = deps.ledger ? await deps.ledger.getDailySpendUsd(now) : Number.NaN;
    const monthlySpendUsd = deps.ledger ? await deps.ledger.getMonthlySpendUsd(now) : Number.NaN;
    const budget = evaluatePaidImageBudget(policy, {
      estimatedCostUsd,
      dailySpendUsd,
      monthlySpendUsd,
    });
    if (budget.decision !== "allow") {
      reject(budget.code ?? "BUDGET_STATE_UNVERIFIED", budget.reason, estimatedCostUsd);
      continue;
    }

    acceptable.push({
      ok: true,
      providerId,
      modelId: deps.modelId,
      adapter,
      estimatedCostUsd,
      qualityScore: effectiveQualityScore,
      rank: {
        providerId,
        health,
        rateLimited: telemetry.rateLimited === true,
        recentFailures:
          isFiniteNumber(telemetry.recentFailures) && telemetry.recentFailures > 0
            ? telemetry.recentFailures
            : 0,
        latencyMs: isFiniteNumber(telemetry.latencyMs) ? telemetry.latencyMs : undefined,
        qualityScore: effectiveQualityScore,
        estimatedCostUsd,
      },
      considered: [...considered],
    });
  }

  if (acceptable.length === 0) {
    if (considered.length === 1) {
      const only = considered[0];
      return denied(only.code, only.reason, considered);
    }
    return denied("NO_ACCEPTABLE_PAID_PROVIDER", "no acceptable paid image provider", considered);
  }

  const ranked = [...acceptable].sort((left, right) => {
    const leftRank = left.rank;
    const rightRank = right.rank;
    if (!leftRank || !rightRank) {
      return left.providerId.localeCompare(right.providerId);
    }
    return compareRankingSignals(leftRank, rightRank);
  });
  const selected = ranked[0];
  return { ...selected, considered: [...considered] };
}

export type PaidImageExecutionCode = PaidImageDenyCode | "PAID_IMAGE_EXECUTION_FAILED";

export interface PaidImageExecutionResult {
  readonly ok: boolean;
  readonly code?: PaidImageExecutionCode;
  readonly reason: string;
  readonly providerId?: string;
  readonly estimatedCostUsd?: number;
  readonly actualCostUsd?: number;
  readonly imageUrls?: readonly string[];
  readonly latencyMs?: number;
}

export interface PaidImageExecutionDeps {
  readonly capability: PaidImageRequestCapability;
  readonly requestId: string;
  readonly modelId?: string;
  readonly prompt?: string;
  readonly n?: number;
  readonly policy?: unknown;
  readonly selection: PaidImageSelection;
  readonly ledger?: PaidImageBudgetLedger;
  readonly fallbackReason?: PaidImageFallbackReason;
  readonly now?: Date;
}

/**
 * Execute a previously resolved paid image selection. Re-checks the capability
 * wall and the policy gate, so a paid provider can never execute while fallback
 * is disabled, budget config is absent, or the capability is not image-generation.
 */
export async function executePaidImageProvider(
  deps: PaidImageExecutionDeps
): Promise<PaidImageExecutionResult> {
  const providerId = deps.selection.providerId;
  if (deps.capability !== "image-generation") {
    return {
      ok: false,
      code: "CAPABILITY_NOT_IMAGE_GENERATION",
      reason: `paid image provider router refuses capability ${deps.capability}`,
      providerId,
    };
  }
  const policy = normalizePaidImagePolicy(deps.policy);
  if (policy.imagePaidFallbackEnabled !== true) {
    return {
      ok: false,
      code: "POLICY_DISABLED",
      reason: "paid image fallback is disabled by policy",
      providerId,
    };
  }
  if (!isPaidImagePolicyFunded(policy)) {
    return {
      ok: false,
      code: "BUDGET_CONFIG_MISSING",
      reason: "paid image budgets are not fully configured; paid execution fails closed",
      providerId,
    };
  }

  const adapter = deps.selection.adapter;
  const request = buildImageRequest({ ...deps, requestId: deps.requestId });
  const fallbackReason = deps.fallbackReason ?? "NO_FREE_IMAGE_PROVIDER_AVAILABLE";
  const estimatedCostUsd = deps.selection.estimatedCostUsd;
  const timestamp = (deps.now ?? new Date()).toISOString();

  // Phase 11: reserve atomically before spending so concurrent requests cannot overspend the cap.
  if (deps.ledger?.tryReserve) {
    const reservation = await deps.ledger.tryReserve({
      requestId: deps.requestId,
      estimatedCostUsd,
      maxCostPerImage: policy.maxCostPerImage as number,
      dailyImageBudget: policy.dailyImageBudget as number,
      monthlyImageBudget: policy.monthlyImageBudget as number,
      now: deps.now ?? new Date(),
    });
    if (!reservation.reserved) {
      await deps.ledger.record({
        requestId: deps.requestId,
        providerId: adapter.providerId,
        modelId: deps.modelId,
        capability: "image-generation",
        timestamp,
        estimatedCostUsd,
        fallbackReason,
        decisionReason: reservation.reason,
        outcome: "denied",
      });
      return {
        ok: false,
        code: reservation.code ?? "DAILY_BUDGET_EXCEEDED",
        reason: reservation.reason,
        providerId,
      };
    }
  }

  const recordLedger = async (entry: PaidImageLedgerEntry): Promise<void> => {
    if (deps.ledger) await deps.ledger.record(entry);
  };

  try {
    const result = await adapter.generateImage(request);
    await adapter.reportUsage?.(result);
    await recordLedger({
      requestId: deps.requestId,
      providerId: adapter.providerId,
      modelId: result.modelId ?? deps.modelId,
      capability: "image-generation",
      timestamp,
      estimatedCostUsd,
      actualCostUsd: isFiniteNumber(result.actualCostUsd) ? result.actualCostUsd : undefined,
      fallbackReason,
      decisionReason: result.ok
        ? "PAID_IMAGE_EXECUTED"
        : (result.error ?? "PAID_IMAGE_GENERATION_FAILED"),
      outcome: result.ok ? "executed" : "failed",
    });
    return {
      ok: result.ok,
      code: result.ok ? undefined : "PAID_IMAGE_EXECUTION_FAILED",
      reason: result.ok ? "paid image executed" : (result.error ?? "paid image generation failed"),
      providerId: adapter.providerId,
      estimatedCostUsd,
      actualCostUsd: result.actualCostUsd,
      imageUrls: result.imageUrls,
      latencyMs: result.latencyMs,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "paid image generation threw";
    await recordLedger({
      requestId: deps.requestId,
      providerId: adapter.providerId,
      modelId: deps.modelId,
      capability: "image-generation",
      timestamp,
      estimatedCostUsd,
      fallbackReason,
      decisionReason: reason,
      outcome: "failed",
    });
    return {
      ok: false,
      code: "PAID_IMAGE_EXECUTION_FAILED",
      reason,
      providerId: adapter.providerId,
    };
  }
}

export interface ImageRouteSelectionRequest {
  readonly capability: PaidImageRequestCapability;
  readonly requestId?: string;
  readonly modelId?: string;
  readonly prompt?: string;
  readonly n?: number;
  readonly free: FreeImageSelection | FreeImageUnavailable;
  readonly paid?: {
    readonly policy?: unknown;
    readonly adapters?: readonly PaidImageProviderAdapter[];
    readonly ledger?: PaidImageBudgetLedger;
    readonly isCircuitOpen?: (providerId: string) => boolean;
    readonly now?: Date;
    readonly fallbackReason?: PaidImageFallbackReason;
  };
}

export interface ImageRouteSelection {
  readonly ok: true;
  readonly via: "free" | "paid";
  readonly providerId: string;
  readonly modelId?: string;
  readonly estimatedCostUsd?: number;
  readonly free?: FreeImageSelection;
  readonly paid?: PaidImageSelection;
}

export interface ImageRouteUnavailable {
  readonly ok: false;
  readonly code: typeof NO_FREE_IMAGE_PROVIDER_AVAILABLE;
  readonly reason: string;
  readonly free: FreeImageUnavailable;
  readonly paidFallback: {
    readonly evaluated: boolean;
    readonly code?: PaidImageDenyCode;
    readonly reason?: string;
    readonly fallbackReason?: PaidImageFallbackReason;
    readonly considered?: readonly PaidImageCandidateRejection[];
  };
}

function fallbackReasonForFreeFailure(
  reason: FreeImageUnavailable["reason"]
): PaidImageFallbackReason {
  return reason === "ALL_FREE_IMAGE_PROVIDERS_CIRCUIT_OPEN"
    ? "FREE_IMAGE_CIRCUIT_OPEN"
    : "NO_FREE_IMAGE_PROVIDER_AVAILABLE";
}

/**
 * Free-first image route selection. The paid router is consulted only when the
 * free pool returned no eligible provider; with the default policy the result
 * stays a controlled NO_FREE_IMAGE_PROVIDER_AVAILABLE.
 */
export async function resolveImageRouteSelection(
  request: ImageRouteSelectionRequest
): Promise<ImageRouteSelection | ImageRouteUnavailable> {
  if (request.free.ok) {
    return {
      ok: true,
      via: "free",
      providerId: request.free.providerId,
      modelId: request.free.modelId,
      free: request.free,
    };
  }

  const fallbackReason =
    request.paid?.fallbackReason ?? fallbackReasonForFreeFailure(request.free.reason);
  const paid = await resolvePaidImageProvider({
    capability: request.capability,
    requestId: request.requestId,
    modelId: request.modelId,
    prompt: request.prompt,
    n: request.n,
    policy: request.paid?.policy ?? DEFAULT_PAID_IMAGE_POLICY,
    adapters: request.paid?.adapters,
    ledger: request.paid?.ledger,
    isCircuitOpen: request.paid?.isCircuitOpen,
    now: request.paid?.now,
    fallbackReason,
  });

  if (paid.ok) {
    return {
      ok: true,
      via: "paid",
      providerId: paid.providerId,
      modelId: paid.modelId,
      estimatedCostUsd: paid.estimatedCostUsd,
      paid,
    };
  }

  return {
    ok: false,
    code: NO_FREE_IMAGE_PROVIDER_AVAILABLE,
    reason: paid.reason,
    free: request.free,
    paidFallback: {
      evaluated: true,
      code: paid.code,
      reason: paid.reason,
      fallbackReason,
      considered: paid.considered,
    },
  };
}
