import type {
  AgentIntent,
  AgentTraceStep,
} from "@/lib/agent/schemas";
import { createDefaultSessionState, normalizeSessionState } from "@/lib/agent/session/normalize-session";
import type { AgentSessionState } from "@/lib/agent/session/types";

import {
  generatePlanDraft,
  PlanDraftGenerationError,
  type PlanDraft,
} from "./draft";
import {
  evaluatePlanReadiness,
  mergePlanSlots,
  type PlanReadiness,
  type PlanSlotKey,
  type PlanSlots,
} from "./readiness";

export type PlanReadinessGateApplied = {
  assistantMessage: string;
  gateApplied: true;
  intent: "clarify";
  pendingAction: null;
  planningDraft?: PlanDraft | null;
  readiness: PlanReadiness;
  sessionState: AgentSessionState;
  traceStep: AgentTraceStep;
};

export type PlanReadinessGateBypass = {
  gateApplied: false;
  readiness?: PlanReadiness;
  reason: "already_confirmed" | "batch_execution" | "not_plan_intent" | "ready_enough";
};

export type PlanReadinessGateResult =
  | PlanReadinessGateApplied
  | PlanReadinessGateBypass;

export type EvaluatePlanReadinessGateInput = {
  batchExecuteIntentCount?: number;
  confirmedActionId?: null | string;
  hasExistingDraft?: boolean;
  intent: AgentIntent;
  sessionState?: null | unknown;
  sessionSlots?: PlanSlots;
  userMessage: string;
};

const PLAN_GATE_INTENTS = new Set<AgentIntent["intent"]>([
  "compose_plan",
  "create_plan",
]);

const SLOT_LABELS: Record<PlanSlotKey, string> = {
  availableTime: "可投入时间",
  constraints: "约束条件",
  currentProgress: "当前进度",
  deadline: "截止时间",
  deliverables: "交付物",
  goal: "目标",
  priority: "优先级",
  scope: "范围",
  successCriteria: "成功标准",
};

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

const firstUsefulString = (
  ...values: Array<null | string | undefined>
): string | undefined => {
  for (const value of values) {
    if (isNonEmptyString(value)) return normalizeText(value);
  }

  return undefined;
};

const normalizeStringList = (
  value: null | string[] | undefined,
): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => normalizeText(item)).filter(Boolean);
  return items.length > 0 ? items : undefined;
};

const splitMessageClauses = (message: string): string[] =>
  normalizeText(message)
    .split(/[;；。.!！?\n]/)
    .map((part) => normalizeText(part))
    .filter(Boolean);

const stripConstraintTail = (value: string): string =>
  normalizeText(value)
    .replace(/[，,]\s*(必须|需要|不能|不要|限制|约束).*$/u, "")
    .trim();

const firstMatchingClause = (
  clauses: string[],
  pattern: RegExp,
): string | undefined => clauses.find((clause) => pattern.test(clause));

const hasSlotValue = (value: null | string | string[] | undefined): boolean =>
  Array.isArray(value)
    ? value.some((item) => isNonEmptyString(item))
    : isNonEmptyString(value);

const hasAnySlot = (slots: PlanSlots | undefined): boolean =>
  Boolean(slots && Object.values(slots).some((value) => hasSlotValue(value)));

const extractConstraintItems = (clauses: string[]): string[] | undefined => {
  const items = clauses
    .filter((clause) => /(限制|约束|不能|不要|必须|需要包含|包含测试|包含部署|包含文档)/u.test(clause))
    .map((clause) => {
      const match = clause.match(/(必须|需要|不能|不要|限制|约束).+$/u);
      return normalizeText(match?.[0] ?? clause);
    })
    .filter(Boolean);

  return items.length > 0 ? [...new Set(items)] : undefined;
};

