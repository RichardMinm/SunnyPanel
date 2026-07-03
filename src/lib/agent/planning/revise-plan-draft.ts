import type { AgentIntent, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { normalizeSessionState } from "@/lib/agent/session/normalize-session";
import type { AgentSessionState } from "@/lib/agent/session/types";

import {
  revisePlanDraft,
  type PlanDraft,
} from "./draft";

export type PlanDraftRevisionResult =
  | {
      reason: "not_planning_session" | "not_revision_request";
      status: "not_revision";
    }
  | {
      assistantMessage: string;
      intent: "revise_plan_draft";
      pendingAction: null;
      planningDraft: PlanDraft;
      sessionState: AgentSessionState;
      status: "revised";
      traceStep: AgentTraceStep;
    }
  | {
      assistantMessage: string;
      intent: "revise_plan_draft";
      pendingAction: null;
      sessionState: AgentSessionState;
      status: "missing_draft";
      traceStep: AgentTraceStep;
    };

export type EvaluatePlanDraftRevisionInput = {
  intent: AgentIntent;
  pendingAction?: null | PendingAction;
  sessionState?: null | unknown;
  userMessage: string;
};

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isPlanningCreationSession = (session: AgentSessionState): boolean =>
  session.semantic.domain === "planning" ||
  session.semantic.workflow === "plan_creation" ||
  session.planning?.workflow === "plan_creation";

const hasRevisionIntent = (message: string): boolean =>
  /(修改一下|调整一下|返回修改|加上测试|增加测试|测试单独|加上部署|增加部署|部署单独|增加上线阶段|上线阶段|时间压缩|更保守|更激进|优先核心功能|把.*提前|删除.*阶段|去掉.*阶段|不要.*阶段|增加验收标准|加上验收标准|上线标准|验收标准|成功标准|重新拆一下|重新拆|我想调整这个计划草案|我想返回修改这个计划草案)/u.test(message);

const hasExplicitDraftRevisionIntent = (message: string): boolean =>
  /(返回修改|我想返回修改|调整这个计划草案|修改这个计划草案|我想调整这个计划草案|调整草案|修改草案|继续修改|重新拆一下|重新拆)/u.test(message);

const hasPendingReturnToEditIntent = (message: string, pendingAction?: null | PendingAction): boolean =>
  Boolean(
    pendingAction?.type === "await_confirmation" &&
      /(返回修改|我想返回修改|调整这个计划草案|修改这个计划草案|我想调整这个计划草案)/u.test(message),
  );

const buildTraceStep = (
  title: string,
  detail: Record<string, unknown>,
  kind: AgentTraceStep["kind"] = "analysis",
): AgentTraceStep => ({
  detail: JSON.stringify(detail),
  id: "revise-plan-draft",
  kind,
  status: kind === "error" ? "error" : "done",
  title,
});

const buildSessionState = (
  previous: AgentSessionState,
  draft: null | PlanDraft,
): AgentSessionState => {
  const next = structuredClone(previous) as AgentSessionState;
  const updatedAt = new Date().toISOString();

  next.updatedAt = updatedAt;
  next.semantic = {
    ...next.semantic,
    domain: "planning",
    stage: "reviewing",
    workflow: "plan_creation",
  };
  next.conversation = {
    ...next.conversation,
    lastUserIntent: "revise_plan_draft",
  };
  next.pending = {
    ...next.pending,
    confirmation: null,
  };
  next.planning = {
    ...(next.planning ?? {}),
    draft,
    workflow: "plan_creation",
    lastUpdatedAt: updatedAt,
  };

  return next;
};

const formatDraftList = (items: string[] | undefined, fallback: string): string =>
  (items && items.length > 0 ? items : [fallback])
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join("\n");

const buildRevisionMessage = (draft: PlanDraft): string => {
  const stageLines = draft.stages
    .slice(0, 5)
    .map((stage, index) => {
      const tasks = stage.tasks.slice(0, 4).map((task) => `  - ${task}`).join("\n");
      return `${index + 1}. ${stage.title}${stage.description ? `：${stage.description}` : ""}\n${tasks}`;
    });

  return [
    "已更新计划草案。它仍然不会写入数据库，也不会创建 pending confirmation；你可以继续修改，或准备创建计划。",
    `\n目标：${draft.goal}`,
    draft.deadline ? `截止时间：${draft.deadline}` : null,
    draft.scope ? `范围：${draft.scope}` : null,
    `\n阶段：\n${stageLines.join("\n")}`,
    `\n验收标准：\n- ${draft.successCriteria ?? "确认第一版达到可验收状态。"}`,
    `\n风险 / 假设：\n${formatDraftList([...(draft.risks ?? []), ...(draft.assumptions ?? [])], "暂无额外风险或假设。")}`,
    `\n下一步操作建议：\n${formatDraftList(draft.nextActions, "继续调整草案。")}`,
  ]
    .filter(Boolean)
    .join("\n");
};

export const evaluatePlanDraftRevision = (
  input: EvaluatePlanDraftRevisionInput,
): PlanDraftRevisionResult => {
  const normalizedSession = input.sessionState
    ? normalizeSessionState(input.sessionState)
    : null;

  if (!normalizedSession || !isPlanningCreationSession(normalizedSession)) {
    return {
      reason: "not_planning_session",
      status: "not_revision",
    };
  }

  const message = normalizeText(input.userMessage);
  const isRevisionRequest =
    hasRevisionIntent(message) ||
    hasPendingReturnToEditIntent(message, input.pendingAction);

  if (!isRevisionRequest) {
    return {
      reason: "not_revision_request",
      status: "not_revision",
    };
  }

  const draft = normalizedSession.planning?.draft ?? null;

  if (!draft) {
    if (
      !hasExplicitDraftRevisionIntent(message) &&
      !hasPendingReturnToEditIntent(message, input.pendingAction)
    ) {
      return {
        reason: "not_revision_request",
        status: "not_revision",
      };
    }

    const sessionState = buildSessionState(normalizedSession, null);

    return {
      assistantMessage: "当前没有可修改的计划草案。请先补充计划上下文并生成草案，再告诉我想怎么调整。",
      intent: "revise_plan_draft",
      pendingAction: null,
      sessionState,
      status: "missing_draft",
      traceStep: buildTraceStep("没有可修改的计划草案", {
        gateApplied: true,
        reason: "missing_draft",
        status: "missing_draft",
      }, "error"),
    };
  }

  const revisedDraft = revisePlanDraft({
    draft,
    instruction: message,
    slots: normalizedSession.planning?.slots,
  });
  const sessionState = buildSessionState(normalizedSession, revisedDraft);

  return {
    assistantMessage: buildRevisionMessage(revisedDraft),
    intent: "revise_plan_draft",
    pendingAction: null,
    planningDraft: revisedDraft,
    sessionState,
    status: "revised",
    traceStep: buildTraceStep("计划草案已更新，未写入数据库", {
      gateApplied: true,
      intent: input.intent.intent,
      pendingActionCleared: Boolean(input.pendingAction),
      stage: "reviewing",
      status: "revised",
      title: revisedDraft.title,
    }),
  };
};
