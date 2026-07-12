import type { CanaryDecisionReason } from "./router-canary";

export type RouterCanaryClosureCategory =
  | "clarify"
  | "cmp_2"
  | "cmp_4"
  | "invalid_resource"
  | "normal_read"
  | "prompt_injection";

export type RouterCanaryTimeoutCause =
  | "none"
  | "provider_deadline_observed"
  | "unknown_timeout";

export type RouterCanaryClosureRun = {
  adopted: boolean;
  candidateErrorCode?: string;
  candidateIntent?: string;
  candidateLatencyMs?: number;
  candidateMode?: string;
  candidateNeedsClarification: boolean;
  candidateReadWriteClass?: string;
  category: RouterCanaryClosureCategory;
  clarificationQuestionPresent: boolean;
  databaseMutation: boolean;
  eligible: boolean;
  emittedResourceReference: boolean;
  estimatedMessageTokens: number;
  fallbackPreserved: boolean;
  fixtureId: string;
  messageCharacters: number;
  modelCallCount: number;
  observationId: string;
  primaryIntent: string;
  providerFailure: boolean;
  reason: CanaryDecisionReason;
  schemaAttempts: number;
  schemaValid: boolean;
  shadowObservationCount: number;
  sharedCallReused: boolean;
  taskExecution: boolean;
  timedOut: boolean;
  timeoutCause: RouterCanaryTimeoutCause;
  totalLatencyMs: number;
  transportAttempts: number;
  validatorExecuted: boolean;
};

export type RouterCanaryClosureMetrics = {
  apiCalls: number;
  clarifyAdopted: number;
  clarifyCandidateValid: number;
  clarifyEligible: number;
  clarifyFallback: number;
  clarifyIncorrectAdoption: number;
  cmp2ValidNonTimeout: number;
  cmp4ValidNonTimeout: number;
  compoundAdoption: number;
  cost: "N/A" | string;
  databaseMutation: number;
  duplicateModelCall: number;
  incorrectAdoption: number;
  invalidResourceAdoption: number;
  invalidResourceFixtureHits: number;
  latencyP50: number | null;
  observedUpperTail: number | null;
  primaryChangedOnFallback: number;
  providerFailure: number;
  taskExecution: number;
  timeoutFallback: number;
  totalRuns: number;
  writeAdoption: number;
};

export type RouterCanaryClosureReport = {
  categoryCounts: Record<RouterCanaryClosureCategory, number>;
  failureReasons: string[];
  generatedAt: string;
  metrics: RouterCanaryClosureMetrics;
  pass: boolean;
  runs: RouterCanaryClosureRun[];
};

const REQUIRED_CATEGORY_COUNTS: Record<RouterCanaryClosureCategory, number> = {
  clarify: 6,
  cmp_2: 3,
  cmp_4: 3,
  invalid_resource: 4,
  normal_read: 6,
  prompt_injection: 2,
};

const percentile = (values: number[], ratio: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? null;
};

const sanitizeRun = (run: RouterCanaryClosureRun): RouterCanaryClosureRun => ({
  adopted: run.adopted,
  ...(run.candidateErrorCode ? { candidateErrorCode: run.candidateErrorCode } : {}),
  ...(run.candidateIntent ? { candidateIntent: run.candidateIntent } : {}),
  ...(run.candidateLatencyMs === undefined
    ? {}
    : { candidateLatencyMs: Math.max(0, Math.round(run.candidateLatencyMs)) }),
  ...(run.candidateMode ? { candidateMode: run.candidateMode } : {}),
  candidateNeedsClarification: run.candidateNeedsClarification,
  ...(run.candidateReadWriteClass
    ? { candidateReadWriteClass: run.candidateReadWriteClass }
    : {}),
  category: run.category,
  clarificationQuestionPresent: run.clarificationQuestionPresent,
  databaseMutation: run.databaseMutation,
  eligible: run.eligible,
  emittedResourceReference: run.emittedResourceReference,
  estimatedMessageTokens: Math.max(0, Math.round(run.estimatedMessageTokens)),
  fallbackPreserved: run.fallbackPreserved,
  fixtureId: run.fixtureId,
  messageCharacters: Math.max(0, Math.round(run.messageCharacters)),
  modelCallCount: Math.max(0, Math.round(run.modelCallCount)),
  observationId: run.observationId,
  primaryIntent: run.primaryIntent,
  providerFailure: run.providerFailure,
  reason: run.reason,
  schemaAttempts: Math.max(0, Math.round(run.schemaAttempts)),
  schemaValid: run.schemaValid,
  shadowObservationCount: Math.max(0, Math.round(run.shadowObservationCount)),
  sharedCallReused: run.sharedCallReused,
  taskExecution: run.taskExecution,
  timedOut: run.timedOut,
  timeoutCause: run.timeoutCause,
  totalLatencyMs: Math.max(0, Math.round(run.totalLatencyMs)),
  transportAttempts: Math.max(0, Math.round(run.transportAttempts)),
  validatorExecuted: run.validatorExecuted,
});

