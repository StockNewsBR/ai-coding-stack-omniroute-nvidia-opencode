/**
 * R3 reconstruction — FREE_ONLY image-generation routing.
 *
 * Node:test scope: top-level tests/unit/*.test.ts run under the built-in test
 * runner (tests/unit/autoCombo/** is the vitest-only scope).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FREE_IMAGE_ELIGIBLE_STATUSES,
  FREE_IMAGE_ROUTE_ID,
  FREE_IMAGE_ROUTE_ID_FREE,
  NO_FREE_IMAGE_PROVIDER_AVAILABLE,
  classifyImageProviderFreeStatus,
  isFreeImageEligibleStatus,
  resolveFreeImageProvider,
} from "../../open-sse/config/freeImageRouting.ts";
import type { FreeModelBudget } from "../../open-sse/config/freeModelCatalog.ts";

const LOCAL_COMFY = "http://127.0.0.1:8188";

function provider(authType: string, baseUrl: string, models: string[]) {
  return {
    id: "synthetic",
    name: "Synthetic",
    baseUrl,
    method: "POST",
    authType,
    authHeader: "authorization",
    models: models.map((id) => ({ id, name: id })),
  };
}

function budgetRow(
  providerId: string,
  modelId: string,
  freeType: string,
  hardStopGuaranteed?: boolean
): FreeModelBudget {
  return {
    provider: providerId,
    modelId,
    displayName: modelId,
    monthlyTokens: 0,
    creditTokens: 0,
    freeType,
    poolKey: null,
    tos: "ok",
    hardStopGuaranteed,
  } as FreeModelBudget;
}

test("classification: local self-hosted endpoint with an active connection is SELF_HOSTED", () => {
  const verdict = classifyImageProviderFreeStatus({
    providerId: "comfyui",
    authType: "none",
    baseUrl: LOCAL_COMFY,
    modelId: "sd-xl",
    budgets: [],
    hasActiveConnection: true,
  });
  assert.equal(verdict.status, "SELF_HOSTED");
  assert.equal(verdict.reason, "SELF_HOSTED_LOCAL_IMAGE_ENDPOINT");
  assert.equal(isFreeImageEligibleStatus(verdict.status), true);
});

test("classification: a remote keyless provider without hard-free evidence is FREE_UNKNOWN", () => {
  const verdict = classifyImageProviderFreeStatus({
    providerId: "aihorde",
    authType: "none",
    baseUrl: "https://aihorde.net/api/v2",
    modelId: "stable_diffusion",
    budgets: [],
    hasActiveConnection: true,
  });
  assert.equal(verdict.status, "FREE_UNKNOWN");
  assert.equal(verdict.reason, "NO_HARD_FREE_IMAGE_EVIDENCE");
  assert.equal(isFreeImageEligibleStatus(verdict.status), false);
});

test("classification: a local endpoint without an active connection is not admitted", () => {
  const verdict = classifyImageProviderFreeStatus({
    providerId: "comfyui",
    authType: "none",
    baseUrl: LOCAL_COMFY,
    modelId: "sd-xl",
    budgets: [],
    hasActiveConnection: false,
  });
  assert.equal(verdict.status, "FREE_UNKNOWN");
  assert.equal(isFreeImageEligibleStatus(verdict.status), false);
});

test("classification: a hard-free budget row with hardStopGuaranteed is FREE_VERIFIED", () => {
  const verdict = classifyImageProviderFreeStatus({
    providerId: "freeimg",
    authType: "apikey",
    baseUrl: "https://freeimg.example.com",
    modelId: "free-model",
    budgets: [budgetRow("freeimg", "free-model", "recurring-daily", true)],
    hasActiveConnection: true,
  });
  assert.equal(verdict.status, "FREE_VERIFIED");
  assert.equal(verdict.reason, "HARD_STOP_FREE_TIER_VERIFIED");
  assert.equal(isFreeImageEligibleStatus(verdict.status), true);
});

test("classification: a hard-free freeType without hardStopGuaranteed stays FREE_UNKNOWN", () => {
  const verdict = classifyImageProviderFreeStatus({
    providerId: "freeimg",
    authType: "apikey",
    baseUrl: "https://freeimg.example.com",
    modelId: "free-model",
    budgets: [budgetRow("freeimg", "free-model", "recurring-daily")],
    hasActiveConnection: true,
  });
  assert.equal(verdict.status, "FREE_UNKNOWN");
  assert.equal(verdict.reason, "NO_HARD_FREE_IMAGE_EVIDENCE");
});

test("classification: credit-shaped budget rows are CREDIT_BACKED", () => {
  for (const freeType of ["one-time-initial", "recurring-credit"]) {
    const verdict = classifyImageProviderFreeStatus({
      providerId: "trialimg",
      authType: "apikey",
      baseUrl: "https://trialimg.example.com",
      modelId: "trial-model",
      budgets: [budgetRow("trialimg", "trial-model", freeType, true)],
      hasActiveConnection: true,
    });
    assert.equal(verdict.status, "CREDIT_BACKED");
    assert.equal(verdict.reason, "CREDIT_BACKED_IMAGE_EXCLUDED");
    assert.equal(isFreeImageEligibleStatus(verdict.status), false);
  }
});

test("classification: discontinued budget rows are DISCONTINUED", () => {
  const verdict = classifyImageProviderFreeStatus({
    providerId: "deadimg",
    authType: "apikey",
    baseUrl: "https://deadimg.example.com",
    modelId: "dead-model",
    budgets: [budgetRow("deadimg", "dead-model", "discontinued", true)],
    hasActiveConnection: true,
  });
  assert.equal(verdict.status, "DISCONTINUED");
  assert.equal(verdict.reason, "DISCONTINUED_IMAGE_EXCLUDED");
  assert.equal(isFreeImageEligibleStatus(verdict.status), false);
});

test("resolver: the first eligible provider in registry order wins", () => {
  const selection = resolveFreeImageProvider({
    providers: {
      "remote-first": provider("apikey", "https://remote.example.com", ["unknown-model"]),
      "local-second": provider("none", LOCAL_COMFY, ["sd-xl"]),
    },
    budgets: [],
    hasActiveConnection: () => true,
    isCircuitOpen: () => false,
  });
  assert.equal(selection.ok, true);
  if (selection.ok) {
    assert.equal(selection.providerId, "local-second");
    assert.equal(selection.modelId, "sd-xl");
    assert.equal(selection.status, "SELF_HOSTED");
  }
});

test("resolver: providers without an active connection are skipped", () => {
  const selection = resolveFreeImageProvider({
    providers: { "local-only": provider("none", LOCAL_COMFY, ["sd-xl"]) },
    budgets: [],
    hasActiveConnection: () => false,
    isCircuitOpen: () => false,
  });
  assert.equal(selection.ok, false);
  if (!selection.ok) {
    assert.equal(selection.code, NO_FREE_IMAGE_PROVIDER_AVAILABLE);
    assert.equal(selection.reason, "NO_ELIGIBLE_FREE_IMAGE_PROVIDER");
  }
});

test("resolver: circuit-open providers are skipped and reported", () => {
  const selection = resolveFreeImageProvider({
    providers: { "local-only": provider("none", LOCAL_COMFY, ["sd-xl"]) },
    budgets: [],
    hasActiveConnection: () => true,
    isCircuitOpen: () => true,
  });
  assert.equal(selection.ok, false);
  if (!selection.ok) {
    assert.equal(selection.code, NO_FREE_IMAGE_PROVIDER_AVAILABLE);
    assert.equal(selection.reason, "ALL_FREE_IMAGE_PROVIDERS_CIRCUIT_OPEN");
  }
});

test("resolver: nothing eligible returns the controlled code with considered entries", () => {
  const selection = resolveFreeImageProvider({
    providers: {
      "remote-keyless": provider("none", "https://aihorde.net/api/v2", ["stable_diffusion"]),
    },
    budgets: [],
    hasActiveConnection: () => true,
    isCircuitOpen: () => false,
  });
  assert.equal(selection.ok, false);
  if (!selection.ok) {
    assert.equal(selection.code, NO_FREE_IMAGE_PROVIDER_AVAILABLE);
    assert.equal(selection.reason, "NO_ELIGIBLE_FREE_IMAGE_PROVIDER");
    assert.equal(selection.considered.length, 1);
    assert.equal(selection.considered[0].status, "FREE_UNKNOWN");
  }
});

test("separation: vision/chat model ids are never selected as image generators", () => {
  const selection = resolveFreeImageProvider({
    providers: { "local-only": provider("none", LOCAL_COMFY, ["sd-xl"]) },
    budgets: [
      budgetRow("freechat", "qwen-vision", "keyless", true),
      budgetRow("freechat", "gemini-2.5-flash", "recurring-daily", true),
    ],
    hasActiveConnection: () => true,
    isCircuitOpen: () => false,
  });
  assert.equal(selection.ok, true);
  if (selection.ok) {
    assert.equal(selection.providerId, "local-only");
    assert.notEqual(selection.modelId, "qwen-vision");
    assert.notEqual(selection.modelId, "gemini-2.5-flash");
  }
  assert.equal(FREE_IMAGE_ELIGIBLE_STATUSES.join(","), "FREE_VERIFIED,SELF_HOSTED");
  assert.equal(isFreeImageEligibleStatus("PAID"), false);
  assert.equal(isFreeImageEligibleStatus("CREDIT_BACKED"), false);
  assert.equal(isFreeImageEligibleStatus("UNKNOWN_COST"), false);
  assert.equal(isFreeImageEligibleStatus("NULL_COST"), false);
  assert.equal(isFreeImageEligibleStatus("FREE_UNKNOWN"), false);
  assert.equal(FREE_IMAGE_ROUTE_ID, "auto/image-gen");
  assert.equal(FREE_IMAGE_ROUTE_ID_FREE, "auto/image-gen:free");
  assert.equal(NO_FREE_IMAGE_PROVIDER_AVAILABLE, "NO_FREE_IMAGE_PROVIDER_AVAILABLE");
});
