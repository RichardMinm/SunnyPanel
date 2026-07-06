import type { AgentIntent, AgentTraceStep } from "../schemas";
import { createDefaultSessionState, normalizeSessionState } from "../session/normalize-session";
import type { AgentSessionState } from "../session/types";
import {
  generateScheduleDraft,
  ScheduleDraftGenerationError,
  type ScheduleDraft,
} from "./draft";
import {
  evaluateScheduleReadiness,
  extractScheduleSlotsFromMessage,
  mergeScheduleSlots,
  type ScheduleReadiness,
  type ScheduleSlotKey,
  type ScheduleSlots,
  type ScheduleSourceType,
  type ScheduleTaskSlot,
} from "./readiness";
import { classifyScheduleIntentBoundary } from "./intent-boundary";

export type ScheduleReadinessGateApplied = {
  assistantMessage: string;
  gateApplied: true;
  intent: "clarify";
  pendingAction: null;
  readiness: ScheduleReadiness;
  scheduleDraft?: ScheduleDraft | null;
  sessionState: AgentSessionState;
  traceStep: AgentTraceStep;
};

export type ScheduleReadinessGateBypass = {
  gateApplied: false;
  readiness?: ScheduleReadiness;
  reason:
    | "already_confirmed"
    | "batch_execution"
    | "not_schedule_request"
    | "ready_without_gate";
};

export type ScheduleReadinessGateResult =
  | ScheduleReadinessGateApplied
  | ScheduleReadinessGateBypass;

export type EvaluateScheduleReadinessGateInput = {
  batchExecuteIntentCount?: number;
  confirmedActionId?: null | string;
  hasExistingDraft?: boolean;
  intent: AgentIntent;
  sessionState?: null | unknown;
  userMessage: string;
};

const SCHEDULE_GATE_INTENTS = new Set<AgentIntent["intent"]>([
  "compose_schedule_item",
  "schedule_plan",
]);

const SLOT_LABELS: Record<ScheduleSlotKey, string> = {
  availableDays: "可安排日期",
  availableTimeWindows: "可用时段",
  conflictPolicy: "冲突处理策略",
  dailyCapacity: "每日 / 每周投入时间",
  deadline: "截止时间",
  durationEstimate: "任务时长估计",
  excludedDates: "排除日期",
  preferredTime: "偏好时间",
  priorityRule: "优先级规则",
  scheduleGranularity: "日程粒度",
  sourceChecklistId: "来源清单",
  sourcePlanId: "来源计划",
  sourceType: "来源类型",
  tasks: "任务列表",
};

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const hasScheduleGateSignal = (message: string): boolean =>
  /(安排到日程|排到日程|排入日程|排进这周|排进|安排时间|安排到未来|加入日程|日程|排期|schedule|calendar)/i.test(message);

const hasExplicitScheduleCreateIntent = (message: string): boolean =>
  /(保存到日程|创建日程|写入日程|就按这个日程创建|确认排入日程|确认创建日程)/i.test(message);

const firstString = (
  ...values: Array<null | string | undefined>
): string | undefined => {
  for (const value of values) {
    if (isNonEmptyString(value)) return normalizeText(value);
  }
  return undefined;
};

const hasAnyScheduleSlotValue = (slots: ScheduleSlots): boolean =>
  Object.values(slots).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return isNonEmptyString(value);
    return value !== null && value !== undefined;
  });

const getSessionScheduleSlots = (session: AgentSessionState | undefined): ScheduleSlots | undefined =>
  session?.scheduling?.slots;

const taskFromTitle = (
  title: string,
  options?: {
    priority?: ScheduleTaskSlot["priority"];
    sourceChecklistId?: number | null;
    sourceChecklistItemKey?: string | null;
    sourcePlanId?: number | null;
    sourceTaskTitle?: string | null;
  },
): ScheduleTaskSlot => ({
  title: normalizeText(title),
  ...(options?.priority ? { priority: options.priority } : {}),
  ...(isPositiveNumber(options?.sourceChecklistId)
    ? { sourceChecklistId: options.sourceChecklistId }
    : options?.sourceChecklistId === null
      ? { sourceChecklistId: null }
      : {}),
  ...(isNonEmptyString(options?.sourceChecklistItemKey)
    ? { sourceChecklistItemKey: normalizeText(options.sourceChecklistItemKey) }
    : options?.sourceChecklistItemKey === null
      ? { sourceChecklistItemKey: null }
      : {}),
  ...(isPositiveNumber(options?.sourcePlanId)
    ? { sourcePlanId: options.sourcePlanId }
    : options?.sourcePlanId === null
      ? { sourcePlanId: null }
      : {}),
  ...(isNonEmptyString(options?.sourceTaskTitle)
    ? { sourceTaskTitle: normalizeText(options.sourceTaskTitle) }
    : options?.sourceTaskTitle === null
      ? { sourceTaskTitle: null }
      : {}),
});

