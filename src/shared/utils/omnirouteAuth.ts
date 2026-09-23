import { isRequireApiKeyEnabled } from "@/shared/utils/featureFlags";

const LOCAL_SELF_LOOP_KEY = "sk_omniroute";

/** Resolve the operator-configured key without caching it across rotations. */
export function resolveOmniRouteApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.OMNIROUTE_API_KEY?.trim() || env.ROUTER_API_KEY?.trim() || null;
}

/** Build auth for an internal loopback request and fail closed when required. */
export function resolveInternalOmniRouteBearer(): string | null {
  const configured = resolveOmniRouteApiKey();
  if (configured) return configured;

  try {
    return isRequireApiKeyEnabled() ? null : LOCAL_SELF_LOOP_KEY;
  } catch {
    return null;
  }
}

export function internalOmniRouteAuthHeaders(
  headers: Record<string, string> = {}
): Record<string, string> | null {
  const bearer = resolveInternalOmniRouteBearer();
  return bearer ? { ...headers, Authorization: `Bearer ${bearer}` } : null;
}

export const LOCAL_OMNIROUTE_SELF_LOOP_KEY = LOCAL_SELF_LOOP_KEY;
