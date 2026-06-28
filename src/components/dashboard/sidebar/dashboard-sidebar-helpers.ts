import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";

/**
 * Pure helper: format a thread's metadata line.
 * Returns e.g. "已就绪 · 2024-01 · #42"
 */
export function formatThreadMeta(thread: AgentThreadSummary): string {
  const state = thread.pendingAction
    ? getPendingActionLabel(thread.pendingAction)
    : "已就绪";
  const tag = thread.tags?.[0];

  return [state, tag, `#${thread.id}`].filter(Boolean).join(" · ");
}