const extractSourceSlotsFromPlanning = (
  session: AgentSessionState | undefined,
): ScheduleSlots => {
  const planning = session?.planning;
  const checklistDraft = planning?.checklistDraft;

  if (checklistDraft) {
    const tasks: ScheduleTaskSlot[] = [];
    checklistDraft.groups.forEach((group, groupIndex) => {
      group.items.forEach((item, itemIndex) => {
        if (item.done === true || !isNonEmptyString(item.title)) return;
        tasks.push(taskFromTitle(item.title, {
          priority: item.priority ?? null,
          sourceChecklistItemKey: `${groupIndex + 1}-${itemIndex + 1}-${normalizeText(item.title)}`,
          sourcePlanId: checklistDraft.sourcePlanId ?? planning?.sourcePlanId ?? null,
          sourceTaskTitle: item.stageTitle ?? group.title,
        }));
      });
    });

    return {
      sourceType: "checklist",
      ...(isPositiveNumber(checklistDraft.sourcePlanId ?? planning?.sourcePlanId)
        ? { sourcePlanId: checklistDraft.sourcePlanId ?? planning?.sourcePlanId }
        : {}),
      ...(tasks.length > 0 ? { tasks } : {}),
    };
  }

  const planDraft = planning?.draft;
  if (planDraft) {
    const tasks = planDraft.stages.flatMap((stage) =>
      stage.tasks
        .filter(isNonEmptyString)
        .map((task) => taskFromTitle(task, {
          sourcePlanId: planDraft.sourcePlanId ?? planning?.sourcePlanId ?? null,
          sourceTaskTitle: stage.title,
        })),
    );

    return {
      sourceType: "plan",
      ...(isPositiveNumber(planDraft.sourcePlanId ?? planning?.sourcePlanId)
        ? { sourcePlanId: planDraft.sourcePlanId ?? planning?.sourcePlanId }
        : {}),
      ...(tasks.length > 0 ? { tasks } : {}),
    };
  }

  if (isPositiveNumber(planning?.sourcePlanId)) {
    return {
      sourcePlanId: planning.sourcePlanId,
      sourceType: "plan",
    };
  }

  return {};
};

const extractSourceSlotsFromIntent = (intent: AgentIntent): ScheduleSlots => {
  if (intent.intent === "schedule_plan") {
    return {
      sourcePlanId: intent.args.planId,
      sourceType: "plan",
      ...(isNonEmptyString(intent.args.startDate) ? { deadline: normalizeText(intent.args.startDate) } : {}),
      ...(isPositiveNumber(intent.args.defaultDurationMinutes)
        ? { durationEstimate: `${intent.args.defaultDurationMinutes} 分钟` }
        : {}),
      ...(isNonEmptyString(intent.args.defaultStartTime)
        ? { preferredTime: normalizeText(intent.args.defaultStartTime) }
        : {}),
    };
  }

  if (intent.intent === "compose_schedule_item") {
    const sourceType: ScheduleSourceType | undefined =
      intent.args.sourceType === "plan" || intent.args.relatedPlanId
        ? "plan"
        : intent.args.sourceType === "checklist" || intent.args.relatedChecklistId
          ? "checklist"
          : undefined;
    const taskTitle = firstString(intent.args.title, intent.args.sourceText, intent.args.description);

    return {
      ...(sourceType ? { sourceType } : {}),
      ...(isPositiveNumber(intent.args.relatedPlanId) ? { sourcePlanId: intent.args.relatedPlanId } : {}),
      ...(isPositiveNumber(intent.args.relatedChecklistId)
        ? { sourceChecklistId: intent.args.relatedChecklistId }
        : {}),
      ...(isNonEmptyString(intent.args.date) ? { deadline: normalizeText(intent.args.date) } : {}),
      ...(isNonEmptyString(intent.args.startTime) || isNonEmptyString(intent.args.endTime)
        ? {
            availableTimeWindows: [{
              ...(isNonEmptyString(intent.args.startTime) ? { startTime: normalizeText(intent.args.startTime) } : {}),
              ...(isNonEmptyString(intent.args.endTime) ? { endTime: normalizeText(intent.args.endTime) } : {}),
            }],
          }
        : {}),
      ...(taskTitle && (sourceType || intent.args.relatedChecklistItemKey)
        ? {
            tasks: [taskFromTitle(taskTitle, {
              priority: intent.args.priority ?? null,
              sourceChecklistId: intent.args.relatedChecklistId ?? null,
              sourceChecklistItemKey: intent.args.relatedChecklistItemKey ?? null,
              sourcePlanId: intent.args.relatedPlanId ?? null,
            })],
          }
        : {}),
    };
  }

  return {};
};

