/**
 * Free-provider sentinel: dynamic, evidence-based cost classification for AUTO FREE routing.
 *
 * Mission context (STRICT POLICY DESIGN REVIEW):
 * - AUTO FREE must be dynamic. There is no static provider shortlist: every discovered
 *   provider/model is classified from current evidence and may join the pool when it satisfies
 *   the policy, health, capability and circuit requirements.
 * - Live quota telemetry improves selection/headroom when it is available, but its ABSENCE must
 *   not automatically exclude a route that is provably unable to spill into paid billing
 *   (self-hosted hardware, keyless hard-free endpoint, or a curated hard-stop free tier that
 *   returns 429/limit exhaustion instead of billing). That is why quota state is advisory for
 *   proof classes and authoritative only when it carries positive evidence of exhaustion.
 *
 * Policy (automatic FREE admission):
 *   ALLOW  FREE_VERIFIED  curated catalog entry with proven no-billing semantics
 *                         (keyless hard-free endpoint, or hard-stop free tier).
 *   ALLOW  SELF_HOSTED    provider runs on operator-controlled hardware; cannot bill.
 *   DENY   FREE_UNKNOWN   free-looking but no proof that exceeding the allowance is a hard stop.
 *   DENY   UNKNOWN_COST   no catalog entry and no zero-cost evidence.
 *   DENY   NULL_COST      cost metadata is null; never assumed free.
 *   DENY   PAID           known positive cost.
 *   DENY   CREDIT_BACKED  trial/one-time/recurring credits that can spill into billing.
 *   DENY   DISCONTINUED   model retired by the provider.
 *
 * This module is pure (no DB, no network). It is used by:
 *   - strictZeroCostFilter.ts — admission into auto/* pools when settings.freeAccessPolicy is "strict";
 *   - autoComboCandidates.ts  — read-only inspector projection using cached state only.
 * Explicit/pinned provider+model requests never consult this module; their semantics are unchanged.
 */

import type { FreeModelBudget } from "@omniroute/open-sse/config/freeModelCatalog.ts";
import { isLocalProvider, isSelfHostedChatProvider } from "@/shared/constants/providers";
import { SYNTHETIC_NOAUTH_CONNECTION_ID } from "./resilienceCandidateFilter";

export type FreeCostClass =
  | "FREE_VERIFIED"
  | "SELF_HOSTED"
  | "FREE_UNKNOWN"
  | "UNKNOWN_COST"
  | "NULL_COST"
  | "PAID"
  | "CREDIT_BACKED"
  | "DISCONTINUED";

/** The only cost classes AUTO FREE may select. Everything else is denied automatically. */
export const AUTO_FREE_ALLOWED_COST_CLASSES: ReadonlySet<FreeCostClass> = new Set<FreeCostClass>([
  "FREE_VERIFIED",
  "SELF_HOSTED",
]);

/** Stable machine-readable explanation codes (safe to expose in read-only diagnostics). */
export type FreeSentinelReason =
  | "SELF_HOSTED_NO_BILLING"
  | "KEYLESS_HARD_FREE_ENDPOINT"
  | "HARD_STOP_FREE_TIER_VERIFIED"
  | "NOAUTH_METADATA_CONFLICT_EXCLUDED"
  | "KEYLESS_REQUIRES_NOAUTH_CONNECTION"
  | "CREDIT_BACKED_EXCLUDED"
  | "FREE_UNKNOWN_NO_HARD_STOP_PROOF"
  | "NULL_COST_EXCLUDED"
  | "UNKNOWN_COST_EXCLUDED"
  | "PAID_COST_EXCLUDED"
  | "DISCONTINUED_EXCLUDED"
  | "QUOTA_EXHAUSTED"
  | "NO_SAFE_CONNECTION";

export interface FreeCostCandidate {
  provider: string;
  model: string;
  connectionId?: string | null;
  allowedConnectionIds?: string[];
  costPer1MTokens?: number | null;
}

/** Structural subset of FreeAccessState (kept local to avoid a circular import). */
export interface FreeQuotaReading {
  status: "SAFE" | "EXHAUSTED" | "UNKNOWN";
  remainingFreeAllowance: number | null;
  resetAt?: string | null;
  checkedAt: string;
}

export type FreeQuotaStatus = "SAFE" | "EXHAUSTED" | "UNKNOWN" | "ABSENT";

export interface FreeCostVerdict {
  costClass: FreeCostClass;
  autoFreeAllowed: boolean;
  /** True when the class is proven unable to spill into paid billing. */
  hardStopProven: boolean;
  /** True when a live quota/headroom reading can refine selection (but not gate it). */
  telemetryAdvisory: boolean;
  reason: FreeSentinelReason;
}

export interface FreeSentinelFacts extends FreeCostVerdict {
  quotaStatus: FreeQuotaStatus;
  quotaRemaining: number | null;
  /** Connections this candidate may be dispatched on; empty means the candidate is not eligible. */
  safeConnectionIds: string[];
}

