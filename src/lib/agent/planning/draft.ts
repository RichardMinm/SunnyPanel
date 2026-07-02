import type { PlanSlots } from "./readiness";

export type PlanDraftStage = {
  title: string;
  description?: string;
  tasks: string[];
  startDate?: string | null;
  endDate?: string | null;
};

export type PlanDraft = {
  title: string;
  goal: string;
  sourcePlanId?: number | null;
  deadline?: string | null;
  scope?: string | null;
  currentProgress?: string | null;
  availableTime?: string | null;
  successCriteria?: string | null;
  stages: PlanDraftStage[];
  risks?: string[];
  assumptions?: string[];
  nextActions?: string[];
};

export type GeneratePlanDraftInput = {
  slots: PlanSlots;
  userMessage?: string;
};

export type RevisePlanDraftInput = {
  draft: PlanDraft;
  instruction: string;
  slots?: PlanSlots;
};

export class PlanDraftGenerationError extends Error {
  code: "insufficient_slots";
  missingSlots: string[];

  constructor(missingSlots: string[]) {
    super(`Insufficient plan slots for draft: ${missingSlots.join(", ")}`);
    this.name = "PlanDraftGenerationError";
    this.code = "insufficient_slots";
    this.missingSlots = missingSlots;
  }
}

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isUsefulString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

const normalizeList = (value: null | string[] | undefined): string[] =>
  Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : [];

const splitItems = (value: null | string | undefined): string[] => {
  if (!isUsefulString(value)) return [];

  return normalizeText(value)
    .replace(/^(第一版|范围|功能|交付物|包含|包括|要有)[:：]?\s*/u, "")
    .split(/[、,，/；;]/u)
    .map((item) => normalizeText(item))
    .filter(Boolean);
};

const unique = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }

  return result;
};

const hasArrayValue = (value: null | string[] | undefined): boolean =>
  normalizeList(value).length > 0;

const validateDraftSlots = (slots: PlanSlots): void => {
  const missing: string[] = [];

  if (!isUsefulString(slots.goal)) missing.push("goal");
  if (!isUsefulString(slots.deadline)) missing.push("deadline");
  if (!isUsefulString(slots.scope) && !hasArrayValue(slots.deliverables)) {
    missing.push("scope");
  }
  if (!isUsefulString(slots.currentProgress)) missing.push("currentProgress");
  if (!isUsefulString(slots.availableTime) && !hasArrayValue(slots.constraints)) {
    missing.push("availableTime");
  }
  if (!isUsefulString(slots.successCriteria)) missing.push("successCriteria");

  if (missing.length > 0) {
    throw new PlanDraftGenerationError(missing);
  }
};

const buildScopeItems = (slots: PlanSlots): string[] => {
  const scopeItems = splitItems(slots.scope);
  const deliverables = normalizeList(slots.deliverables);

  return unique([...scopeItems, ...deliverables]).slice(0, 8);
};

const taskForScopeItem = (item: string): string => {
  if (/测试|test/i.test(item)) return `补齐${item}并记录验证结果`;
  if (/部署|发布|上线/i.test(item)) return `完成${item}路径和回滚检查`;
  return `完成${item}相关收尾`;
};

const buildRisks = (slots: PlanSlots): string[] => {
  const risks = [
    isUsefulString(slots.availableTime)
      ? `可投入时间为${normalizeText(slots.availableTime)}，需要控制范围和返工。`
      : "可投入时间未量化，排期可能偏乐观。",
    isUsefulString(slots.currentProgress)
      ? `当前进度：${normalizeText(slots.currentProgress)}。`
      : null,
    ...normalizeList(slots.constraints).map((item) => `约束：${item}。`),
  ].filter((item): item is string => Boolean(item));

  return unique(risks).slice(0, 6);
};

