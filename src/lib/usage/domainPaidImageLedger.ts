/**
 * SQLite-backed paid image budget ledger.
 *
 * Reuses the existing domain_cost_history table through domainState helpers
 * (saveCostEntry / loadCostTotal) instead of creating a second database.
 * Only aggregate USD spend is persisted; per-entry detail stays in
 * PaidImageLedgerEntry. No prompt contents and no secrets are stored.
 */

import { loadCostTotal, saveCostEntry } from "../db/domainState";
import {
  utcDayStartMs,
  utcMonthStartMs,
  type PaidImageBudgetLedger,
  type PaidImageLedgerEntry,
} from "@omniroute/open-sse/config/paidImageLedger.ts";

export const PAID_IMAGE_LEDGER_SCOPE = "paid-image";

export function createDomainStatePaidImageLedger(): PaidImageBudgetLedger {
  return {
    record(entry: PaidImageLedgerEntry) {
      const cost = entry.actualCostUsd ?? entry.estimatedCostUsd ?? 0;
      const timestamp = Date.parse(entry.timestamp);
      saveCostEntry(
        PAID_IMAGE_LEDGER_SCOPE,
        cost,
        Number.isFinite(timestamp) ? timestamp : Date.now()
      );
    },
    getDailySpendUsd(now = new Date()) {
      return loadCostTotal(PAID_IMAGE_LEDGER_SCOPE, utcDayStartMs(now));
    },
    getMonthlySpendUsd(now = new Date()) {
      return loadCostTotal(PAID_IMAGE_LEDGER_SCOPE, utcMonthStartMs(now));
    },
  };
}
