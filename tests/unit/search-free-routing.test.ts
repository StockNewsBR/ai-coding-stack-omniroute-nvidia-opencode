/**
 * R2 reconstruction — FREE_ONLY search routing: metadata-only cost classification,
 * dynamic discovery, deterministic quality gate and the bounded free→free chain.
 *
 * Node:test scope: top-level tests/unit/*.test.ts runs under the built-in runner
 * (tests/unit/autoCombo/** is the vitest-only scope).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { SearchProviderConfig } from "../../open-sse/config/searchRegistry.ts";
import {
  FREE_ELIGIBLE_SEARCH_STATUSES,
  NO_FREE_SEARCH_PROVIDER_AVAILABLE,
  assessSearchResultQuality,
  buildFreeSearchChain,
  classifySearchProviderFreeStatus,
  dedupeSearchResults,
  isFreeEligibleStatus,
  isSelfHostedBaseUrl,
  normalizeResultUrl,
  runFreeSearchChain,
  type FreeSearchChainEntry,
  type SearchFreeStatus,
} from "../../open-sse/services/searchFreeRouting.ts";

function provider(overrides: Partial<SearchProviderConfig> & { id: string }): SearchProviderConfig {
  const { id, ...rest } = overrides;
  return {
    id,
    name: id,
    baseUrl: `https://${id}.example.com/search`,
    method: "POST",
    authType: "apikey",
    authHeader: "authorization",
    costPerQuery: 0,
    freeMonthlyQuota: 1000,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 10_000,
    cacheTTLMs: 60_000,
    ...rest,
  };
}

function entry(config: SearchProviderConfig): FreeSearchChainEntry {
  return { config, freeStatus: classifySearchProviderFreeStatus(config) };
}

test("classification: cost and auth evidence decide the free status", () => {
  const base = { baseUrl: "https://x.test/search", freeMonthlyQuota: 0 } as const;
  assert.equal(
    classifySearchProviderFreeStatus({ ...base, authType: "none", costPerQuery: 0 }),
    "FREE_VERIFIED"
  );
  assert.equal(
    classifySearchProviderFreeStatus({
      ...base,
      authType: "apikey",
      costPerQuery: 0,
      freeMonthlyQuota: 1000,
    }),
    "FREE_VERIFIED"
  );
  assert.equal(
    classifySearchProviderFreeStatus({ ...base, authType: "apikey", costPerQuery: 0 }),
    "FREE_UNKNOWN"
  );
  assert.equal(
    classifySearchProviderFreeStatus({
      ...base,
      authType: "apikey",
      costPerQuery: 0.001,
      freeMonthlyQuota: 2500,
    }),
    "CREDIT_BACKED"
  );
  assert.equal(
    classifySearchProviderFreeStatus({
      ...base,
      authType: "apikey",
      costPerQuery: 0.005,
      freeMonthlyQuota: 0,
    }),
    "PAID"
  );
  assert.equal(
    classifySearchProviderFreeStatus({
      ...base,
      authType: "apikey",
      costPerQuery: 0,
      baseUrl: "http://localhost:8888/search",
    }),
    "SELF_HOSTED"
  );
  assert.equal(
    classifySearchProviderFreeStatus({ ...base, authType: "none", costPerQuery: Number.NaN }),
    "UNKNOWN_COST"
  );
  assert.equal(
    classifySearchProviderFreeStatus({ ...base, authType: "none", costPerQuery: -1 }),
    "UNKNOWN_COST"
  );
});

test("self-hosted detection covers loopback, private ranges and internal suffixes", () => {
  const selfHosted = [
    "http://localhost:8888/search",
    "http://127.0.0.1:8080/v1",
    "http://0.0.0.0:8080/search",
    "http://[::1]:1234/search",
    "http://10.1.2.3/search",
    "http://192.168.0.9/search",
    "http://172.20.5.5/search",
    "http://searx.internal/search",
    "http://box.local/search",
  ];
  for (const url of selfHosted) {
    assert.equal(isSelfHostedBaseUrl(url), true, `${url} must be self-hosted`);
  }
  assert.equal(isSelfHostedBaseUrl("https://api.example.com/search"), false);
  assert.equal(isSelfHostedBaseUrl(undefined), false);
});

test("eligibility is exactly FREE_VERIFIED plus SELF_HOSTED", () => {
  assert.deepEqual([...FREE_ELIGIBLE_SEARCH_STATUSES], ["FREE_VERIFIED", "SELF_HOSTED"]);
  const denied: SearchFreeStatus[] = [
    "FREE_UNKNOWN",
    "UNKNOWN_COST",
    "NULL_COST",
    "PAID",
    "CREDIT_BACKED",
    "DISCONTINUED",
  ];
  for (const status of denied) {
    assert.equal(isFreeEligibleStatus(status), false, `${status} must not be auto-eligible`);
  }
});

test("chain: discovery filters non-free, blocked, unsupported, disabled and unconfigured-loopback providers", () => {
  const providers = [
    provider({ id: "paid-search", costPerQuery: 0.01, freeMonthlyQuota: 0 }),
    provider({ id: "credit-search", costPerQuery: 0.005, freeMonthlyQuota: 1000 }),
    provider({ id: "unknown-search", costPerQuery: 0, freeMonthlyQuota: 0 }),
    provider({ id: "disabled-free", authType: "none", freeMonthlyQuota: 0, disabled: true }),
    provider({
      id: "news-only-free",
      authType: "none",
      freeMonthlyQuota: 0,
      searchTypes: ["news"],
    }),
    provider({ id: "blocked-free", authType: "none", freeMonthlyQuota: 0 }),
    provider({
      id: "searxng-search",
      baseUrl: "http://localhost:8888/search",
      authType: "apikey",
      freeMonthlyQuota: 0,
    }),
    provider({ id: "plain-free", authType: "none", freeMonthlyQuota: 0 }),
  ];
  const chain = buildFreeSearchChain(providers, {
    searchType: "web",
    isBlocked: (id) => id === "blocked-free",
  });
  assert.deepEqual(
    chain.map((item) => item.config.id),
    ["plain-free"]
  );
  for (const item of chain) {
    assert.equal(isFreeEligibleStatus(item.freeStatus), true);
  }
});

test("chain: ordering keeps non-fallbackOnly providers first, then registry order", () => {
  const chain = buildFreeSearchChain(
    [
      provider({ id: "fallback-free", authType: "none", freeMonthlyQuota: 0, fallbackOnly: true }),
      provider({ id: "alpha-free", authType: "none", freeMonthlyQuota: 0 }),
      provider({ id: "beta-free", authType: "none", freeMonthlyQuota: 0 }),
    ],
    { searchType: "web" }
  );
  assert.deepEqual(
    chain.map((item) => item.config.id),
    ["alpha-free", "beta-free", "fallback-free"]
  );
});

test("quality gate: empty, url-less and healthy result sets", () => {
  assert.deepEqual(assessSearchResultQuality(undefined), {
    valid: false,
    resultCount: 0,
    validUrlCount: 0,
    freshnessCount: 0,
    reason: "empty",
  });
  const noUrls = assessSearchResultQuality({ results: [{ title: "no url here" }] });
  assert.equal(noUrls.valid, false);
  assert.equal(noUrls.reason, "no-valid-urls");
  const healthy = assessSearchResultQuality({
    results: [
      { url: "https://a.test/one", published_at: "2026-09-01" },
      { url: "http://b.test/two" },
    ],
  });
  assert.equal(healthy.valid, true);
  assert.equal(healthy.resultCount, 2);
  assert.equal(healthy.validUrlCount, 2);
  assert.equal(healthy.freshnessCount, 1);
});

test("url normalization strips hashes and trailing slashes and dedupe keeps the first hit", () => {
  assert.equal(
    normalizeResultUrl("https://Example.com:8443/Path/#frag"),
    "https://example.com:8443/Path"
  );
  const deduped = dedupeSearchResults([
    { url: "https://a.test/x/" },
    { url: "https://A.test/x" },
    { url: "https://a.test/x#fragment" },
    { url: "https://b.test/y" },
  ]);
  assert.deepEqual(
    deduped.map((item) => item.url),
    ["https://a.test/x/", "https://b.test/y"]
  );
});

test("failover: the bounded chain stops at the first quality-passing free leg", async () => {
  const attempts: string[] = [];
  const outcome = await runFreeSearchChain(
    [
      entry(provider({ id: "leg-a", authType: "none", freeMonthlyQuota: 0 })),
      entry(provider({ id: "leg-b", authType: "none", freeMonthlyQuota: 0 })),
      entry(provider({ id: "leg-c", authType: "none", freeMonthlyQuota: 0 })),
    ],
    {
      executeLeg: async (item) => {
        attempts.push(item.config.id);
        if (item.config.id === "leg-a") {
          return { kind: "failed", error: "upstream 503", status: 503 };
        }
        return { kind: "ok", data: {} };
      },
      dedupe: (results) => results,
      assessQuality: () => ({ valid: true, resultCount: 1, validUrlCount: 1, freshnessCount: 0 }),
    }
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.providerId, "leg-b");
  assert.deepEqual(attempts, ["leg-a", "leg-b"]);
  assert.deepEqual(
    outcome.attempts.map((item) => item.outcome),
    ["failed", "ok"]
  );
});

test("failover: a leg failing the quality gate hands off to the next free provider", async () => {
  let qualityCalls = 0;
  const outcome = await runFreeSearchChain(
    [
      entry(provider({ id: "leg-empty", authType: "none", freeMonthlyQuota: 0 })),
      entry(provider({ id: "leg-good", authType: "none", freeMonthlyQuota: 0 })),
    ],
    {
      executeLeg: async () => ({ kind: "ok", data: {} }),
      dedupe: (results) => results,
      assessQuality: () => {
        qualityCalls += 1;
        return qualityCalls === 1
          ? {
              valid: false,
              resultCount: 0,
              validUrlCount: 0,
              freshnessCount: 0,
              reason: "no-valid-urls",
            }
          : { valid: true, resultCount: 1, validUrlCount: 1, freshnessCount: 0 };
      },
    }
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.providerId, "leg-good");
  assert.deepEqual(
    outcome.attempts.map((item) => item.outcome),
    ["quality-failed", "ok"]
  );
});
test("skips: exhausted free legs report their reasons without executing", async () => {
  const executed: string[] = [];
  const outcome = await runFreeSearchChain(
    [
      entry(provider({ id: "leg-noauth", authType: "none", freeMonthlyQuota: 0 })),
      entry(provider({ id: "leg-cool", authType: "none", freeMonthlyQuota: 0 })),
      entry(provider({ id: "leg-open", authType: "none", freeMonthlyQuota: 0 })),
    ],
    {
      executeLeg: async (item) => {
        executed.push(item.config.id);
        const reason =
          item.config.id === "leg-noauth"
            ? ("no-credentials" as const)
            : item.config.id === "leg-cool"
              ? ("rate-limited" as const)
              : ("circuit-open" as const);
        return { kind: "skipped", reason };
      },
      assessQuality: () => ({ valid: true, resultCount: 1, validUrlCount: 1, freshnessCount: 0 }),
    }
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.exhausted, true);
  assert.equal(outcome.allRateLimited, false);
  assert.deepEqual(
    outcome.attempts.map((item) => item.skipReason),
    ["no-credentials", "rate-limited", "circuit-open"]
  );
  assert.equal(executed.length, 3);
});

test("exhaustion: all rate-limited legs surface allRateLimited and never leave the chain", async () => {
  const outcome = await runFreeSearchChain(
    [
      entry(provider({ id: "leg-r1", authType: "none", freeMonthlyQuota: 0 })),
      entry(provider({ id: "leg-r2", authType: "none", freeMonthlyQuota: 0 })),
    ],
    {
      executeLeg: async () => ({ kind: "skipped", reason: "rate-limited" }),
    }
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.exhausted, true);
  assert.equal(outcome.allRateLimited, true);
  assert.equal(outcome.attempts.length, 2);
});

test("exhaustion: every failing leg is attempted exactly once and the terminal error is stable", async () => {
  const outcome = await runFreeSearchChain(
    [
      entry(provider({ id: "leg-x", authType: "none", freeMonthlyQuota: 0 })),
      entry(provider({ id: "leg-y", authType: "none", freeMonthlyQuota: 0 })),
    ],
    {
      executeLeg: async () => ({ kind: "failed", error: "boom", status: 500 }),
    }
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.exhausted, true);
  assert.equal(outcome.allRateLimited, false);
  assert.equal(outcome.attempts.length, 2);
  assert.equal(NO_FREE_SEARCH_PROVIDER_AVAILABLE, "NO_FREE_SEARCH_PROVIDER_AVAILABLE");
});

test("dedupe: the winning leg's results are normalised and deduplicated", async () => {
  const outcome = await runFreeSearchChain(
    [entry(provider({ id: "leg-dedupe", authType: "none", freeMonthlyQuota: 0 }))],
    {
      executeLeg: async () => ({
        kind: "ok",
        data: {
          results: [{ url: "https://dup.test/x" }, { url: "https://dup.test/x#again" }],
        },
      }),
    }
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.providerId, "leg-dedupe");
  const results = (outcome.data as { results?: unknown[] } | undefined)?.results ?? [];
  assert.equal(results.length, 1);
});