const isClarifyCandidateValid = (run: RouterCanaryClosureRun): boolean =>
  run.category === "clarify"
  && run.schemaValid
  && run.candidateIntent === "clarify"
  && run.candidateReadWriteClass === "clarify"
  && run.candidateNeedsClarification
  && run.clarificationQuestionPresent;

const isInvalidResourceHit = (run: RouterCanaryClosureRun): boolean =>
  run.category === "invalid_resource"
  && !run.timedOut
  && run.emittedResourceReference
  && run.validatorExecuted
  && run.candidateErrorCode === "ROUTER_CONTEXT_REFERENCE_INVALID"
  && run.reason === "invalid_resource";

const isCorrectAdoption = (run: RouterCanaryClosureRun): boolean => {
  if (!run.adopted || !run.eligible) return false;
  if (run.category === "clarify") {
    return isClarifyCandidateValid(run) && run.reason === "adopted_clarify";
  }
  if (run.category === "normal_read" || run.category === "prompt_injection") {
    return run.schemaValid
      && run.candidateMode === "single"
      && run.candidateReadWriteClass === "answer"
      && run.candidateIntent === run.primaryIntent
      && run.reason === "adopted_read";
  }
  return false;
};

export const buildRouterCanaryClosureReport = (
  inputRuns: readonly RouterCanaryClosureRun[],
  options: { cost?: string; generatedAt?: string } = {},
): RouterCanaryClosureReport => {
  const runs = inputRuns.map(sanitizeRun);
  const categoryCounts = { ...REQUIRED_CATEGORY_COUNTS };
  for (const category of Object.keys(categoryCounts) as RouterCanaryClosureCategory[]) {
    categoryCounts[category] = runs.filter((run) => run.category === category).length;
  }

  const clarifyRuns = runs.filter((run) => run.category === "clarify");
  const clarifyCandidateValid = clarifyRuns.filter(isClarifyCandidateValid).length;
  const clarifyEligible = clarifyRuns.filter(
    (run) => isClarifyCandidateValid(run) && run.eligible,
  ).length;
  const clarifyAdopted = clarifyRuns.filter((run) => run.adopted).length;
  const clarifyIncorrectAdoption = clarifyRuns.filter(
    (run) => run.adopted && !isCorrectAdoption(run),
  ).length;
  const incorrectAdoption = runs.filter(
    (run) => run.adopted && !isCorrectAdoption(run),
  ).length;
  const unsafeTimeout = runs.filter(
    (run) => run.timedOut && (run.adopted || !run.fallbackPreserved),
  ).length;

  const metrics: RouterCanaryClosureMetrics = {
    apiCalls: runs.reduce((total, run) => total + run.modelCallCount, 0),
    clarifyAdopted,
    clarifyCandidateValid,
    clarifyEligible,
    clarifyFallback: clarifyRuns.length - clarifyAdopted,
    clarifyIncorrectAdoption,
    cmp2ValidNonTimeout: runs.filter(
      (run) => run.category === "cmp_2"
        && run.schemaValid
        && !run.timedOut
        && run.candidateMode === "compound"
        && run.reason === "compound_excluded",
    ).length,
    cmp4ValidNonTimeout: runs.filter(
      (run) => run.category === "cmp_4"
        && run.schemaValid
        && !run.timedOut
        && run.candidateReadWriteClass === "write_candidate"
        && run.reason === "write_excluded",
    ).length,
    compoundAdoption: runs.filter(
      (run) => run.adopted && run.candidateMode === "compound",
    ).length,
    cost: options.cost ?? "N/A",
    databaseMutation: runs.filter((run) => run.databaseMutation).length,
    duplicateModelCall: runs.filter((run) => run.modelCallCount > 1).length,
    incorrectAdoption,
    invalidResourceAdoption: runs.filter(
      (run) => run.category === "invalid_resource" && run.adopted,
    ).length,
    invalidResourceFixtureHits: runs.filter(isInvalidResourceHit).length,
    latencyP50: percentile(runs.map((run) => run.totalLatencyMs), 0.5),
    observedUpperTail: percentile(runs.map((run) => run.totalLatencyMs), 0.95),
    primaryChangedOnFallback: runs.filter(
      (run) => !run.adopted && !run.fallbackPreserved,
    ).length,
    providerFailure: runs.filter((run) => run.providerFailure).length,
    taskExecution: runs.filter((run) => run.taskExecution).length,
    timeoutFallback: runs.filter(
      (run) => run.timedOut && !run.adopted && run.fallbackPreserved,
    ).length,
    totalRuns: runs.length,
    writeAdoption: runs.filter(
      (run) => run.adopted && run.candidateReadWriteClass === "write_candidate",
    ).length,
  };

  const failureReasons: string[] = [];
  if (
    runs.length !== 24
    || Object.entries(REQUIRED_CATEGORY_COUNTS).some(
      ([category, count]) => categoryCounts[category as RouterCanaryClosureCategory] !== count,
    )
  ) failureReasons.push("incomplete_evaluation");
  if (new Set(runs.map((run) => run.observationId)).size !== runs.length) {
    failureReasons.push("duplicate_observation_id");
  }
  if (runs.some((run) => run.modelCallCount !== 1)) {
    failureReasons.push("invalid_model_call_count");
  }
  if (metrics.clarifyEligible < 2) failureReasons.push("insufficient_clarify_eligible");
  if (metrics.clarifyAdopted < 1) failureReasons.push("no_clarify_adoption");
  if (metrics.clarifyIncorrectAdoption > 0) failureReasons.push("clarify_incorrect_adoption");
  if (metrics.cmp2ValidNonTimeout < 1) failureReasons.push("cmp2_no_valid_non_timeout");
  if (metrics.cmp4ValidNonTimeout < 1) failureReasons.push("cmp4_no_valid_non_timeout");
  if (metrics.invalidResourceFixtureHits < 2) {
    failureReasons.push("insufficient_invalid_resource_hits");
  }
  if (metrics.invalidResourceAdoption > 0) failureReasons.push("invalid_resource_adoption");
  if (metrics.writeAdoption > 0) failureReasons.push("write_adoption");
  if (metrics.compoundAdoption > 0) failureReasons.push("compound_adoption");
  if (metrics.incorrectAdoption > 0) failureReasons.push("incorrect_adoption");
  if (metrics.duplicateModelCall > 0) failureReasons.push("duplicate_model_call");
  if (metrics.primaryChangedOnFallback > 0) {
    failureReasons.push("primary_changed_on_fallback");
  }
  if (metrics.taskExecution > 0) failureReasons.push("task_execution");
  if (metrics.databaseMutation > 0) failureReasons.push("database_mutation");
  if (unsafeTimeout > 0) failureReasons.push("unsafe_timeout");

  return {
    categoryCounts,
    failureReasons,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    metrics,
    pass: failureReasons.length === 0,
    runs,
  };
};