export const generatePlanDraft = (
  input: GeneratePlanDraftInput,
): PlanDraft => {
  const slots = input.slots;
  validateDraftSlots(slots);

  const goal = normalizeText(slots.goal!);
  const deadline = isUsefulString(slots.deadline) ? normalizeText(slots.deadline) : null;
  const scope = isUsefulString(slots.scope) ? normalizeText(slots.scope) : null;
  const currentProgress = isUsefulString(slots.currentProgress)
    ? normalizeText(slots.currentProgress)
    : null;
  const availableTime = isUsefulString(slots.availableTime)
    ? normalizeText(slots.availableTime)
    : null;
  const successCriteria = isUsefulString(slots.successCriteria)
    ? normalizeText(slots.successCriteria)
    : null;
  const scopeItems = buildScopeItems(slots);
  const scopeTasks = scopeItems.length > 0
    ? scopeItems.map(taskForScopeItem)
    : ["确认第一版范围并冻结变更"];

  const stages: PlanDraftStage[] = [
    {
      description: currentProgress
        ? `从当前进度出发，先补齐第一版必须项。`
        : "先对齐现状并补齐第一版必须项。",
      tasks: unique([
        currentProgress ? `核对当前进度：${currentProgress}` : "盘点当前完成情况",
        ...scopeTasks.slice(0, 4),
      ]),
      title: "范围收敛与功能收尾",
    },
    {
      description: "把上线风险前置处理，避免草案直接变成写入动作。",
      tasks: unique([
        "补齐关键路径测试",
        "整理部署步骤和回滚检查",
        ...normalizeList(slots.constraints).slice(0, 2).map((item) => `处理约束：${item}`),
      ]),
      title: "测试、部署与约束处理",
    },
    {
      description: successCriteria
        ? `围绕验收标准完成最终检查：${successCriteria}`
        : "完成最终验收和下一步创建确认。",
      tasks: unique([
        successCriteria ? `按验收标准检查：${successCriteria}` : "确认验收标准",
        deadline ? `在${deadline}前完成上线确认` : "确认截止时间",
        "确认草案是否需要写入为正式计划",
      ]),
      title: "验收与上线确认",
    },
  ];

  return {
    availableTime,
    currentProgress,
    deadline,
    goal,
    scope,
    stages,
    successCriteria,
    title: `${goal}计划草案`,
    risks: buildRisks(slots),
    assumptions: [
      "这是规则生成的计划草案，未写入数据库。",
      "阶段顺序根据已知 slots 推断，可继续调整。",
      ...(input.userMessage ? [`本轮补充信息已纳入草案：${normalizeText(input.userMessage)}`] : []),
    ],
    nextActions: [
      "调整阶段",
      "增加测试和部署",
      "拆成清单",
      "就按这个创建",
    ],
  };
};

const MAX_DRAFT_STAGES = 8;
const MAX_STAGE_TASKS = 12;
const MAX_DRAFT_LIST_ITEMS = 8;

const TESTING_STAGE: PlanDraftStage = {
  description: "把测试与阻塞修复单独前置，降低上线前返工风险。",
  tasks: [
    "回归核心流程",
    "修复阻塞问题",
    "验证上线前检查项",
  ],
  title: "测试与修复",
};

const DEPLOYMENT_STAGE: PlanDraftStage = {
  description: "完成上线环境准备、部署和线上路径验证。",
  tasks: [
    "准备生产环境配置",
    "执行部署",
    "验证线上核心路径",
  ],
  title: "部署与上线",
};

const cloneDraft = (draft: PlanDraft): PlanDraft => ({
  ...draft,
  assumptions: draft.assumptions ? [...draft.assumptions] : undefined,
  nextActions: draft.nextActions ? [...draft.nextActions] : undefined,
  risks: draft.risks ? [...draft.risks] : undefined,
  stages: draft.stages.map((stage) => ({
    ...stage,
    tasks: [...stage.tasks],
  })),
});

