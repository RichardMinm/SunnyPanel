import type {
  PendingAction,
  PlanProposal,
  ProposedAgentAction,
  ScheduleProposal,
} from "@/lib/agent/schemas";

import { riskLevelLabelMap } from "./constants";
import { isRecord } from "@/lib/shared/is-record";

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

  // Chinese: 已创建日程「title」：YYYY-MM-DD timeRange (relaxed end anchor)
  const cnMatch = trimmed.match(/^已创建日程「(.+?)」[：:]\s*(\d{4}-\d{2}-\d{2})\s+(.+?)[。.]?$/u);
  if (cnMatch) {
    return { title: cnMatch[1], date: cnMatch[2], timeRange: cnMatch[3].replace(/[。.]$/, "") };
  }

  // English: Created schedule "title": YYYY-MM-DD timeRange
  const enMatch = trimmed.match(/^Created (?:schedule|event) ["「](.+?)["」][：:]\s*(\d{4}-\d{2}-\d{2})\s+(.+?)\.?$/i);
  if (enMatch) {
    return { title: enMatch[1], date: enMatch[2], timeRange: enMatch[3].replace(/\.$/, "") };
  }

  // English variant: Scheduled "title" for YYYY-MM-DD, timeRange
  const enMatch2 = trimmed.match(/^Scheduled ["「](.+?)["」] for (\d{4}-\d{2}-\d{2})[,，]?\s*(.+?)\.?$/i);
  if (enMatch2) {
    return { title: enMatch2[1], date: enMatch2[2], timeRange: enMatch2[3].replace(/\.$/, "") };
  }

  return null;
};

/* ── Structured Card Detection & Parsing ── */

export type PlanOverviewData = {
  title: string;
  phaseCount?: number;
  estimatedDays?: number;
};

export type ChecklistCompletionData = {
  title: string;
  completed: number;
  total: number;
};

export type StructuredCardType = "plan" | "checklist" | "schedule" | "none";

export function detectStructuredCardType(content: string): StructuredCardType {
  if (parseScheduleResultMessage(content)) return "schedule";
  if (parseChecklistCompletion(content)) return "checklist";
  if (parsePlanOverview(content)) return "plan";
  return "none";
}

