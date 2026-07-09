import type {
  PendingAction,
  PlanProposal,
  ProposedAgentAction,
  ScheduleProposal,
} from "@/lib/agent/schemas";
import type { ScheduleConflict } from "@/lib/agent/schedule/conflict-awareness";
import type { ScheduleConflictSuggestion } from "@/lib/agent/schedule/conflict-suggestions";

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
    return `等待策略恢复：${pendingAction.strategyMode}`;
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
  progress?: number;
};

export type ChecklistCompletionData = {
  title: string;
  completed: number;
  total: number;
};

export type ActionResultData = {
  checklistTitle?: string;
  createdScheduleItemIds?: number[];
  dateRange?: string;
  groupsCount?: number;
  groupTitle?: string | null;
  itemsCount?: number;
  kind: "checklist_created" | "checklist_item_completed" | "plan_created" | "schedule_items_created";
  linkedPlanId?: number | null;
  rollbackAvailable: boolean;
  scheduleItemPreviews?: string[];
  sourceChecklistId?: number | null;
  sourcePlanId?: number | null;
  timelineStatus?: "not_synced" | "synced";
  title: string;
};

export type StructuredCardType = "action_result" | "plan" | "checklist" | "schedule" | "none";

export function detectStructuredCardType(content: string): StructuredCardType {
  if (parseActionResultMessage(content)) return "action_result";
  if (parseScheduleResultMessage(content)) return "schedule";
  if (parseChecklistCompletion(content)) return "checklist";
  if (parsePlanOverview(content)) return "plan";
  return "none";
}

