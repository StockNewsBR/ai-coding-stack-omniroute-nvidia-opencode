/**
 * Paid image usage / budget ledger abstraction (R0).
 *
 * Entries intentionally carry no prompt contents and no secrets: provider,
 * request id, timestamp, estimated/actual cost, fallback reason, decision
 * reason and outcome only. Daily/monthly aggregates are UTC windows.
 *
 * The budget router consumes PaidImageBudgetLedger; a SQLite-backed
 * implementation reusing the existing domain cost history ships alongside in
 * src/lib/usage/domainPaidImageLedger.ts. No second database is introduced.
 *
 * R1 adds an OPTIONAL atomic `tryReserve` so two concurrent paid image
 * requests cannot both observe the same remaining budget and overspend the
 * configured cap (CONCURRENT_BUDGET_OVERRUN=NO). The method is additive: older
 * ledgers that only implement record/getDaily/getMonthly still typecheck and
 * the router simply skips the reservation step for them.
 */

import { isFiniteNumber, type PaidImageFallbackReason } from "./paidImagePolicy.ts";

export type PaidImageLedgerOutcome = "executed" | "failed" | "denied";

export interface PaidImageLedgerEntry {
  readonly requestId: string;
  readonly providerId: string;
  readonly modelId?: string;
  readonly capability: "image-generation";
  readonly timestamp: string;
  readonly estimatedCostUsd?: number;
  readonly actualCostUsd?: number;
  readonly fallbackReason?: PaidImageFallbackReason;
  readonly decisionReason: string;
  readonly outcome: PaidImageLedgerOutcome;
}

/** Deny codes a reservation attempt may return (subset of PaidImageDenyCode). */
export type PaidImageReservationCode =
  | "MAX_COST_EXCEEDED"
  | "DAILY_BUDGET_EXCEEDED"
  | "MONTHLY_BUDGET_EXCEEDED"
  | "BUDGET_STATE_UNVERIFIED";

export interface PaidImageReservationRequest {
  readonly requestId: string;
  readonly estimatedCostUsd: number;
  readonly maxCostPerImage: number;
  readonly dailyImageBudget: number;
  readonly monthlyImageBudget: number;
  readonly now: Date;
}

export interface PaidImageReservationResult {
  readonly reserved: boolean;
  readonly code?: PaidImageReservationCode;
  readonly reason: string;
}

export interface PaidImageBudgetLedger {
  record(entry: PaidImageLedgerEntry): void | Promise<void>;
  getDailySpendUsd(now?: Date): number | Promise<number>;
  getMonthlySpendUsd(now?: Date): number | Promise<number>;
  /**
   * Optional atomic budget reservation. Implementations MUST be synchronous
   * (or otherwise atomic) with respect to other tryReserve/record calls so a
   * check-then-commit pair cannot interleave and overspend.
   */
  tryReserve?(
    request: PaidImageReservationRequest
  ): PaidImageReservationResult | Promise<PaidImageReservationResult>;
}

export function utcDayStartMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function utcMonthStartMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/**
 * Pure reservation decision shared by every ledger implementation. Uses the
 * same fail-closed ordering as evaluatePaidImageBudget: unverified state and
 * over-cost requests are rejected before any budget window is consulted.
 */