export function parsePlanOverview(content: string): PlanOverviewData | null {
  const trimmed = content.trim();

  // Pattern 1a: "已创建计划「...」" (Chinese)
  const cnCreated = trimmed.match(/已创建计划「(.+?)」/u);
  // Pattern 1b: "Created plan "..." " (English)
  const enCreated = trimmed.match(/Created plan ["「](.+?)["」]/i);
  const createdMatch = cnCreated || enCreated;
  if (createdMatch) {
    const title = createdMatch[1];
    const phaseMatch = trimmed.match(/(\d+)\s*个?(阶段|Phase|phase|phases)/i);
    const daysMatch = trimmed.match(/预计\s*(\d+)\s*天/);
    return {
      title,
      phaseCount: phaseMatch ? Number(phaseMatch[1]) : undefined,
      estimatedDays: daysMatch ? Number(daysMatch[1]) : undefined,
    };
  }

  // Pattern 2: "## 计划" / "## Plan" heading
  const planHeading = trimmed.match(/^##\s*(?:计划|Plan|方案|Roadmap)[：:]\s*(.+)/mi);
  if (planHeading) {
    const phases = (trimmed.match(/^###?\s+\d+[\.\)]\s+.+/gm) || []).length;
    return {
      title: planHeading[1].trim(),
      phaseCount: phases > 0 ? phases : undefined,
    };
  }

  // Pattern 3: "Here's a plan" / "Here is my plan" (English natural intro)
  const hereMatch = trimmed.match(/Here(?:'s| is) (?:a|the|my) plan[：:]?\s*(.+?)(?:[\.\n]|$)/i);
  if (hereMatch) {
    const phases = (trimmed.match(/^###?\s+\d+[\.\)]\s+.+/gm) || []).length;
    return {
      title: hereMatch[1].trim().slice(0, 50),
      phaseCount: phases > 0 ? phases : undefined,
    };
  }

  // Pattern 4: Bare inline "Plan: xxx" or "计划：xxx" (no ## heading)
  const inlinePlan = trimmed.match(/^(?:Plan|计划)[：:]\s*(.+?)(?:[\.\n]|$)/mi);
  if (inlinePlan) {
    const phases = (trimmed.match(/^###?\s+\d+[\.\)]\s+.+/gm) || []).length;
    return {
      title: inlinePlan[1].trim().slice(0, 50),
      phaseCount: phases > 0 ? phases : undefined,
    };
  }

  // Pattern 5: Numbered plan phases (Chinese: 第一阶段：..., 第二步：...)
  // Lower threshold: allow single phase when accompanied by a plan-related heading
  const phaseLines = trimmed.match(/^第[一二三四五六七八九十\d]+[阶段步][：:]/gm);
  const hasPlanContext = /计划|plan|phase|步骤|TODO/i.test(trimmed.slice(0, 200));
  if (phaseLines && (phaseLines.length >= 2 || (phaseLines.length >= 1 && hasPlanContext))) {
    return {
      title: "执行计划",
      phaseCount: phaseLines.length,
    };
  }

  // Pattern 6: "以下是一个...计划" / "为你制定了...计划" (Chinese descriptive)
  const planDesc = trimmed.match(/(?:以下是|为你制定了?|我为你)(?:一个|一份)?[计执][划行]?[：:，]?\s*(.+?)(?:[。\n]|$)/);
  if (planDesc) {
    const phaseCount = (trimmed.match(/^###?\s+\d+[\.\)]\s+.+/gm) || []).length;
    return {
      title: planDesc[1].trim().slice(0, 40),
      phaseCount: phaseCount > 0 ? phaseCount : undefined,
    };
  }

  return null;
}

export function parseChecklistCompletion(content: string): ChecklistCompletionData | null {
  const trimmed = content.trim();

  // Count checkbox items (support both - [x] and * [x] markdown formats)
  const completedItems =
    (trimmed.match(/^[-*]\s*\[x\]/gim) || []).length;
  const totalItems =
    (trimmed.match(/^[-*]\s*\[[x\s]\]/gim) || []).length;

  // Also check for numbered checklists: "1. [x]"
  const numCompleted = (trimmed.match(/^\d+\.\s*\[x\]/gim) || []).length;
  const numTotal = (trimmed.match(/^\d+\.\s*\[[x\s]\]/gim) || []).length;

  if (totalItems === 0 && numTotal === 0) return null;

  // Try to extract a title from heading (Chinese + English)
  const headingMatch = trimmed.match(/^##\s*(.+)/m);
  let title = "清单进度";
  if (headingMatch) {
    title = headingMatch[1].trim();
  } else if (/(?:Checklist|Tasks|Todo|清单|任务)/i.test(trimmed.slice(0, 100))) {
    const kwMatch = trimmed.match(/(?:Checklist|Tasks|Todo|清单|任务)[：:]\s*(.+?)(?:[\.\n]|$)/i);
    if (kwMatch) title = kwMatch[1].trim().slice(0, 40);
  }

  // Progress patterns:
  // Chinese: "已完成 X/Y"
  const cnProgress = trimmed.match(/已完成[：:]?\s*(\d+)\s*\/\s*(\d+)/);
  // English: "X of Y completed"
  const enProgress = trimmed.match(/(\d+)\s+of\s+(\d+)\s+completed/i);
  // Percentage: "80% complete" — derive from checkbox counts if available
  const pctMatch = trimmed.match(/(\d+)%\s*complete/i);

  if (cnProgress) {
    return { title, completed: Number(cnProgress[1]), total: Number(cnProgress[2]) };
  }
  if (enProgress) {
    return { title, completed: Number(enProgress[1]), total: Number(enProgress[2]) };
  }
  if (pctMatch && (totalItems > 0 || numTotal > 0)) {
    const pct = Number(pctMatch[1]);
    const total = totalItems || numTotal;
    return { title, completed: Math.round((pct / 100) * total), total };
  }

  return {
    title,
    completed: completedItems + numCompleted,
    total: totalItems + numTotal,
  };
}

export const getScheduleProposalFromAction = (action: ProposedAgentAction): null | ScheduleProposal => {
  if (action.intent !== "compose_schedule_item") {
    return null;
  }

  const snapshot = isRecord(action.afterSnapshot) ? action.afterSnapshot : null;
  const argsProposal = isRecord(action.args) && isRecord(action.args.proposal) ? action.args.proposal : null;
  const proposal = argsProposal ?? snapshot;

  return proposal as null | ScheduleProposal;
};
