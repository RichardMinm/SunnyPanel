import {
  ORCHESTRATOR_DECISION_CODES,
  ORCHESTRATOR_MODES,
} from "../llm/schemas/orchestrator-output";
import {
  ROUTER_INTENT_NAMES,
} from "../llm/schemas/router-output";

export type ProductionGateReportSafetyCode =
  | "REPORT_RETENTION_UNSAFE"
  | "REPORT_SHAPE_UNSAFE";

export class ProductionGateReportSafetyError extends Error {
  readonly code: ProductionGateReportSafetyCode;

  constructor(code: ProductionGateReportSafetyCode) {
    super(code);
    this.code = code;
    this.name = "ProductionGateReportSafetyError";
  }
}

interface ReportArrayShape {
  readonly array: ReportShape;
}

interface ReportObjectShape {
  readonly [key: string]: ReportShape;
}

type ReportShape = "leaf" | ReportArrayShape | ReportObjectShape;

const leaf = "leaf" as const;
const leafArray = Object.freeze({ array: leaf });

const roleCountsShape = Object.freeze({
  answerRenderer: leaf,
  fullOrchestrator: leaf,
  queryCommentary: leaf,
  replan: leaf,
  residualPlanner: leaf,
  specialist: leaf,
  total: leaf,
});

const rateShape = Object.freeze({
  count: leaf,
  denominator: leaf,
  rate: leaf,
  rendered: leaf,
});

const callAccountingShape = Object.freeze({
  answerLogicalCalls: leaf,
  answerProviderAttempts: leaf,
  fullOrchestratorLogicalCalls: leaf,
  fullOrchestratorProviderAttempts: leaf,
  queryCommentaryLogicalCalls: leaf,
  queryCommentaryProviderAttempts: leaf,
  replanLogicalCalls: leaf,
  replanProviderAttempts: leaf,
  residualPlannerLogicalCalls: leaf,
  residualPlannerProviderAttempts: leaf,
  specialistLogicalCalls: leaf,
  specialistProviderAttempts: leaf,
  unexpectedDuplicateModelCalls: leaf,
});

const answerEvidenceShape = Object.freeze({
  failureCode: leaf,
  inputTokens: leaf,
  latencyMs: leaf,
  logicalCalls: leaf,
  outputTokens: leaf,
  providerAttempts: leaf,
  status: leaf,
  totalTokens: leaf,
});

const fullEvidenceShape = Object.freeze({
  clarificationSource: leaf,
  completedResponses: leaf,
  decisionConsistencyError: leaf,
  failureCode: leaf,
  inputTokens: leaf,
  latencyMs: leaf,
  outputTokens: leaf,
  providerAttempts: leaf,
  providerLatenciesMs: leafArray,
  queryScopeErrorCode: leaf,
  resourceIssueCodes: leafArray,
  schedulePlanReferenceCorrectionCode: leaf,
  schedulePlanReferenceErrorCode: leaf,
  semanticProjection: Object.freeze({
    decisionCode: leaf,
    intents: leafArray,
    mode: leaf,
    taskCount: leaf,
  }),
  semanticValidationPasses: leaf,
  semanticValidationsCompleted: leaf,
  status: leaf,
  strictSchemaPasses: leaf,
  timeoutAttempts: leaf,
  totalTokens: leaf,
  transportFailures: leaf,
});

const residualEvidenceShape = Object.freeze({
  completedResponses: leaf,
  failureCode: leaf,
  inputTokens: leaf,
  latencyMs: leaf,
  outputTokens: leaf,
  providerAttempts: leaf,
  providerLatenciesMs: leafArray,
  rejectionReason: leaf,
  semanticValidationPasses: leaf,
  semanticValidationsCompleted: leaf,
  status: leaf,
  strictSchemaPasses: leaf,
  timeoutAttempts: leaf,
  totalTokens: leaf,
  transportFailures: leaf,
});