const hasTaskSource = (slots: ScheduleSlots): boolean =>
  Boolean(
    isPositiveNumber(slots.sourcePlanId) ||
      isPositiveNumber(slots.sourceChecklistId) ||
      (Array.isArray(slots.tasks) && slots.tasks.length > 0),
  );

const isSchedulingSession = (session: AgentSessionState | undefined): boolean =>
  session?.semantic.domain === "schedule" &&
  session.semantic.workflow === "schedule_composition" &&
  Boolean(session.scheduling?.slots);

const hasFollowupSlotSignal = (slots: ScheduleSlots): boolean => {
  const withoutSource: ScheduleSlots = {
    availableDays: slots.availableDays,
    availableTimeWindows: slots.availableTimeWindows,
    conflictPolicy: slots.conflictPolicy,
    dailyCapacity: slots.dailyCapacity,
    deadline: slots.deadline,
    durationEstimate: slots.durationEstimate,
    excludedDates: slots.excludedDates,
    preferredTime: slots.preferredTime,
    priorityRule: slots.priorityRule,
    scheduleGranularity: slots.scheduleGranularity,
  };
  return hasAnyScheduleSlotValue(withoutSource);
};

const formatKnownLine = (
  label: string,
  value: null | number | string | unknown[] | undefined,
): string | null => {
  if (typeof value === "number") return `- ${label}：${value}`;
  if (Array.isArray(value)) return value.length > 0 ? `- ${label}：${value.length} 项` : null;
  return isNonEmptyString(value) ? `- ${label}：${normalizeText(value)}` : null;
};

