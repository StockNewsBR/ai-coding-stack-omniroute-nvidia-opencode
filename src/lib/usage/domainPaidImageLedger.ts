/**
 * SQLite-backed paid image budget ledger.
 *
 * Reuses the existing domain_cost_history table through domainState helpers
 * (saveCostEntry / loadCostTotal) instead of creating a second database.
 * Only aggregate USD spend is persisted; per-entry detail stays in
 * PaidImageLedgerEntry. No prompt contents and no secrets are stored.
 *
 * R1 adds an atomic tryReserve: outstanding reservations are held in a
 * process-local map and added to the SQL aggregates so a concurrent request
 * sees committed budget. Every sqlite call is synchronous, so the
 * read-aggregate + write-reservation pair runs to completion in one tick and
 * cannot interleave (CONCURRENT_BUDGET_OVERRUN=NO).
 */

import { loadCostTotal, saveCostEntry } from "../db/domainState";
import {
  evaluateBudgetReservation,
  utcDayStartMs,
  utcMonthStartMs,
  type PaidImageBudgetLedger,
  type PaidImageLedgerEntry,
  type PaidImageReservationRequest,
  type PaidImageReservationResult,
} from "@omniroute/open-sse/config/paidImageLedger.ts";

export const PAID_IMAGE_LEDGER_SCOPE = "paid-image";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const reservationsById = new Map<
  string,
  { cost: number; timestampMs: number; expiresAtMs: number }
>();

function reservedSince(startMs: number, excludeRequestId?: string, nowMs = Date.now()): number {
  let total = 0;
  for (const [requestId, reservation] of reservationsById) {
    if (reservation.expiresAtMs <= nowMs) {
      reservationsById.delete(requestId);
      continue;
    }
    if (requestId === excludeRequestId) continue;
    if (Number.isFinite(reservation.timestampMs) && reservation.timestampMs < startMs) continue;
    total += reservation.cost;
  }
  return total;
}

export function createDomainStatePaidImageLedger(): PaidImageBudgetLedger {
  const dailyCommitted = (startMs: number, excludeRequestId?: string, nowMs = Date.now()): number =>
    loadCostTotal(PAID_IMAGE_LEDGER_SCOPE, startMs) +
    reservedSince(startMs, excludeRequestId, nowMs);
  const monthlyCommitted = (
    startMs: number,
    excludeRequestId?: string,
    nowMs = Date.now()
  ): number =>
    loadCostTotal(PAID_IMAGE_LEDGER_SCOPE, startMs) +
    reservedSince(startMs, excludeRequestId, nowMs);

  return {
    record(entry: PaidImageLedgerEntry) {
      const cost = entry.actualCostUsd ?? entry.estimatedCostUsd ?? 0;
      const timestamp = Date.parse(entry.timestamp);
      reservationsById.delete(entry.requestId);
      saveCostEntry(
        PAID_IMAGE_LEDGER_SCOPE,
        cost,
        Number.isFinite(timestamp) ? timestamp : Date.now()
      );
    },
    getDailySpendUsd(now = new Date()) {
      return dailyCommitted(utcDayStartMs(now));
    },
    getMonthlySpendUsd(now = new Date()) {
      return monthlyCommitted(utcMonthStartMs(now));
    },
    tryReserve(request: PaidImageReservationRequest): PaidImageReservationResult {
      const verdict = evaluateBudgetReservation({
        estimatedCostUsd: request.estimatedCostUsd,
        maxCostPerImage: request.maxCostPerImage,
        dailyImageBudget: request.dailyImageBudget,
        monthlyImageBudget: request.monthlyImageBudget,
        dailyCommittedUsd: dailyCommitted(
          utcDayStartMs(request.now),
          request.requestId,
          request.now.getTime()
        ),
        monthlyCommittedUsd: monthlyCommitted(
          utcMonthStartMs(request.now),
          request.requestId,
          request.now.getTime()
        ),
      });
      if (verdict.reserved) {
        reservationsById.set(request.requestId, {
          cost: request.estimatedCostUsd,
          timestampMs: request.now.getTime(),
          expiresAtMs: request.now.getTime() + RESERVATION_TTL_MS,
        });
      }
      return verdict;
    },
  };
}
