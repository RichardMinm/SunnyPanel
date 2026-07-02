import type { PlanDraft } from "./draft";

export type ChecklistDraftPriority = "high" | "low" | "medium";

export type ChecklistDraftItem = {
  title: string;
  description?: string;
  stageTitle?: string;
  priority?: ChecklistDraftPriority;
  done?: boolean;
};

export type ChecklistDraftGroup = {
  title: string;
  description?: string;
  items: ChecklistDraftItem[];
};

export type ChecklistDraft = {
  title: string;
  sourcePlanId?: number | null;
  sourcePlanTitle?: string;
  goal?: string;
  groups: ChecklistDraftGroup[];
  assumptions?: string[];
  nextActions?: string[];
};

export type GenerateChecklistDraftInput = {
  instruction?: string;
  planDraft?: null | PlanDraft;
};

export class ChecklistDraftGenerationError extends Error {
  code: "invalid_plan_draft" | "missing_plan_draft";

  constructor(code: ChecklistDraftGenerationError["code"], message: string) {
    super(message);
    this.name = "ChecklistDraftGenerationError";
    this.code = code;
  }
}

export const MAX_CHECKLIST_DRAFT_GROUPS = 8;
export const MAX_CHECKLIST_DRAFT_ITEMS_PER_GROUP = 12;
export const MAX_CHECKLIST_DRAFT_LIST_ITEMS = 8;

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUsefulString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

const sanitizeStringList = (
  value: unknown,
  limit = MAX_CHECKLIST_DRAFT_LIST_ITEMS,
): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (!isUsefulString(item)) continue;
    const normalized = normalizeText(item);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result.length > 0 ? result : undefined;
};

const inferPriority = (task: string): ChecklistDraftPriority => {
  if (/阻塞|核心|上线|部署|回归|验证|修复/u.test(task)) return "high";
  if (/整理|文档|记录|补充/u.test(task)) return "medium";
  return "medium";
};

const validatePlanDraft = (planDraft: null | PlanDraft | undefined): PlanDraft => {
  if (!planDraft) {
    throw new ChecklistDraftGenerationError(
      "missing_plan_draft",
      "Missing PlanDraft for ChecklistDraft generation.",
    );
  }

  if (
    !isUsefulString(planDraft.title) ||
    !isUsefulString(planDraft.goal) ||
    !Array.isArray(planDraft.stages) ||
    planDraft.stages.length === 0
  ) {
    throw new ChecklistDraftGenerationError(
      "invalid_plan_draft",
      "Invalid PlanDraft for ChecklistDraft generation.",
    );
  }

  return planDraft;
};

const buildChecklistTitle = (planDraft: PlanDraft): string =>
  `${normalizeText(planDraft.goal)}任务清单草案`;

const taskToItem = (
  task: string,
  stageTitle: string,
): ChecklistDraftItem => {
  const title = normalizeText(task);

  return {
    done: false,
    priority: inferPriority(title),
    stageTitle,
    title,
  };
};

