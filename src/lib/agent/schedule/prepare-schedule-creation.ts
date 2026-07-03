import type {
  AgentIntent,
  AgentTraceStep,
  CreateScheduleItemsArgs,
} from "@/lib/agent/schemas";
import { normalizeSessionState } from "@/lib/agent/session/normalize-session";
import type { AgentSessionState } from "@/lib/agent/session/types";

import type { ScheduleDraft, ScheduleDraftItem } from "./draft";

export const SCHEDULE_DRAFT_PREPARE_CREATE_PROMPT = "就按这个日程草案创建日程";
const MAX_CREATE_SCHEDULE_ITEMS = 24;

export type BuildCreateScheduleItemsInputFromDraftError = {
  code: "invalid_schedule_draft" | "undated_schedule_draft_items";
  missingFields: string[];
};

export type BuildCreateScheduleItemsInputFromDraftResult =
  | {
      args: CreateScheduleItemsArgs;
      ok: true;
    }
  | {
      error: BuildCreateScheduleItemsInputFromDraftError;
      ok: false;
    };

export type ScheduleCreationPreparationResult =
  | {
      reason: "not_prepare_request" | "not_scheduling_session";
      status: "not_prepare";
    }
  | {
      assistantMessage: string;
      sessionState: AgentSessionState;
      status: "missing_draft";
      traceStep: AgentTraceStep;
    }
  | {
      assistantMessage: string;
      error: BuildCreateScheduleItemsInputFromDraftError;
      sessionState: AgentSessionState;
      status: "invalid_draft";
      traceStep: AgentTraceStep;
    }
  | {
      args: CreateScheduleItemsArgs;
      intent: Extract<AgentIntent, { intent: "create_schedule_items" }>;
      sessionState: AgentSessionState;
      status: "prepared";
      traceStep: AgentTraceStep;
    };

export type EvaluateScheduleCreationPreparationInput = {
  intent: AgentIntent;
  sessionState?: null | unknown;
  userMessage: string;
};

const normalizeText = (value: null | string | undefined): string =>
  value?.trim().replace(/\s+/g, " ") ?? "";

const isUsefulNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const cleanOptional = (value: null | string | undefined): null | string =>
  normalizeText(value) || null;

const itemDateField = (index: number) => `items[${index}].date`;

const hasUsefulTitle = (item: ScheduleDraftItem): boolean =>
  normalizeText(item.title).length > 0;

const validateDraft = (draft: ScheduleDraft): BuildCreateScheduleItemsInputFromDraftError | null => {
  const missingFields: string[] = [];

  if (!normalizeText(draft.title)) missingFields.push("title");
  if (!Array.isArray(draft.items) || draft.items.length === 0 || !draft.items.some(hasUsefulTitle)) {
    missingFields.push("items");
  }

  if (missingFields.length > 0) {
    return {
      code: "invalid_schedule_draft",
      missingFields,
    };
  }

  const undatedFields = draft.items
    .slice(0, MAX_CREATE_SCHEDULE_ITEMS)
    .map((item, index) => (hasUsefulTitle(item) && !normalizeText(item.date) ? itemDateField(index) : null))
    .filter((field): field is string => Boolean(field));

  if (undatedFields.length > 0) {
    return {
      code: "undated_schedule_draft_items",
      missingFields: undatedFields,
    };
  }

  return null;
};

const buildSourceText = (draft: ScheduleDraft): string =>
  [
    "从日程草案准备创建正式日程。",
    `标题：${normalizeText(draft.title)}`,
    `来源：${draft.sourceType}`,
    isUsefulNumber(draft.sourcePlanId) ? `来源计划：${draft.sourcePlanId}` : null,
    isUsefulNumber(draft.sourceChecklistId) ? `来源清单：${draft.sourceChecklistId}` : null,
    draft.assumptions?.length ? `草案假设：${draft.assumptions.map(normalizeText).filter(Boolean).join("；")}` : null,
  ].filter(Boolean).join("\n");

const buildCreateItem = (
  draft: ScheduleDraft,
  item: ScheduleDraftItem,
): CreateScheduleItemsArgs["items"][number] => {
  const relatedPlanId = isUsefulNumber(item.sourcePlanId)
    ? item.sourcePlanId
    : isUsefulNumber(draft.sourcePlanId)
      ? draft.sourcePlanId
      : null;
  const relatedChecklistId = isUsefulNumber(item.sourceChecklistId)
    ? item.sourceChecklistId
    : isUsefulNumber(draft.sourceChecklistId)
      ? draft.sourceChecklistId
      : null;
  const startTime = cleanOptional(item.startTime);
  const endTime = cleanOptional(item.endTime);
  const draftConflictNote = draft.conflicts?.map(normalizeText).filter(Boolean).join("；") ?? "";

  return {
    conflictNote: cleanOptional(item.conflictNote) ?? cleanOptional(draftConflictNote),
    date: normalizeText(item.date),
    description: cleanOptional(item.sourceTaskTitle),
    endTime,
    isAllDay: !startTime && !endTime,
    priority: null,
    relatedChecklistId,
    relatedChecklistItemKey: cleanOptional(item.sourceChecklistItemKey),
    relatedPlanId,
    sourceTaskTitle: cleanOptional(item.sourceTaskTitle),
    startTime,
    title: normalizeText(item.title),
  };
};

