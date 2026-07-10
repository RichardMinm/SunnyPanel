/** Router Shadow feature flag.
 *
 *   AGENT_ROUTER_SHADOW=off   → disabled (default)
 *   AGENT_ROUTER_SHADOW=admin → enabled for admin/allowlist
 *   AGENT_ROUTER_SHADOW=on    → enabled for all eligible requests
 *
 * Shadow results NEVER affect production intent, write paths, or user responses.
 */

export type RouterShadowMode = "admin" | "off" | "on";

export const resolveRouterShadowMode = (): RouterShadowMode => {
  const raw = process.env.AGENT_ROUTER_SHADOW?.trim().toLowerCase();
  if (raw === "on") return "on";
  if (raw === "admin") return "admin";
  return "off";
};

export const isRouterShadowEnabled = (): boolean =>
  resolveRouterShadowMode() !== "off";
