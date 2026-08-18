export type ModelCallRole =
  | "orchestrator"
  | "residual_planner"
  | "replan"
  | "conversational_answer"
  | "query_commentary"
  | "learning"
  | "specialist";

export type ModelCallAuthorizationErrorCode =
  | "MODEL_LOGICAL_CALL_LIMIT_EXCEEDED"
  | "MODEL_OBSERVATION_PROVIDER_ATTEMPT_LIMIT_EXCEEDED"
  | "MODEL_PROVIDER_ATTEMPT_LIMIT_EXCEEDED";

export class ModelCallAuthorizationError extends Error {
  readonly code: ModelCallAuthorizationErrorCode;

  constructor(code: ModelCallAuthorizationErrorCode) {
    super(code);
    this.code = code;
    this.name = "ModelCallAuthorizationError";
  }
}

export const isModelCallAuthorizationError = (
  error: unknown,
): error is ModelCallAuthorizationError =>
  error instanceof ModelCallAuthorizationError
  || (
    typeof error === "object"
    && error !== null
    && "name" in error
    && error.name === "ModelCallAuthorizationError"
    && "code" in error
    && typeof error.code === "string"
  );

export type ModelCallAuthorizer = Readonly<{
  authorizeLogicalCall: (role: ModelCallRole) => void;
  authorizeProviderAttempt: (role: ModelCallRole) => void;
  beginObservation: () => void;
  snapshot: () => Readonly<{
    logicalCalls: number;
    observationProviderAttempts: number;
    providerAttempts: number;
  }>;
}>;

export type ModelCallAuthorizationLimits = Readonly<{
  logicalCallMaximum: number;
  providerAttemptMaximum: number;
  providerAttemptsPerObservationMaximum: number;
}>;

const boundedMaximum = (value: number): number =>
  Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

export const createModelCallAuthorizer = (
  limits: ModelCallAuthorizationLimits,
): ModelCallAuthorizer => {
  const logicalCallMaximum = boundedMaximum(limits.logicalCallMaximum);
  const providerAttemptMaximum = boundedMaximum(
    limits.providerAttemptMaximum,
  );
  const providerAttemptsPerObservationMaximum = boundedMaximum(
    limits.providerAttemptsPerObservationMaximum,
  );
  let logicalCalls = 0;
  let providerAttempts = 0;
  let observationProviderAttempts = 0;

  return Object.freeze({
    authorizeLogicalCall: (_role) => {
      if (logicalCalls >= logicalCallMaximum) {
        throw new ModelCallAuthorizationError(
          "MODEL_LOGICAL_CALL_LIMIT_EXCEEDED",
        );
      }
      logicalCalls += 1;
    },
    authorizeProviderAttempt: (_role) => {
      if (providerAttempts >= providerAttemptMaximum) {
        throw new ModelCallAuthorizationError(
          "MODEL_PROVIDER_ATTEMPT_LIMIT_EXCEEDED",
        );
      }
      if (
        observationProviderAttempts
        >= providerAttemptsPerObservationMaximum
      ) {
        throw new ModelCallAuthorizationError(
          "MODEL_OBSERVATION_PROVIDER_ATTEMPT_LIMIT_EXCEEDED",
        );
      }
      providerAttempts += 1;
      observationProviderAttempts += 1;
    },
    beginObservation: () => {
      observationProviderAttempts = 0;
    },
    snapshot: () => Object.freeze({
      logicalCalls,
      observationProviderAttempts,
      providerAttempts,
    }),
  });
};

export type L3BTurnCallAccounting = {
  answerLogicalCalls: number;
  answerProviderAttempts: number;
  learningLogicalCalls: number;
  learningProviderAttempts: number;
  orchestratorLogicalCalls: number;
  orchestratorProviderAttempts: number;
  residualPlannerLogicalCalls: number;
  residualPlannerProviderAttempts: number;
  replanLogicalCalls: number;
  replanProviderAttempts: number;
  specialistLogicalCalls: number;
  specialistProviderAttempts: number;
  unexpectedDuplicateModelCalls: number;
};

export type TurnModelCallBudget = L3BTurnCallAccounting & {
  /** Compatibility aliases retained for existing production callers. */
  conversationalAnswerCalls: number;
  learningCalls: number;
  orchestratorCalls: number;
  queryCommentaryCalls: number;
  queryCommentaryLogicalCalls: number;
  queryCommentaryProviderAttempts: number;
  residualPlannerCalls: number;
  replanCalls: number;
  specialistCalls: number;
  unexpectedDuplicateCalls: number;
};

export type ModelCallBudgetRecorder = {
  /** Returns false when the same role already consumed the same logical scope. */
  record: (role: ModelCallRole, scopeId: string) => boolean;
  recordProviderAttempt: (role: ModelCallRole) => void;
  snapshot: () => TurnModelCallBudget;
};

export type ModelCallBudgetRecorderOptions = Readonly<{
  authorizer?: ModelCallAuthorizer;
}>;

export type ModelCallBudgetProjection = Readonly<{
  answerLogicalCalls: number;
  answerProviderAttempts: number;
  fullOrchestratorLogicalCalls: number;
  fullOrchestratorProviderAttempts: number;
  learningLogicalCalls: number;
  learningProviderAttempts: number;
  queryCommentaryLogicalCalls: number;
  queryCommentaryProviderAttempts: number;
  replanLogicalCalls: number;
  replanProviderAttempts: number;
  residualPlannerLogicalCalls: number;
  residualPlannerProviderAttempts: number;
  specialistLogicalCalls: number;
  specialistProviderAttempts: number;
  unexpectedDuplicateModelCalls: number;
}>;

