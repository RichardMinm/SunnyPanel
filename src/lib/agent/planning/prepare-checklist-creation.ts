import type { AgentIntent, AgentTraceStep, CreateChecklistArgs } from "@/lib/agent/schemas";
import { normalizeSessionState } from "@/lib/agent/session/normalize-session";
import type { AgentSessionState } from "@/lib/agent/session/types";

import type { ChecklistDraft, ChecklistDraftGroup, ChecklistDraftItem } from "./checklist-draft";

export const CHECKLIST_DRAFT_PREPARE_CREATE_PROMPT = "就按这个清单草案创建清单";

export type BuildCreateChecklistInputFromDraftError = {
  code: "invalid_checklist_draft";
  missingFields: string[];
};

export type BuildCreateChecklistInputFromDraftResult =
  | {
      args: CreateChecklistArgs;
      ok: true;
    }
  | {
      error: BuildCreateChecklistInputFromDraftError;
      ok: false;
    };

export type ChecklistCreationPreparationResult =
  | {
      reason: "not_planning_session" | "not_prepare_request";
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
      error: BuildCreateChecklistInputFromDraftError;
      sessionState: AgentSessionState;
      status: "invalid_draft";
      traceStep: AgentTraceStep;
    }
  | {
      args: CreateChecklistArgs;
      intent: Extract<AgentIntent, { intent: "create_checklist" }>;
      sessionState: AgentSessionState;
      status: "prepared";
      traceStep: AgentTraceStep;
    };

export type EvaluateChecklistCreationPreparationInput = {
  intent: AgentIntent;
  sessionState?: null | unknown;
  userMessage: string;
};

const normalizeText = (value: null | string | undefined): string =>
  value?.trim().replace(/\s+/g, " ") ?? "";

const isUsefulItem = (item: ChecklistDraftItem): boolean =>
  normalizeText(item.title).length > 0;

const isUsefulGroup = (group: ChecklistDraftGroup): boolean =>
  normalizeText(group.title).length > 0 &&
  Array.isArray(group.items) &&
  group.items.some(isUsefulItem);

const validateDraft = (draft: ChecklistDraft): string[] => {
  const missing: string[] = [];

  if (!normalizeText(draft.title)) missing.push("title");
  if (!Array.isArray(draft.groups) || draft.groups.length === 0 || !draft.groups.some(isUsefulGroup)) {
    missing.push("groups");
  }

  return missing;
};