export const buildCreateScheduleItemsInputFromDraft = (
  draft: ScheduleDraft,
): BuildCreateScheduleItemsInputFromDraftResult => {
  const error = validateDraft(draft);

  if (error) {
    return {
      error,
      ok: false,
    };
  }

  const items = draft.items
    .filter(hasUsefulTitle)
    .slice(0, MAX_CREATE_SCHEDULE_ITEMS)
    .map((item) => buildCreateItem(draft, item));

  return {
    args: {
      items,
      sourceChecklistId: isUsefulNumber(draft.sourceChecklistId) ? draft.sourceChecklistId : null,
      sourcePlanId: isUsefulNumber(draft.sourcePlanId) ? draft.sourcePlanId : null,
      sourceText: buildSourceText(draft),
      sourceType: draft.sourceType,
      title: normalizeText(draft.title),
    },
    ok: true,
  };
};

const isSchedulingCreationSession = (session: AgentSessionState): boolean =>
  session.semantic.domain === "schedule" ||
  session.semantic.workflow === "schedule_composition" ||
  session.scheduling?.workflow === "schedule_from_plan" ||
  session.scheduling?.workflow === "schedule_from_checklist" ||
  session.scheduling?.workflow === "manual_schedule";

const hasPrepareIntent = (message: string): boolean =>
  /(就按这个日程草案创建日程|准备创建日程|保存到日程|写入日程|创建日程|确认排入日程|按这个草案创建日程|按这个日程草案创建日程)/u.test(message);

const buildTraceStep = (
  title: string,
  detail: Record<string, unknown>,
  kind: AgentTraceStep["kind"] = "analysis",
): AgentTraceStep => ({
  detail: JSON.stringify(detail),
  id: "prepare-schedule-creation",
  kind,
  status: kind === "error" ? "error" : "done",
  title,
});

const buildSessionState = (
  previous: AgentSessionState,
  stage: AgentSessionState["semantic"]["stage"],
): AgentSessionState => {
  const next = structuredClone(previous) as AgentSessionState;

  next.semantic = {
    ...next.semantic,
    domain: "schedule",
    stage,
    workflow: "schedule_composition",
  };
  next.conversation = {
    ...next.conversation,
    lastUserIntent: "prepare_schedule_creation",
  };
  next.scheduling = {
    ...(next.scheduling ?? {}),
    workflow: next.scheduling?.workflow ?? "manual_schedule",
  };

  return next;
};

const invalidDraftMessage = (error: BuildCreateScheduleItemsInputFromDraftError): string => {
  if (error.code === "undated_schedule_draft_items") {
    return "当前日程草案仍有未确定日期的项目，请先补充具体日期或让我重新调整草案。";
  }

  return `当前日程草案缺少关键信息：${error.missingFields.join("、")}。请先修改草案后再准备创建。`;
};

export const evaluateScheduleCreationPreparation = (
  input: EvaluateScheduleCreationPreparationInput,
): ScheduleCreationPreparationResult => {
  const normalizedSession = input.sessionState
    ? normalizeSessionState(input.sessionState)
    : null;

  if (!normalizedSession || !isSchedulingCreationSession(normalizedSession)) {
    return {
      reason: "not_scheduling_session",
      status: "not_prepare",
    };
  }

  if (!hasPrepareIntent(input.userMessage)) {
    return {
      reason: "not_prepare_request",
      status: "not_prepare",
    };
  }

  const draft = normalizedSession.scheduling?.draft ?? null;

  if (!draft) {
    const sessionState = buildSessionState(normalizedSession, "reviewing");

    return {
      assistantMessage: "当前没有可创建的日程草案，请先生成日程草案。",
      sessionState,
      status: "missing_draft",
      traceStep: buildTraceStep("没有可创建的日程草案", {
        gateApplied: true,
        reason: "missing_draft",
        status: "missing_draft",
      }, "error"),
    };
  }

  const buildResult = buildCreateScheduleItemsInputFromDraft(draft);
  const sessionState = buildSessionState(normalizedSession, "confirming");

  if (!buildResult.ok) {
    return {
      assistantMessage: invalidDraftMessage(buildResult.error),
      error: buildResult.error,
      sessionState,
      status: "invalid_draft",
      traceStep: buildTraceStep("日程草案无法进入创建确认", {
        missingFields: buildResult.error.missingFields,
        reason: buildResult.error.code,
        status: "invalid_draft",
      }, "error"),
    };
  }

  const conflictPolicy = normalizedSession.scheduling?.slots?.conflictPolicy ?? null;
  const args: CreateScheduleItemsArgs = {
    ...buildResult.args,
    ...(conflictPolicy ? { conflictPolicy } : {}),
  };

  const intent: Extract<AgentIntent, { intent: "create_schedule_items" }> = {
    args,
    confidence: Math.max(input.intent.confidence ?? 0.85, 0.9),
    intent: "create_schedule_items",
  };

  return {
    args,
    intent,
    sessionState,
    status: "prepared",
    traceStep: buildTraceStep("日程草案已准备进入创建确认", {
      gateApplied: true,
      intent: "prepare_schedule_creation",
      itemCount: buildResult.args.items.length,
      nextIntent: "create_schedule_items",
      stage: "confirming",
      status: "prepared",
      title: buildResult.args.title,
    }),
  };
};

export const applyScheduleCreationPreparationToResolution = <T extends { intent: AgentIntent }>(
  resolution: T,
  preparation: Extract<ScheduleCreationPreparationResult, { status: "prepared" }>,
): T => ({
  ...resolution,
  intent: preparation.intent,
});