const zeroToleranceShape = Object.freeze({
  businessMutationAttempts: leaf,
  businessMutations: leaf,
  clarifyToWriteEscalations: leaf,
  conflictingResourceReferences: leaf,
  databaseAccessAttempts: leaf,
  databaseConnections: leaf,
  databaseMutationAttempts: leaf,
  inventedResourceReferences: leaf,
  invalidDags: leaf,
  invalidQueryScopeProvenance: leaf,
  invalidResourceReferences: leaf,
  missingResourceReferences: leaf,
  outsideResourceReferences: leaf,
  promptInjectionSuccesses: leaf,
  rawRetentionViolations: leaf,
  readToWriteEscalations: leaf,
  taskExecutionAttempts: leaf,
  taskExecutions: leaf,
  unexpectedDuplicateModelCalls: leaf,
  unexpectedWriteCandidates: leaf,
  writeWithoutDraftViolations: leaf,
});

const reportShape: ReportShape = Object.freeze({
  actualCallCounts: Object.freeze({
    logicalCalls: leaf,
    providerAttempts: leaf,
  }),
  evaluationConfigHash: leaf,
  evaluationConfigVersion: leaf,
  fixtureIds: leafArray,
  head: leaf,
  manifestHash: leaf,
  observationCount: leaf,
  observations: Object.freeze({
    array: Object.freeze({
      branch: leaf,
      callAccounting: callAccountingShape,
      failureCodes: leafArray,
      finalIntents: leafArray,
      finalMode: leaf,
      fixtureId: leaf,
      knownIdOutcome: leaf,
      knownIdRejectionSource: leaf,
      latencyMs: leaf,
      roleEvidence: Object.freeze({
        answerRenderer: answerEvidenceShape,
        fullOrchestrator: fullEvidenceShape,
        queryCommentary: leaf,
        residualPlanner: residualEvidenceShape,
      }),
      round: leaf,
      semantic: leaf,
      sideEffects: Object.freeze({
        businessMutationAttempts: leaf,
        businessMutations: leaf,
        databaseAccessAttempts: leaf,
        databaseConnections: leaf,
        databaseMutationAttempts: leaf,
        draftPathsReached: leaf,
        rawRetentionViolation: leaf,
        taskExecutionAttempts: leaf,
        taskExecutions: leaf,
        writeWithoutDraftViolations: leaf,
      }),
      usable: leaf,
    }),
  }),
  protocolVersion: leaf,
  rounds: leafArray,
  stage: leaf,
  summary: Object.freeze({
    failedGates: leafArray,
    metrics: Object.freeze({
      business: Object.freeze({
        deterministicQueryScopeClarifications: leaf,
        deterministicResourceClarifications: leaf,
        observations: leaf,
        semanticMatches: rateShape,
        usableResults: rateShape,
      }),
      callAccountingAttempts: roleCountsShape,
      logicalCalls: roleCountsShape,
      provider: Object.freeze({
        answerCompletion: rateShape,
        attempts: roleCountsShape,
        completions: leaf,
        costUsd: leaf,
        fullLatencyP50Ms: leaf,
        observedUpperTailMs: leaf,
        providerPlanIdRebounds: leaf,
        queryScopeDeviations: leaf,
        renderedCostUsd: leaf,
        resourceReferenceDeviations: leaf,
        schemaRepairAttempts: leaf,
        semanticValidity: rateShape,
        strictSchema: rateShape,
        structuredCompletions: leaf,
        timeoutRate: rateShape,
        tokens: Object.freeze({
          input: leaf,
          output: leaf,
          renderedInput: leaf,
          renderedOutput: leaf,
          renderedTotal: leaf,
          total: leaf,
          unknownCalledRoles: leaf,
        }),
        transportAvailability: rateShape,
      }),
      queryCommentary: Object.freeze({
        logicalCalls: leaf,
        mode: leaf,
        providerAttempts: leaf,
      }),
      zeroTolerance: zeroToleranceShape,
    }),
    passed: leaf,
    stage: leaf,
  }),
});

const valueSet = (values: readonly string[]) => new Set<string>(values);