export const extractPlanSlotsFromMessage = (message: string): PlanSlots => {
  const slots: PlanSlots = {};
  const normalized = normalizeText(message);
  const clauses = splitMessageClauses(message);
  const deadlineMatch = normalized.match(/(\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?|今天晚上|今天|今晚|明天|本周|下周|月底|年底|\d{1,2}\s*点\s*到\s*\d{1,2}\s*点)/i);

  if (deadlineMatch?.[0]) {
    slots.deadline = normalizeText(deadlineMatch[0]);
  }

  if (/SunnyPanel/i.test(normalized) && /上线|发布|第一版|v1/i.test(normalized)) {
    slots.goal = "SunnyPanel 第一版上线";
  }

  const scope = firstMatchingClause(
    clauses,
    /(第一版.*?(包含|包括|要有|范围)|范围|功能|交付物|deliverables?)/iu,
  );
  if (scope) {
    slots.scope = scope;
  }

  const progress = firstMatchingClause(
    clauses,
    /(当前|已经完成|已完成|还差|进度|目前)/u,
  );
  if (progress) {
    slots.currentProgress = progress;
  }

  const availableTime = firstMatchingClause(
    clauses,
    /(每天|每周|能投入|投入.*?(小时|天)|\d+\s*(小时|天))/u,
  );
  if (availableTime) {
    slots.availableTime = availableTime;
  }

  const successCriteria = firstMatchingClause(
    clauses,
    /(上线标准|完成标准|成功标准|公开部署|内测|本地可用|验收标准)/u,
  );
  if (successCriteria) {
    slots.successCriteria = stripConstraintTail(successCriteria);
  }

  const constraints = extractConstraintItems(clauses);
  if (constraints) {
    slots.constraints = constraints;
  }

  return slots;
};

export const isPlanReadinessGateIntent = (intent: AgentIntent): boolean =>
  PLAN_GATE_INTENTS.has(intent.intent);

export const hasExplicitPlanCreateIntent = (message: string): boolean =>
  /(保存为计划|保存成计划|创建(一个)?计划|写入计划|就按这个创建|确认创建|生成并保存|添加到计划)/i.test(message);

const hasPlanDraftIntent = (message: string): boolean =>
  /(生成.*草案|计划草案|先给我?一版|给我?一版|帮我拆一下|拆一下|先拆|草案|draft)/i.test(message);

const hasPlanMaturityGateSignal = (message: string): boolean =>
  /(帮我计划|帮我规划|制定.*计划|规划.*计划|上线|发布|第一版|v1|产品|项目|部署|内测|公开|考试|考研|备考|复习|长期|学习计划|多阶段|里程碑|冲刺|未来数天|一周|两周|本月|月底|季度)/i.test(message);

export const extractPlanReadinessSlotsFromIntent = (
  intent: AgentIntent,
): PlanSlots => {
  if (intent.intent === "compose_plan") {
    const args = intent.args;
    return {
      deadline: firstUsefulString(args.suggestedDueDate),
      deliverables: normalizeStringList(args.keySteps),
      goal: firstUsefulString(args.goal, args.title),
      priority: firstUsefulString(args.suggestedPriority),
      scope: firstUsefulString(args.scope),
      successCriteria: normalizeStringList(args.successCriteria)?.join("；") ?? null,
    };
  }

  if (intent.intent === "create_plan") {
    const args = intent.args;
    return {
      deadline: firstUsefulString(args.dueDate),
      goal: firstUsefulString(args.title),
      priority: firstUsefulString(args.priority),
      scope: firstUsefulString(args.description),
    };
  }

  return {};
};

export const extractPlanSlotsFromSessionState = (
  state: unknown,
): PlanSlots | undefined => {
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    return undefined;
  }

  const root = state as Record<string, unknown>;
  const planning = root.planning;
  if (typeof planning === "object" && planning !== null && !Array.isArray(planning)) {
    const slots = (planning as Record<string, unknown>).slots;
    if (typeof slots === "object" && slots !== null && !Array.isArray(slots)) {
      return slots as PlanSlots;
    }
  }

  const planSlots = root.planSlots;
  if (typeof planSlots === "object" && planSlots !== null && !Array.isArray(planSlots)) {
    return planSlots as PlanSlots;
  }

  return undefined;
};

const formatKnownLine = (
  label: string,
  value: null | string | string[] | undefined,
): string | null => {
  if (Array.isArray(value)) {
    const items = value.map((item) => normalizeText(item)).filter(Boolean);
    return items.length > 0 ? `- ${label}：${items.join("、")}` : null;
  }

  return isNonEmptyString(value) ? `- ${label}：${normalizeText(value)}` : null;
};

