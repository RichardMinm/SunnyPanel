import { resolveOrchestrationPreflightIntent } from "../intent-resolution";
import {
  getL3BProductionStageCases,
  type L3BProductionGateStage,
} from "./l3b-production-gate-contract";
import {
  buildActorAuthorizedResourceSnapshot,
  resolveHybridQueryBoundary,
} from "./query-boundary-resolver";

export type ProductionGateRetryLimits = Readonly<{
  answerAttemptsPerObservation: number;
  fullSchemaRetries: number;
  fullTransportRetries: number;
  residualSchemaRetries: number;
  residualTransportRetries: number;
}>;

export type ProductionStageAuthorizedBudget = Readonly<{
  logicalCalls: number;
  providerAttempts: number;
}>;

const attempts = (schemaRetries: number, transportRetries: number): number =>
  (schemaRetries + 1) * (transportRetries + 1);

/**
 * Derive the authorization ceiling from the same deterministic preflight and
 * query-boundary decisions used by the production orchestration entry.
 * Only the one reachable model branch is budgeted for each fixture.
 */
export const calculateProductionStageAuthorizedBudget = (input: Readonly<{
  authenticatedActor: Readonly<{
    collection: "users";
    id: number;
    isAdmin: boolean;
  }>;
  retryLimits: ProductionGateRetryLimits;
  stage: L3BProductionGateStage;
}>): ProductionStageAuthorizedBudget => {
  const fullAttempts = attempts(
    input.retryLimits.fullSchemaRetries,
    input.retryLimits.fullTransportRetries,
  );
  const residualAttempts = attempts(
    input.retryLimits.residualSchemaRetries,
    input.retryLimits.residualTransportRetries,
  );

  return getL3BProductionStageCases(input.stage).reduce(
    (total, entry) => {
      const source = entry.source;
      const expectsAnswer = typeof source.expected === "object"
        && Array.isArray(source.expected.intents)
        && source.expected.intents.includes("answer_question");
      const preflightIntent = resolveOrchestrationPreflightIntent({
        context: source.context,
        message: source.message,
        pendingAction: null,
      });
      if (preflightIntent) {
        return expectsAnswer
          ? {
              logicalCalls: total.logicalCalls + 1,
              providerAttempts:
                total.providerAttempts
                + input.retryLimits.answerAttemptsPerObservation,
            }
          : total;
      }

      const snapshot = buildActorAuthorizedResourceSnapshot({
        authenticatedActor: {
          collection: input.authenticatedActor.collection,
          id: input.authenticatedActor.id,
        },
        context: source.context,
      });
      const boundary = snapshot.valid
        ? resolveHybridQueryBoundary({
            authorizedSnapshot: snapshot.snapshot,
            originalRequest: source.message,
          })
        : { kind: "not_applicable" as const };

      if (boundary.kind === "compound") {
        return {
          logicalCalls: total.logicalCalls + 1,
          providerAttempts: total.providerAttempts + residualAttempts,
        };
      }
      if (boundary.kind !== "not_applicable") return total;

      return {
        logicalCalls: total.logicalCalls + 1 + (expectsAnswer ? 1 : 0),
        providerAttempts:
          total.providerAttempts
          + fullAttempts
          + (expectsAnswer
            ? input.retryLimits.answerAttemptsPerObservation
            : 0),
      };
    },
    { logicalCalls: 0, providerAttempts: 0 },
  );
};
