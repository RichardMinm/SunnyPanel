/** Runtime configuration for the read/clarify Router canary. */

export type RouterCanaryMode = "admin" | "off";

export const DEFAULT_ROUTER_CANARY_TIMEOUT_MS = 8_000;
export const MAX_ROUTER_CANARY_TIMEOUT_MS = 12_000;

export const resolveRouterCanaryMode = (): RouterCanaryMode =>
  process.env.AGENT_ROUTER_CANARY?.trim().toLowerCase() === "admin"
    ? "admin"
    : "off";

export const normalizeRouterCanaryTimeoutMs = (value: unknown): number =>
  typeof value === "number"
  && Number.isInteger(value)
  && value > 0
  && value <= MAX_ROUTER_CANARY_TIMEOUT_MS
    ? value
    : DEFAULT_ROUTER_CANARY_TIMEOUT_MS;

export const resolveRouterCanaryTimeoutMs = (): number => {
  const raw = process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_ROUTER_CANARY_TIMEOUT_MS;

  return normalizeRouterCanaryTimeoutMs(Number(raw));
};
