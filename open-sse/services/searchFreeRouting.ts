/**
 * FREE_ONLY search routing for `POST /v1/search`.
 *
 * Search counterpart to the model-side FREE_ONLY admission in
 * `autoCombo/freeProviderSentinel.ts`: it does NOT open a parallel search
 * gateway — the native route keeps owning credentials, cache and execution —
 * it only (a) classifies the search providers already declared in
 * `SEARCH_PROVIDERS` from their registry metadata (cost + quota + auth),
 * (b) orders the eligible free providers into a bounded chain, and (c) provides
 * the deterministic quality gate and URL dedup applied to each leg.
 *
 * Free eligibility is metadata-only and shortlist-free: any provider that is
 * provably no-cost (FREE_VERIFIED) or self-hosted (SELF_HOSTED) is eligible;
 * paid / credit-backed / unknown-cost / free-unknown providers never are.
 */
import {
  isUnconfiguredLoopbackSearchProvider,
  supportsSearchType,
  type SearchProviderConfig,
} from "../config/searchRegistry.ts";
import type { FreeCostClass } from "./autoCombo/freeProviderSentinel.ts";
import type { SearchResult } from "../handlers/search.ts";

/** Provider selector that opts a `/v1/search` request into FREE_ONLY routing. */
export const FREE_ONLY_SEARCH_SELECTOR = "auto/search:free";

/** Terminal error when no eligible free provider remains — never a paid fallback. */
export const NO_FREE_SEARCH_PROVIDER_AVAILABLE = "NO_FREE_SEARCH_PROVIDER_AVAILABLE";

/** Circuit-breaker name namespace so search legs never collide with model legs. */
export const FREE_SEARCH_BREAKER_PREFIX = "search:";

export type SearchFreeStatus = FreeCostClass;

export const FREE_ELIGIBLE_SEARCH_STATUSES: readonly SearchFreeStatus[] = [
  "FREE_VERIFIED",
  "SELF_HOSTED",
];

const SELF_HOSTED_HOST_PREFIXES = [
  "localhost",
  "127.",
  "10.",
  "192.168.",
  "0.0.0.0",
  "::1",
  "[::1]",
] as const;

const SELF_HOSTED_HOST_SUFFIXES = [".local", ".internal", ".localhost"] as const;

function isPrivateIpv4(host: string): boolean {
  if (!host.startsWith("172.")) return false;
  const second = Number(host.split(".")[1]);
  return Number.isFinite(second) && second >= 16 && second <= 31;
}

