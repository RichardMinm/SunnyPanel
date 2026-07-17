/**
 * Authoritative post-Composer validation for Hybrid orchestration candidates.
 *
 * This module is deliberately pure: it performs no model, database, mapping,
 * persistence, or execution work. The fixed-task provenance sidecar is
 * validated here and discarded by projecting only the schema-valid output.
 */

import {
  orchestratorOutputSchema,
  type OrchestratorOutput,
  type OrchestratorTask,
  validateTaskDAG,
} from "../llm/schemas/orchestrator-output";
import type {
  ActorAuthorizedResourceSnapshot,
  FixedTaskMetadata,
  HybridOrchestrationCandidate,
} from "./hybrid-query-boundary-types";
import {
  READ_QUERY_INTENTS,
  validateOrchestratorDecisionConsistency,
} from "./orchestrator-decision-consistency";
import {
  buildResourceIndex,
  validateResourceReadiness,
} from "./resource-readiness-guard";

export const HYBRID_CANDIDATE_VALIDATION_STEPS = Object.freeze([
  "strict_structure",
  "provenance",
  "decision",
  "dag",
  "resource",
  "sidecar_projection",
] as const);

export type HybridCandidateValidationStep =
  typeof HYBRID_CANDIDATE_VALIDATION_STEPS[number];

export type HybridCandidateValidationErrorCode =
  | "decision_consistency_failure"
  | "invalid_candidate_structure"
  | "invalid_dag"
  | "invalid_fixed_task_provenance"
  | "residual_query_intent_forbidden"
  | "resource_readiness_failure";

export type HybridCandidateValidationInput = Readonly<{
  allowedResourceIds: ReadonlySet<number>;
  authorizedSnapshot: ActorAuthorizedResourceSnapshot;
  candidate: HybridOrchestrationCandidate;
  onValidationStep?: (step: HybridCandidateValidationStep) => void;
}>;

export type HybridCandidateValidationResult =
  | Readonly<{
      output: OrchestratorOutput;
      status: "valid";
    }>
  | Readonly<{
      code: HybridCandidateValidationErrorCode;
      status: "rejected";
    }>;

const queryIntents = new Set<string>(READ_QUERY_INTENTS);

const reject = (
  code: HybridCandidateValidationErrorCode,
): HybridCandidateValidationResult => Object.freeze({
  code,
  status: "rejected",
});

const hasExactKeys = (
  value: object,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasStrictAggregateProvenance = (
  provenance: unknown,
): boolean =>
  isRecord(provenance)
  && hasExactKeys(provenance, ["scope", "source"])
  && provenance.scope === "aggregate"
  && provenance.source === "user_unspecified";

const hasStrictPlanProvenance = (
  provenance: unknown,
): provenance is Readonly<{
  planId: number;
  scope: "plan";
  source: "explicit_plan_id" | "resolved_exact_title";
}> =>
  isRecord(provenance)
  && hasExactKeys(provenance, ["planId", "scope", "source"])
  && provenance.scope === "plan"
  && (
    provenance.source === "explicit_plan_id"
    || provenance.source === "resolved_exact_title"
  )
  && typeof provenance.planId === "number"
  && Number.isInteger(provenance.planId)
  && provenance.planId > 0;

const hasStrictMetadataShape = (
  metadata: unknown,
): metadata is FixedTaskMetadata =>
  isRecord(metadata)
  && hasExactKeys(metadata, [
    "ownership",
    "queryScopeProvenance",
    "taskId",
  ])
  && metadata.ownership === "deterministic_query_boundary"
  && typeof metadata.taskId === "string"
  && metadata.taskId.length > 0
  && (
    hasStrictAggregateProvenance(metadata.queryScopeProvenance)
    || hasStrictPlanProvenance(metadata.queryScopeProvenance)
  );

const hasStrictCandidateStructure = (
  candidate: HybridOrchestrationCandidate,
): boolean =>
  isRecord(candidate)
  && hasExactKeys(candidate, ["fixedTaskMetadata", "output"])
  && Array.isArray(candidate.fixedTaskMetadata)
  && candidate.fixedTaskMetadata.length === 1
  && hasStrictMetadataShape(candidate.fixedTaskMetadata[0])
  && orchestratorOutputSchema.safeParse(candidate.output).success;

const findFixedTask = (
  output: OrchestratorOutput,
  metadata: FixedTaskMetadata,
): OrchestratorTask | null =>
  output.tasks.find((task) => task.id === metadata.taskId) ?? null;

const fixedTaskProvenanceIsValid = (
  task: OrchestratorTask,
  metadata: FixedTaskMetadata,
  input: HybridCandidateValidationInput,
): boolean => {
  if (
    metadata.ownership !== "deterministic_query_boundary"
    || !queryIntents.has(task.intent)
    || task.dependsOn.length > 0
  ) {
    return false;
  }

  const provenance = metadata.queryScopeProvenance;
  if (provenance.scope === "aggregate") {
    return provenance.source === "user_unspecified"
      && task.intent === "query_progress"
      && !("planId" in task.args);
  }

  const authorizedPlanIds = new Set(
    input.authorizedSnapshot.plans.map((plan) => plan.id),
  );
  return (
    provenance.source === "explicit_plan_id"
    || provenance.source === "resolved_exact_title"
  )
    && task.intent === "query_plan_progress"
    && task.args.planId === provenance.planId
    && input.allowedResourceIds.has(provenance.planId)
    && authorizedPlanIds.has(provenance.planId);
};

export const validateHybridOrchestrationCandidate = (
  input: HybridCandidateValidationInput,
): HybridCandidateValidationResult => {
  input.onValidationStep?.("strict_structure");
  if (!hasStrictCandidateStructure(input.candidate)) {
    return reject("invalid_candidate_structure");
  }

  input.onValidationStep?.("provenance");
  const metadata = input.candidate.fixedTaskMetadata[0];
  const fixedTask = findFixedTask(input.candidate.output, metadata);
  if (
    fixedTask === null
    || !fixedTaskProvenanceIsValid(fixedTask, metadata, input)
  ) {
    return reject("invalid_fixed_task_provenance");
  }
  if (
    input.candidate.output.tasks.some(
      (task) => task.id !== metadata.taskId && queryIntents.has(task.intent),
    )
  ) {
    return reject("residual_query_intent_forbidden");
  }

  input.onValidationStep?.("decision");
  if (
    !validateOrchestratorDecisionConsistency(input.candidate.output).valid
  ) {
    return reject("decision_consistency_failure");
  }

  input.onValidationStep?.("dag");
  if (!validateTaskDAG(input.candidate.output).valid) {
    return reject("invalid_dag");
  }

  input.onValidationStep?.("resource");
  const allowedPlans = input.authorizedSnapshot.plans
    .filter((plan) => input.allowedResourceIds.has(plan.id))
    .map((plan) => ({
      id: plan.id,
      title: plan.normalizedTitle,
    }));
  const readiness = validateResourceReadiness({
    resourceIndex: buildResourceIndex({ plans: allowedPlans }),
    tasks: input.candidate.output.tasks,
  });
  if (!readiness.ready) {
    return reject("resource_readiness_failure");
  }

  input.onValidationStep?.("sidecar_projection");
  return Object.freeze({
    output: input.candidate.output,
    status: "valid",
  });
};
