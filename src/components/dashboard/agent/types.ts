import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentRunDetailView, AgentRunSummaryView } from "@/lib/agent/run-summary";
export type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

export type ContextPreferences = {
  excluded: string[];
  pinned: string[];
};

export type AgentInspectorTab = "approval" | "context" | "debug" | "linked" | "memory" | "trace" | "inbox";

export type AgentThreadSummary = {
  archived?: boolean;
  id: number;
  lastInteractionAt?: null | string;
  pendingAction: null | PendingAction;
  tags?: string[];
  title: string;
};

export type AgentRunSummary = AgentRunSummaryView;
export type AgentRunDetail = AgentRunDetailView;
