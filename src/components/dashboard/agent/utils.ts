import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type {
  AgentChatMessage,
  PendingAction,
  PlanProposal,
  ProposedAgentAction,
  ScheduleProposal,
} from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

import { riskLevelLabelMap } from "./constants";
import type { SuggestionAction } from "./types";

export const formatTokenCount = (value?: number) =>
  new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));

export const getUsagePercent = (value: number, total: number) => {
  if (total <= 0 || value <= 0) {
    return 0;
  }

  return Math.max(4, Math.round((value / total) * 100));
};

export const getPendingActionLabel = (pendingAction: PendingAction) => {
  if (pendingAction.type === "await_completion_note") {
    return `等待补备注：${pendingAction.itemTitle}`;
  }

  if (pendingAction.type === "await_confirmation") {
    return `等待确认：${riskLevelLabelMap[pendingAction.action.riskLevel]}`;
  }

  return `等待澄清：${pendingAction.missingFields.join(" / ") || pendingAction.intent}`;
};

export const buildSuggestedTasks = (
  suggestions: AgentInboxSuggestion[],
  quickPrompts: AgentQuickPrompt[],
): SuggestionAction[] => {
  const inboxTasks = suggestions.map((suggestion) => ({
    id: `inbox-${suggestion.id}`,
    label: suggestion.title,
    prompt: suggestion.suggestedPrompt,
    reason: suggestion.reason,
    riskLevel: suggestion.riskLevel,
    source: suggestion.source,
    suggestion,
  }));
  const quickTasks = quickPrompts.map((prompt) => ({
    id: `quick-${prompt.prompt}`,
    label: prompt.label,
    prompt: prompt.prompt,
    reason: prompt.prompt,
  }));

  return [...inboxTasks, ...quickTasks];
};

export const getLatestAssistantMessage = (messages: AgentChatMessage[]) =>
  [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim().length > 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getPlanProposalFromAction = (action: ProposedAgentAction): null | PlanProposal => {
  if (action.intent !== "compose_plan") {
    return null;
  }

  const snapshotProposal = isRecord(action.afterSnapshot) && isRecord(action.afterSnapshot.proposal)
    ? action.afterSnapshot.proposal
    : null;
  const argsProposal = isRecord(action.args) && isRecord(action.args.proposal) ? action.args.proposal : null;
  const proposal = snapshotProposal ?? argsProposal;

  return proposal as null | PlanProposal;
};

export const getScheduleProposalFromAction = (action: ProposedAgentAction): null | ScheduleProposal => {
  if (action.intent !== "compose_schedule_item") {
    return null;
  }

  const snapshot = isRecord(action.afterSnapshot) ? action.afterSnapshot : null;
  const argsProposal = isRecord(action.args) && isRecord(action.args.proposal) ? action.args.proposal : null;
  const proposal = argsProposal ?? snapshot;

  return proposal as null | ScheduleProposal;
};
