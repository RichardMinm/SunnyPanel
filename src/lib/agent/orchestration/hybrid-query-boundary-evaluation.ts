/**
 * Sanitized observation projection for Hybrid Query Boundary evaluation.
 *
 * The projection deliberately excludes requests, workspace payloads, resource
 * identifiers, titles, prompts, responses, reasoning, task args, and secrets.
 */

import type {
  HybridFailureCode,
  HybridOrchestrationResult,
} from "./hybrid-query-boundary";

export type HybridEvaluationObservation = Readonly<{
  boundaryResolution:
    | "clarify"
    | "compound"
    | "not_applicable"
    | "pure_query";
  finalDependencies: readonly Readonly<{
    dependsOn: readonly string[];
    taskId: string;
  }>[];
  finalTaskIntents: readonly string[];
  finalUsableStatus: "unavailable" | "usable";
  fixtureId: string;
  fixedTaskOwnership: "deterministic_query_boundary" | null;
  fullOrchestratorLogicalCalls: number;
  queryCommentaryLogicalCalls: number;
  queryDispatcherSelection: "adopted" | "legacy" | "not_called";
  residualPlannerLogicalCalls: number;
  typedFailureCategory?: HybridFailureCode;
}>;

const sanitizeFixtureId = (fixtureId: string): string =>
  fixtureId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 80);

export const evaluateHybridQueryBoundaryCase = async (input: Readonly<{
  fixtureId: string;
  runHybridPath: () => Promise<HybridOrchestrationResult>;
}>): Promise<HybridEvaluationObservation> => {
  const result = await input.runHybridPath();
  const output = result.candidate?.output ?? result.output;

  return Object.freeze({
    boundaryResolution: result.boundaryResolution,
    finalDependencies: Object.freeze((output?.tasks ?? []).map((task) =>
      Object.freeze({
        dependsOn: Object.freeze([...task.dependsOn]),
        taskId: task.id,
      })
    )),
    finalTaskIntents: Object.freeze(
      (output?.tasks ?? []).map((task) => task.intent),
    ),
    finalUsableStatus: result.status,
    fixtureId: sanitizeFixtureId(input.fixtureId),
    fixedTaskOwnership:
      result.candidate?.fixedTaskMetadata[0]?.ownership ?? null,
    fullOrchestratorLogicalCalls:
      result.callAccounting.fullOrchestratorLogicalCalls,
    queryCommentaryLogicalCalls:
      result.callAccounting.queryCommentaryLogicalCalls,
    queryDispatcherSelection: result.queryDispatcherSelection,
    residualPlannerLogicalCalls:
      result.callAccounting.residualPlannerLogicalCalls,
    ...(result.failureCode
      ? { typedFailureCategory: result.failureCode }
      : {}),
  });
};
