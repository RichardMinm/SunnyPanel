import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";

/**
 * Pure helper: format a thread's metadata line.
 * Keeps the sidebar product-facing: state and one optional tag, without internal IDs.
 */
export function formatThreadMeta(thread: AgentThreadSummary): string {
  const state = thread.pendingAction
    ? getPendingActionLabel(thread.pendingAction)
    : "已就绪";
  const tag = thread.tags?.[0];

  return [state, tag].filter(Boolean).join(" · ");
}
