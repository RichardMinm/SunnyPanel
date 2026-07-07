import type { ClarificationComposerInput, ClarificationMissingNeed } from "./types";

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isUsefulString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

/* ──── Schedule Clarification Context ──── */

const SCHEDULE_MISSING_LABELS: Record<string, string> = {
  availableDays: "偏好的可安排日期",
  availableTimeWindows: "偏好的可用时间段",
  conflictPolicy: "遇到已有日程冲突时怎么处理",
  dailyCapacity: "每天或本周可投入时间",
  deadline: "期望完成时间",
  durationEstimate: "任务时长估计",
  excludedDates: "需要排除的日期",
  preferredTime: "偏好安排时间",
  priorityRule: "优先级安排规则",
  scheduleGranularity: "日程粒度偏好",
  sourceChecklistId: "来源清单",
  sourcePlanId: "来源计划",
  sourceType: "任务来源类型",
  tasks: "需要安排的任务",
};

const SCHEDULE_PRIORITY_MISSING = [
  "dailyCapacity",
  "preferredTime",
  "availableTimeWindows",
  "conflictPolicy",
];

const SCHEDULE_MISSING_EXAMPLES: Record<string, string[]> = {
  conflictPolicy: ["冲突时跳过", "允许和已有日程重叠", "遇到冲突时帮我重新安排"],
  dailyCapacity: ["每天 1 小时", "每周 3 天"],
  preferredTime: ["晚上", "上午", "周末"],
};

const SCHEDULE_QUESTION_LIMIT = 3;

export const buildScheduleClarificationContext = (input: {
  deadline?: null | string;
  hasSchedulingDraft?: boolean;
  missingSlotKeys: string[];
  sourceLabel?: null | string;
  userMessage: string;
}): ClarificationComposerInput => {
  const goalSummary = buildScheduleGoalSummary(input.userMessage, input.deadline, input.sourceLabel);
  const knownFacts = buildScheduleKnownFacts(input.deadline, input.sourceLabel);
  const missingNeeds = buildScheduleMissingNeeds(input.missingSlotKeys);

  return {
    knownFacts,
    maxQuestions: SCHEDULE_QUESTION_LIMIT,
    missingNeeds,
    safetyBoundary: {
      nextStep: input.hasSchedulingDraft ? "继续修改草案" : "先生成日程草案",
      willNotWriteYet: true,
    },
    tone: "warm",
    userGoalSummary: goalSummary,
    userMessage: input.userMessage,
    workflow: "schedule_creation",
  };
};

const buildScheduleGoalSummary = (
  userMessage: string,
  deadline?: null | string,
  sourceLabel?: null | string,
): string | undefined => {
  const parts: string[] = [];
  if (sourceLabel) parts.push(`基于${sourceLabel}`);
  if (deadline) parts.push(`希望在${deadline}前完成`);
  return parts.length > 0 ? parts.join("，") : userMessage.slice(0, 80) || undefined;
};

const buildScheduleKnownFacts = (
  deadline?: null | string,
  sourceLabel?: null | string,
): string[] => {
  const facts: string[] = [];
  if (sourceLabel) facts.push(`任务来源：${sourceLabel}`);
  if (deadline) facts.push(`期望完成时间：${deadline}`);
  return facts;
};

const buildScheduleMissingNeeds = (missingSlotKeys: string[]): ClarificationMissingNeed[] => {
  const needs: ClarificationMissingNeed[] = [];
  const seen = new Set<string>();

  for (const key of SCHEDULE_PRIORITY_MISSING) {
    if (missingSlotKeys.includes(key) && !seen.has(key)) {
      seen.add(key);
      needs.push({
        examples: SCHEDULE_MISSING_EXAMPLES[key],
        key,
        label: SCHEDULE_MISSING_LABELS[key] ?? key,
      });
    }
  }

  // Add remaining missing slots (up to question limit)
  for (const key of missingSlotKeys) {
    if (needs.length >= SCHEDULE_QUESTION_LIMIT + 2) break;
    if (seen.has(key)) continue;
    seen.add(key);
    needs.push({
      key,
      label: SCHEDULE_MISSING_LABELS[key] ?? key,
    });
  }

  return needs.slice(0, SCHEDULE_QUESTION_LIMIT + 2);
};

