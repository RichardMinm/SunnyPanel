import type { AgentIntent, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { normalizeSessionState } from "@/lib/agent/session/normalize-session";
import type { AgentSessionState } from "@/lib/agent/session/types";

import {
  ChecklistDraftGenerationError,
  generateChecklistDraftFromPlanDraft,
  type ChecklistDraft,
} from "./checklist-draft";
import type { PlanDraft } from "./draft";

export type ChecklistDraftGenerationResult =
  | {
      reason: "not_planning_session" | "not_request";
      status: "not_applicable";
    }
  | {
      assistantMessage: string;
      intent: "clarify";
      pendingAction: null;
      planningChecklistDraft: ChecklistDraft;
      sessionState: AgentSessionState;
      status: "generated";
      traceStep: AgentTraceStep;
    }
  | {
      assistantMessage: string;
      intent: "clarify";
      pendingAction: null;
      sessionState: AgentSessionState;
      status: "invalid_draft" | "missing_draft";
      traceStep: AgentTraceStep;
    };

export type EvaluateChecklistDraftGenerationInput = {
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

const hasChecklistDraftIntent = (message: string): boolean =>
  /(拆成清单|生成清单草案|转成清单|把这个计划拆成任务|生成任务清单|checklist|todo)/iu.test(message);

const buildTraceStep = (
  title: string,
  detail: Record<string, unknown>,
  kind: AgentTraceStep["kind"] = "analysis",
): AgentTraceStep => ({
  detail: JSON.stringify(detail),
  id: "checklist-draft-generation",
  kind,
  status: kind === "error" ? "error" : "done",
  title,
});

const buildSessionState = (
  previous: AgentSessionState,
  checklistDraft: ChecklistDraft | null,
  planDraft?: PlanDraft | null,
): AgentSessionState => {
  const next = structuredClone(previous) as AgentSessionState;
  const updatedAt = new Date().toISOString();

  next.updatedAt = updatedAt;
  next.semantic = {
    ...next.semantic,
    domain: "planning",
    stage: "drafting",
    workflow: "plan_creation",
  };
  next.conversation = {
    ...next.conversation,
    lastUserIntent: "generate_checklist_draft_from_plan",
  };
  next.pending = {
    ...next.pending,
    confirmation: null,
  };
  next.planning = {
    ...(next.planning ?? {}),
    checklistDraft,
    ...(planDraft !== undefined ? { draft: planDraft } : {}),
    workflow: "plan_creation",
    lastUpdatedAt: updatedAt,
  };

  return next;
};

const resolvePlanDraftForChecklistGeneration = (session: AgentSessionState): PlanDraft | null => {
  const draft = session.planning?.draft ?? null;
  const sourcePlanId = session.planning?.sourcePlanId;

  if (!draft || typeof draft.sourcePlanId === "number" || typeof sourcePlanId !== "number") {
    return draft;
  }

  return {
    ...draft,
    sourcePlanId,
  };
};

const buildChecklistDraftMessage = (draft: ChecklistDraft): string => {
  const groupLines = draft.groups
    .slice(0, 5)
    .map((group, index) => {
      const items = group.items.slice(0, 5).map((item) => `  - ${item.title}`).join("\n");
      return `${index + 1}. ${group.title}${group.description ? `：${group.description}` : ""}\n${items}`;
    })
    .join("\n");
  const assumptions = (draft.assumptions?.length ? draft.assumptions : ["这是清单草案，尚未写入数据库。"])
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join("\n");

  return [
    "已把计划草案拆成清单草案。它尚未写入数据库，也不会创建 pending confirmation；真正创建清单会放到下一步确认流程。",
    `\n标题：${draft.title}`,
    draft.sourcePlanTitle ? `来源计划：${draft.sourcePlanTitle}` : null,
    draft.goal ? `目标：${draft.goal}` : null,
    `\n分组与条目：\n${groupLines}`,
    `\n说明：\n${assumptions}`,
    "\n下一步可以继续修改清单草案，或稍后准备创建正式清单。",
  ]
    .filter(Boolean)
    .join("\n");
};

export const evaluateChecklistDraftGeneration = (
  input: EvaluateChecklistDraftGenerationInput,
): ChecklistDraftGenerationResult => {
  const normalizedSession = input.sessionState
    ? normalizeSessionState(input.sessionState)
    : null;
  const message = normalizeText(input.userMessage);

  if (!normalizedSession || !isPlanningCreationSession(normalizedSession)) {
    return {
      reason: "not_planning_session",
      status: "not_applicable",
    };
  }

  if (!hasChecklistDraftIntent(message)) {
    return {
      reason: "not_request",
      status: "not_applicable",
    };
  }

  try {
    const planDraft = resolvePlanDraftForChecklistGeneration(normalizedSession);
    const checklistDraft = generateChecklistDraftFromPlanDraft({
      instruction: message,
      planDraft,
    });
    const sessionState = buildSessionState(normalizedSession, checklistDraft, planDraft);

    return {
      assistantMessage: buildChecklistDraftMessage(checklistDraft),
      intent: "clarify",
      pendingAction: null,
      planningChecklistDraft: checklistDraft,
      sessionState,
      status: "generated",
      traceStep: buildTraceStep("清单草案已生成，未写入数据库", {
        gateApplied: true,
        intent: input.intent.intent,
        pendingActionCleared: Boolean(input.pendingAction),
        status: "generated",
        title: checklistDraft.title,
      }),
    };
  } catch (error) {
    const code = error instanceof ChecklistDraftGenerationError
      ? error.code
      : "invalid_plan_draft";
    const status = code === "missing_plan_draft" ? "missing_draft" : "invalid_draft";
    const sessionState = buildSessionState(normalizedSession, null);

    return {
      assistantMessage: status === "missing_draft"
        ? "当前没有可拆解的计划草案，请先生成计划草案。"
        : "当前计划草案结构不完整，暂时不能拆成清单草案。请先调整计划草案。",
      intent: "clarify",
      pendingAction: null,
      sessionState,
      status,
      traceStep: buildTraceStep("无法生成清单草案", {
        gateApplied: true,
        reason: code,
        status,
      }, "error"),
    };
  }
};
