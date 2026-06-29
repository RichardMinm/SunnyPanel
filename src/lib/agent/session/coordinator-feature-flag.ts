/**
 * Coordinator Feature Flag — Phase 4D
 *
 * Controls whether the Semantic Session Coordinator runs.
 * Default: OFF (0). Set AGENT_SESSION_COORDINATOR=1 to enable.
 *
 * When disabled (0):
 *   - SessionCoordinator does not run
 *   - RouteHint is not injected
 *   - reconcileSessionAfterRoute is skipped
 *   - Existing conversationState write behavior is unchanged
 *
 * When enabled (1):
 *   - Full coordinator pipeline runs before/during Router
 *   - RouteHint is injected into Router context
 *   - Reconciled session is available for persistence
 */

export const isSessionCoordinatorEnabled = (): boolean =>
  process.env.AGENT_SESSION_COORDINATOR !== "0";