export const generateChecklistDraftFromPlanDraft = ({
  instruction,
  planDraft: rawPlanDraft,
}: GenerateChecklistDraftInput): ChecklistDraft => {
  const planDraft = validatePlanDraft(rawPlanDraft);
  const groups: ChecklistDraftGroup[] = planDraft.stages
    .slice(0, MAX_CHECKLIST_DRAFT_GROUPS)
    .map((stage) => {
      const title = isUsefulString(stage.title)
        ? normalizeText(stage.title)
        : "未命名阶段";
      const tasks = Array.isArray(stage.tasks)
        ? stage.tasks.filter(isUsefulString).slice(0, MAX_CHECKLIST_DRAFT_ITEMS_PER_GROUP)
        : [];
      const items = tasks.length > 0
        ? tasks.map((task) => taskToItem(task, title))
        : [
            {
              done: false,
              priority: "medium" as const,
              stageTitle: title,
              title: `补充${title}的可执行任务`,
            },
          ];

      return {
        ...(isUsefulString(stage.description)
          ? { description: normalizeText(stage.description) }
          : {}),
        items,
        title,
      };
    });

  return {
    goal: normalizeText(planDraft.goal),
    groups,
    ...(typeof planDraft.sourcePlanId === "number" ? { sourcePlanId: planDraft.sourcePlanId } : {}),
    sourcePlanTitle: normalizeText(planDraft.title),
    title: buildChecklistTitle(planDraft),
    assumptions: [
      "这是从计划草案拆出的清单草案，尚未写入数据库。",
      "每个计划阶段被拆成一个清单分组，阶段任务被拆成清单条目。",
      ...(instruction && isUsefulString(instruction)
        ? [`本轮拆解要求：${normalizeText(instruction)}`]
        : []),
    ].slice(0, MAX_CHECKLIST_DRAFT_LIST_ITEMS),
    nextActions: [
      "继续修改清单草案",
      "准备创建清单",
    ],
  };
};

const sanitizePriority = (value: unknown): ChecklistDraftPriority | undefined =>
  value === "high" || value === "medium" || value === "low" ? value : undefined;

const sanitizeChecklistDraftItem = (
  raw: unknown,
): ChecklistDraftItem | undefined => {
  if (!isRecord(raw)) return undefined;
  const title = raw.title;
  if (!isUsefulString(title)) return undefined;

  const description = raw.description;
  const stageTitle = raw.stageTitle;
  const priority = sanitizePriority(raw.priority);

  return {
    ...(typeof raw.done === "boolean" ? { done: raw.done } : {}),
    ...(isUsefulString(description) ? { description: normalizeText(description) } : {}),
    ...(priority ? { priority } : {}),
    ...(isUsefulString(stageTitle) ? { stageTitle: normalizeText(stageTitle) } : {}),
    title: normalizeText(title),
  };
};

const sanitizeChecklistDraftGroup = (
  raw: unknown,
): ChecklistDraftGroup | undefined => {
  if (!isRecord(raw)) return undefined;
  const title = raw.title;
  if (!isUsefulString(title) || !Array.isArray(raw.items)) return undefined;

  const items = raw.items
    .map(sanitizeChecklistDraftItem)
    .filter((item): item is ChecklistDraftItem => Boolean(item))
    .slice(0, MAX_CHECKLIST_DRAFT_ITEMS_PER_GROUP);

  if (items.length === 0) return undefined;

  const description = raw.description;

  return {
    ...(isUsefulString(description) ? { description: normalizeText(description) } : {}),
    items,
    title: normalizeText(title),
  };
};

export const sanitizeChecklistDraft = (
  raw: unknown,
): ChecklistDraft | null | undefined => {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;

  const title = raw.title;
  if (!isUsefulString(title) || !Array.isArray(raw.groups)) {
    return undefined;
  }

  const groups = raw.groups
    .map(sanitizeChecklistDraftGroup)
    .filter((group): group is ChecklistDraftGroup => Boolean(group))
    .slice(0, MAX_CHECKLIST_DRAFT_GROUPS);

  if (groups.length === 0) return undefined;

  const sourcePlanTitle = raw.sourcePlanTitle;
  const sourcePlanId = typeof raw.sourcePlanId === "number" ? raw.sourcePlanId : null;
  const goal = raw.goal;
  const assumptions = sanitizeStringList(raw.assumptions);
  const nextActions = sanitizeStringList(raw.nextActions);

  return {
    ...(assumptions ? { assumptions } : {}),
    ...(isUsefulString(goal) ? { goal: normalizeText(goal) } : {}),
    groups,
    ...(nextActions ? { nextActions } : {}),
    ...(typeof sourcePlanId === "number" ? { sourcePlanId } : {}),
    ...(isUsefulString(sourcePlanTitle) ? { sourcePlanTitle: normalizeText(sourcePlanTitle) } : {}),
    title: normalizeText(title),
  };
};