export const buildPlanReadinessClarificationMessage = (
  readiness: PlanReadiness,
  slots: PlanSlots,
): string => {
  const knownLines = [
    formatKnownLine("目标", slots.goal),
    formatKnownLine("截止", slots.deadline),
  ].filter((line): line is string => Boolean(line));
  const missingLabels = readiness.missingSlots
    .map((slot) => SLOT_LABELS[slot])
    .filter((label, index, labels) => labels.indexOf(label) === index);
  const questionLines = readiness.suggestedQuestions
    .slice(0, 5)
    .map((question, index) => `${index + 1}. ${question}`);

  return [
    "可以，我先帮你把这个计划拆出来。不过在生成完整计划前，我需要确认几个关键点：",
    knownLines.length > 0 ? `\n已知信息：\n${knownLines.join("\n")}` : null,
    missingLabels.length > 0 ? `\n缺少信息：\n${missingLabels.map((label) => `- ${label}`).join("\n")}` : null,
    questionLines.length > 0 ? `\n需要确认：\n${questionLines.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

const buildTraceStep = (readiness: PlanReadiness): AgentTraceStep => ({
  detail: JSON.stringify({
    gateApplied: true,
    knownSlots: readiness.knownSlots,
    missingSlots: readiness.missingSlots,
    reason: readiness.reason,
    status: readiness.status,
  }),
  id: "plan-readiness-gate",
  kind: "analysis",
  status: "done",
  title: "计划上下文不足，转为澄清",
});

const buildPlanDraftReadyMessage = (
  readiness: PlanReadiness,
  slots: PlanSlots,
): string => {
  const goalLine = formatKnownLine("目标", slots.goal);
  const deadlineLine = formatKnownLine("截止", slots.deadline);

  return [
    "信息已经基本足够，我可以先为你生成一版计划草案。是否现在生成草案？",
    goalLine || deadlineLine
      ? `\n已整理信息：\n${[goalLine, deadlineLine].filter(Boolean).join("\n")}`
      : null,
    readiness.reason ? `\n判断：${readiness.reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

const isPlanningClarificationSession = (session: AgentSessionState): boolean =>
  session.semantic.domain === "planning" &&
  session.semantic.stage === "clarifying" &&
  session.semantic.workflow === "plan_creation" &&
  Boolean(session.planning?.slots);

const isPlanningSlotSession = (session: AgentSessionState): boolean =>
  session.semantic.domain === "planning" &&
  session.semantic.workflow === "plan_creation" &&
  Boolean(session.planning?.slots);

const formatDraftList = (items: string[] | undefined, fallback: string): string =>
  (items && items.length > 0 ? items : [fallback])
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join("\n");

const buildPlanDraftResponseMessage = (draft: PlanDraft): string => {
  const stageLines = draft.stages
    .slice(0, 5)
    .map((stage, index) => {
      const tasks = stage.tasks.slice(0, 4).map((task) => `  - ${task}`).join("\n");
      return `${index + 1}. ${stage.title}${stage.description ? `：${stage.description}` : ""}\n${tasks}`;
    });

  return [
    "我先根据你补充的信息生成一版计划草案。它还不会写入数据库，你可以继续让我调整；如果你确认后，我再准备创建计划。",
    `\n目标：${draft.goal}`,
    draft.deadline ? `截止时间：${draft.deadline}` : null,
    draft.scope ? `范围：${draft.scope}` : null,
    draft.currentProgress ? `当前进度：${draft.currentProgress}` : null,
    draft.availableTime ? `可投入时间：${draft.availableTime}` : null,
    `\n阶段：\n${stageLines.join("\n")}`,
    `\n风险 / 约束：\n${formatDraftList(draft.risks, "暂无额外风险，后续可继续补充。")}`,
    `\n验收标准：\n- ${draft.successCriteria ?? "确认第一版达到可验收状态。"}`,
    `\n下一步操作建议：\n${formatDraftList(draft.nextActions, "继续调整草案。")}`,
  ]
    .filter(Boolean)
    .join("\n");
};

const buildPlanningSessionState = ({
  draft,
  previous,
  readiness,
  slots,
  stage,
}: {
  draft?: PlanDraft | null;
  previous?: AgentSessionState;
  readiness: PlanReadiness;
  slots: PlanSlots;
  stage: "clarifying" | "drafting" | "reviewing";
}): AgentSessionState => {
  const base = previous ?? createDefaultSessionState();
  const next = structuredClone(base) as AgentSessionState;
  const topic =
    firstUsefulString(
      slots.goal,
      next.semantic.currentTarget.topic ?? undefined,
      next.conversation.lastTopic ?? undefined,
    ) ?? "计划";

  next.updatedAt = new Date().toISOString();
  next.semantic = {
    domain: "planning",
    stage,
    currentTarget: {
      entityType: "plan",
      topic,
    },
    workflow: "plan_creation",
  };
  next.conversation = {
    ...next.conversation,
    lastTopic: topic,
    lastUserIntent: "clarify",
  };
  next.planning = {
    workflow: "plan_creation",
    slots,
    readiness,
    ...(draft !== undefined ? { draft } : next.planning?.draft !== undefined ? { draft: next.planning.draft } : {}),
    lastSuggestedQuestions: readiness.suggestedQuestions.slice(0, 5),
    lastUpdatedAt: next.updatedAt,
  };

  return next;
};

export const evaluatePlanReadinessGate = (
  input: EvaluatePlanReadinessGateInput,
): PlanReadinessGateResult => {
  const normalizedSession = input.sessionState
    ? normalizeSessionState(input.sessionState)
    : undefined;
  const messageSlots = extractPlanSlotsFromMessage(input.userMessage);
  const sessionSlots =
    normalizedSession?.planning?.slots ??
    input.sessionSlots;
  const isPlanningFollowup =
    normalizedSession ? isPlanningClarificationSession(normalizedSession) : false;
  const isPlanningSlotFollowup =
    normalizedSession ? isPlanningSlotSession(normalizedSession) : false;
  const isDraftGenerationRequest =
    isPlanningSlotFollowup && hasPlanDraftIntent(input.userMessage);
  const isFollowupWithNewSlots = isPlanningFollowup && hasAnySlot(messageSlots);
  const isPlanIntent = isPlanReadinessGateIntent(input.intent);

  if (!isPlanIntent && !isFollowupWithNewSlots && !isDraftGenerationRequest) {
    return { gateApplied: false, reason: "not_plan_intent" };
  }

  if (input.confirmedActionId) {
    return { gateApplied: false, reason: "already_confirmed" };
  }

  if ((input.batchExecuteIntentCount ?? 0) > 0) {
    return { gateApplied: false, reason: "batch_execution" };
  }

  const intentSlots = extractPlanReadinessSlotsFromIntent(input.intent);
  const slots = mergePlanSlots(messageSlots, intentSlots);
  const displaySlots = mergePlanSlots(
    messageSlots,
    slots,
  );
  const readiness = evaluatePlanReadiness({
    explicitCreateIntent: hasExplicitPlanCreateIntent(input.userMessage),
    hasExistingDraft: input.hasExistingDraft,
    sessionSlots,
    slots,
    userMessage: input.userMessage,
  });
  const mergedSlots = mergePlanSlots(sessionSlots, slots);

  if (
    readiness.status === "draftable" &&
    (isPlanningFollowup || isDraftGenerationRequest)
  ) {
    try {
      const draft = generatePlanDraft({
        slots: mergedSlots,
        userMessage: input.userMessage,
      });
      const sessionState = buildPlanningSessionState({
        draft,
        previous: normalizedSession,
        readiness,
        slots: mergedSlots,
        stage: "drafting",
      });

      return {
        assistantMessage: buildPlanDraftResponseMessage(draft),
        gateApplied: true,
        intent: "clarify",
        pendingAction: null,
        planningDraft: draft,
        readiness,
        sessionState,
        traceStep: {
          ...buildTraceStep(readiness),
          title: "计划草案已生成，未写入数据库",
        },
      };
    } catch (error) {
      if (!(error instanceof PlanDraftGenerationError)) {
        throw error;
      }
    }
  }

  if (isPlanningFollowup && readiness.status === "draftable") {
    const sessionState = buildPlanningSessionState({
      previous: normalizedSession,
      readiness,
      slots: mergedSlots,
      stage: "drafting",
    });

    return {
      assistantMessage: buildPlanDraftReadyMessage(readiness, mergedSlots),
      gateApplied: true,
      intent: "clarify",
      pendingAction: null,
      readiness,
      sessionState,
      traceStep: {
        ...buildTraceStep(readiness),
        title: "计划上下文已足够，等待草案指令",
      },
    };
  }

  if (readiness.status !== "insufficient" || (isPlanIntent && !hasPlanMaturityGateSignal(input.userMessage))) {
    return {
      gateApplied: false,
      readiness,
      reason: "ready_enough",
    };
  }

  const sessionState = buildPlanningSessionState({
    previous: normalizedSession,
    readiness,
    slots: mergedSlots,
    stage: "clarifying",
  });

  return {
    assistantMessage: buildPlanReadinessClarificationMessage(readiness, mergedSlots.goal || mergedSlots.deadline ? mergedSlots : displaySlots),
    gateApplied: true,
    intent: "clarify",
    pendingAction: null,
    readiness,
    sessionState,
    traceStep: buildTraceStep(readiness),
  };
};
