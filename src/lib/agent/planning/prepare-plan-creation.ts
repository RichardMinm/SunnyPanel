import type { AgentIntent, AgentTraceStep, ComposePlanArgs, PlanPriorityValue } from "@/lib/agent/schemas";
import { normalizeSessionState } from "@/lib/agent/session/normalize-session";
import type { AgentSessionState } from "@/lib/agent/session/types";
import type { DecomposedPlan } from "@/lib/agent/workflows/plan-decomposer";

import type { PlanDraft, PlanDraftStage } from "./draft";
import type { PlanSlots } from "./readiness";

export const PLAN_DRAFT_PREPARE_CREATE_PROMPT = "就按这个草案创建计划";

export type BuildCreatePlanInputFromDraftError = {
  code: "invalid_plan_draft";
  missingFields: string[];
};

export type BuildCreatePlanInputFromDraftResult =
  | {
      args: ComposePlanArgs;
      ok: true;
    }
  | {
      error: BuildCreatePlanInputFromDraftError;
      ok: false;
    };

export type PlanCreationPreparationResult =
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
      error: BuildCreatePlanInputFromDraftError;
      sessionState: AgentSessionState;
      status: "invalid_draft";
      traceStep: AgentTraceStep;
    }
  | {
      args: ComposePlanArgs;
      intent: Extract<AgentIntent, { intent: "compose_plan" }>;
      sessionState: AgentSessionState;
      status: "prepared";
      traceStep: AgentTraceStep;
    };

export type EvaluatePlanCreationPreparationInput = {
  intent: AgentIntent;
  sessionState?: null | unknown;
  userMessage: string;
};

const normalizeText = (value: null | string | undefined): string =>
  value?.trim().replace(/\s+/g, " ") ?? "";

const toCleanList = (items: null | string[] | undefined): string[] =>
  Array.isArray(items)
    ? Array.from(new Set(items.map((item) => normalizeText(item)).filter(Boolean)))
    : [];

const splitTextList = (value: null | string | undefined): string[] =>
  normalizeText(value)
    .split(/[、,，；;。]/u)
    .map((item) => normalizeText(item))
    .filter(Boolean);

const hasUsefulStage = (stage: PlanDraftStage): boolean =>
  normalizeText(stage.title).length > 0 &&
  Array.isArray(stage.tasks) &&
  stage.tasks.some((task) => normalizeText(task).length > 0);

const validateDraft = (draft: PlanDraft): string[] => {
  const missing: string[] = [];

  if (!normalizeText(draft.title)) missing.push("title");
  if (!normalizeText(draft.goal)) missing.push("goal");
  if (!Array.isArray(draft.stages) || draft.stages.length === 0 || !draft.stages.some(hasUsefulStage)) {
    missing.push("stages");
  }

  return missing;
};

const priorityFromSlots = (priority: null | string | undefined): PlanPriorityValue => {
  if (priority === "high" || priority === "low" || priority === "medium") {
    return priority;
  }

  return "medium";
};

const stageEstimatedDays = (stage: PlanDraftStage): number => {
  if (stage.startDate && stage.endDate) {
    const start = Date.parse(stage.startDate);
    const end = Date.parse(stage.endDate);

    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      return Math.max(1, Math.ceil((end - start) / 86_400_000) + 1);
    }
  }

  return 1;
};

const buildDecomposedPlan = (
  draft: PlanDraft,
  slots: PlanSlots,
): DecomposedPlan => {
  const phases = draft.stages
    .filter(hasUsefulStage)
    .map((stage) => {
      const tasks = toCleanList(stage.tasks);

      return {
        estimatedDays: stageEstimatedDays(stage),
        goal: normalizeText(stage.description) || `完成「${normalizeText(stage.title)}」阶段任务。`,
        milestones: [
          {
            estimatedHours: Math.max(2, tasks.length * 2),
            tasks,
            title: `${normalizeText(stage.title)}任务`,
          },
        ],
        title: normalizeText(stage.title),
      };
    });

  return {
    finalGoal: normalizeText(draft.goal),
    phases,
    prerequisites: [
      ...toCleanList(draft.assumptions),
      ...toCleanList(slots.constraints),
    ].slice(0, 8),
    totalEstimatedDays: phases.reduce((sum, phase) => sum + phase.estimatedDays, 0) || phases.length || 1,
    weeklyRhythm:
      normalizeText(draft.availableTime) ||
      normalizeText(slots.availableTime) ||
      "按草案节奏推进。",
  };
};

const buildAgentBrief = (
  draft: PlanDraft,
  slots: PlanSlots,
  decomposed: DecomposedPlan,
): string => {
  const lines = [
    `来源：用户已确认的 session.planning.draft。`,
    `目标：${normalizeText(draft.goal)}`,
    normalizeText(draft.deadline ?? slots.deadline) ? `截止时间：${normalizeText(draft.deadline ?? slots.deadline)}` : null,
    normalizeText(draft.scope ?? slots.scope) ? `范围：${normalizeText(draft.scope ?? slots.scope)}` : null,
    normalizeText(draft.currentProgress ?? slots.currentProgress)
      ? `当前进度：${normalizeText(draft.currentProgress ?? slots.currentProgress)}`
      : null,
    normalizeText(draft.availableTime ?? slots.availableTime)
      ? `可投入时间：${normalizeText(draft.availableTime ?? slots.availableTime)}`
      : null,
    normalizeText(draft.successCriteria ?? slots.successCriteria)
      ? `验收标准：${normalizeText(draft.successCriteria ?? slots.successCriteria)}`
      : null,
    "阶段与任务：",
    ...decomposed.phases.map((phase, index) => {
      const tasks = phase.milestones.flatMap((milestone) => milestone.tasks).join("；");

      return `${index + 1}. ${phase.title}：${tasks}`;
    }),
    toCleanList(draft.assumptions).length > 0
      ? `假设：${toCleanList(draft.assumptions).join("；")}`
      : null,
    toCleanList(draft.risks).length > 0
      ? `风险：${toCleanList(draft.risks).join("；")}`
      : null,
  ];

  return lines.filter((line): line is string => Boolean(line)).join("\n");
};