const normalizeInstruction = (instruction: string): string =>
  normalizeText(instruction).replace(/[“”"']/g, "");

const hasStageMatching = (draft: PlanDraft, pattern: RegExp): boolean =>
  draft.stages.some((stage) => pattern.test(stage.title) || pattern.test(stage.description ?? ""));

const addStageIfMissing = (
  draft: PlanDraft,
  stage: PlanDraftStage,
  pattern: RegExp,
): boolean => {
  if (hasStageMatching(draft, pattern)) return false;

  draft.stages.push({
    ...stage,
    tasks: [...stage.tasks],
  });
  return true;
};

const removeStagesMatching = (draft: PlanDraft, pattern: RegExp): boolean => {
  const before = draft.stages.length;
  draft.stages = draft.stages.filter((stage) => !pattern.test(stage.title));
  return draft.stages.length !== before;
};

const appendUnique = (
  current: string[] | undefined,
  item: string,
  limit = MAX_DRAFT_LIST_ITEMS,
): string[] => unique([...(current ?? []), normalizeText(item)]).slice(0, limit);

const appendNextAction = (draft: PlanDraft, item: string): void => {
  draft.nextActions = appendUnique(draft.nextActions, item);
};

const appendAssumption = (draft: PlanDraft, item: string): void => {
  draft.assumptions = appendUnique(draft.assumptions, item);
};

const appendRisk = (draft: PlanDraft, item: string): void => {
  draft.risks = appendUnique(draft.risks, item);
};

const extractSuccessCriteria = (instruction: string): string | null => {
  const patterns = [
    /(?:上线标准|验收标准|成功标准|标准)\s*(?:是|改成|为|：|:)\s*([^。；;，,]+)/u,
    /(公开部署可用|内测可用|本地可用)/u,
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    const value = match?.[1] ?? match?.[0];
    if (value && normalizeText(value)) {
      return normalizeText(value);
    }
  }

  return null;
};

const extractStageRemovalPattern = (instruction: string): RegExp | null => {
  if (/(删除|去掉|不要).{0,8}(测试|回归|修复).{0,4}阶段/u.test(instruction)) {
    return /测试|回归|修复/u;
  }

  if (/(删除|去掉|不要).{0,8}(部署|上线|发布).{0,4}阶段/u.test(instruction)) {
    return /部署|发布/u;
  }

  const namedRemoval = instruction.match(/(?:删除|去掉|不要)\s*([^，,。；;]{1,24})阶段/u);
  if (namedRemoval?.[1]) {
    const escaped = namedRemoval[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "u");
  }

  return null;
};

const recordTimeStrategy = (draft: PlanDraft, instruction: string): boolean => {
  let changed = false;

  if (/更保守/u.test(instruction)) {
    appendAssumption(draft, "时间策略调整为更保守，优先保留缓冲和风险处理。");
    appendRisk(draft, "时间策略调整为更保守，需要主动收缩非核心范围。");
    changed = true;
  }

  if (/更激进/u.test(instruction)) {
    appendAssumption(draft, "时间策略调整为更激进，需要接受更高返工和延期风险。");
    appendRisk(draft, "时间策略调整为更激进，需每天检查阻塞项。");
    changed = true;
  }

  if (/时间压缩|压缩时间|优先核心功能|核心功能优先/u.test(instruction)) {
    appendAssumption(draft, "优先保证核心功能，非必要内容可延后。");
    appendRisk(draft, "时间策略已压缩，需要防止测试和部署被继续挤压。");
    changed = true;
  }

  if (changed) {
    draft.stages = draft.stages.map((stage, index) => (
      index === 0
        ? {
            ...stage,
            description: stage.description
              ? `${stage.description} 优先保证核心功能。`
              : "优先保证核心功能。",
          }
        : stage
    ));
  }

  return changed;
};

const limitDraftSize = (draft: PlanDraft): PlanDraft => ({
  ...draft,
  assumptions: draft.assumptions?.slice(0, MAX_DRAFT_LIST_ITEMS),
  nextActions: draft.nextActions?.slice(0, MAX_DRAFT_LIST_ITEMS),
  risks: draft.risks?.slice(0, MAX_DRAFT_LIST_ITEMS),
  stages: draft.stages.slice(0, MAX_DRAFT_STAGES).map((stage) => ({
    ...stage,
    tasks: unique(stage.tasks.map((task) => normalizeText(task)).filter(Boolean)).slice(0, MAX_STAGE_TASKS),
  })),
});

export const revisePlanDraft = ({
  draft,
  instruction,
  slots,
}: RevisePlanDraftInput): PlanDraft => {
  const revised = cloneDraft(draft);
  const normalizedInstruction = normalizeInstruction(instruction);
  let changed = false;

  const removalPattern = extractStageRemovalPattern(normalizedInstruction);
  if (removalPattern) {
    changed = removeStagesMatching(revised, removalPattern) || changed;
    if (!changed) {
      appendNextAction(revised, `请指定需要删除的阶段：${normalizedInstruction}`);
    }
  }

  if (!removalPattern && /(加上|增加|补上|单独).{0,8}(测试|回归|修复)|测试单独一阶段/u.test(normalizedInstruction)) {
    changed = addStageIfMissing(revised, TESTING_STAGE, /测试|回归|修复/u) || changed;
  }

  if (!removalPattern && /(加上|增加|补上|单独).{0,8}(部署|上线|发布)|部署单独成一阶段|增加上线阶段/u.test(normalizedInstruction)) {
    changed = addStageIfMissing(revised, DEPLOYMENT_STAGE, /部署与上线|生产环境|线上核心路径/u) || changed;
  }

  const successCriteria = extractSuccessCriteria(normalizedInstruction);
  if (successCriteria) {
    revised.successCriteria = successCriteria;
    changed = true;
  } else if (/加上验收标准|增加验收标准/u.test(normalizedInstruction)) {
    appendNextAction(revised, "补充更具体的验收标准。");
    changed = true;
  }

  changed = recordTimeStrategy(revised, normalizedInstruction) || changed;

  if (slots?.successCriteria && !revised.successCriteria) {
    revised.successCriteria = normalizeText(slots.successCriteria);
    changed = true;
  }

  if (!changed && normalizedInstruction) {
    appendAssumption(revised, `用户要求修改草案：${normalizedInstruction}`);
    appendNextAction(revised, `继续澄清修改要求：${normalizedInstruction}`);
  }

  revised.nextActions = appendUnique(revised.nextActions, "继续修改草案");
  revised.nextActions = appendUnique(revised.nextActions, "就按这个创建");

  return limitDraftSize({
    ...revised,
    title: draft.title,
    goal: draft.goal,
    deadline: draft.deadline,
  });
};