const splitChecklistItemPath = (label: string) => {
  const parts = label
    .split(/\s*\/\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const title = parts[parts.length - 1] ?? label.trim();

  if (parts.length >= 3) {
    return {
      checklistTitle: parts[0],
      groupTitle: parts.slice(1, -1).join(" / "),
      title,
    };
  }

  if (parts.length === 2) {
    return {
      checklistTitle: parts[0],
      groupTitle: null,
      title,
    };
  }

  return {
    checklistTitle: undefined,
    groupTitle: null,
    title,
  };
};

export function parseActionResultMessage(content: string): ActionResultData | null {
  const trimmed = content.trim();

  if (!trimmed) {
    return null;
  }

  const scheduleCreated = trimmed.match(/^已创建\s*(\d+)\s*个日程项，时间范围[：:]\s*(.+?)[。.]?(?:\n|$)/u);
  if (scheduleCreated) {
    const scheduleItemPreviews = Array.from(trimmed.matchAll(/^\s*-\s*(#\d+\s+.+)$/gmu), (match) =>
      match[1].trim(),
    );
    const createdScheduleItemIds = scheduleItemPreviews
      .map((preview) => preview.match(/^#(\d+)/u)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    const sourcePlanId = trimmed.match(/来源计划\s*#(\d+)/u)?.[1];
    const sourceChecklistId = trimmed.match(/来源清单\s*#(\d+)/u)?.[1];
    const itemsCount = Number(scheduleCreated[1]);

    return {
      createdScheduleItemIds,
      dateRange: scheduleCreated[2].trim(),
      itemsCount,
      kind: "schedule_items_created",
      rollbackAvailable: true,
      scheduleItemPreviews,
      sourceChecklistId: sourceChecklistId ? Number(sourceChecklistId) : null,
      sourcePlanId: sourcePlanId ? Number(sourcePlanId) : null,
      title: `已创建 ${itemsCount} 个日程项`,
    };
  }

  const checklistCreated = trimmed.match(
    /已创建清单「(.+?)」(?:，包含\s*(\d+)\s*个分组\s*[\/／]\s*(\d+)\s*个条目)?(?:，并已?关联到计划\s*#(\d+))?/u,
  );
  if (checklistCreated) {
    return {
      groupsCount: checklistCreated[2] ? Number(checklistCreated[2]) : undefined,
      itemsCount: checklistCreated[3] ? Number(checklistCreated[3]) : undefined,
      kind: "checklist_created",
      linkedPlanId: checklistCreated[4] ? Number(checklistCreated[4]) : null,
      rollbackAvailable: true,
      title: checklistCreated[1],
    };
  }

  const completedItem = trimmed.match(/已把\s*「(.+?)」\s*标记完成/u);
  if (completedItem) {
    const path = splitChecklistItemPath(completedItem[1]);
    const timelineStatus =
      /(Timeline|时间线)/iu.test(trimmed) && /(同步|记录|更新)/u.test(trimmed)
        ? "synced"
        : "not_synced";

    return {
      checklistTitle: path.checklistTitle,
      groupTitle: path.groupTitle,
      kind: "checklist_item_completed",
      rollbackAvailable: true,
      timelineStatus,
      title: path.title,
    };
  }

  const planCreated = trimmed.match(/(?:已帮你创建计划|已创建完整计划|已创建计划)「(.+?)」/u);
  if (planCreated) {
    return {
      kind: "plan_created",
      rollbackAvailable: true,
      title: planCreated[1],
    };
  }

  return null;
}

/* ── Checklist API relatedPlan helpers ── */

/**
 * Resolve a checklist's planId field to a numeric plan ID.
 *
 * Payload may populate `planId` as:
 * - `number` (depth=1, populated with just the id)
 * - `{ id: number }` (depth=1 with partial population)
 * - `null | undefined` (no plan linked)
 */
export function resolveChecklistPlanId(rawPlanId: unknown): number | null {
  if (typeof rawPlanId === "number" && Number.isFinite(rawPlanId)) {
    return rawPlanId;
  }
  if (rawPlanId && typeof rawPlanId === "object" && typeof (rawPlanId as { id?: number }).id === "number") {
    return (rawPlanId as { id: number }).id;
  }
  return null;
}

/** Build a lookup map from plan documents: id → { id, title }. */
export function buildPlansByIdMap(planDocs: Array<{ id: number; title?: string }>): Map<number, { id: number; title: string }> {
  const map = new Map<number, { id: number; title: string }>();
  for (const plan of planDocs) {
    map.set(plan.id, { id: plan.id, title: plan.title ?? "" });
  }
  return map;
}

/** Resolve relatedPlan for one checklist from the plansById lookup map. */
export function getChecklistRelatedPlan(
  rawPlanId: unknown,
  plansById: Map<number, { id: number; title: string }>,
): { id: number; title: string } | null {
  const planId = resolveChecklistPlanId(rawPlanId);
  if (planId === null) return null;
  return plansById.get(planId) ?? null;
}

export function parsePlanOverview(content: string): PlanOverviewData | null {
  const trimmed = content.trim();

  // Pattern 1a: "已创建计划「...」" / "已创建完整计划「...」" / "已帮你创建计划「...」" (Chinese)
  const cnCreated = trimmed.match(/已(?:帮你)?创建(?:完整)?计划「([^」]+)」/u);
  // Pattern 1b: "Created plan "..." " (English)
  const enCreated = trimmed.match(/Created plan ["「](.+?)["」]/i);
  const createdMatch = cnCreated || enCreated;
  if (createdMatch) {
    const title = createdMatch[1];
    const phaseMatch = trimmed.match(/(\d+)\s*个?(阶段|Phase|phase|phases)/i);
    const daysMatch = trimmed.match(/预计\s*(\d+)\s*天/)
      ?? trimmed.match(/[（(]\d+\s*个?阶段[，,]\s*(\d+)\s*天[）)]/);
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

export type ScheduleCreationProposal = {
  conflictSummary: {
    conflictCount: number;
    conflictPolicy?: null | string;
    existingScheduleChecked: boolean;
    message: string;
    warningCount: number;
  };
  conflicts: ScheduleConflict[];
  conflictSuggestions: ScheduleConflictSuggestion[];
  dateRange: string;
  itemCount: number;
  sourceChecklistId?: null | number;
  sourcePlanId?: null | number;
  title?: null | string;
};

const isScheduleConflict = (value: unknown): value is ScheduleConflict => {
  if (!isRecord(value)) return false;

  return (
    (value.type === "internal" || value.type === "existing" || value.type === "warning") &&
    (value.severity === "info" || value.severity === "warning" || value.severity === "blocking") &&
    typeof value.proposedTitle === "string" &&
    typeof value.message === "string"
  );
};

const isScheduleConflictSuggestion = (value: unknown): value is ScheduleConflictSuggestion => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    return false;
  }

  if (value.riskLevel !== "low" && value.riskLevel !== "medium") {
    return false;
  }

  const action = value.action;
  if (!isRecord(action) || typeof action.type !== "string") {
    return false;
  }

  if (action.type === "allow_overlap") return true;
  if (action.type === "manual_adjust") return typeof action.message === "string";
  if (action.type === "remove_item") return typeof action.itemTitle === "string";

  return (
    action.type === "move_item" &&
    typeof action.itemTitle === "string" &&
    (action.date == null || typeof action.date === "string") &&
    (action.startTime == null || typeof action.startTime === "string") &&
    (action.endTime == null || typeof action.endTime === "string")
  );
};

export const getScheduleCreationProposalFromAction = (action: ProposedAgentAction): null | ScheduleCreationProposal => {
  if (action.intent !== "create_schedule_items" || !isRecord(action.afterSnapshot)) {
    return null;
  }

  const snapshot = action.afterSnapshot;
  const conflictSummary = isRecord(snapshot.conflictSummary) ? snapshot.conflictSummary : null;

  if (!conflictSummary || typeof conflictSummary.message !== "string") {
    return null;
  }

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const conflicts = Array.isArray(snapshot.scheduleConflicts)
    ? snapshot.scheduleConflicts.filter(isScheduleConflict)
    : [];
  const conflictSuggestions = Array.isArray(snapshot.conflictSuggestions)
    ? snapshot.conflictSuggestions.filter(isScheduleConflictSuggestion)
    : [];

  return {
    conflictSummary: {
      conflictCount: typeof conflictSummary.conflictCount === "number" ? conflictSummary.conflictCount : conflicts.length,
      conflictPolicy: typeof conflictSummary.conflictPolicy === "string" ? conflictSummary.conflictPolicy : null,
      existingScheduleChecked: conflictSummary.existingScheduleChecked === true,
      message: conflictSummary.message,
      warningCount: typeof conflictSummary.warningCount === "number" ? conflictSummary.warningCount : 0,
    },
    conflicts,
    conflictSuggestions,
    dateRange: typeof snapshot.dateRange === "string" ? snapshot.dateRange : "未确定日期",
    itemCount: items.length,
    sourceChecklistId: typeof snapshot.sourceChecklistId === "number" ? snapshot.sourceChecklistId : null,
    sourcePlanId: typeof snapshot.sourcePlanId === "number" ? snapshot.sourcePlanId : null,
    title: typeof snapshot.title === "string" ? snapshot.title : null,
  };
};
