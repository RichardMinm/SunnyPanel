import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

export type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

export type ContextPreferences = {
  excluded: string[];
  pinned: string[];
};

export type AgentWorkbenchTab = "conversation" | "timeline";
export type AgentInspectorTab = "artifacts" | "changes" | "context" | "debug";

export type AgentThreadSummary = {
  id: number;
  lastInteractionAt?: null | string;
  pendingAction: null | PendingAction;
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