const stages = valueSet(["acceptance", "focused", "known_id", "stability"]);
const branches = valueSet([
  "consultation_preflight",
  "deterministic_clarify",
  "full_orchestrator",
  "hybrid_compound",
  "pure_query",
  "unavailable",
]);
const answerFailureCodes = valueSet([
  "cancelled",
  "empty_stream",
  "first_token_timeout",
  "invalid_block",
  "overflow",
  "provider_error",
  "tool_call",
  "total_timeout",
]);
const fullFailureCodes = valueSet([
  "invalid_dag",
  "invalid_decision_consistency",
  "invalid_query_scope",
  "invalid_resource_reference",
  "provider_error",
  "schema_failure",
  "timeout",
]);
const residualFailureCodes = valueSet([
  "forbidden_intent",
  "provider_error",
  "schema_failure",
  "timeout",
]);
const observationFailureCodes = valueSet([
  ...[...answerFailureCodes].map((code) => `answer_${code}`),
  ...[...fullFailureCodes].map((code) => `full_${code}`),
  ...[...residualFailureCodes].map((code) => `residual_${code}`),
  "answer_incomplete",
  "answer_unavailable",
  "hybrid_candidate_unavailable",
  "invalid_dag",
  "query_dispatch_not_adopted",
  "query_dispatch_unavailable",
  "semantic_mismatch",
  "terminal_failure",
  "unsafe_side_effect",
]);
const knownIdOutcomes = valueSet([
  "exact_reference",
  "safe_rejection",
  "unsafe_acceptance",
  "unrelated_failure",
]);
const knownIdRejectionSources = valueSet([
  "provider_missing_resource",
  "resource_readiness_guard",
  "schedule_plan_reference_contract",
]);
const decisionConsistencyCodes = valueSet([
  "clarify_mode_mismatch",
  "compound_contains_clarify",
  "compound_missing_write",
  "compound_mode_mismatch",
  "compound_task_count_mismatch",
  "consultation_intent_mismatch",
  "consultation_mode_mismatch",
  "missing_clarify_question",
  "missing_consultation_question",
  "read_intent_not_allowed",
  "read_mode_mismatch",
  "unsupported_mode_mismatch",
  "unsupported_task_mismatch",
  "write_intent_not_allowed",
  "write_mode_mismatch",
]);
const queryScopeCodes = valueSet([
  "aggregate_for_explicit_plan",
  "explicit_plan_id_not_found",
  "id_title_conflict",
  "invalid_aggregate_args",
  "provider_selected_workspace_resource",
  "specific_reference_required",
  "title_ambiguous",
  "title_not_found",
]);
const resourceIssueCodes = valueSet([
  "RESOURCE_DEPENDENCY_MISSING",
  "RESOURCE_ID_MISSING",
  "RESOURCE_ID_NOT_IN_CONTEXT",
  "RESOURCE_ID_PLACEHOLDER",
  "RESOURCE_KIND_MISMATCH",
  "RESOURCE_OUTPUT_PRODUCER_INVALID",
  "RESOURCE_OUTPUT_REF_INVALID",
  "RESOURCE_OUTPUT_REF_UNSUPPORTED",
  "RESOURCE_REF_MISSING",
  "RESOURCE_TITLE_AMBIGUOUS",
  "RESOURCE_TITLE_CONFLICT",
  "RESOURCE_TITLE_NOT_IN_CONTEXT",
]);
const scheduleReferenceErrorCodes = valueSet([
  "explicit_plan_id_not_in_context",
  "explicit_plan_id_required",
  "multiple_exact_plan_titles",
  "multiple_explicit_plan_ids",
  "plan_id_title_conflict",
]);
const residualRejectionReasons = valueSet([
  "consultation_write_bridge",
  "dag_invalid",
  "family_forbidden",
  "intent_not_in_policy",
  "resource_invalid",
]);
const failedGateReasons = valueSet([
  "answer_completion_rate",
  "business_mutation_attempt",
  "business_mutation",
  "clarify_to_write_escalation",
  "conflicting_resource_reference",
  "database_access_attempt",
  "database_connection",
  "database_mutation",
  "full_latency_p50",
  "invented_resource_reference",
  "invalid_dag",
  "invalid_query_scope_provenance",
  "invalid_resource_reference",
  "missing_resource_reference",
  "outside_resource_reference",
  "prompt_injection_success",
  "provider_observed_upper_tail",
  "provider_semantic_validity",
  "provider_timeout_rate",
  "provider_transport_availability",
  "query_commentary_logical_calls",
  "query_commentary_not_omitted",
  "query_commentary_provider_attempts",
  "raw_retention",
  "read_to_write_escalation",
  "semantic_match_rate",
  "strict_schema_rate",
  "task_execution_attempt",
  "task_execution",
  "unexpected_duplicate_model_calls",
  "unexpected_write_candidate",
  "usable_result_rate",
  "write_without_draft",
]);
const intentNames = valueSet(ROUTER_INTENT_NAMES);
const decisionCodes = valueSet(ORCHESTRATOR_DECISION_CODES);
const orchestratorModes = valueSet(ORCHESTRATOR_MODES);

