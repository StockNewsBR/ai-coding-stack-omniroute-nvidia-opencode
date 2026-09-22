/**
 * Minimal paid image provider registry (R1).
 *
 * Registration is provider-agnostic: it permits AWS, Meta and any future
 * adapter WITHOUT encoding any priority. Ranking/selection belongs solely to
 * the paid image router (paidImageRouting.ts), which sorts acceptable
 * candidates by factual cost. Provider-specific code never chooses a winner.
 */
import type { PaidImageProviderAdapter } from "./paidImageProviderAdapter.ts";

export interface PaidImageProviderRegistry {
  register(adapter: PaidImageProviderAdapter): void;
  has(providerId: string): boolean;
  get(providerId: string): PaidImageProviderAdapter | undefined;
  list(): readonly PaidImageProviderAdapter[];
  readonly size: number;
}

export function createPaidImageProviderRegistry(
  initial: readonly PaidImageProviderAdapter[] = []
): PaidImageProviderRegistry {
  const adapters = new Map<string, PaidImageProviderAdapter>();

  const registry: PaidImageProviderRegistry = {
    register(adapter: PaidImageProviderAdapter): void {
      if (!adapter || typeof adapter.providerId !== "string" || adapter.providerId.trim() === "") {
        throw new Error("paid image provider adapter requires a non-empty providerId");
      }
      adapters.set(adapter.providerId, adapter);
    },
    has(providerId: string): boolean {
      return adapters.has(providerId);
    },
    get(providerId: string): PaidImageProviderAdapter | undefined {
      return adapters.get(providerId);
    },
    list(): readonly PaidImageProviderAdapter[] {
      return Array.from(adapters.values());
    },
    get size(): number {
      return adapters.size;
    },
  };

  for (const adapter of initial) registry.register(adapter);
  return registry;
}