export function isSelfHostedBaseUrl(baseUrl: string | undefined | null): boolean {
  if (!baseUrl || typeof baseUrl !== "string") return false;
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    host =
      baseUrl
        .trim()
        .toLowerCase()
        .replace(/^[a-z]+:\/\//, "")
        .split("/")[0]
        ?.split(":")[0] ?? "";
  }
  if (!host) return false;
  if (isPrivateIpv4(host)) return true;
  return (
    SELF_HOSTED_HOST_PREFIXES.some((prefix) => host === prefix || host.startsWith(prefix)) ||
    SELF_HOSTED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

export function classifySearchProviderFreeStatus(
  provider: Pick<SearchProviderConfig, "baseUrl" | "authType" | "costPerQuery" | "freeMonthlyQuota">
): SearchFreeStatus {
  const cost = provider.costPerQuery;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return "UNKNOWN_COST";
  if (cost === 0) {
    if (isSelfHostedBaseUrl(provider.baseUrl)) return "SELF_HOSTED";
    if (provider.authType === "none") return "FREE_VERIFIED";
    return (provider.freeMonthlyQuota ?? 0) > 0 ? "FREE_VERIFIED" : "FREE_UNKNOWN";
  }
  return (provider.freeMonthlyQuota ?? 0) > 0 ? "CREDIT_BACKED" : "PAID";
}

export function isFreeEligibleStatus(status: SearchFreeStatus): boolean {
  return FREE_ELIGIBLE_SEARCH_STATUSES.includes(status);
}

export interface FreeSearchChainEntry {
  config: SearchProviderConfig;
  freeStatus: SearchFreeStatus;
}

export function buildFreeSearchChain(
  providers: readonly SearchProviderConfig[],
  options: { searchType: string; isBlocked?: (providerId: string) => boolean }
): FreeSearchChainEntry[] {
  const isBlocked = options.isBlocked ?? (() => false);
  const ordered: Array<FreeSearchChainEntry & { order: number }> = [];
  providers.forEach((config, order) => {
    if (config.disabled) return;
    if (!supportsSearchType(config, options.searchType)) return;
    if (isBlocked(config.id)) return;
    if (isUnconfiguredLoopbackSearchProvider(config)) return;
    const freeStatus = classifySearchProviderFreeStatus(config);
    if (!isFreeEligibleStatus(freeStatus)) return;
    ordered.push({ config, freeStatus, order });
  });
  ordered.sort(
    (a, b) =>
      Number(Boolean(a.config.fallbackOnly)) - Number(Boolean(b.config.fallbackOnly)) ||
      (a.config.costPerQuery ?? Number.POSITIVE_INFINITY) -
        (b.config.costPerQuery ?? Number.POSITIVE_INFINITY) ||
      a.order - b.order
  );
  return ordered.map(({ config, freeStatus }) => ({ config, freeStatus }));
}

export interface SearchQualityAssessment {
  valid: boolean;
  resultCount: number;
  validUrlCount: number;
  freshnessCount: number;
  reason?: "empty" | "no-valid-urls";
}

export function isValidResultUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function assessSearchResultQuality(
  data: { results?: unknown } | null | undefined
): SearchQualityAssessment {
  const results = Array.isArray(data?.results) ? (data?.results as SearchResult[]) : [];
  if (results.length === 0) {
    return { valid: false, resultCount: 0, validUrlCount: 0, freshnessCount: 0, reason: "empty" };
  }
  let validUrlCount = 0;
  let freshnessCount = 0;
  for (const result of results) {
    if (isValidResultUrl((result as { url?: unknown })?.url)) validUrlCount += 1;
    const published = (result as { published_at?: unknown })?.published_at;
    if (typeof published === "string" && published.trim() !== "") freshnessCount += 1;
  }
  if (validUrlCount === 0) {
    return {
      valid: false,
      resultCount: results.length,
      validUrlCount,
      freshnessCount,
      reason: "no-valid-urls",
    };
  }
  return { valid: true, resultCount: results.length, validUrlCount, freshnessCount };
}

export function normalizeResultUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port ? `:${parsed.port}` : "";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${protocol}//${host}${port}${pathname}${parsed.search}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function dedupeSearchResults<T extends { url?: string }>(results: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const result of results) {
    const key = normalizeResultUrl(String(result?.url ?? ""));
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

export type FreeSearchLegOutcome =
  | { kind: "ok"; data: { results?: SearchResult[]; [key: string]: unknown } }
  | { kind: "empty" }
  | { kind: "failed"; error: string; status?: number }
  | { kind: "skipped"; reason: "no-credentials" | "rate-limited" | "circuit-open" };

export interface FreeSearchLegAttempt {
  providerId: string;
  outcome: "ok" | "empty" | "failed" | "skipped" | "quality-failed";
  skipReason?: string;
  error?: string;
}

export interface FreeSearchChainOutcome {
  ok: boolean;
  providerId?: string;
  data?: { results?: SearchResult[]; [key: string]: unknown };
  attempts: FreeSearchLegAttempt[];
  allRateLimited: boolean;
  exhausted: boolean;
}

export interface FreeSearchChainDeps {
  executeLeg: (entry: FreeSearchChainEntry) => Promise<FreeSearchLegOutcome>;
  assessQuality?: (data: { results?: unknown }) => SearchQualityAssessment;
  dedupe?: <T extends { url?: string }>(results: readonly T[]) => T[];
}

/**
 * Runs one bounded pass over the ordered free chain: every provider is tried at
 * most once, a leg only wins when it returns data that passes the deterministic
 * quality gate, and the runner never escalates outside the chain it was given
 * (the route builds that chain exclusively from FREE_VERIFIED / SELF_HOSTED
 * providers, so a paid provider can never be reached from here).
 */
export async function runFreeSearchChain(
  chain: readonly FreeSearchChainEntry[],
  deps: FreeSearchChainDeps
): Promise<FreeSearchChainOutcome> {
  const assessQuality = deps.assessQuality ?? assessSearchResultQuality;
  const dedupe = deps.dedupe ?? dedupeSearchResults;
  const attempts: FreeSearchLegAttempt[] = [];
  let rateLimitedOnly = chain.length > 0;

  for (const entry of chain) {
    const outcome = await deps.executeLeg(entry);

    if (outcome.kind === "ok") {
      const quality = assessQuality(outcome.data);
      if (quality.valid) {
        const results = dedupe((outcome.data?.results ?? []) as Array<{ url?: string }>);
        attempts.push({ providerId: entry.config.id, outcome: "ok" });
        return {
          ok: true,
          providerId: entry.config.id,
          data: { ...outcome.data, results: results as SearchResult[] },
          attempts,
          allRateLimited: false,
          exhausted: false,
        };
      }
      attempts.push({
        providerId: entry.config.id,
        outcome: "quality-failed",
        error: quality.reason,
      });
      rateLimitedOnly = false;
      continue;
    }

    if (outcome.kind === "skipped") {
      attempts.push({
        providerId: entry.config.id,
        outcome: "skipped",
        skipReason: outcome.reason,
      });
      if (outcome.reason !== "rate-limited") rateLimitedOnly = false;
      continue;
    }

    attempts.push({
      providerId: entry.config.id,
      outcome: outcome.kind,
      error: outcome.kind === "failed" ? outcome.error : undefined,
    });
    rateLimitedOnly = false;
  }

  return {
    ok: false,
    attempts,
    allRateLimited: rateLimitedOnly && attempts.length > 0,
    exhausted: true,
  };
}
