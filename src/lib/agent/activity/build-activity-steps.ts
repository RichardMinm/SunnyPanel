import type { ChecklistDraft } from "@/lib/agent/planning/checklist-draft";
import type { PlanDraft } from "@/lib/agent/planning/draft";
import type { ScheduleDraft } from "@/lib/agent/schedule/draft";
import type { AgentChatMessage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { isRecord } from "@/lib/shared/is-record";
import { sanitizeAgentTraceEvent, type AgentTraceEventPayload, type AgentTracePhase, type AgentTraceStatus } from "@/lib/agent/trace";

import { sanitizeAgentActivityDetailsRecord } from "./sanitize";
import type { AgentActivityKind, AgentActivityStatus, AgentActivityStep } from "./types";

export type BuildAgentActivityStepsInput = {
  assistantMessage?: null | string;
  error?: {
    code?: string;
    message: string;
  } | null;
  intent?: null | string;
  lastRollbackSourceRunId?: number | null;
  pendingAction?: null | PendingAction;
  planningChecklistDraft?: ChecklistDraft | null;
  planningDraft?: PlanDraft | null;
  rollbackResult?: unknown;
  schedulingDraft?: ScheduleDraft | null;
  backendTraceEvents?: AgentTraceEventPayload[];
  traceSteps?: AgentTraceStep[];
};

const makeStep = (
  id: string,
  kind: AgentActivityKind,
  status: AgentActivityStatus,
  title: string,
  options: Omit<AgentActivityStep, "id" | "kind" | "status" | "title"> = {},
): AgentActivityStep => ({
  id,
  kind,
  status,
  title,
  visibility: "user",
  ...options,
  ...(options.details ? { details: sanitizeAgentActivityDetailsRecord(options.details) } : {}),
});

const traceKindToActivityKind: Record<AgentTraceStep["kind"], AgentActivityKind> = {
  action: "calling_tool",
  analysis: "understanding",
  complete: "completed",
  context: "loading_context",
  error: "failed",
  write: "writing_database",
};

const traceStatusToActivityStatus: Record<AgentTraceStep["status"], AgentActivityStatus> = {
  done: "success",
  error: "failed",
  running: "running",
};

const buildDeveloperTraceSteps = (traceSteps: AgentTraceStep[] = []): AgentActivityStep[] =>
  traceSteps.map((step) =>
    makeStep(
      `trace:${step.id}`,
      traceKindToActivityKind[step.kind],
      traceStatusToActivityStatus[step.status],
      step.title,
      {
        details: step.detail ? { detail: step.detail } : undefined,
        summary: step.detail,
        visibility: "developer",
      },
    ),
  );

const backendTracePhaseToActivityKind: Record<AgentTracePhase, AgentActivityKind> = {
  api_call: "calling_api",
  draft: "generating_draft",
  dry_run: "dry_run",
  error: "failed",
  execute: "executing",
  finalize: "completed",
  pending_confirmation: "awaiting_confirmation",
  policy_guard: "policy_guard",
  readiness: "checking_readiness",
  receipt: "recording_receipt",
  rollback: "rollback",
  router: "routing",
  session: "loading_context",
  slot_extraction: "understanding",
  llm_availability: "failed",
  tool_planning: "planning",
  tool_planner_unavailable: "failed",
  tool_call: "calling_tool",
  user_message: "received",
};

const backendTraceStatusToActivityStatus: Record<AgentTraceStatus, AgentActivityStatus> = {
  failed: "failed",
  skipped: "skipped",
  started: "running",
  success: "success",
  warning: "warning",
};

const detailsForBackendTraceEvent = (event: AgentTraceEventPayload) =>
  sanitizeAgentActivityDetailsRecord({
    ...(event.apiPath ? { apiPath: event.apiPath } : {}),
    ...(event.createdAt ? { createdAt: event.createdAt } : {}),
    ...(event.error ? { error: event.error } : {}),
    ...(event.inputPreview !== undefined ? { inputPreview: event.inputPreview } : {}),
    ...(event.method ? { method: event.method } : {}),
    ...(event.outputPreview !== undefined ? { outputPreview: event.outputPreview } : {}),
    phase: event.phase,
    status: event.status,
    ...(event.statusCode !== undefined ? { statusCode: event.statusCode } : {}),
  });

const stableTraceIdPart = (value: string | undefined, fallback: string) =>
  (value && value.trim().length > 0 ? value : fallback)
    .replace(/[^a-z0-9._:-]+/gi, "-")
    .slice(0, 96);

const backendTraceActivityStepId = (
  event: AgentTraceEventPayload,
  index: number,
) =>
  [
    "backend-trace",
    stableTraceIdPart(event.createdAt, `index-${index}`),
    stableTraceIdPart(event.phase, "phase"),
    stableTraceIdPart(event.status, "status"),
    stableTraceIdPart(event.actionId ?? event.intent ?? event.toolName ?? event.title, "event"),
  ].join(":");

const backendTraceUserActivityStepId = (event: AgentTraceEventPayload) =>
  [
    "backend-user-trace",
    stableTraceIdPart(event.phase, "phase"),
    stableTraceIdPart(event.actionId ?? event.intent ?? event.toolName ?? event.apiPath ?? "event", "event"),
  ].join(":");

const isScheduleTraceEvent = (event: AgentTraceEventPayload) =>
  event.intent === "query_schedule" ||
  event.intent === "create_schedule_items" ||
  /schedule|日程/u.test(`${event.apiPath ?? ""} ${event.toolName ?? ""} ${event.title}`);

const titleForBackendUserActivity = (event: AgentTraceEventPayload) => {
  const isRunning = event.status === "started";
  const isSuccess = event.status === "success";

  if (event.phase === "user_message" || event.phase === "router") {
    return isSuccess ? "已理解你的请求" : "正在理解你的请求";
  }

  if (event.phase === "session") {
    return isSuccess ? "已读取工作区上下文" : "正在读取工作区上下文";
  }

  if (event.phase === "api_call") {
    if (isScheduleTraceEvent(event)) {
      return isSuccess ? "已读取本地日程" : "正在查询本地日程";
    }

    return isSuccess ? "已读取工作区数据" : "正在读取工作区数据";
  }

  if (event.phase === "readiness") {
    return isSuccess ? "信息检查完成" : "正在检查信息是否足够";
  }

  if (event.phase === "draft") {
    return isSuccess ? "已生成草案" : "正在生成草案";
  }

  if (event.phase === "dry_run") {
    return isSuccess ? "已生成写入预览" : "正在生成写入预览";
  }

  if (event.phase === "policy_guard") {
    return isSuccess ? "已通过安全检查" : "正在检查安全边界";
  }

  if (event.phase === "pending_confirmation") {
    return "等待你确认";
  }

  if (event.phase === "execute") {
    return isSuccess ? "已执行写入" : "正在执行写入";
  }

  if (event.phase === "receipt") {
    return isSuccess ? "已记录操作凭证" : "正在记录操作凭证";
  }

  if (event.phase === "rollback") {
    return isSuccess ? "已完成撤销" : "正在撤销本次操作";
  }

  if (event.phase === "finalize") {
    return isRunning ? "正在整理结果" : "已完成";
  }

  if (event.phase === "tool_call") {
    return isSuccess ? "数据整理完成" : "正在读取或整理数据";
  }

  if (event.phase === "tool_planning") {
    return isSuccess ? "已规划执行步骤" : "正在规划执行步骤";
  }

  if (event.phase === "slot_extraction") {
    return isSuccess ? "已识别关键信息" : "正在提取关键信息";
  }

  if (event.phase === "error" || event.status === "failed") {
    return "执行失败";
  }

  return isSuccess ? "已完成当前步骤" : "正在处理";
};

const statusForBackendUserActivity = (
  event: AgentTraceEventPayload,
): AgentActivityStatus => {
  if (event.phase === "pending_confirmation") {
    return "waiting";
  }

  return backendTraceStatusToActivityStatus[event.status];
};

export const backendTraceEventToUserActivityStep = (
  rawEvent: AgentTraceEventPayload,
): AgentActivityStep => {
  const event = sanitizeAgentTraceEvent(rawEvent);

  return makeStep(
    backendTraceUserActivityStepId(event),
    backendTracePhaseToActivityKind[event.phase],
    statusForBackendUserActivity(event),
    titleForBackendUserActivity(event),
    {
      ...(event.error
        ? {
            error: {
              ...(event.error.code ? { code: event.error.code } : {}),
              message: event.error.message,
            },
          }
        : {}),
      visibility: "user",
    },
  );
};

export const backendTraceEventToActivityStep = (
  rawEvent: AgentTraceEventPayload,
  index = 0,
): AgentActivityStep => {
  const event = sanitizeAgentTraceEvent(rawEvent);

  return makeStep(
    backendTraceActivityStepId(event, index),
    backendTracePhaseToActivityKind[event.phase],
    backendTraceStatusToActivityStatus[event.status],
    event.title,
    {
      ...(event.actionId ? { actionId: event.actionId } : {}),
      details: detailsForBackendTraceEvent(event),
      ...(event.error
        ? {
            error: {
              ...(event.error.code ? { code: event.error.code } : {}),
              message: event.error.message,
            },
          }
        : {}),
      ...(event.intent ? { intent: event.intent } : {}),
      ...(event.latencyMs !== undefined ? { latencyMs: event.latencyMs } : {}),
      ...(event.runId ? { runId: event.runId } : {}),
      ...(event.summary ? { summary: event.summary } : {}),
      ...(event.toolName ? { toolName: event.toolName } : {}),
      visibility: "developer",
    },
  );
};

export const backendTraceEventsToActivitySteps = (
  backendTraceEvents: AgentTraceEventPayload[] = [],
): AgentActivityStep[] =>
  backendTraceEvents.map((event, index) => backendTraceEventToActivityStep(event, index));

export const appendBackendTraceEventToActivitySteps = (
  activitySteps: AgentActivityStep[],
  backendTraceEvent: AgentTraceEventPayload,
): AgentActivityStep[] => {
  const nextStep = backendTraceEventToUserActivityStep(backendTraceEvent);
  const existingIndex = activitySteps.findIndex((step) => step.id === nextStep.id);

  if (existingIndex === -1) {
    return [...activitySteps, nextStep];
  }

  return activitySteps.map((step, index) =>
    index === existingIndex
      ? {
          ...step,
          ...nextStep,
        }
      : step,
  );
};

const isScheduleQueryMessage = (message: string, intent?: null | string) =>
  intent === "query_schedule" ||
  (/日程|安排/u.test(message) && /范围[：:]|没有已安排|已安排的日程|未来\s*7\s*天/u.test(message));

const isPlanQueryMessage = (message: string, intent?: null | string) =>
  intent === "query_plan" ||
  intent === "query_plan_progress" ||
  (/计划/u.test(message) && /进度|状态|查询|查看/u.test(message) && !/创建|起草|新建|生成|删除/u.test(message));

const isPlanComposeOrCreateMessage = (message: string) =>
  /已创建完整计划|已帮你创建计划|已创建计划/u.test(message);

const isRollbackMessage = (message: string, rollbackResult: unknown) =>
  Boolean(rollbackResult) || (/撤销|回滚/u.test(message) && /完成|已执行|成功/u.test(message));

const isExecuteResultMessage = (message: string, lastRollbackSourceRunId: null | number | undefined) =>
  Boolean(lastRollbackSourceRunId) ||
  /^已创建\s*\d+\s*个日程项/u.test(message) ||
  /已帮你创建计划|已创建完整计划|已创建计划|已创建清单|已把\s*「.+?」\s*标记完成/u.test(message);

const pendingSummary = (pendingAction: PendingAction) => {
  if (pendingAction.type === "await_confirmation") {
    return {
      actionId: pendingAction.action.id,
      intent: pendingAction.action.intent,
      toolName: pendingAction.action.capability ?? pendingAction.action.toolName,
    };
  }

  if (pendingAction.type === "await_batch_confirmation") {
    return {
      actionId: pendingAction.actions.map((action) => action.id).join(","),
      intent: "batch",
      toolName: "batch_confirmation",
    };
  }

  return {
    actionId: undefined,
    intent: "clarify",
    toolName: undefined,
  };
};

const buildPendingConfirmationSteps = (pendingAction: PendingAction): AgentActivityStep[] => {
  const summary = pendingSummary(pendingAction);

  return [
    makeStep("activity:dry-run", "dry_run", "success", "已完成写入预览", {
      intent: summary.intent,
      toolName: summary.toolName,
    }),
    makeStep("activity:policy-guard", "policy_guard", "success", "已通过安全检查", {
      intent: summary.intent,
    }),
    makeStep("activity:awaiting-confirmation", "awaiting_confirmation", "waiting", "等待你确认", {
      actionId: summary.actionId,
      intent: summary.intent,
      summary: "确认前不会写入数据库。",
      toolName: summary.toolName,
    }),
    makeStep("activity:write-skipped-until-confirm", "writing_database", "skipped", "确认后才会写入数据库", {
      actionId: summary.actionId,
      intent: summary.intent,
    }),
  ];
};

const buildQueryScheduleSteps = (intent?: null | string): AgentActivityStep[] => [
  makeStep("activity:understanding", "understanding", "success", "已理解请求", { intent: intent ?? undefined }),
  makeStep("activity:classify-query-schedule", "classifying_intent", "success", "已识别为日程查询", { intent: "query_schedule" }),
  makeStep("activity:read-schedule", "reading_schedule", "success", "已读取本地日程"),
  makeStep("activity:read-only-boundary", "checking_read_write_boundary", "success", "已确认这是只读操作", {
    summary: "没有创建或修改任何日程。",
  }),
  makeStep("activity:query-completed", "completed", "success", "已完成查询", {
    summary: "本轮没有进入 dry-run、Policy Guard 或执行写入。",
  }),
];

const buildQueryPlanSteps = (intent?: null | string): AgentActivityStep[] => [
  makeStep("activity:understanding", "understanding", "success", "已理解请求", { intent: intent ?? undefined }),
  makeStep("activity:classify-query-plan", "classifying_intent", "success", "已识别为计划查询", { intent: "query_plan_progress" }),
  makeStep("activity:read-plans", "reading_plans", "success", "已读取计划数据"),
  makeStep("activity:read-only-boundary", "checking_read_write_boundary", "success", "已确认这是只读操作", {
    summary: "没有创建或修改任何计划。",
  }),
  makeStep("activity:query-completed", "completed", "success", "已完成查询", {
    summary: "本轮没有进入 dry-run、Policy Guard 或执行写入。",
  }),
];

const buildPlanComposeOrCreateSteps = (): AgentActivityStep[] => [
  makeStep("activity:classify-plan", "classifying_intent", "success", "已识别为计划创建", { intent: "compose_plan" }),
  makeStep("activity:plan-readiness", "checking_readiness", "success", "已检查计划信息"),
  makeStep("activity:plan-draft", "generating_draft", "success", "已生成计划草案"),
  makeStep("activity:dry-run", "dry_run", "success", "已完成写入预览"),
  makeStep("activity:policy-guard", "policy_guard", "success", "已通过安全检查"),
  makeStep("activity:execute", "executing", "success", "已执行写入"),
  makeStep("activity:database-written", "writing_database", "success", "已写入数据库"),
  makeStep("activity:receipt", "recording_receipt", "success", "已记录操作凭证"),
  makeStep("activity:rollback-available", "rollback", "success", "支持撤销"),
];

const buildPlanDraftSteps = (): AgentActivityStep[] => [
  makeStep("activity:classify-plan", "classifying_intent", "success", "已识别为计划创建", { intent: "compose_plan" }),
  makeStep("activity:plan-readiness", "checking_readiness", "success", "已检查计划信息是否足够"),
  makeStep("activity:plan-draft", "generating_draft", "success", "已生成计划草案"),
  makeStep("activity:plan-draft-not-written", "writing_database", "skipped", "草案尚未写入数据库"),
];

const buildChecklistDraftSteps = (): AgentActivityStep[] => [
  makeStep("activity:checklist-from-plan", "decomposing_goal", "success", "正在从计划草案生成清单"),
  makeStep("activity:checklist-draft", "generating_draft", "success", "已生成清单草案"),
  makeStep("activity:checklist-draft-not-written", "writing_database", "skipped", "草案尚未写入数据库"),
];

const buildScheduleDraftSteps = (): AgentActivityStep[] => [
  makeStep("activity:classify-schedule", "classifying_intent", "success", "已识别为日程创建", { intent: "create_schedule_items" }),
  makeStep("activity:schedule-time", "finding_free_slots", "success", "已检查可用时间"),
  makeStep("activity:schedule-conflicts", "checking_conflicts", "success", "已检查本地冲突"),
  makeStep("activity:schedule-draft", "generating_draft", "success", "已生成日程草案"),
  makeStep("activity:schedule-draft-not-written", "writing_database", "skipped", "草案尚未写入日程"),
];

const buildExecuteResultSteps = (input: BuildAgentActivityStepsInput): AgentActivityStep[] => [
  makeStep("activity:execute", "executing", "success", "已执行写入"),
  makeStep("activity:database-written", "writing_database", "success", "已写入数据库"),
  makeStep("activity:receipt", "recording_receipt", "success", "已记录操作凭证"),
  makeStep("activity:rollback-available", "rollback", input.lastRollbackSourceRunId ? "success" : "skipped", input.lastRollbackSourceRunId ? "支持撤销" : "未返回自动撤销信息"),
];

const buildRollbackSteps = (): AgentActivityStep[] => [
  makeStep("activity:rollback-start", "rollback", "success", "正在撤销本次操作"),
  makeStep("activity:rollback-complete", "rollback", "success", "已完成撤销"),
  makeStep("activity:rollback-receipt", "recording_receipt", "success", "已记录 rollback receipt"),
];

const buildErrorSteps = (error: NonNullable<BuildAgentActivityStepsInput["error"]>): AgentActivityStep[] => [
  makeStep("activity:error", "failed", "failed", "执行失败", {
    error,
    summary: error.message,
  }),
  makeStep("activity:error-recorded", "recording_receipt", "warning", "已记录错误摘要", {
    details: { code: error.code, message: error.message },
  }),
];

export const buildAgentActivitySteps = (input: BuildAgentActivityStepsInput): AgentActivityStep[] => {
  const assistantMessage = input.assistantMessage?.trim() ?? "";
  let userSteps: AgentActivityStep[] = [];

  if (input.error) {
    userSteps = buildErrorSteps(input.error);
  } else if (isRollbackMessage(assistantMessage, input.rollbackResult)) {
    userSteps = buildRollbackSteps();
  } else if (input.pendingAction) {
    userSteps = buildPendingConfirmationSteps(input.pendingAction);
  } else if (input.planningChecklistDraft) {
    userSteps = buildChecklistDraftSteps();
  } else if (input.planningDraft) {
    userSteps = buildPlanDraftSteps();
  } else if (input.schedulingDraft) {
    userSteps = buildScheduleDraftSteps();
  } else if (isPlanComposeOrCreateMessage(assistantMessage)) {
    userSteps = buildPlanComposeOrCreateSteps();
  } else if (isExecuteResultMessage(assistantMessage, input.lastRollbackSourceRunId)) {
    userSteps = buildExecuteResultSteps(input);
  } else if (isScheduleQueryMessage(assistantMessage, input.intent)) {
    userSteps = buildQueryScheduleSteps(input.intent);
  } else if (isPlanQueryMessage(assistantMessage, input.intent)) {
    userSteps = buildQueryPlanSteps(input.intent);
  }

  const backendTraceSteps = backendTraceEventsToActivitySteps(input.backendTraceEvents);

  return [
    ...userSteps,
    ...(backendTraceSteps.length > 0
      ? backendTraceSteps
      : buildDeveloperTraceSteps(input.traceSteps)),
  ];
};

const lastAssistantIndex = (messages: AgentChatMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant") {
      return index;
    }
  }

  return -1;
};

