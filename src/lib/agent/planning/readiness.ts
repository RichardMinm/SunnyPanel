export type PlanReadinessStatus =
  | "insufficient"
  | "draftable"
  | "confirmable";

export type PlanSlotKey =
  | "goal"
  | "deadline"
  | "scope"
  | "currentProgress"
  | "availableTime"
  | "successCriteria"
  | "priority"
  | "deliverables"
  | "constraints";

export type PlanSlots = {
  goal?: string | null;
  deadline?: string | null;
  scope?: string | null;
  currentProgress?: string | null;
  availableTime?: string | null;
  successCriteria?: string | null;
  priority?: string | null;
  deliverables?: string[] | null;
  constraints?: string[] | null;
};

export type PlanReadiness = {
  status: PlanReadinessStatus;
  confidence: number;
  knownSlots: PlanSlotKey[];
  missingSlots: PlanSlotKey[];
  suggestedQuestions: string[];
  reason: string;
};

export type EvaluatePlanReadinessInput = {
  userMessage: string;
  slots?: PlanSlots;
  sessionSlots?: PlanSlots;
  explicitCreateIntent?: boolean;
  hasExistingDraft?: boolean;
};

const SLOT_KEYS: readonly PlanSlotKey[] = [
  "goal",
  "deadline",
  "scope",
  "currentProgress",
  "availableTime",
  "successCriteria",
  "priority",
  "deliverables",
  "constraints",
];

const SCALAR_SLOT_KEYS: readonly Exclude<PlanSlotKey, "deliverables" | "constraints">[] = [
  "goal",
  "deadline",
  "scope",
  "currentProgress",
  "availableTime",
  "successCriteria",
  "priority",
];

const ARRAY_SLOT_KEYS: readonly Extract<PlanSlotKey, "deliverables" | "constraints">[] = [
  "deliverables",
  "constraints",
];

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isUsefulString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

const normalizeStringArray = (value: string[] | null | undefined): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
};

const mergeUnique = (first: string[], second: string[]): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const item of [...first, ...second]) {
    if (seen.has(item)) continue;
    seen.add(item);
    merged.push(item);
  }

  return merged;
};

const slotHasValue = (slots: PlanSlots, key: PlanSlotKey): boolean => {
  if (key === "deliverables" || key === "constraints") {
    return normalizeStringArray(slots[key]).length > 0;
  }

  return isUsefulString(slots[key]);
};

const getKnownSlots = (slots: PlanSlots): PlanSlotKey[] =>
  SLOT_KEYS.filter((key) => slotHasValue(slots, key));

export const mergePlanSlots = (
  sessionSlots?: PlanSlots,
  extractedSlots?: PlanSlots,
): PlanSlots => {
  const merged: PlanSlots = {};

  for (const key of SCALAR_SLOT_KEYS) {
    const sessionValue = sessionSlots?.[key];
    const extractedValue = extractedSlots?.[key];

    if (isUsefulString(sessionValue)) {
      merged[key] = normalizeText(sessionValue);
    } else if (sessionValue === null) {
      merged[key] = null;
    }

    if (isUsefulString(extractedValue)) {
      merged[key] = normalizeText(extractedValue);
    } else if (!isUsefulString(merged[key]) && extractedValue === null) {
      merged[key] = null;
    }
  }

  for (const key of ARRAY_SLOT_KEYS) {
    const sessionValues = normalizeStringArray(sessionSlots?.[key]);
    const extractedValues = normalizeStringArray(extractedSlots?.[key]);
    const values = mergeUnique(sessionValues, extractedValues);

    if (values.length > 0) {
      merged[key] = values;
    } else if (sessionSlots?.[key] === null || extractedSlots?.[key] === null) {
      merged[key] = null;
    }
  }

  return merged;
};

const extractDeadlineFromMessage = (message: string): string | null => {
  const match = message.match(/(\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?|今天晚上|今天|今晚|明天|本周|下周|月底|年底|\d{1,2}\s*点\s*到\s*\d{1,2}\s*点)/i);
  return match ? normalizeText(match[0]) : null;
};

const extractGoalFromMessage = (message: string): string | null => {
  const normalized = normalizeText(message);

  const afterPlanMarker = normalized.match(/计划[:：]\s*(.+)$/);
  if (afterPlanMarker?.[1]) {
    const text = normalizeText(afterPlanMarker[1]);
    const completionMatch = text.match(/完成(.+)$/);
    return completionMatch?.[1] ? `完成${normalizeText(completionMatch[1])}` : text;
  }

  if (/SunnyPanel/i.test(normalized) && /上线|发布|第一版|v1/i.test(normalized)) {
    return "SunnyPanel 第一版上线";
  }

  const examMatch = normalized.match(/(考研|考试|雅思|托福|高考|考公)[^，。,.!?？！\s]*(计划|备考|复习)?/);
  if (examMatch?.[0]) {
    return normalizeText(examMatch[0]);
  }

  const finishMatch = normalized.match(/完成([^，。,.!?？！]+)/);
  if (finishMatch?.[1]) {
    return `完成${normalizeText(finishMatch[1])}`;
  }

  const projectMatch = normalized.match(/([A-Za-z0-9_-]+|[\u4e00-\u9fa5]{2,20})(项目|产品|版本|第一版|上线|发布)/);
  if (projectMatch?.[0]) {
    return normalizeText(projectMatch[0]);
  }

  return null;
};

