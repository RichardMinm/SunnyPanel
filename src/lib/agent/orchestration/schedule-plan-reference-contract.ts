import type { OrchestratorOutput } from "../llm/schemas/orchestrator-output";
import type { AgentPromptContext } from "../prompts";
import {
  analyzePlanReferenceEvidence,
} from "./plan-reference-evidence";

export type SchedulePlanReferenceErrorCode =
  | "explicit_plan_id_required"
  | "multiple_explicit_plan_ids"
  | "explicit_plan_id_not_in_context"
  | "multiple_exact_plan_titles"
  | "plan_id_title_conflict";

export type SchedulePlanReferenceCorrectionCode =
  "provider_plan_id_rebound";

export type SchedulePlanReferenceCorrection = Readonly<{
  code: SchedulePlanReferenceCorrectionCode;
  taskId: string;
}>;

export type SchedulePlanReferenceProvenance = Readonly<{
  planId: number;
  source:
    | "explicit_plan_id"
    | "explicit_plan_id_and_exact_title";
  taskId: string;
}>;

export type SchedulePlanReferenceValidationResult =
  | Readonly<{
      corrections: readonly SchedulePlanReferenceCorrection[];
      output: OrchestratorOutput;
      provenances: readonly SchedulePlanReferenceProvenance[];
      valid: true;
    }>
  | Readonly<{
      code: SchedulePlanReferenceErrorCode;
      safeMessage: string;
      valid: false;
    }>;

const safeMessageByCode = Object.freeze({
  explicit_plan_id_not_in_context:
    "没有找到用户明确提供的计划 ID，请确认要安排的计划。",
  explicit_plan_id_required:
    "安排已有计划需要用户明确提供一个计划 ID。",
  multiple_exact_plan_titles:
    "请求同时提到了多个计划标题，请确认要安排的计划。",
  multiple_explicit_plan_ids:
    "请求同时提到了多个计划 ID，请确认要安排的计划。",
  plan_id_title_conflict:
    "计划 ID 与标题指向不同资源，请确认要安排的计划。",
} satisfies Record<SchedulePlanReferenceErrorCode, string>);

const NO_CORRECTIONS =
  Object.freeze([]) as readonly SchedulePlanReferenceCorrection[];

const invalid = (
  code: SchedulePlanReferenceErrorCode,
): SchedulePlanReferenceValidationResult => Object.freeze({
  code,
  safeMessage: safeMessageByCode[code],
  valid: false,
});

export const validateSchedulePlanReferences = (
  input: Readonly<{
    context: AgentPromptContext;
    message: string;
    output: OrchestratorOutput;
  }>,
): SchedulePlanReferenceValidationResult => {
  const scheduleTasks = input.output.tasks.filter(
    ({ intent }) => intent === "schedule_plan",
  );
  if (scheduleTasks.length === 0) {
    return Object.freeze({
      corrections: NO_CORRECTIONS,
      output: input.output,
      provenances: Object.freeze([]),
      valid: true,
    });
  }
  if (
    input.output.mode !== "single"
    || input.output.tasks.length !== 1
    || scheduleTasks.length !== 1
  ) {
    return Object.freeze({
      corrections: NO_CORRECTIONS,
      output: input.output,
      provenances: Object.freeze([]),
      valid: true,
    });
  }

  const task = scheduleTasks[0]!;
  const evidence = analyzePlanReferenceEvidence({
    context: input.context,
    message: input.message,
  });
  if (evidence.explicitPlanIds.length === 0) {
    return invalid("explicit_plan_id_required");
  }
  if (evidence.explicitPlanIds.length > 1) {
    return invalid("multiple_explicit_plan_ids");
  }

  const explicitPlanId = evidence.explicitPlanIds[0]!;
  if (!evidence.trustedPlans.some(({ id }) => id === explicitPlanId)) {
    return invalid("explicit_plan_id_not_in_context");
  }

  const exactTitlePlanIds = new Set(
    evidence.exactTitlePlans.map(({ id }) => id),
  );
  if (exactTitlePlanIds.size > 1) {
    return invalid("multiple_exact_plan_titles");
  }
  if (
    exactTitlePlanIds.size === 1
    && !exactTitlePlanIds.has(explicitPlanId)
  ) {
    return invalid("plan_id_title_conflict");
  }

  const correctionRequired = task.args.planId !== explicitPlanId;
  const normalizedTask = correctionRequired
    ? Object.freeze({
        ...task,
        args: Object.freeze({
          ...task.args,
          planId: explicitPlanId,
        }),
      })
    : task;
  const normalizedOutput = correctionRequired
    ? Object.freeze({
        ...input.output,
        tasks: Object.freeze([normalizedTask]),
      }) as OrchestratorOutput
    : input.output;
  const corrections = correctionRequired
    ? Object.freeze([
        Object.freeze({
          code: "provider_plan_id_rebound" as const,
          taskId: task.id,
        }),
      ])
    : NO_CORRECTIONS;

  const provenance = Object.freeze({
    planId: explicitPlanId,
    source: exactTitlePlanIds.size === 1
      ? "explicit_plan_id_and_exact_title" as const
      : "explicit_plan_id" as const,
    taskId: task.id,
  });
  return Object.freeze({
    corrections,
    output: normalizedOutput,
    provenances: Object.freeze([provenance]),
    valid: true,
  });
};