export interface FreeSentinelContext {
  /** Explicit catalog entry (the strict filter resolves it and passes it through). */
  entry?: FreeModelBudget | null;
  /** Catalog to resolve the entry from when `entry` is not provided. */
  catalog?: readonly FreeModelBudget[];
  /** Synchronous, cache-only free-access reader. Never triggers a provider request. */
  resolveFreeAccessState?: (provider: string, connectionId: string) => FreeQuotaReading | undefined;
  minRemainingAllowance?: number;
  maxStateAgeMs?: number;
  now?: () => number;
}

interface VerdictFlags {
  hardStopProven: boolean;
  telemetryAdvisory: boolean;
  reason: FreeSentinelReason;
}

function allow(costClass: FreeCostClass, flags: VerdictFlags): FreeCostVerdict {
  return {
    costClass,
    autoFreeAllowed: true,
    hardStopProven: flags.hardStopProven,
    telemetryAdvisory: flags.telemetryAdvisory,
    reason: flags.reason,
  };
}

function deny(costClass: FreeCostClass, reason: FreeSentinelReason): FreeCostVerdict {
  return {
    costClass,
    autoFreeAllowed: false,
    hardStopProven: false,
    telemetryAdvisory: false,
    reason,
  };
}

const HARD_STOP_FREE_TYPES = new Set<FreeModelBudget["freeType"]>([
  "recurring-daily",
  "recurring-monthly",
  "recurring-uncapped",
]);

/** Credits, trials and one-time balances can spill into billing — never auto-selected. */
const CREDIT_BACKED_FREE_TYPES = new Set<FreeModelBudget["freeType"]>([
  "one-time-initial",
  "recurring-credit",
]);

/**
 * Self-hosted signal: the provider executes on hardware the operator controls, so no request can
 * ever generate provider billing. This reads the native self-hosted/local provider constants; it is
 * a capability class, not a free-provider allowlist. Generic `*-compatible-*` endpoints are
 * deliberately NOT included: a user-defined endpoint may front a paid remote service, so those
 * models stay UNKNOWN_COST until a catalog entry proves otherwise.
 */
export function isSelfHostedFreeProvider(providerId: string): boolean {
  return isSelfHostedChatProvider(providerId) || isLocalProvider(providerId);
}

export function findFreeCatalogEntry(
  candidate: Pick<FreeCostCandidate, "provider" | "model">,
  catalog: readonly FreeModelBudget[] | undefined
): FreeModelBudget | undefined {
  if (!catalog) return undefined;
  return catalog.find(
    (item) => item.provider === candidate.provider && item.modelId === candidate.model
  );
}

/**
 * Pure cost classification from catalog/credential evidence. No provider is classified as free by
 * name, and no quota reading is consulted here (see evaluateFreeSentinel for the quota dimension).
 */
export function classifyFreeCost(
  candidate: FreeCostCandidate,
  entry?: FreeModelBudget
): FreeCostVerdict {
  if (isSelfHostedFreeProvider(candidate.provider)) {
    return allow("SELF_HOSTED", {
      hardStopProven: true,
      telemetryAdvisory: false,
      reason: "SELF_HOSTED_NO_BILLING",
    });
  }

  if (entry) {
    const freeType = entry.freeType;

    if (candidate.connectionId === SYNTHETIC_NOAUTH_CONNECTION_ID && freeType !== "keyless") {
      // A credential-less candidate pointing at a credential-backed catalog entry is contradictory
      // metadata. Fail closed instead of trusting either side.
      return deny("FREE_UNKNOWN", "NOAUTH_METADATA_CONFLICT_EXCLUDED");
    }

    if (freeType === "discontinued") {
      return deny("DISCONTINUED", "DISCONTINUED_EXCLUDED");
    }

    if (freeType === "keyless") {
      // The endpoint itself needs no credential, so it cannot bill. The shortcut is only valid on
      // the genuine no-auth path: a real DB connection holding a credential must not inherit
      // keyless semantics (connection-safety invariant #1).
      if (candidate.connectionId === SYNTHETIC_NOAUTH_CONNECTION_ID) {
        return allow("FREE_VERIFIED", {
          hardStopProven: true,
          telemetryAdvisory: false,
          reason: "KEYLESS_HARD_FREE_ENDPOINT",
        });
      }
      return deny("FREE_UNKNOWN", "KEYLESS_REQUIRES_NOAUTH_CONNECTION");
    }

    if (CREDIT_BACKED_FREE_TYPES.has(freeType)) {
      return deny("CREDIT_BACKED", "CREDIT_BACKED_EXCLUDED");
    }

    if (HARD_STOP_FREE_TYPES.has(freeType)) {
      if (entry.hardStopGuaranteed === true) {
        return allow("FREE_VERIFIED", {
          hardStopProven: true,
          telemetryAdvisory: true,
          reason: "HARD_STOP_FREE_TIER_VERIFIED",
        });
      }
      return deny("FREE_UNKNOWN", "FREE_UNKNOWN_NO_HARD_STOP_PROOF");
    }

    return deny("FREE_UNKNOWN", "FREE_UNKNOWN_NO_HARD_STOP_PROOF");
  }

  const cost = candidate.costPer1MTokens;
  if (cost === null) return deny("NULL_COST", "NULL_COST_EXCLUDED");
  if (typeof cost === "number" && Number.isFinite(cost) && cost > 0) {
    return deny("PAID", "PAID_COST_EXCLUDED");
  }
  // An uncatalogued zero price is not evidence of a hard-free endpoint.
  return deny("UNKNOWN_COST", "UNKNOWN_COST_EXCLUDED");
}

