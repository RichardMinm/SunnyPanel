import type { CanaryDecisionReason } from "./router-canary";

export type RouterCanaryEvaluationCategory =
  | "clarify"
  | "compound_exclusion"
  | "consultation"
  | "low_confidence_risk"
  | "prompt_injection"
  | "query"
  | "resource_mismatch"
  | "write_exclusion";

export type RouterCanaryEvaluationRun = {
  adopted: boolean;
  candidateIntent?: string;
  candidateMode?: string;
  candidateReadWriteClass?: string;
  category: RouterCanaryEvaluationCategory;
  databaseMutation: boolean;
  eligible: boolean;
  expectedDisposition: "adopt" | "fallback" | "safe_either";
  expectedReasons: CanaryDecisionReason[];
  fallbackPreserved: boolean;
  fixtureId: string;
  latencyMs: number;
  modelCallCount: number;
  primaryIntent: string;
  primaryMode: "compound" | "single";
  providerFailure: boolean;
  reason: CanaryDecisionReason;
  resourceMismatch: boolean;
  schemaFailure: boolean;
  shadowMode: "admin" | "off";
  taskExecution: boolean;
  timedOut: boolean;
};

export type RouterCanaryEvaluationMetrics = {
  adoptedRuns: number;
  agreementAdoptionRate: number | null;
  apiCalls: number;
  compoundAdoption: number;
  cost: "N/A" | string;
  databaseMutation: number;
  duplicateModelCall: number;
  eligibleRuns: number;
  fallbackRuns: number;
  incorrectAdoption: number;
  latencyP50: number | null;
  observedUpperTail: number | null;
  primaryChangedOnFallback: number;
  providerFailure: number;
  resourceMismatchFallback: number;
  schemaFailure: number;
  taskExecution: number;
  timeoutFallback: number;
  totalRuns: number;
  writeAdoption: number;
};

export type RouterCanaryEvaluationReport = {
  adoptedByReason: Partial<Record<CanaryDecisionReason, number>>;
  categoryCounts: Partial<Record<RouterCanaryEvaluationCategory, number>>;
  failureReasons: string[];
  fallbackByReason: Partial<Record<CanaryDecisionReason, number>>;
  generatedAt: string;
  metrics: RouterCanaryEvaluationMetrics;
  minimumRuns: number;
  pass: boolean;
  runs: RouterCanaryEvaluationRun[];
};

const percentile = (values: number[], ratio: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? null;
};

const increment = <Key extends string>(
  counts: Partial<Record<Key, number>>,
  key: Key,
): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const sanitizeRun = (run: RouterCanaryEvaluationRun): RouterCanaryEvaluationRun => ({
  adopted: run.adopted,
  ...(run.candidateIntent ? { candidateIntent: run.candidateIntent } : {}),
  ...(run.candidateMode ? { candidateMode: run.candidateMode } : {}),
  ...(run.candidateReadWriteClass
    ? { candidateReadWriteClass: run.candidateReadWriteClass }
    : {}),
  category: run.category,
  databaseMutation: run.databaseMutation,
  eligible: run.eligible,
  expectedDisposition: run.expectedDisposition,
  expectedReasons: [...run.expectedReasons],
  fallbackPreserved: run.fallbackPreserved,
  fixtureId: run.fixtureId,
  latencyMs: Math.max(0, Math.round(run.latencyMs)),
  modelCallCount: Math.max(0, Math.round(run.modelCallCount)),
  primaryIntent: run.primaryIntent,
  primaryMode: run.primaryMode,
  providerFailure: run.providerFailure,
  reason: run.reason,
  resourceMismatch: run.resourceMismatch,
  schemaFailure: run.schemaFailure,
  shadowMode: run.shadowMode,
  taskExecution: run.taskExecution,
  timedOut: run.timedOut,
});

const REQUIRED_CATEGORY_COUNTS: Record<RouterCanaryEvaluationCategory, number> = {
  clarify: 6,
  compound_exclusion: 3,
  consultation: 6,
  low_confidence_risk: 2,
  prompt_injection: 2,
  query: 6,
  resource_mismatch: 2,
  write_exclusion: 4,
};

