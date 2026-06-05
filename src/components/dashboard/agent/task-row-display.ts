import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";

import type { AgentRunSummary } from "./types";

export type AgentTaskRowTone = "accent" | "danger" | "info" | "muted" | "success" | "warning";

export type UnifiedAgentTask = {
  id: string;
  label: string;
  prompt: string;
  reason: string;
  riskLevel?: "high" | "low" | "medium";
  source?: string;
  suggestion?: AgentInboxSuggestion;
};

const runStatusLabelMap: Record<string, string> = {
  cancelled: "已取消",
  failed: "失败",
  pending: "排队",
  queued: "排队",
  running: "运行中",
  succeeded: "成功",
};

export function buildUnifiedAgentTasks(
  suggestions: AgentInboxSuggestion[],
  quickPrompts: AgentQuickPrompt[],
  limits: { quick?: number; suggestions?: number } = {},
): UnifiedAgentTask[] {
  const suggestionLimit = limits.suggestions ?? 3;
  const quickLimit = limits.quick ?? 2;
  const suggestionTasks = suggestions.slice(0, suggestionLimit).map((suggestion) => ({
    id: `inbox-${suggestion.id}`,
    label: suggestion.title,
    prompt: suggestion.suggestedPrompt,
    reason: suggestion.reason,
    riskLevel: suggestion.riskLevel,
    source: suggestion.source,
    suggestion,
  }));
  const quickTasks = quickPrompts.slice(0, quickLimit).map((prompt) => ({
    id: `quick-${prompt.prompt}`,
    label: prompt.label,
    prompt: prompt.prompt,
    reason: prompt.prompt,
  }));

  return [...suggestionTasks, ...quickTasks];
}

export function getPendingActionTone(pendingAction: PendingAction | null): AgentTaskRowTone {
  if (pendingAction?.type === "await_confirmation") {
    return pendingAction.action.riskLevel === "high"
      ? "danger"
      : pendingAction.action.riskLevel === "medium"
        ? "warning"
        : "success";
  }

  return "warning";
}

export function getRunTaskTone(run: AgentRunSummary): AgentTaskRowTone {
  if (run.status === "failed") {
    return "danger";
  }

  if (run.runKind === "rollback") {
    return "warning";
  }

  return run.status === "succeeded" ? "success" : "info";
}

export function getRunTaskMeta(run: AgentRunSummary) {
  if (run.runKind === "rollback") {
    return "回滚";
  }

  if (run.runKind === "review") {
    return "复盘";
  }

  return runStatusLabelMap[run.status] ?? run.status;
}

export function getRiskTone(riskLevel?: "high" | "low" | "medium"): AgentTaskRowTone {
  return riskLevel === "high" ? "danger" : riskLevel === "medium" ? "warning" : "accent";
}