export function evaluateBudgetReservation(input: {
  readonly estimatedCostUsd: number;
  readonly maxCostPerImage: number;
  readonly dailyImageBudget: number;
  readonly monthlyImageBudget: number;
  readonly dailyCommittedUsd: number;
  readonly monthlyCommittedUsd: number;
}): PaidImageReservationResult {
  const {
    estimatedCostUsd,
    maxCostPerImage,
    dailyImageBudget,
    monthlyImageBudget,
    dailyCommittedUsd,
    monthlyCommittedUsd,
  } = input;

  if (!isFiniteNumber(estimatedCostUsd) || estimatedCostUsd < 0) {
    return {
      reserved: false,
      code: "BUDGET_STATE_UNVERIFIED",
      reason: "estimated cost is not a finite non-negative number",
    };
  }
  if (!isFiniteNumber(dailyCommittedUsd) || !isFiniteNumber(monthlyCommittedUsd)) {
    return {
      reserved: false,
      code: "BUDGET_STATE_UNVERIFIED",
      reason: "committed spend state is unverified",
    };
  }
  if (estimatedCostUsd > maxCostPerImage) {
    return {
      reserved: false,
      code: "MAX_COST_EXCEEDED",
      reason: `estimated cost ${estimatedCostUsd} exceeds maxCostPerImage ${maxCostPerImage}`,
    };
  }
  if (dailyCommittedUsd + estimatedCostUsd > dailyImageBudget) {
    return {
      reserved: false,
      code: "DAILY_BUDGET_EXCEEDED",
      reason: `daily budget would be exceeded (${dailyCommittedUsd} + ${estimatedCostUsd} > ${dailyImageBudget})`,
    };
  }
  if (monthlyCommittedUsd + estimatedCostUsd > monthlyImageBudget) {
    return {
      reserved: false,
      code: "MONTHLY_BUDGET_EXCEEDED",
      reason: `monthly budget would be exceeded (${monthlyCommittedUsd} + ${estimatedCostUsd} > ${monthlyImageBudget})`,
    };
  }
  return { reserved: true, reason: "reserved" };
}

export interface InMemoryPaidImageLedger extends PaidImageBudgetLedger {
  readonly entries: readonly PaidImageLedgerEntry[];
}

/**
 * Deterministic offline ledger used by tests and by any pre-persistence phase.
 * Denied decisions are excluded from spend; entries with an unparsable
 * timestamp are conservatively counted in both windows. Outstanding
 * reservations count toward spend so concurrent resolvers see committed
 * budget; `record()` releases the reservation for its request id (the entry
 * then carries the authoritative cost).
 */
export function createInMemoryPaidImageLedger(): InMemoryPaidImageLedger {
  const entries: PaidImageLedgerEntry[] = [];
  const reservations = new Map<string, { cost: number; timestampMs: number }>();

  const entriesSince = (startMs: number): number =>
    entries.reduce((total, entry) => {
      if (entry.outcome === "denied") return total;
      const timestamp = Date.parse(entry.timestamp);
      if (Number.isFinite(timestamp) && timestamp < startMs) return total;
      const cost = isFiniteNumber(entry.actualCostUsd)
        ? entry.actualCostUsd
        : (entry.estimatedCostUsd ?? 0);
      return total + cost;
    }, 0);

  const reservedSince = (startMs: number, excludeRequestId?: string): number => {
    let total = 0;
    for (const [requestId, reservation] of reservations) {
      if (requestId === excludeRequestId) continue;
      if (Number.isFinite(reservation.timestampMs) && reservation.timestampMs < startMs) continue;
      total += reservation.cost;
    }
    return total;
  };

  /** Committed spend (executed entries + outstanding reservations) in a window. */
  const spendSince = (startMs: number, excludeRequestId?: string): number =>
    entriesSince(startMs) + reservedSince(startMs, excludeRequestId);

  return {
    entries,
    record(entry) {
      reservations.delete(entry.requestId);
      entries.push(entry);
    },
    getDailySpendUsd(now = new Date()) {
      return spendSince(utcDayStartMs(now));
    },
    getMonthlySpendUsd(now = new Date()) {
      return spendSince(utcMonthStartMs(now));
    },
    tryReserve(request) {
      const verdict = evaluateBudgetReservation({
        estimatedCostUsd: request.estimatedCostUsd,
        maxCostPerImage: request.maxCostPerImage,
        dailyImageBudget: request.dailyImageBudget,
        monthlyImageBudget: request.monthlyImageBudget,
        dailyCommittedUsd: spendSince(utcDayStartMs(request.now), request.requestId),
        monthlyCommittedUsd: spendSince(utcMonthStartMs(request.now), request.requestId),
      });
      if (verdict.reserved) {
        reservations.set(request.requestId, {
          cost: request.estimatedCostUsd,
          timestampMs: request.now.getTime(),
        });
      }
      return verdict;
    },
  };
}
