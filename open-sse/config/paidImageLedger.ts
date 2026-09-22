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

export interface PaidImageBudgetLedger {
  record(entry: PaidImageLedgerEntry): void | Promise<void>;
  getDailySpendUsd(now?: Date): number | Promise<number>;
  getMonthlySpendUsd(now?: Date): number | Promise<number>;
}

export function utcDayStartMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function utcMonthStartMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

export interface InMemoryPaidImageLedger extends PaidImageBudgetLedger {
  readonly entries: readonly PaidImageLedgerEntry[];
}

/**
 * Deterministic offline ledger used by tests and by any pre-persistence phase.
 * Denied decisions are excluded from spend; entries with an unparsable
 * timestamp are conservatively counted in both windows.
 */
export function createInMemoryPaidImageLedger(): InMemoryPaidImageLedger {
  const entries: PaidImageLedgerEntry[] = [];
  const spendSince = (startMs: number): number =>
    entries.reduce((total, entry) => {
      if (entry.outcome === "denied") return total;
      const timestamp = Date.parse(entry.timestamp);
      if (Number.isFinite(timestamp) && timestamp < startMs) return total;
      const cost = isFiniteNumber(entry.actualCostUsd)
        ? entry.actualCostUsd
        : (entry.estimatedCostUsd ?? 0);
      return total + cost;
    }, 0);

  return {
    entries,
    record(entry) {
      entries.push(entry);
    },
    getDailySpendUsd(now = new Date()) {
      return spendSince(utcDayStartMs(now));
    },
    getMonthlySpendUsd(now = new Date()) {
      return spendSince(utcMonthStartMs(now));
    },
  };
}