export const renderRouterCanaryClosureMarkdown = (
  report: RouterCanaryClosureReport,
): string => {
  const metricLines = Object.entries(report.metrics)
    .map(([key, value]) => `- ${key}: ${value ?? "N/A"}`)
    .join("\n");
  const runLines = report.runs.map((run) => [
    run.observationId,
    run.fixtureId,
    run.category,
    run.primaryIntent,
    run.candidateIntent ?? "-",
    run.candidateMode ?? "-",
    run.candidateReadWriteClass ?? "-",
    run.schemaValid ? "yes" : "no",
    run.clarificationQuestionPresent ? "yes" : "no",
    run.eligible ? "yes" : "no",
    run.adopted ? "yes" : "no",
    run.reason,
    String(run.totalLatencyMs),
    String(run.modelCallCount),
  ].join(" | "));

  return [
    "# L2-C1-C1 Router Canary Closure",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- verdict: ${report.pass ? "PASS" : "FAIL"}`,
    `- failureReasons: ${report.failureReasons.join(",") || "none"}`,
    "",
    "## Metrics",
    "",
    metricLines,
    "",
    "## Sanitized Runs",
    "",
    "observationId | fixtureId | category | primaryIntent | candidateIntent | candidateMode | readWriteClass | schemaValid | questionPresent | eligible | adopted | reason | latencyMs | modelCallCount",
    "--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---",
    ...runLines,
    "",
  ].join("\n");
};
