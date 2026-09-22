/**
 * R2 canary spend guard — PRE-FLIGHT ONLY. Makes no network calls and no paid
 * API calls. It answers one question before the R2 retry mission is allowed to
 * fire: "would this canary stay inside the hard budget ceiling?"
 *
 * Mirrors canary/r1-1/spend-guard.ts. Differences:
 *  - targets are read from the price-evidence file (provider + model are data,
 *    not constants baked into the guard);
 *  - fail-closed is asserted for missing price, stale price, and unknown total.
 *
 * Run: node --import tsx/esm canary/r2/spend-guard.ts
 */
import { readFileSync } from "node:fs";
import { buildPaidImageQuote } from "../../open-sse/config/paidImagePriceEvidence.ts";

interface PriceEvidenceFile {
  readonly generatedAt: string;
  readonly ceilingUsd: number;
  readonly maxImagesPerProvider: number;
  readonly evidence: readonly unknown[];
  readonly verificationAttempts: readonly {
    readonly providerId: string;
    readonly modelId: string;
  }[];
}

const file = JSON.parse(
  readFileSync(new URL("./price-evidence.json", import.meta.url), "utf8")
) as PriceEvidenceFile;

const now = new Date(file.generatedAt);
const ceiling = file.ceilingUsd;
const n = file.maxImagesPerProvider;
const TARGETS = file.verificationAttempts.map((entry) => ({
  providerId: entry.providerId,
  modelId: entry.modelId,
}));

function evaluate(evidence: readonly unknown[]) {
  const rows = TARGETS.map((target) => {
    const quote = buildPaidImageQuote({
      providerId: target.providerId,
      request: {
        capability: "image-generation",
        requestId: "canary-r2",
        modelId: target.modelId,
        n,
      },
      evidence,
      now,
    });
    return {
      providerId: target.providerId,
      modelId: target.modelId,
      quoteState: quote ? "PRICED" : "COST_QUOTE_UNAVAILABLE",
      expectedMaxCostUsd: quote ? quote.estimatedCostUsd : 0,
    };
  });
  const priced = rows.filter((row) => row.quoteState === "PRICED").length;
  const expectedTotal = rows.reduce((sum, row) => sum + row.expectedMaxCostUsd, 0);
  const withinCeiling = expectedTotal <= ceiling;
  return {
    rows,
    expectedTotal,
    withinCeiling,
    decision:
      priced === rows.length && withinCeiling ? "ALLOW_ONE_IMAGE_PER_PROVIDER" : "BLOCK",
  };
}

function synthetic(
  unitPrice: number,
  providerId: string,
  modelId: string,
  overrides: Record<string, unknown> = {}
) {
  return { providerId, modelId, currency: "USD", unit: "image", unitPrice, verifiedAt: file.generatedAt, ...overrides };
}

const live = evaluate(file.evidence);
console.log(`CANARY_SPEND_GUARD ${JSON.stringify({ ceilingUsd: ceiling, maxImagesPerProvider: n, ...live })}`);

// Fail-closed assertions. Each one must hold or the guard exits non-zero.
const checks = [
  {
    name: "missing/stale official price must BLOCK",
    ok: live.decision === "BLOCK",
  },
  {
    name: "total above ceiling must BLOCK",
    ok:
      evaluate(TARGETS.flatMap((t) => [synthetic(0.06, t.providerId, t.modelId)])).decision ===
      "BLOCK",
  },
  {
    name: "total at ceiling must ALLOW",
    ok: (() => {
      const atCeiling = evaluate(
        TARGETS.flatMap((t) => [synthetic(ceiling / TARGETS.length, t.providerId, t.modelId)])
      );
      return atCeiling.decision === "ALLOW_ONE_IMAGE_PER_PROVIDER" && atCeiling.expectedTotal === ceiling;
    })(),
  },
  {
    name: "one unpriced provider must BLOCK even when the other is cheap",
    ok: (() => {
      const partial = evaluate([synthetic(0.001, TARGETS[0].providerId, TARGETS[0].modelId)]);
      return partial.decision === "BLOCK";
    })(),
  },
  {
    name: "stale price evidence must BLOCK",
    ok: (() => {
      const stale = evaluate(
        TARGETS.flatMap((t) => [
          synthetic(0.001, t.providerId, t.modelId, {
            verifiedAt: "2026-01-01T00:00:00.000Z",
            maxAgeMs: 1000,
          }),
        ])
      );
      return stale.decision === "BLOCK";
    })(),
  },
];

let failed = 0;
for (const check of checks) {
  if (!check.ok) failed += 1;
  console.log(`${check.ok ? "ok" : "FAIL"} - ${check.name}`);
}

console.log(`CANARY_SPEND_GUARD_CHECKS=${checks.length - failed}/${checks.length}`);
if (failed > 0) process.exit(1);