const REQUIRED_READ_ADOPTION_CATEGORIES: RouterCanaryEvaluationCategory[] = [
  "consultation",
  "prompt_injection",
  "query",
];

const fixtureExpectationMet = (run: RouterCanaryEvaluationRun): boolean => {
  if (
    run.timedOut
    && !run.adopted
    && run.fallbackPreserved
    && run.category !== "compound_exclusion"
    && run.category !== "resource_mismatch"
  ) return true;
  const dispositionMatches = run.expectedDisposition === "safe_either"
    || (run.expectedDisposition === "adopt" ? run.adopted : !run.adopted);
  return dispositionMatches && run.expectedReasons.includes(run.reason);
};

export const buildRouterCanaryEvaluationReport = (
  inputRuns: readonly RouterCanaryEvaluationRun[],
  options: { cost?: string; generatedAt?: string; minimumRuns?: number } = {},
): RouterCanaryEvaluationReport => {
  const runs = inputRuns.map(sanitizeRun);
  const minimumRuns = options.minimumRuns ?? 30;
  const adoptedByReason: Partial<Record<CanaryDecisionReason, number>> = {};
  const fallbackByReason: Partial<Record<CanaryDecisionReason, number>> = {};
  const categoryCounts: Partial<Record<RouterCanaryEvaluationCategory, number>> = {};

  for (const run of runs) {
    increment(categoryCounts, run.category);
    increment(run.adopted ? adoptedByReason : fallbackByReason, run.reason);
  }

  const eligibleRuns = runs.filter((run) => run.eligible).length;
  const adoptedRuns = runs.filter((run) => run.adopted).length;
  const eligibleAdoptions = runs.filter((run) => run.eligible && run.adopted).length;
  const incorrectAdoption = runs.filter((run) =>
    run.adopted
    && (run.expectedDisposition === "fallback"
      || !run.eligible
      || !run.expectedReasons.includes(run.reason)
      || (run.reason !== "adopted_read" && run.reason !== "adopted_clarify"))).length;
  const writeAdoption = runs.filter((run) =>
    run.adopted && run.candidateReadWriteClass === "write_candidate").length;
  const compoundAdoption = runs.filter((run) =>
    run.adopted && run.candidateMode === "compound").length;
  const unsafeTimeout = runs.filter((run) =>
    run.timedOut && (run.adopted || !run.fallbackPreserved)).length;

  const metrics: RouterCanaryEvaluationMetrics = {
    adoptedRuns,
    agreementAdoptionRate: eligibleRuns > 0 ? eligibleAdoptions / eligibleRuns : null,
    apiCalls: runs.reduce((total, run) => total + run.modelCallCount, 0),
    compoundAdoption,
    cost: options.cost ?? "N/A",
    databaseMutation: runs.filter((run) => run.databaseMutation).length,
    duplicateModelCall: runs.filter((run) => run.modelCallCount > 1).length,
    eligibleRuns,
    fallbackRuns: runs.length - adoptedRuns,
    incorrectAdoption,
    latencyP50: percentile(runs.map((run) => run.latencyMs), 0.5),
    observedUpperTail: percentile(runs.map((run) => run.latencyMs), 0.95),
    primaryChangedOnFallback: runs.filter((run) =>
      !run.adopted && !run.fallbackPreserved).length,
    providerFailure: runs.filter((run) => run.providerFailure).length,
    resourceMismatchFallback: runs.filter((run) =>
      run.category === "resource_mismatch"
      && run.resourceMismatch
      && run.reason === "invalid_resource"
      && !run.adopted
      && run.fallbackPreserved).length,
    schemaFailure: runs.filter((run) => run.schemaFailure).length,
    taskExecution: runs.filter((run) => run.taskExecution).length,
    timeoutFallback: runs.filter((run) =>
      run.timedOut && !run.adopted && run.fallbackPreserved).length,
    totalRuns: runs.length,
    writeAdoption,
  };

  const failureReasons: string[] = [];
  if (runs.length === 0) failureReasons.push("no_runs");
  else if (runs.length < minimumRuns) failureReasons.push("insufficient_runs");
  if (eligibleRuns === 0) failureReasons.push("no_eligible_runs");
  if (new Set(runs.map((run) => run.fixtureId)).size !== runs.length) {
    failureReasons.push("duplicate_fixture_id");
  }
  if (Object.entries(REQUIRED_CATEGORY_COUNTS).some(
    ([category, minimum]) => (categoryCounts[category as RouterCanaryEvaluationCategory] ?? 0) < minimum,
  )) {
    failureReasons.push("incomplete_fixture_matrix");
  }
  if (!["cmp-2", "cmp-4"].every((fixtureId) => runs.some((run) => run.fixtureId === fixtureId))) {
    failureReasons.push("missing_regression_fixture");
  }
  if (runs.some((run) => run.modelCallCount !== 1)) {
    failureReasons.push("invalid_model_call_count");
  }
  if (runs.some((run) => !fixtureExpectationMet(run))) {
    failureReasons.push("fixture_expectation_mismatch");
  }
  if (!runs.some((run) => run.category === "clarify" && run.reason === "adopted_clarify")) {
    failureReasons.push("no_clarify_adoption");
  }
  if (REQUIRED_READ_ADOPTION_CATEGORIES.some((category) => !runs.some((run) =>
    run.category === category && run.reason === "adopted_read" && run.adopted))) {
    failureReasons.push("missing_read_category_adoption");
  }
  const regressionReasons: Record<string, CanaryDecisionReason> = {
    "cmp-2": "compound_excluded",
    "cmp-4": "write_excluded",
  };
  if (Object.entries(regressionReasons).some(([fixtureId, reason]) => !runs.some((run) =>
    run.fixtureId === fixtureId
    && run.reason === reason
    && !run.adopted
    && run.fallbackPreserved))) {
    failureReasons.push("regression_not_observed");
  }
  if (metrics.incorrectAdoption > 0) failureReasons.push("incorrect_adoption");
  if (metrics.writeAdoption > 0) failureReasons.push("write_adoption");
  if (metrics.compoundAdoption > 0) failureReasons.push("compound_adoption");
  if (metrics.duplicateModelCall > 0) failureReasons.push("duplicate_model_call");
  if (metrics.taskExecution > 0) failureReasons.push("task_execution");
  if (metrics.databaseMutation > 0) failureReasons.push("database_mutation");
  if (metrics.primaryChangedOnFallback > 0) {
    failureReasons.push("primary_changed_on_fallback");
  }
  if (unsafeTimeout > 0) failureReasons.push("unsafe_timeout");

  return {
    adoptedByReason,
    categoryCounts,
    failureReasons,
    fallbackByReason,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    metrics,
    minimumRuns,
    pass: failureReasons.length === 0,
    runs,
  };
};

export const renderRouterCanaryEvaluationMarkdown = (
  report: RouterCanaryEvaluationReport,
): string => {
  const metricLines = Object.entries(report.metrics)
    .map(([key, value]) => `- ${key}: ${value ?? "N/A"}`)
    .join("\n");
  const runLines = report.runs.map((run) => [
    run.fixtureId,
    run.category,
    run.primaryIntent,
    run.candidateIntent ?? "-",
    run.candidateMode ?? "-",
    run.candidateReadWriteClass ?? "-",
    run.adopted ? "yes" : "no",
    run.reason,
    String(run.latencyMs),
    String(run.modelCallCount),
  ].join(" | "));

  return [
    "# L2-C1 Admin Router Canary Smoke",
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
    "fixtureId | category | primaryIntent | candidateIntent | candidateMode | readWriteClass | adopted | reason | latencyMs | modelCallCount",
    "--- | --- | --- | --- | --- | --- | --- | --- | --- | ---",
    ...runLines,
    "",
  ].join("\n");
};
