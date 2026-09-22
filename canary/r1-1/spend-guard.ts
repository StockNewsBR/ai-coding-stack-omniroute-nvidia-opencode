import { readFileSync } from "node:fs";
import { buildPaidImageQuote } from "../../open-sse/config/paidImagePriceEvidence.ts";

const file = JSON.parse(
  readFileSync(new URL("./price-evidence.json", import.meta.url), "utf8"),
) as {
  generatedAt: string;
  ceilingUsd: number;
  maxImagesPerProvider: number;
  evidence: unknown[];
};

const now = new Date(file.generatedAt);
const ceiling: number = file.ceilingUsd;
const n: number = file.maxImagesPerProvider;

const TARGETS = [
  { providerId: "aws-bedrock-image", modelId: "amazon.nova-canvas-v1:0" },
  { providerId: "meta-muse-image", modelId: "muse-image-1.0" },
];

function evaluate(evidence: unknown[]) {
  const rows = TARGETS.map((target) => {
    const quote = buildPaidImageQuote({
      providerId: target.providerId,
      request: {
        capability: "image-generation",
        requestId: "canary-r1-1",
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

const synthetic = (unitPrice: number, providerId: string, modelId: string) => ({
  providerId,
  modelId,
  currency: "USD",
  unit: "image",
  unitPrice,
  verifiedAt: file.generatedAt,
});

const live = evaluate(file.evidence);
console.log("CANARY_SPEND_GUARD " + JSON.stringify(live, null, 2));

const overCeiling = evaluate([
  synthetic(0.06, "aws-bedrock-image", "amazon.nova-canvas-v1:0"),
  synthetic(0.06, "meta-muse-image", "muse-image-1.0"),
]);
const atCeiling = evaluate([
  synthetic(0.05, "aws-bedrock-image", "amazon.nova-canvas-v1:0"),
  synthetic(0.05, "meta-muse-image", "muse-image-1.0"),
]);

const checks: Array<[string, boolean]> = [
  ["unverified official price must block", live.decision === "BLOCK"],
  [
    "total above ceiling must block",
    overCeiling.decision === "BLOCK" && overCeiling.expectedTotal > ceiling,
  ],
  [
    "total at ceiling must allow",
    atCeiling.decision === "ALLOW_ONE_IMAGE_PER_PROVIDER" &&
      atCeiling.expectedTotal === ceiling,
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok" : "FAIL"} - ${name}`);
}
console.log(`CANARY_SPEND_GUARD_CHECKS=${checks.length - failed}/${checks.length}`);
process.exit(failed === 0 ? 0 : 1);
