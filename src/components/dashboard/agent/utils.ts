import type {
  PendingAction,
  PlanProposal,
  ProposedAgentAction,
  ScheduleProposal,
} from "@/lib/agent/schemas";

import { riskLevelLabelMap } from "./constants";

export const getPendingActionLabel = (pendingAction: PendingAction) => {
  if (pendingAction.type === "await_completion_note") {
    return `等待补备注：${pendingAction.itemTitle}`;
  }

  if (pendingAction.type === "await_confirmation") {
    return `等待确认：${riskLevelLabelMap[pendingAction.action.riskLevel]}`;
  }

  if (pendingAction.type === "await_batch_confirmation") {
    return `等待批量确认：${pendingAction.actions.length} 项`;
  }

  if (pendingAction.type === "await_queue_resume") {
    return `等待继续：${pendingAction.deferredTaskIds.length} 个子任务`;
  }

  if (pendingAction.type === "await_strategy_resume") {
    return "等待策略重试";
  }

  if (pendingAction.type === "await_learning_followup") {
    return `需要确认：是否保存为学习计划：${pendingAction.subject}`;
  }

  return `等待澄清：${pendingAction.missingFields.join(" / ") || pendingAction.intent}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getDecomposedFromAction = (action: ProposedAgentAction) => {
  if (action.intent !== "compose_plan") {
    return null;
  }

  const args = isRecord(action.args) ? action.args : null;
  const decomposed = args?.decomposed;

  if (!isRecord(decomposed) || !Array.isArray(decomposed.phases)) {
    return null;
  }

  return decomposed as {
    phases: Array<{
      estimatedDays: number;
      goal: string;
      milestones: Array<{ tasks: string[]; title: string }>;
      title: string;
    }>;
    totalEstimatedDays: number;
    weeklyRhythm?: string;
  };
};

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

const DRY_RUN_MARKER = "我已经 dry-run 了这个工具动作";
const DRY_RUN_CONFIRM_HINT = "回复「确认」或「执行」";

export type ScheduleResultSummary = {
  date: string;
  timeRange: string;
  title: string;
};

export const compactDryRunAssistantMessage = (content: string): string => {
  const trimmed = content.trim();
  if (!trimmed) {
    return trimmed;
  }

  const markerIndex = trimmed.indexOf(DRY_RUN_MARKER);
  const hasDryRunBoilerplate = markerIndex >= 0 || trimmed.includes(DRY_RUN_CONFIRM_HINT);

  if (!hasDryRunBoilerplate) {
    return content;
  }

  if (markerIndex > 0) {
    const leading = trimmed.slice(0, markerIndex).trim();
    if (leading) {
      return `${leading}\n\n（DryRun 详情已归档为结构化记录，不再展开全文。）`;
    }
  }

  return "（DryRun 详情已归档为结构化记录，不再展开全文。）";
};

export const compactAssistantMessageForPendingAction = (
  content: string,
  pendingAction: null | PendingAction,
): string => {
  if (
    !pendingAction ||
    (pendingAction.type !== "await_confirmation" && pendingAction.type !== "await_batch_confirmation")
  ) {
    return compactDryRunAssistantMessage(content);
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return trimmed;
  }

  const markerIndex = trimmed.indexOf(DRY_RUN_MARKER);
  if (markerIndex > 0) {
    const leading = trimmed.slice(0, markerIndex).trim();
    if (leading) {
      return `${leading}\n\n我已整理好一个待确认操作，详情见下方卡片。`;
    }
  }

  if (markerIndex >= 0 || trimmed.includes(DRY_RUN_CONFIRM_HINT)) {
    return "我已整理好一个待确认操作，详情见下方卡片。";
  }

  return trimmed;
};

export const parseScheduleResultMessage = (content: string): null | ScheduleResultSummary => {
  const trimmed = content.trim();
  const match = trimmed.match(/^已创建日程「(.+?)」：(\d{4}-\d{2}-\d{2})\s+(.+?)。?$/u);

  if (!match) {
    return null;
  }

  return {
    date: match[2],
    timeRange: match[3],
    title: match[1],
  };
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