const buildClarificationMessage = (
  readiness: ScheduleReadiness,
  slots: ScheduleSlots,
): string => {
  const knownLines = [
    formatKnownLine("来源", slots.sourceType),
    formatKnownLine("任务", slots.tasks),
    formatKnownLine("截止", slots.deadline),
    formatKnownLine("偏好时间", slots.preferredTime),
    formatKnownLine("可用时段", slots.availableTimeWindows),
    formatKnownLine("投入时间", slots.dailyCapacity),
  ].filter((line): line is string => Boolean(line));
  const missingLabels = readiness.missingSlots
    .map((slot) => SLOT_LABELS[slot])
    .filter((label, index, labels) => labels.indexOf(label) === index);
  const questionLines = readiness.suggestedQuestions
    .slice(0, 5)
    .map((question, index) => `${index + 1}. ${question}`);

  return [
    "可以，我先不写入日程。要把这些任务排进日程前，我需要确认几个关键点：",
    knownLines.length > 0 ? `\n已知信息：\n${knownLines.join("\n")}` : null,
    missingLabels.length > 0 ? `\n缺少信息：\n${missingLabels.map((label) => `- ${label}`).join("\n")}` : null,
    questionLines.length > 0 ? `\n需要确认：\n${questionLines.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

const formatDraftList = (items: string[] | undefined, fallback: string): string =>
  (items && items.length > 0 ? items : [fallback])
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join("\n");

const buildDraftItemsPreview = (draft: ScheduleDraft): string =>
  draft.items
    .slice(0, 8)
    .map((item, index) => {
      const time = [item.date, item.startTime && item.endTime ? `${item.startTime}-${item.endTime}` : item.startTime ?? item.endTime]
        .filter(Boolean)
        .join(" ");
      return `${index + 1}. ${item.title}${time ? `：${time}` : "：时间待定"}`;
    })
    .join("\n");

const buildScheduleDraftResponseMessage = (
  draft: ScheduleDraft,
  readiness: ScheduleReadiness,
): string => {
  const sourceLabel =
    draft.sourceType === "plan"
      ? "计划"
      : draft.sourceType === "checklist"
        ? "清单"
        : "手动任务";

  return [
    "我先根据你补充的信息生成一版日程草案。它还不会写入日程，你可以继续调整；如果确认后，我再准备创建日程。",
    `\n来源：${sourceLabel}`,
    `任务数量：${draft.items.length}`,
    `\n预计安排：\n${buildDraftItemsPreview(draft)}`,
    `\n假设：\n${formatDraftList(draft.assumptions, "这是草案，尚未写入日程。")}`,
    `\n冲突提示：\n${formatDraftList(draft.conflicts, "尚未检查已有日程冲突，确认写入前需要进行冲突检测。")}`,
    `\n你可以回复：\n${formatDraftList(draft.nextActions, "调整时间")}`,
    readiness.reason ? `\n判断：${readiness.reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

const buildConfirmableMessage = (): string =>
  "我已经有一版日程草案。下一步可以准备创建日程，但需要进入最终确认；K3 阶段不会创建 pendingAction，也不会写入日程。";

const buildTraceStep = (readiness: ScheduleReadiness, title: string): AgentTraceStep => ({
  detail: JSON.stringify({
    gateApplied: true,
    knownSlots: readiness.knownSlots,
    missingSlots: readiness.missingSlots,
    reason: readiness.reason,
    status: readiness.status,
  }),
  id: "schedule-readiness-gate",
  kind: "analysis",
  status: "done",
  title,
});

const inferWorkflow = (sourceType: ScheduleSourceType | null | undefined): NonNullable<AgentSessionState["scheduling"]>["workflow"] => {
  if (sourceType === "plan") return "schedule_from_plan";
  if (sourceType === "checklist") return "schedule_from_checklist";
  return "manual_schedule";
};

const buildSchedulingSessionState = ({
  draft,
  previous,
  readiness,
  slots,
  stage,
}: {
  draft?: ScheduleDraft | null;
  previous?: AgentSessionState;
  readiness: ScheduleReadiness;
  slots: ScheduleSlots;
  stage: "clarifying" | "drafting" | "confirming";
}): AgentSessionState => {
  const base = previous ?? createDefaultSessionState();
  const next = structuredClone(base) as AgentSessionState;
  const taskTitle = slots.tasks?.find((task) => isNonEmptyString(task.title))?.title;
  const topic =
    firstString(
      taskTitle,
      next.semantic.currentTarget.topic ?? undefined,
      next.conversation.lastTopic ?? undefined,
    ) ?? "日程安排";

  next.updatedAt = new Date().toISOString();
  next.semantic = {
    currentTarget: {
      entityType: "schedule",
      topic,
    },
    domain: "schedule",
    stage,
    workflow: "schedule_composition",
  };
  next.conversation = {
    ...next.conversation,
    lastTopic: topic,
    lastUserIntent: "clarify",
  };
  next.pending = { ...next.pending };
  delete next.pending.confirmation;
  next.scheduling = {
    workflow: inferWorkflow(slots.sourceType),
    ...(slots.sourceType ? { sourceType: slots.sourceType } : {}),
    ...(isPositiveNumber(slots.sourcePlanId) ? { sourcePlanId: slots.sourcePlanId } : {}),
    ...(isPositiveNumber(slots.sourceChecklistId) ? { sourceChecklistId: slots.sourceChecklistId } : {}),
    slots,
    readiness,
    ...(draft !== undefined
      ? { draft }
      : next.scheduling?.draft !== undefined
        ? { draft: next.scheduling.draft }
        : {}),
    lastSuggestedQuestions: readiness.suggestedQuestions.slice(0, 5),
    lastUpdatedAt: next.updatedAt,
  };

  return next;
};

export const evaluateScheduleReadinessGate = (
  input: EvaluateScheduleReadinessGateInput,
): ScheduleReadinessGateResult => {
  if (input.confirmedActionId) {
    return { gateApplied: false, reason: "already_confirmed" };
  }

  if ((input.batchExecuteIntentCount ?? 0) > 0) {
    return { gateApplied: false, reason: "batch_execution" };
  }

  const normalizedSession = input.sessionState
    ? normalizeSessionState(input.sessionState)
    : undefined;
  const boundary = classifyScheduleIntentBoundary({
    hasPendingAction: Boolean(input.confirmedActionId),
    hasSchedulingDraft: Boolean(normalizedSession?.scheduling?.draft),
    routerIntent: input.intent.intent,
    userMessage: input.userMessage,
  });

  // Read-only schedule queries must not inherit scheduling source slots from
  // previous plan/checklist turns. Otherwise "查看日程安排" can be mistaken for
  // "把上一轮计划安排进日程".
  if (boundary.intent === "query_schedule") {
    return { gateApplied: false, reason: "not_schedule_request" };
  }

  const messageSlots = extractScheduleSlotsFromMessage(input.userMessage);
  const intentSlots = extractSourceSlotsFromIntent(input.intent);
  const planningSourceSlots = extractSourceSlotsFromPlanning(normalizedSession);
  const sessionSlots = getSessionScheduleSlots(normalizedSession);
  const sourceSlots = mergeScheduleSlots(planningSourceSlots, intentSlots);
  const slots = mergeScheduleSlots(
    mergeScheduleSlots(sessionSlots, sourceSlots),
    messageSlots,
  );
  const isScheduleIntent = SCHEDULE_GATE_INTENTS.has(input.intent.intent);
  const isFollowup = isSchedulingSession(normalizedSession);
  const shouldConsider =
    (hasScheduleGateSignal(input.userMessage) && hasTaskSource(mergeScheduleSlots(sourceSlots, sessionSlots))) ||
    (isScheduleIntent && hasTaskSource(slots)) ||
    (isFollowup && hasFollowupSlotSignal(messageSlots));

  if (!shouldConsider) {
    return { gateApplied: false, reason: "not_schedule_request" };
  }

  const readiness = evaluateScheduleReadiness({
    explicitCreateIntent: hasExplicitScheduleCreateIntent(input.userMessage),
    hasExistingDraft: input.hasExistingDraft ?? Boolean(normalizedSession?.scheduling?.draft),
    sessionSlots: mergeScheduleSlots(sessionSlots, sourceSlots),
    slots: messageSlots,
    userMessage: input.userMessage,
  });
  const mergedSlots = mergeScheduleSlots(
    mergeScheduleSlots(sessionSlots, sourceSlots),
    messageSlots,
  );

  if (readiness.status === "insufficient") {
    const sessionState = buildSchedulingSessionState({
      previous: normalizedSession,
      readiness,
      slots: mergedSlots,
      stage: "clarifying",
    });

    return {
      assistantMessage: buildClarificationMessage(readiness, mergedSlots),
      gateApplied: true,
      intent: "clarify",
      pendingAction: null,
      readiness,
      sessionState,
      traceStep: buildTraceStep(readiness, "日程上下文不足，转为澄清"),
    };
  }

  if (readiness.status === "draftable") {
    let draft: ScheduleDraft;
    try {
      draft = generateScheduleDraft({
        slots: mergedSlots,
        userMessage: input.userMessage,
      });
    } catch (error) {
      if (!(error instanceof ScheduleDraftGenerationError)) {
        throw error;
      }

      const sessionState = buildSchedulingSessionState({
        previous: normalizedSession,
        readiness: {
          ...readiness,
          status: "insufficient",
          reason: "日程草案生成缺少任务来源。",
          suggestedQuestions: ["要安排哪些任务，或者从哪份计划 / 清单开始？"],
        },
        slots: mergedSlots,
        stage: "clarifying",
      });

      return {
        assistantMessage: buildClarificationMessage(sessionState.scheduling!.readiness!, mergedSlots),
        gateApplied: true,
        intent: "clarify",
        pendingAction: null,
        readiness: sessionState.scheduling!.readiness!,
        sessionState,
        traceStep: buildTraceStep(sessionState.scheduling!.readiness!, "日程草案生成缺少任务来源"),
      };
    }

    const sessionState = buildSchedulingSessionState({
      draft,
      previous: normalizedSession,
      readiness,
      slots: mergedSlots,
      stage: "drafting",
    });

    return {
      assistantMessage: buildScheduleDraftResponseMessage(draft, readiness),
      gateApplied: true,
      intent: "clarify",
      pendingAction: null,
      readiness,
      scheduleDraft: draft,
      sessionState,
      traceStep: buildTraceStep(readiness, "日程草案已生成，未写入日程"),
    };
  }

  const sessionState = buildSchedulingSessionState({
    previous: normalizedSession,
    readiness,
    slots: mergedSlots,
    stage: "confirming",
  });

  return {
    assistantMessage: buildConfirmableMessage(),
    gateApplied: true,
    intent: "clarify",
    pendingAction: null,
    readiness,
    sessionState,
    traceStep: buildTraceStep(readiness, "日程可进入创建准备，但 K2 不写入"),
  };
};