const inferSlotsFromMessage = (message: string): PlanSlots => {
  const inferred: PlanSlots = {};
  const deadline = extractDeadlineFromMessage(message);
  const goal = extractGoalFromMessage(message);

  if (deadline) inferred.deadline = deadline;
  if (goal) inferred.goal = goal;

  return inferred;
};

const hasExplicitCreateIntent = (
  message: string,
  explicitCreateIntent?: boolean,
): boolean => {
  if (explicitCreateIntent) return true;

  return /(创建(一个)?计划|保存为计划|保存成计划|写入|记录为计划|加入计划|确认创建|就按.*创建|按这个创建|生成并保存)/i.test(message);
};

const confirmsExistingDraft = (message: string, hasExistingDraft?: boolean): boolean =>
  Boolean(hasExistingDraft && /(就按这个创建|按这个创建|确认创建|保存这个|用这个版本|就这样保存)/i.test(message));

const hasLargePlanSignal = (message: string, slots: PlanSlots): boolean => {
  const text = `${message} ${Object.values(slots)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string")
    .join(" ")}`;

  return /(上线|发布|第一版|v1|产品|项目|版本|部署|内测|公开|考试|考研|备考|复习|长期|学习计划|多阶段|里程碑|冲刺|未来数天|一周|两周|本月|月底|季度)/i.test(text);
};

const hasSmallTaskSignal = (message: string, slots: PlanSlots): boolean => {
  if (hasLargePlanSignal(message, slots)) return false;

  return /(修复|完成|整理|检查|写完|改完|补上|处理|验证|调试|今晚|今天晚上|\d{1,2}\s*点\s*到\s*\d{1,2}\s*点)/i.test(message);
};

const missingForLargePlan = (slots: PlanSlots): PlanSlotKey[] => {
  const missing: PlanSlotKey[] = [];

  if (!slotHasValue(slots, "goal")) missing.push("goal");
  if (!slotHasValue(slots, "deadline")) missing.push("deadline");

  const hasScope = slotHasValue(slots, "scope");
  const hasDeliverables = slotHasValue(slots, "deliverables");
  if (!hasScope && !hasDeliverables) {
    missing.push("scope", "deliverables");
  }

  if (!slotHasValue(slots, "currentProgress")) {
    missing.push("currentProgress");
  }

  const hasAvailableTime = slotHasValue(slots, "availableTime");
  const hasConstraints = slotHasValue(slots, "constraints");
  if (!hasAvailableTime && !hasConstraints) {
    missing.push("availableTime", "constraints");
  }

  if (!slotHasValue(slots, "successCriteria")) {
    missing.push("successCriteria");
  }

  return missing;
};

const missingForSmallPlan = (slots: PlanSlots): PlanSlotKey[] => {
  const missing: PlanSlotKey[] = [];

  if (!slotHasValue(slots, "goal")) missing.push("goal");
  if (!slotHasValue(slots, "deadline")) missing.push("deadline");

  return missing;
};

const uniqSlots = (slots: PlanSlotKey[]): PlanSlotKey[] => {
  const seen = new Set<PlanSlotKey>();
  const result: PlanSlotKey[] = [];

  for (const slot of slots) {
    if (seen.has(slot)) continue;
    seen.add(slot);
    result.push(slot);
  }

  return result;
};