const buildSummary = (draft: ChecklistDraft): string | null => {
  const lines = [
    normalizeText(draft.sourcePlanTitle) ? `来源计划：${normalizeText(draft.sourcePlanTitle)}` : null,
    normalizeText(draft.goal) ? `目标：${normalizeText(draft.goal)}` : null,
    draft.assumptions?.length
      ? `草案说明：${draft.assumptions.map((item) => normalizeText(item)).filter(Boolean).join("；")}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : null;
};

export const buildCreateChecklistInputFromDraft = (
  draft: ChecklistDraft,
): BuildCreateChecklistInputFromDraftResult => {
  const missingFields = validateDraft(draft);

  if (missingFields.length > 0) {
    return {
      error: {
        code: "invalid_checklist_draft",
        missingFields,
      },
      ok: false,
    };
  }

  const groups = draft.groups
    .filter(isUsefulGroup)
    .map((group) => ({
      items: group.items
        .filter(isUsefulItem)
        .map((item) => ({
          description: normalizeText(item.description) || null,
          isCompleted: item.done === true,
          title: normalizeText(item.title),
        })),
      title: normalizeText(group.title),
    }));

  return {
    args: {
      groups,
      ...(typeof draft.sourcePlanId === "number" ? { sourcePlanId: draft.sourcePlanId } : {}),
      sourceText: [
        "从清单草案准备创建正式清单。",
        `标题：${normalizeText(draft.title)}`,
        normalizeText(draft.sourcePlanTitle) ? `来源计划：${normalizeText(draft.sourcePlanTitle)}` : null,
        normalizeText(draft.goal) ? `目标：${normalizeText(draft.goal)}` : null,
      ].filter(Boolean).join("\n"),
      status: "draft",
      summary: buildSummary(draft),
      title: normalizeText(draft.title),
      visibility: "private",
    },
    ok: true,
  };
};

const isPlanningCreationSession = (session: AgentSessionState): boolean =>
  session.semantic.domain === "planning" ||
  session.semantic.workflow === "plan_creation" ||
  session.planning?.workflow === "plan_creation";

const hasPrepareIntent = (message: string): boolean =>
  /(就按(这个|这版|此).*清单|按这个清单草案创建|按这个清单创建|准备创建清单|保存为清单|创建清单|写入清单|确认创建清单)/u.test(message);

const buildTraceStep = (
  title: string,
  detail: Record<string, unknown>,
  kind: AgentTraceStep["kind"] = "analysis",
): AgentTraceStep => ({
  detail: JSON.stringify(detail),
  id: "prepare-checklist-creation",
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
    domain: "planning",
    stage,
    workflow: "plan_creation",
  };
  next.conversation = {
    ...next.conversation,
    lastUserIntent: "prepare_checklist_creation",
  };
  next.planning = {
    ...(next.planning ?? {}),
    workflow: "plan_creation",
  };

  return next;
};

export const evaluateChecklistCreationPreparation = (
  input: EvaluateChecklistCreationPreparationInput,
): ChecklistCreationPreparationResult => {
  const normalizedSession = input.sessionState
    ? normalizeSessionState(input.sessionState)
    : null;

  if (!normalizedSession || !isPlanningCreationSession(normalizedSession)) {
    return {
      reason: "not_planning_session",
      status: "not_prepare",
    };
  }

  if (!hasPrepareIntent(input.userMessage)) {
    return {
      reason: "not_prepare_request",
      status: "not_prepare",
    };
  }

  const draft = normalizedSession.planning?.checklistDraft ?? null;

  if (!draft) {
    const sessionState = buildSessionState(normalizedSession, "reviewing");

    return {
      assistantMessage: "当前没有可创建的清单草案，请先从计划草案拆出清单草案。",
      sessionState,
      status: "missing_draft",
      traceStep: buildTraceStep("没有可创建的清单草案", {
        gateApplied: true,
        reason: "missing_draft",
        status: "missing_draft",
      }, "error"),
    };
  }

  const buildResult = buildCreateChecklistInputFromDraft(draft);
  const sessionState = buildSessionState(normalizedSession, "confirming");

  if (!buildResult.ok) {
    return {
      assistantMessage: `当前清单草案缺少关键信息：${buildResult.error.missingFields.join("、")}。请先修改草案后再准备创建。`,
      error: buildResult.error,
      sessionState,
      status: "invalid_draft",
      traceStep: buildTraceStep("清单草案无法进入创建确认", {
        missingFields: buildResult.error.missingFields,
        reason: buildResult.error.code,
        status: "invalid_draft",
      }, "error"),
    };
  }

  const intent: Extract<AgentIntent, { intent: "create_checklist" }> = {
    args: buildResult.args,
    confidence: Math.max(input.intent.confidence ?? 0.85, 0.9),
    intent: "create_checklist",
  };

  return {
    args: buildResult.args,
    intent,
    sessionState,
    status: "prepared",
    traceStep: buildTraceStep("清单草案已准备进入创建确认", {
      gateApplied: true,
      intent: "prepare_checklist_creation",
      nextIntent: "create_checklist",
      stage: "confirming",
      status: "prepared",
      title: buildResult.args.title,
    }),
  };
};

export const applyChecklistCreationPreparationToResolution = <T extends { intent: AgentIntent }>(
  resolution: T,
  preparation: Extract<ChecklistCreationPreparationResult, { status: "prepared" }>,
): T => ({
  ...resolution,
  intent: preparation.intent,
});