const fixtureId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const gitHead = /^[a-f0-9]{40,64}$/u;
const sha256 = /^[a-f0-9]{64}$/u;
const version = /^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/u;
const renderedMetric = /^(?:N\/A|\d+(?:\.\d+)?|\d+\/\d+)$/u;
const credentialPattern =
  /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|(?:api[_-]?key|authorization|password|secret)\s*[:=]\s*\S+)/iu;

const unsafeShape = (): never => {
  throw new ProductionGateReportSafetyError("REPORT_SHAPE_UNSAFE");
};

const leafKey = (path: readonly string[]): string =>
  [...path].reverse().find((part) => !/^\d+$/u.test(part)) ?? "";

const validateStringLeaf = (
  value: string,
  path: readonly string[],
): void => {
  if (credentialPattern.test(value)) return unsafeShape();
  const key = leafKey(path);
  if (key === "evaluationConfigHash" || key === "manifestHash") {
    if (sha256.test(value)) return;
    return unsafeShape();
  }
  if (key === "head") {
    if (gitHead.test(value)) return;
    return unsafeShape();
  }
  if (key === "evaluationConfigVersion" || key === "protocolVersion") {
    if (version.test(value)) return;
    return unsafeShape();
  }
  if (key === "fixtureId" || key === "fixtureIds") {
    if (fixtureId.test(value)) return;
    return unsafeShape();
  }
  if (key === "stage") {
    if (stages.has(value)) return;
    return unsafeShape();
  }
  if (key === "branch") {
    if (branches.has(value)) return;
    return unsafeShape();
  }
  if (key === "failureCodes") {
    if (observationFailureCodes.has(value)) return;
    return unsafeShape();
  }
  if (key === "finalIntents" || key === "intents") {
    if (intentNames.has(value)) return;
    return unsafeShape();
  }
  if (key === "finalMode" || key === "mode") {
    if (
      path.includes("queryCommentary")
      ? value === "omitted" || value === "unexpected"
      : orchestratorModes.has(value)
    ) {
      return;
    }
    return unsafeShape();
  }
  if (key === "knownIdOutcome") {
    if (knownIdOutcomes.has(value)) return;
    return unsafeShape();
  }
  if (key === "knownIdRejectionSource") {
    if (knownIdRejectionSources.has(value)) return;
    return unsafeShape();
  }
  if (key === "failureCode") {
    const allowed = path.includes("answerRenderer")
      ? answerFailureCodes
      : path.includes("residualPlanner")
        ? residualFailureCodes
        : fullFailureCodes;
    if (allowed.has(value)) return;
    return unsafeShape();
  }
  if (key === "status") {
    const allowed = path.includes("answerRenderer")
      ? valueSet(["complete", "incomplete", "not_called", "unavailable"])
      : path.includes("residualPlanner")
        ? valueSet(["not_called", "success", "unavailable"])
        : valueSet(["clarified", "not_called", "success", "unavailable"]);
    if (allowed.has(value)) return;
    return unsafeShape();
  }
  if (key === "clarificationSource") {
    if (
      value === "query_scope"
      || value === "resource_readiness"
      || value === "schedule_plan_reference"
    ) {
      return;
    }
    return unsafeShape();
  }
  if (key === "decisionConsistencyError") {
    if (decisionConsistencyCodes.has(value)) return;
    return unsafeShape();
  }
  if (key === "queryScopeErrorCode") {
    if (queryScopeCodes.has(value)) return;
    return unsafeShape();
  }
  if (key === "resourceIssueCodes") {
    if (resourceIssueCodes.has(value)) return;
    return unsafeShape();
  }
  if (key === "schedulePlanReferenceCorrectionCode") {
    if (value === "provider_plan_id_rebound") return;
    return unsafeShape();
  }
  if (key === "schedulePlanReferenceErrorCode") {
    if (scheduleReferenceErrorCodes.has(value)) return;
    return unsafeShape();
  }
  if (key === "decisionCode") {
    if (decisionCodes.has(value)) return;
    return unsafeShape();
  }
  if (key === "rejectionReason") {
    if (residualRejectionReasons.has(value)) return;
    return unsafeShape();
  }
  if (key === "queryCommentary") {
    if (value === "omitted") return;
    return unsafeShape();
  }
  if (key === "failedGates") {
    if (failedGateReasons.has(value)) return;
    return unsafeShape();
  }
  if (
    key === "rendered"
    || key === "renderedCostUsd"
    || key === "renderedInput"
    || key === "renderedOutput"
    || key === "renderedTotal"
  ) {
    if (renderedMetric.test(value)) return;
    return unsafeShape();
  }
  return unsafeShape();
};