const emptyBudget = (): TurnModelCallBudget => ({
  answerLogicalCalls: 0,
  answerProviderAttempts: 0,
  conversationalAnswerCalls: 0,
  learningCalls: 0,
  learningLogicalCalls: 0,
  learningProviderAttempts: 0,
  orchestratorCalls: 0,
  orchestratorLogicalCalls: 0,
  orchestratorProviderAttempts: 0,
  queryCommentaryCalls: 0,
  queryCommentaryLogicalCalls: 0,
  queryCommentaryProviderAttempts: 0,
  residualPlannerCalls: 0,
  residualPlannerLogicalCalls: 0,
  residualPlannerProviderAttempts: 0,
  replanCalls: 0,
  replanLogicalCalls: 0,
  replanProviderAttempts: 0,
  specialistCalls: 0,
  specialistLogicalCalls: 0,
  specialistProviderAttempts: 0,
  unexpectedDuplicateCalls: 0,
  unexpectedDuplicateModelCalls: 0,
});

const roleCounter: Record<
  ModelCallRole,
  | "conversationalAnswerCalls"
  | "orchestratorCalls"
  | "queryCommentaryCalls"
  | "learningCalls"
  | "residualPlannerCalls"
  | "replanCalls"
  | "specialistCalls"
> = {
  conversational_answer: "conversationalAnswerCalls",
  learning: "learningCalls",
  orchestrator: "orchestratorCalls",
  query_commentary: "queryCommentaryCalls",
  residual_planner: "residualPlannerCalls",
  replan: "replanCalls",
  specialist: "specialistCalls",
};

const logicalRoleCounter: Record<
  ModelCallRole,
  | "answerLogicalCalls"
  | "orchestratorLogicalCalls"
  | "queryCommentaryLogicalCalls"
  | "learningLogicalCalls"
  | "residualPlannerLogicalCalls"
  | "replanLogicalCalls"
  | "specialistLogicalCalls"
> = {
  conversational_answer: "answerLogicalCalls",
  learning: "learningLogicalCalls",
  orchestrator: "orchestratorLogicalCalls",
  query_commentary: "queryCommentaryLogicalCalls",
  residual_planner: "residualPlannerLogicalCalls",
  replan: "replanLogicalCalls",
  specialist: "specialistLogicalCalls",
};

const providerAttemptCounter: Record<
  ModelCallRole,
  | "answerProviderAttempts"
  | "orchestratorProviderAttempts"
  | "queryCommentaryProviderAttempts"
  | "learningProviderAttempts"
  | "residualPlannerProviderAttempts"
  | "replanProviderAttempts"
  | "specialistProviderAttempts"
> = {
  conversational_answer: "answerProviderAttempts",
  learning: "learningProviderAttempts",
  orchestrator: "orchestratorProviderAttempts",
  query_commentary: "queryCommentaryProviderAttempts",
  residual_planner: "residualPlannerProviderAttempts",
  replan: "replanProviderAttempts",
  specialist: "specialistProviderAttempts",
};

export const createModelCallBudgetRecorder = (
  options: ModelCallBudgetRecorderOptions = {},
): ModelCallBudgetRecorder => {
  const budget = emptyBudget();
  const consumedScopes = new Set<string>();

  return {
    record: (role, scopeId) => {
      options.authorizer?.authorizeLogicalCall(role);
      const scopeKey = `${role}:${scopeId}`;

      if (consumedScopes.has(scopeKey)) {
        budget.unexpectedDuplicateCalls += 1;
        budget.unexpectedDuplicateModelCalls += 1;
        return false;
      }

      consumedScopes.add(scopeKey);
      budget[roleCounter[role]] += 1;
      budget[logicalRoleCounter[role]] += 1;
      return true;
    },
    recordProviderAttempt: (role) => {
      options.authorizer?.authorizeProviderAttempt(role);
      budget[providerAttemptCounter[role]] += 1;
    },
    snapshot: () => ({ ...budget }),
  };
};

export const projectModelCallBudget = (
  budget: TurnModelCallBudget,
): ModelCallBudgetProjection => Object.freeze({
  answerLogicalCalls: budget.answerLogicalCalls,
  answerProviderAttempts: budget.answerProviderAttempts,
  fullOrchestratorLogicalCalls: budget.orchestratorLogicalCalls,
  fullOrchestratorProviderAttempts: budget.orchestratorProviderAttempts,
  learningLogicalCalls: budget.learningLogicalCalls,
  learningProviderAttempts: budget.learningProviderAttempts,
  queryCommentaryLogicalCalls: budget.queryCommentaryLogicalCalls,
  queryCommentaryProviderAttempts: budget.queryCommentaryProviderAttempts,
  replanLogicalCalls: budget.replanLogicalCalls,
  replanProviderAttempts: budget.replanProviderAttempts,
  residualPlannerLogicalCalls: budget.residualPlannerLogicalCalls,
  residualPlannerProviderAttempts: budget.residualPlannerProviderAttempts,
  specialistLogicalCalls: budget.specialistLogicalCalls,
  specialistProviderAttempts: budget.specialistProviderAttempts,
  unexpectedDuplicateModelCalls: budget.unexpectedDuplicateModelCalls,
});
