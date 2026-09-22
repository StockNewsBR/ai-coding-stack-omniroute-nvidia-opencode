/**
 * R2 paid image provider runtime configuration + assembly contract.
 *
 * NO network, NO paid inference, NO spend. Proves the non-secret config
 * contract, the value-free credential presence check, fail-closed adapter
 * readiness, and that paid deps only assemble when the policy is enabled and
 * funded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PAID_IMAGE_CREDENTIAL_ENV_NAMES,
  PAID_IMAGE_PROVIDER_ENV_KEYS,
  loadPaidImageProviderRuntimeConfig,
  readPaidImageCredentialPresence,
} from "../../open-sse/config/paidImageProviderConfig.ts";
import { createAwsImageAdapter } from "../../open-sse/config/paidImageAwsAdapter.ts";
import { createMetaImageAdapter } from "../../open-sse/config/paidImageMetaAdapter.ts";
import { buildPaidImageRoutingDeps } from "../../open-sse/config/paidImageRouteFallback.ts";

const FUNDED_ENV = {
  IMAGE_PAID_FALLBACK_ENABLED: "true",
  IMAGE_PAID_MAX_COST_PER_IMAGE: "0.1",
  IMAGE_PAID_DAILY_BUDGET: "1",
  IMAGE_PAID_MONTHLY_BUDGET: "10",
};

test("runtime config: empty env yields no model, region or base url defaults", () => {
  const config = loadPaidImageProviderRuntimeConfig({});
  assert.equal(config.aws.modelId, undefined);
  assert.equal(config.aws.region, undefined);
  assert.equal(config.meta.modelId, undefined);
  assert.equal(config.meta.baseUrl, undefined);
});

test("runtime config: values are trimmed and blank values become undefined", () => {
  const config = loadPaidImageProviderRuntimeConfig({
    [PAID_IMAGE_PROVIDER_ENV_KEYS.awsImageModelId]: "  amazon.nova-canvas-v1:0  ",
    [PAID_IMAGE_PROVIDER_ENV_KEYS.awsImageRegion]: "   ",
    [PAID_IMAGE_PROVIDER_ENV_KEYS.metaImageModelId]: "muse-image-1.0",
    [PAID_IMAGE_PROVIDER_ENV_KEYS.metaImageBaseUrl]: " https://api.meta.ai/v1 ",
  });
  assert.equal(config.aws.modelId, "amazon.nova-canvas-v1:0");
  assert.equal(config.aws.region, undefined);
  assert.equal(config.meta.modelId, "muse-image-1.0");
  assert.equal(config.meta.baseUrl, "https://api.meta.ai/v1");
});

test("credential presence: booleans only, never the credential value", () => {
  const secret = "super-secret-value-not-a-real-key";
  const presence = readPaidImageCredentialPresence({
    [PAID_IMAGE_CREDENTIAL_ENV_NAMES.aws[0]]: secret,
  });
  assert.equal(typeof presence.aws, "boolean");
  assert.equal(typeof presence.meta, "boolean");
  assert.equal(presence.aws, true);
  assert.equal(presence.meta, false);
  assert.equal(JSON.stringify(presence).includes(secret), false);
});

test("credential presence: alternate names work and blanks are ignored", () => {
  assert.equal(
    readPaidImageCredentialPresence({ [PAID_IMAGE_CREDENTIAL_ENV_NAMES.aws[0]]: "   " }).aws,
    false
  );
  assert.equal(
    readPaidImageCredentialPresence({ [PAID_IMAGE_CREDENTIAL_ENV_NAMES.aws[1]]: "k" }).aws,
    true
  );
  assert.equal(
    readPaidImageCredentialPresence({ [PAID_IMAGE_CREDENTIAL_ENV_NAMES.meta[1]]: "k" }).meta,
    true
  );
  assert.equal(readPaidImageCredentialPresence({}).meta, false);
});

test("assembly: paid deps stay undefined unless the policy is enabled and funded", () => {
  assert.equal(buildPaidImageRoutingDeps({ env: {} }), undefined);
  assert.equal(
    buildPaidImageRoutingDeps({ env: { IMAGE_PAID_FALLBACK_ENABLED: "true" } }),
    undefined
  );
});

test("assembly: no adapters are built without provider config and credentials", () => {
  assert.equal(buildPaidImageRoutingDeps({ env: FUNDED_ENV }), undefined);
});

test("assembly: adapters are assembled from config plus credential presence", () => {
  const deps = buildPaidImageRoutingDeps({
    env: {
      ...FUNDED_ENV,
      AWS_IMAGE_MODEL_ID: "stability.stable-image-core-v1:1",
      AWS_IMAGE_REGION: "us-west-2",
      AWS_BEARER_TOKEN_BEDROCK: "test-key-not-a-secret",
      META_IMAGE_MODEL_ID: "muse-image-1.0",
      MODEL_API_KEY: "test-key-not-a-secret",
    },
  });
  if (!deps) assert.fail("expected assembled paid deps");
  assert.ok(deps.policy);
  const ids = (deps.adapters ?? []).map((adapter) => adapter.providerId).sort();
  assert.deepEqual(ids, ["aws-bedrock-image", "meta-muse-image"]);
});

test("assembly: a single credentialed provider still assembles without the other", () => {
  const deps = buildPaidImageRoutingDeps({
    env: {
      ...FUNDED_ENV,
      META_IMAGE_MODEL_ID: "muse-image-1.0",
      MODEL_API_KEY: "test-key-not-a-secret",
    },
  });
  if (!deps) assert.fail("expected assembled paid deps");
  const ids = (deps.adapters ?? []).map((adapter) => adapter.providerId);
  assert.deepEqual(ids, ["meta-muse-image"]);
});

test("adapters fail closed without credentials and make zero network calls", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async () => {
    calls.push("called");
    throw new Error("must not be called");
  };

  const aws = createAwsImageAdapter({
    modelId: "stability.stable-image-core-v1:1",
    fetcher,
  });
  const meta = createMetaImageAdapter({ modelId: "muse-image-1.0", fetcher });

  assert.equal(aws.isConfigured(), false);
  assert.equal(meta.isConfigured(), false);

  const awsResult = await aws.generateImage({ capability: "image-generation", requestId: "r" });
  const metaResult = await meta.generateImage({ capability: "image-generation", requestId: "r" });

  assert.equal(awsResult.ok, false);
  assert.equal(metaResult.ok, false);
  assert.equal(calls.length, 0);
});
