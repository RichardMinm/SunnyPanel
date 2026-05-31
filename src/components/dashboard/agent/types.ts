import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

export type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

export type ContextPreferences = {
  excluded: string[];
  pinned: string[];
};

export type AgentWorkbenchTab = "conversation" | "timeline";
export type AgentInspectorTab = "context" | "approval" | "trace" | "linked" | "memory" | "artifacts" | "changes" | "dag" | "debug";
export type DashboardLayout = "balanced" | "focus" | "inspector";

export type AgentThreadSummary = {
  archived?: boolean;
  id: number;
  lastInteractionAt?: null | string;
  pendingAction: null | PendingAction;
  tags?: string[];
  title: string;
};

export type AgentRunSummary = {
  id: number;
  startedAt?: null | string;
  status: string;
  summary?: null | string;
  title: string;
  workflow: string;
};

export type SuggestionAction = {
  id: string;
  label: string;
  prompt: string;
  reason: string;
  riskLevel?: AgentInboxSuggestion["riskLevel"];
  source?: AgentInboxSuggestion["source"];
  suggestion?: AgentInboxSuggestion;
};