const buildSuggestedQuestions = (
  missingSlots: PlanSlotKey[],
  message: string,
): string[] => {
  const missing = new Set(missingSlots);
  const isLaunch = /上线|发布|第一版|SunnyPanel/i.test(message);
  const questions: string[] = [];

  if (missing.has("goal")) {
    questions.push("这个计划最终要达成什么具体目标？");
  }

  if (missing.has("deadline")) {
    questions.push("这个计划希望在什么时候完成？");
  }

  if (missing.has("scope") || missing.has("deliverables")) {
    questions.push(
      isLaunch
        ? "第一版必须包含哪些功能或交付物？"
        : "这个计划包含哪些范围或交付物？",
    );
  }

  if (missing.has("currentProgress")) {
    questions.push("当前已经完成了哪些部分，进度大概到哪里？");
  }

  if (missing.has("availableTime") || missing.has("constraints")) {
    questions.push(
      isLaunch
        ? "截止前你每天大概能投入多少时间，有哪些约束？"
        : "你每天或每周大概能投入多少时间，有哪些限制？",
    );
  }

  if (missing.has("successCriteria")) {
    questions.push(
      isLaunch
        ? "上线标准是什么：本地可用、内测可用，还是公开部署？"
        : "怎样才算这个计划完成，验收标准是什么？",
    );
  }

  if (missing.has("priority")) {
    questions.push("这个计划的优先级是什么？");
  }

  if (missing.has("constraints") && !questions.some((question) => /测试|部署|文档|约束|限制/.test(question))) {
    questions.push("是否需要包含测试、部署、文档整理或其他约束？");
  }

  return questions.slice(0, 5);
};

const isOnlyGoalAndDeadlineKnown = (knownSlots: PlanSlotKey[]): boolean =>
  knownSlots.length === 2 && knownSlots.includes("goal") && knownSlots.includes("deadline");

const createReadiness = (
  status: PlanReadinessStatus,
  knownSlots: PlanSlotKey[],
  missingSlots: PlanSlotKey[],
  userMessage: string,
  reason: string,
): PlanReadiness => ({
  confidence:
    status === "confirmable"
      ? 0.9
      : status === "draftable"
        ? 0.82
        : 0.78,
  knownSlots,
  missingSlots,
  reason,
  status,
  suggestedQuestions:
    status === "insufficient"
      ? buildSuggestedQuestions(missingSlots, userMessage)
      : [],
});

export const evaluatePlanReadiness = (
  input: EvaluatePlanReadinessInput,
): PlanReadiness => {
  const inferredSlots = inferSlotsFromMessage(input.userMessage);
  const mergedSessionAndInferred = mergePlanSlots(input.sessionSlots, inferredSlots);
  const slots = mergePlanSlots(mergedSessionAndInferred, input.slots);
  const knownSlots = getKnownSlots(slots);
  const explicitCreate = hasExplicitCreateIntent(input.userMessage, input.explicitCreateIntent);
  const existingDraftConfirmed = confirmsExistingDraft(input.userMessage, input.hasExistingDraft);
  const smallPlan = hasSmallTaskSignal(input.userMessage, slots);
  const largePlan = !smallPlan && hasLargePlanSignal(input.userMessage, slots);

  if (smallPlan) {
    const missingSlots = uniqSlots(missingForSmallPlan(slots));
    if (missingSlots.length > 0) {
      return createReadiness(
        "insufficient",
        knownSlots,
        missingSlots,
        input.userMessage,
        "小型任务仍缺少目标或时间，不能准备创建计划。",
      );
    }

    return createReadiness(
      explicitCreate || existingDraftConfirmed ? "confirmable" : "draftable",
      knownSlots,
      [],
      input.userMessage,
      explicitCreate || existingDraftConfirmed
        ? "小型任务目标、时间和创建意图明确，可以进入确认准备阶段。"
        : "小型任务信息足够生成草案，但用户尚未明确要求写入。",
    );
  }

  const largeMissingSlots = uniqSlots(missingForLargePlan(slots));
  if (largePlan || largeMissingSlots.length > 0) {
    if (largeMissingSlots.length > 0) {
      const sparseReason = isOnlyGoalAndDeadlineKnown(knownSlots)
        ? "大型计划仅有目标和截止时间，不足以生成可执行计划。"
        : "大型计划缺少关键上下文，不应直接进入确认或写入。";

      return createReadiness(
        "insufficient",
        knownSlots,
        largeMissingSlots,
        input.userMessage,
        sparseReason,
      );
    }

    return createReadiness(
      explicitCreate || existingDraftConfirmed ? "confirmable" : "draftable",
      knownSlots,
      [],
      input.userMessage,
      explicitCreate || existingDraftConfirmed
        ? "大型计划上下文完整且用户明确要求创建，可以进入确认准备阶段。"
        : "大型计划上下文足够生成草案，但用户尚未明确要求写入数据库。",
    );
  }

  const smallMissingSlots = uniqSlots(missingForSmallPlan(slots));
  if (smallMissingSlots.length > 0) {
    return createReadiness(
      "insufficient",
      knownSlots,
      smallMissingSlots,
      input.userMessage,
      "计划请求缺少目标或时间，无法判断是否可生成草案。",
    );
  }

  return createReadiness(
    explicitCreate || existingDraftConfirmed ? "confirmable" : "draftable",
    knownSlots,
    [],
    input.userMessage,
    explicitCreate || existingDraftConfirmed
      ? "计划目标和时间明确，且用户明确要求创建。"
      : "计划目标和时间明确，可先生成草案。",
  );
};