export const attachActivityStepsToLastAssistantMessage = (
  messages: AgentChatMessage[],
  activitySteps: AgentActivityStep[],
): AgentChatMessage[] => {
  if (activitySteps.length === 0) {
    return messages;
  }

  const index = lastAssistantIndex(messages);

  if (index < 0) {
    return messages;
  }

  return messages.map((message, messageIndex) =>
    messageIndex === index
      ? {
          ...message,
          activitySteps,
        }
      : message,
  );
};

export const attachAgentActivityStepsToMessages = (
  messages: AgentChatMessage[],
  pendingAction?: null | PendingAction,
): AgentChatMessage[] => {
  const pendingIndex = pendingAction ? lastAssistantIndex(messages) : -1;

  return messages.map((message, index) => {
    if (message.role !== "assistant") {
      return message;
    }

    if (message.activitySteps && message.activitySteps.length > 0) {
      return message;
    }

    const activitySteps = buildAgentActivitySteps({
      assistantMessage: message.content,
      pendingAction: index === pendingIndex ? pendingAction ?? null : null,
      planningChecklistDraft: message.planningChecklistDraft ?? null,
      planningDraft: message.planningDraft ?? null,
      schedulingDraft: message.schedulingDraft ?? null,
    });

    return activitySteps.length > 0
      ? {
          ...message,
          activitySteps,
        }
      : message;
  });
};

export const hasSensitiveActivityValue = (value: unknown): boolean => {
  if (typeof value === "string") {
    return /authorization|cookie|password|secret|token/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(hasSensitiveActivityValue);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some(hasSensitiveActivityValue);
};