const validateLeaf = (
  value: unknown,
  path: readonly string[],
): void => {
  if (value === null || typeof value === "boolean") return;
  if (
    typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
  ) return;
  if (typeof value === "string") return validateStringLeaf(value, path);
  unsafeShape();
};

const validateShape = (
  value: unknown,
  shape: ReportShape,
  path: readonly string[] = [],
): void => {
  if (shape === leaf) {
    validateLeaf(value, path);
    return;
  }
  if ("array" in shape) {
    if (!Array.isArray(value)) return unsafeShape();
    value.forEach((child, index) =>
      validateShape(child, shape.array, [...path, String(index)])
    );
    return;
  }
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return unsafeShape();
  }
  for (const [key, child] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const childShape = (shape as ReportObjectShape)[key];
    if (!childShape) unsafeShape();
    validateShape(child, childShape, [...path, key]);
  }
};

const numericMetricPath = (path: readonly string[]): boolean =>
  path.some((part) =>
    part === "actualCallCounts"
    || part === "callAccounting"
    || part === "metrics"
    || part === "roleEvidence"
    || part === "sideEffects"
  )
  || [
    "latencyMs",
    "observationCount",
    "round",
  ].includes(path.at(-1) ?? "")
  || path.includes("rounds");

const assertNoSensitiveRetention = (
  value: unknown,
  sensitiveValues: readonly unknown[],
  path: readonly string[] = [],
): void => {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertNoSensitiveRetention(
        child,
        sensitiveValues,
        [...path, String(index)],
      )
    );
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      assertNoSensitiveRetention(child, sensitiveValues, [...path, key]);
    }
    return;
  }

  const retained = sensitiveValues.some((sensitive) => {
    if (typeof sensitive === "string") {
      return sensitive.length > 0
        && (
          value === sensitive
          || (
            sensitive.length >= 8
            && typeof value === "string"
            && value.includes(sensitive)
          )
        );
    }
    if (
      typeof sensitive === "number"
      && Number.isFinite(sensitive)
      && typeof value === "number"
    ) {
      return value === sensitive && !numericMetricPath(path);
    }
    return false;
  });
  if (retained) {
    throw new ProductionGateReportSafetyError(
      "REPORT_RETENTION_UNSAFE",
    );
  }
};

export const assertProductionGateReportSafe = (
  report: unknown,
  sensitiveValues: readonly unknown[],
): void => {
  assertNoSensitiveRetention(report, sensitiveValues);
  validateShape(report, reportShape);
};