/* ──── Planning Clarification Context ──── */

const PLANNING_MISSING_LABELS: Record<string, string> = {
  availableTime: "每周可投入时间",
  constraints: "需要遵守的约束条件",
  currentProgress: "当前进度",
  deadline: "期望完成时间",
  deliverables: "需要交付的内容",
  goal: "计划目标",
  priority: "优先级",
  scope: "计划范围",
  successCriteria: "成功的标准",
};

const PLANNING_PRIORITY_MISSING = [
  "availableTime",
  "scope",
  "currentProgress",
  "successCriteria",
];

const PLANNING_MISSING_EXAMPLES: Record<string, string[]> = {
  availableTime: ["每天 1 小时", "每周 3 天"],
  constraints: ["不包含部署", "需要包含测试"],
  scope: ["第一版只包含核心功能", "完整上线包含部署和文档"],
  successCriteria: ["本地可用", "内测可用", "公开部署"],
};

const PLANNING_QUESTION_LIMIT = 4;

export const buildPlanningClarificationContext = (input: {
  deadline?: null | string;
  goal?: null | string;
  hasPlanningDraft?: boolean;
  missingSlotKeys: string[];
  userMessage: string;
}): ClarificationComposerInput => {
  const goalSummary = buildPlanningGoalSummary(input.goal, input.userMessage);
  const knownFacts = buildPlanningKnownFacts(input.goal, input.deadline);
  const missingNeeds = buildPlanningMissingNeeds(input.missingSlotKeys);

  return {
    knownFacts,
    maxQuestions: PLANNING_QUESTION_LIMIT,
    missingNeeds,
    safetyBoundary: {
      nextStep: input.hasPlanningDraft ? "继续修改计划草案" : "先生成计划草案",
      willNotWriteYet: true,
    },
    tone: "supportive",
    userGoalSummary: goalSummary,
    userMessage: input.userMessage,
    workflow: "plan_creation",
  };
};

const buildPlanningGoalSummary = (
  goal?: null | string,
  userMessage?: string,
): string | undefined => {
  if (isUsefulString(goal)) return normalizeText(goal);
  if (isUsefulString(userMessage)) return normalizeText(userMessage).slice(0, 80);
  return undefined;
};

const buildPlanningKnownFacts = (
  goal?: null | string,
  deadline?: null | string,
): string[] => {
  const facts: string[] = [];
  if (isUsefulString(goal)) facts.push(`目标：${normalizeText(goal)}`);
  if (isUsefulString(deadline)) facts.push(`期望完成时间：${normalizeText(deadline)}`);
  return facts;
};

const buildPlanningMissingNeeds = (missingSlotKeys: string[]): ClarificationMissingNeed[] => {
  const needs: ClarificationMissingNeed[] = [];
  const seen = new Set<string>();

  for (const key of PLANNING_PRIORITY_MISSING) {
    if (missingSlotKeys.includes(key) && !seen.has(key)) {
      seen.add(key);
      needs.push({
        examples: PLANNING_MISSING_EXAMPLES[key],
        key,
        label: PLANNING_MISSING_LABELS[key] ?? key,
      });
    }
  }

  for (const key of missingSlotKeys) {
    if (needs.length >= PLANNING_QUESTION_LIMIT + 2) break;
    if (seen.has(key)) continue;
    seen.add(key);
    needs.push({
      key,
      label: PLANNING_MISSING_LABELS[key] ?? key,
    });
  }

  return needs.slice(0, PLANNING_QUESTION_LIMIT + 2);
};

/* ──── Source label helpers ──── */

export const humanSourceLabel = (rawSource: null | string | undefined): string | null => {
  if (rawSource === "plan") return "当前计划";
  if (rawSource === "checklist") return "当前清单";
  if (rawSource === "manual") return "手动任务";
  return null;
};