function collectConnectionIds(candidate: FreeCostCandidate): string[] {
  if (typeof candidate.connectionId === "string" && candidate.connectionId.length > 0) {
    return [candidate.connectionId];
  }
  const allowed = candidate.allowedConnectionIds;
  if (Array.isArray(allowed) && allowed.length > 0) return [...allowed];
  return [];
}

function isUsableSafeReading(
  reading: FreeQuotaReading,
  now: () => number,
  maxAgeMs: number
): boolean {
  if (reading.status !== "SAFE") return false;
  if (reading.remainingFreeAllowance === null) return false;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return false;
  const checkedAtMs = Date.parse(reading.checkedAt);
  if (!Number.isFinite(checkedAtMs)) return false;
  return now() - checkedAtMs <= maxAgeMs;
}

/**
 * Full eligibility projection: cost class + per-connection safety.
 *
 * Quota semantics for proof classes (FREE_VERIFIED via hard stop):
 *   - a fresh SAFE reading with headroom above the margin keeps the connection and reports headroom;
 *   - a reading that positively reports EXHAUSTED, or a fresh SAFE reading without headroom, drops
 *     the connection (negative evidence must never be dispatched);
 *   - an ABSENT, stale or UNKNOWN reading does not exclude the connection, because the hard stop
 *     itself prevents billing (worst case the provider returns 429 and the existing resilience
 *     layer cools the connection down).
 * SELF_HOSTED and keyless candidates never resolve quota state at all.
 */
export function evaluateFreeSentinel(
  candidate: FreeCostCandidate,
  context: FreeSentinelContext = {}
): FreeSentinelFacts {
  const entry =
    context.entry === undefined
      ? findFreeCatalogEntry(candidate, context.catalog)
      : (context.entry ?? undefined);
  const verdict = classifyFreeCost(candidate, entry);

  const facts: FreeSentinelFacts = {
    ...verdict,
    quotaStatus: "ABSENT",
    quotaRemaining: null,
    safeConnectionIds: [],
  };

  if (!verdict.autoFreeAllowed) return facts;

  const connectionIds = collectConnectionIds(candidate);
  if (connectionIds.length === 0) return facts;

  if (verdict.costClass === "SELF_HOSTED" || verdict.reason === "KEYLESS_HARD_FREE_ENDPOINT") {
    return { ...facts, safeConnectionIds: [...connectionIds] };
  }

  const resolve = context.resolveFreeAccessState;
  const minRemaining =
    typeof context.minRemainingAllowance === "number" ? context.minRemainingAllowance : 0;
  const maxAgeMs = typeof context.maxStateAgeMs === "number" ? context.maxStateAgeMs : 0;
  const now = context.now ?? (() => Date.now());

  const safeConnectionIds: string[] = [];
  let bestStatus: FreeQuotaStatus = "ABSENT";
  let bestRemaining: number | null = null;
  let exhaustedRemaining: number | null = null;

  for (const connectionId of connectionIds) {
    const reading = resolve ? resolve(candidate.provider, connectionId) : undefined;

    if (!reading) {
      // Telemetry absent: advisory only for a provably hard-free route.
      if (bestStatus !== "SAFE") bestStatus = "UNKNOWN";
      safeConnectionIds.push(connectionId);
      continue;
    }

    if (reading.status === "EXHAUSTED") {
      exhaustedRemaining = reading.remainingFreeAllowance;
      continue;
    }

    if (!isUsableSafeReading(reading, now, maxAgeMs)) {
      if (bestStatus !== "SAFE") bestStatus = "UNKNOWN";
      safeConnectionIds.push(connectionId);
      continue;
    }

    const remaining = reading.remainingFreeAllowance as number;
    if (minRemaining < 0 || remaining > minRemaining) {
      bestStatus = "SAFE";
      bestRemaining = remaining;
      safeConnectionIds.push(connectionId);
    }
  }

  if (safeConnectionIds.length === 0) {
    return {
      ...facts,
      quotaStatus: exhaustedRemaining === null ? "ABSENT" : "EXHAUSTED",
      quotaRemaining: exhaustedRemaining,
      reason: exhaustedRemaining === null ? "NO_SAFE_CONNECTION" : "QUOTA_EXHAUSTED",
    };
  }

  return {
    ...facts,
    quotaStatus: bestStatus,
    quotaRemaining: bestRemaining,
    safeConnectionIds,
  };
}
