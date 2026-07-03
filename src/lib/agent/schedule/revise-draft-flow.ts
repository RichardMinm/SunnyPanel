import type { AgentIntent, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { normalizeSessionState } from "@/lib/agent/session/normalize-session";
import type { AgentSessionState } from "@/lib/agent/session/types";

import type { ScheduleConflict, ScheduleConflictPolicy } from "./conflict-awareness";
import type { ScheduleDraft } from "./draft";
import {
  reviseScheduleDraft,
  type ScheduleDraftRevisionAction,
} from "./revise-draft";

export type ScheduleDraftRevisionFlowResult =
  | {
      reason: "not_scheduling_session" | "not_revision_request";
      status: "not_revision";
    }
  | {
      appliedActions: ScheduleDraftRevisionAction[];
      assistantMessage: string;
      intent: "revise_schedule_draft";
      pendingAction: null;
      schedulingDraft: ScheduleDraft;
      sessionState: AgentSessionState;
      status: "revised";
      traceStep: AgentTraceStep;
    }
  | {
      assistantMessage: string;
      clarificationQuestions: string[];
      intent: "revise_schedule_draft";
      pendingAction: null;
      sessionState: AgentSessionState;
      status: "needs_clarification";
      traceStep: AgentTraceStep;
    }
  | {
      assistantMessage: string;
      intent: "revise_schedule_draft";
      pendingAction: null;
      sessionState: AgentSessionState;
      status: "missing_draft";
      traceStep: AgentTraceStep;
    };

export type EvaluateScheduleDraftRevisionInput = {
  intent: AgentIntent;
  pendingAction?: null | PendingAction;
  referenceDate?: string;
  sessionState?: null | unknown;
  userMessage: string;
};

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSchedulingSession = (session: AgentSessionState): boolean =>
  session.semantic.domain === "schedule" ||
  session.semantic.workflow === "schedule_composition" ||
  Boolean(session.scheduling?.workflow || session.scheduling?.draft);

const hasDraftRevisionIntent = (message: string): boolean =>
  /(调整这个日程草案|修改这个日程草案|我想调整这个日程草案|继续修改|返回修改|日程草案.*修改|把.*改到|把.*调整到|把.*放到|改到(?:今天|明天|后天|周|星期|\d)|调整到(?:今天|明天|后天|周|星期|\d)|删除.*日程项|移除.*日程项|不要安排|先不要安排|删除.*任务|允许重叠|冲突也没关系|重叠安排|冲突就跳过|跳过冲突|自动.*安排|自动.*重排|避开冲突|找空闲)/u.test(message);

const hasPendingScheduleCreation = (
  pendingAction?: null | PendingAction,
): pendingAction is Extract<PendingAction, { type: "await_confirmation" }> =>
  pendingAction?.type === "await_confirmation" &&
  pendingAction.action.intent === "create_schedule_items";

const hasPendingReturnToEditIntent = (message: string, pendingAction?: null | PendingAction): boolean =>
  hasPendingScheduleCreation(pendingAction) &&
  /(返回修改|继续修改|调整这个日程草案|修改这个日程草案|我想调整这个日程草案)/u.test(message);

const isScheduleConflict = (value: unknown): value is ScheduleConflict => {
  if (!isRecord(value)) return false;

  return (
    (value.type === "internal" || value.type === "existing" || value.type === "warning") &&
    (value.severity === "info" || value.severity === "warning" || value.severity === "blocking") &&
    typeof value.proposedTitle === "string" &&
    typeof value.message === "string"
  );
};

const extractScheduleConflicts = (pendingAction?: null | PendingAction): ScheduleConflict[] => {
  if (!hasPendingScheduleCreation(pendingAction)) return [];
  const action = pendingAction.action;
  if (!isRecord(action.afterSnapshot)) return [];
  const conflicts = action.afterSnapshot.scheduleConflicts;

  return Array.isArray(conflicts)
    ? conflicts.filter(isScheduleConflict)
    : [];
};

const buildTraceStep = (
  title: string,
  detail: Record<string, unknown>,
  kind: AgentTraceStep["kind"] = "analysis",
): AgentTraceStep => ({
  detail: JSON.stringify(detail),
  id: "revise-schedule-draft",
  kind,
  status: kind === "error" ? "error" : "done",
  title,
});

const conflictPolicyFromActions = (
  actions: ScheduleDraftRevisionAction[],
): ScheduleConflictPolicy | null => {
  const action = actions.find(
    (item): item is Extract<ScheduleDraftRevisionAction, { type: "set_conflict_policy" }> =>
      item.type === "set_conflict_policy",
  );

  return action?.conflictPolicy ?? null;
};

const buildSessionState = ({
  actions,
  draft,
  previous,
}: {
  actions: ScheduleDraftRevisionAction[];
  draft: ScheduleDraft | null;
  previous: AgentSessionState;
}): AgentSessionState => {
  const next = structuredClone(previous) as AgentSessionState;
  const updatedAt = new Date().toISOString();
  const conflictPolicy = conflictPolicyFromActions(actions);

  next.updatedAt = updatedAt;
  next.semantic = {
    ...next.semantic,
    domain: "schedule",
    stage: "reviewing",
    workflow: "schedule_composition",
  };
  next.conversation = {
    ...next.conversation,
    lastUserIntent: "revise_schedule_draft",
  };
  next.pending = {
    ...next.pending,
    confirmation: null,
  };
  next.scheduling = {
    ...(next.scheduling ?? {}),
    draft,
    lastUpdatedAt: updatedAt,
    workflow: next.scheduling?.workflow ?? "manual_schedule",
  };

  if (conflictPolicy) {
    next.scheduling.slots = {
      ...(next.scheduling.slots ?? {}),
      conflictPolicy,
    };
  }

  return next;
};

const formatDraftItems = (draft: ScheduleDraft): string =>
  draft.items
    .slice(0, 8)
    .map((item, index) => {
      const time = [item.startTime, item.endTime].filter(Boolean).join("-") || "未定时间";
      const date = item.date ?? "未定日期";

      return `${index + 1}. ${item.title}：${date} ${time}`;
    })
    .join("\n");

const formatList = (items: string[] | undefined, fallback: string): string =>
  (items && items.length > 0 ? items : [fallback])
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join("\n");

const buildRevisionMessage = (draft: ScheduleDraft, summary: string): string =>
  [
    "已更新日程草案。它仍然尚未写入日程，也不会创建 pending confirmation；你可以继续修改，或准备创建日程。",
    "修改后的草案尚未重新检查已有日程冲突，准备创建时会再次检查。",
    `\n变更摘要：${summary}`,
    `\n草案：${draft.title}`,
    `\n日程项：\n${formatDraftItems(draft)}`,
    `\n假设 / 冲突提示：\n${formatList([...(draft.assumptions ?? []), ...(draft.conflicts ?? [])], "暂无额外提示。")}`,
  ].join("\n");

const buildClarificationMessage = (questions: string[]): string =>
  [
    "我可以继续修改这个日程草案，但还需要你补充一点信息。草案仍然尚未写入日程，也不会创建 pending confirmation。",
    ...questions.slice(0, 3).map((question) => `- ${question}`),
  ].join("\n");

export const evaluateScheduleDraftRevision = (
  input: EvaluateScheduleDraftRevisionInput,
): ScheduleDraftRevisionFlowResult => {
  const normalizedSession = input.sessionState
    ? normalizeSessionState(input.sessionState)
    : null;

  if (!normalizedSession || !isSchedulingSession(normalizedSession)) {
    return {
      reason: "not_scheduling_session",
      status: "not_revision",
    };
  }

  const message = normalizeText(input.userMessage);
  const isRevisionRequest =
    hasDraftRevisionIntent(message) ||
    hasPendingReturnToEditIntent(message, input.pendingAction);

  if (!isRevisionRequest) {
    return {
      reason: "not_revision_request",
      status: "not_revision",
    };
  }

  const draft = normalizedSession.scheduling?.draft ?? null;

  if (!draft) {
    const sessionState = buildSessionState({
      actions: [],
      draft: null,
      previous: normalizedSession,
    });

    return {
      assistantMessage: "当前没有可修改的日程草案。请先生成日程草案，再告诉我想怎么调整。",
      intent: "revise_schedule_draft",
      pendingAction: null,
      sessionState,
      status: "missing_draft",
      traceStep: buildTraceStep("没有可修改的日程草案", {
        gateApplied: true,
        reason: "missing_draft",
        status: "missing_draft",
      }, "error"),
    };
  }

  const revision = reviseScheduleDraft({
    conflicts: extractScheduleConflicts(input.pendingAction),
    draft,
    referenceDate: input.referenceDate,
    userMessage: message,
  });

  if (revision.needsClarification) {
    const sessionState = buildSessionState({
      actions: [],
      draft,
      previous: normalizedSession,
    });
    const questions = revision.clarificationQuestions ?? [revision.summary];

    return {
      assistantMessage: buildClarificationMessage(questions),
      clarificationQuestions: questions,
      intent: "revise_schedule_draft",
      pendingAction: null,
      sessionState,
      status: "needs_clarification",
      traceStep: buildTraceStep("日程草案修改需要澄清，未写入日程", {
        gateApplied: true,
        intent: input.intent.intent,
        pendingActionCleared: Boolean(input.pendingAction),
        reason: "needs_clarification",
        status: "needs_clarification",
      }),
    };
  }

  const sessionState = buildSessionState({
    actions: revision.appliedActions,
    draft: revision.draft,
    previous: normalizedSession,
  });

  return {
    appliedActions: revision.appliedActions,
    assistantMessage: buildRevisionMessage(revision.draft, revision.summary),
    intent: "revise_schedule_draft",
    pendingAction: null,
    schedulingDraft: revision.draft,
    sessionState,
    status: "revised",
    traceStep: buildTraceStep("日程草案已更新，未写入日程", {
      appliedActions: revision.appliedActions.map((action) => action.type),
      gateApplied: true,
      intent: input.intent.intent,
      pendingActionCleared: Boolean(input.pendingAction),
      stage: "reviewing",
      status: "revised",
      title: revision.draft.title,
    }),
  };
};