export const buildCreatePlanInputFromDraft = (
  draft: PlanDraft,
  slots: PlanSlots = {},
): BuildCreatePlanInputFromDraftResult => {
  const missingFields = validateDraft(draft);

  if (missingFields.length > 0) {
    return {
      error: {
        code: "invalid_plan_draft",
        missingFields,
      },
      ok: false,
    };
  }

  const decomposed = buildDecomposedPlan(draft, slots);
  const deadline = normalizeText(draft.deadline ?? slots.deadline) || null;
  const scope = normalizeText(draft.scope ?? slots.scope) || null;
  const successCriteria = [
    ...splitTextList(draft.successCriteria),
    ...splitTextList(slots.successCriteria),
  ];
  const nextActions = toCleanList(draft.nextActions).length > 0
    ? toCleanList(draft.nextActions)
    : decomposed.phases.flatMap((phase) => phase.milestones.flatMap((milestone) => milestone.tasks)).slice(0, 5);

  const args: ComposePlanArgs = {
    agentBrief: buildAgentBrief(draft, slots, decomposed),
    decomposed,
    goal: normalizeText(draft.goal),
    keySteps: decomposed.phases.map((phase) => {
      const tasks = phase.milestones.flatMap((milestone) => milestone.tasks).slice(0, 3).join("；");

      return `【${phase.title}】${tasks}`;
    }),
    motivation: normalizeText(draft.currentProgress ?? slots.currentProgress)
      ? `基于当前进度推进：${normalizeText(draft.currentProgress ?? slots.currentProgress)}`
      : "从已确认计划草案进入正式创建确认。",
    nextActions,
    outOfScope: null,
    risks: toCleanList(draft.risks),
    scope,
    sourceText: [
      "从计划草案准备创建正式计划。",
      `标题：${normalizeText(draft.title)}`,
      `目标：${normalizeText(draft.goal)}`,
      deadline ? `截止时间：${deadline}` : null,
      scope ? `范围：${scope}` : null,
    ].filter(Boolean).join("\n"),
    successCriteria,
    suggestedDueDate: deadline,
    suggestedPriority: priorityFromSlots(slots.priority),
    title: normalizeText(draft.title),
  };

  return {
    args,
    ok: true,
  };
};

const isPlanningCreationSession = (session: AgentSessionState): boolean =>
  session.semantic.domain === "planning" ||
  session.semantic.workflow === "plan_creation" ||
  session.planning?.workflow === "plan_creation";

const hasPrepareIntent = (message: string): boolean =>
  /(就按(这个|这版|此)|按这个草案|按这(个|版)草案|准备创建计划|保存为计划|写入计划|确认创建|生成并保存|添加到计划|创建计划)/u.test(message);

const buildTraceStep = (
  title: string,
  detail: Record<string, unknown>,
  kind: AgentTraceStep["kind"] = "analysis",
): AgentTraceStep => ({
  detail: JSON.stringify(detail),
  id: "prepare-plan-creation",
  kind,
  status: "done",
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
    lastUserIntent: "prepare_plan_creation",
  };
  next.planning = {
    ...(next.planning ?? {}),
    workflow: "plan_creation",
  };

  return next;
};

export const evaluatePlanCreationPreparation = (
  input: EvaluatePlanCreationPreparationInput,
): PlanCreationPreparationResult => {
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

  const draft = normalizedSession.planning?.draft ?? null;

  if (!draft) {
    const sessionState = buildSessionState(normalizedSession, "reviewing");

    return {
      assistantMessage: "当前没有可创建的计划草案。请先补充计划上下文并生成草案，再说“就按这个草案创建计划”。",
      sessionState,
      status: "missing_draft",
      traceStep: buildTraceStep("没有可创建的计划草案", {
        gateApplied: true,
        reason: "missing_draft",
        status: "missing_draft",
      }, "error"),
    };
  }

  const buildResult = buildCreatePlanInputFromDraft(
    draft,
    normalizedSession.planning?.slots ?? {},
  );
  const sessionState = buildSessionState(normalizedSession, "confirming");

  if (!buildResult.ok) {
    return {
      assistantMessage: `当前计划草案缺少关键信息：${buildResult.error.missingFields.join("、")}。请先修改草案后再准备创建。`,
      error: buildResult.error,
      sessionState,
      status: "invalid_draft",
      traceStep: buildTraceStep("计划草案无法进入创建确认", {
        missingFields: buildResult.error.missingFields,
        reason: buildResult.error.code,
        status: "invalid_draft",
      }, "error"),
    };
  }

  const intent: Extract<AgentIntent, { intent: "compose_plan" }> = {
    args: buildResult.args,
    confidence: Math.max(input.intent.confidence ?? 0.85, 0.9),
    intent: "compose_plan",
  };

  return {
    args: buildResult.args,
    intent,
    sessionState,
    status: "prepared",
    traceStep: buildTraceStep("计划草案已准备进入创建确认", {
      gateApplied: true,
      intent: "prepare_plan_creation",
      nextIntent: "compose_plan",
      stage: "confirming",
      status: "prepared",
      title: buildResult.args.title,
    }),
  };
};

export const applyPlanCreationPreparationToResolution = <T extends { intent: AgentIntent }>(
  resolution: T,
  preparation: Extract<PlanCreationPreparationResult, { status: "prepared" }>,
): T => ({
  ...resolution,
  intent: preparation.intent,
});
