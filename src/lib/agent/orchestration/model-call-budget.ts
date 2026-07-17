export type ModelCallRole =
  | "orchestrator"
  | "residual_planner"
  | "replan"
  | "conversational_answer"
  | "query_commentary"
  | "specialist";

export type L3BTurnCallAccounting = {
  answerLogicalCalls: number;
  answerProviderAttempts: number;
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

export type ModelCallBudgetProjection = Readonly<{
  answerLogicalCalls: number;
  answerProviderAttempts: number;
  fullOrchestratorLogicalCalls: number;
  fullOrchestratorProviderAttempts: number;
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
  | "residualPlannerCalls"
  | "replanCalls"
  | "specialistCalls"
> = {
  conversational_answer: "conversationalAnswerCalls",
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
  | "residualPlannerLogicalCalls"
  | "replanLogicalCalls"
  | "specialistLogicalCalls"
> = {
  conversational_answer: "answerLogicalCalls",
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
  | "residualPlannerProviderAttempts"
  | "replanProviderAttempts"
  | "specialistProviderAttempts"
> = {
  conversational_answer: "answerProviderAttempts",
  orchestrator: "orchestratorProviderAttempts",
  query_commentary: "queryCommentaryProviderAttempts",
  residual_planner: "residualPlannerProviderAttempts",
  replan: "replanProviderAttempts",
  specialist: "specialistProviderAttempts",
};

export const createModelCallBudgetRecorder = (): ModelCallBudgetRecorder => {
  const budget = emptyBudget();
  const consumedScopes = new Set<string>();

  return {
    record: (role, scopeId) => {
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
