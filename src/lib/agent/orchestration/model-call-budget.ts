export type ModelCallRole =
  | "orchestrator"
  | "replan"
  | "conversational_answer"
  | "query_commentary"
  | "specialist";

export type TurnModelCallBudget = {
  conversationalAnswerCalls: number;
  orchestratorCalls: number;
  queryCommentaryCalls: number;
  replanCalls: number;
  specialistCalls: number;
  unexpectedDuplicateCalls: number;
};

export type ModelCallBudgetRecorder = {
  /** Returns false when the same role already consumed the same logical scope. */
  record: (role: ModelCallRole, scopeId: string) => boolean;
  snapshot: () => TurnModelCallBudget;
};

const emptyBudget = (): TurnModelCallBudget => ({
  conversationalAnswerCalls: 0,
  orchestratorCalls: 0,
  queryCommentaryCalls: 0,
  replanCalls: 0,
  specialistCalls: 0,
  unexpectedDuplicateCalls: 0,
});

const roleCounter: Record<
  ModelCallRole,
  Exclude<keyof TurnModelCallBudget, "unexpectedDuplicateCalls">
> = {
  conversational_answer: "conversationalAnswerCalls",
  orchestrator: "orchestratorCalls",
  query_commentary: "queryCommentaryCalls",
  replan: "replanCalls",
  specialist: "specialistCalls",
};

export const createModelCallBudgetRecorder = (): ModelCallBudgetRecorder => {
  const budget = emptyBudget();
  const consumedScopes = new Set<string>();

  return {
    record: (role, scopeId) => {
      const scopeKey = `${role}:${scopeId}`;

      if (consumedScopes.has(scopeKey)) {
        budget.unexpectedDuplicateCalls += 1;
        return false;
      }

      consumedScopes.add(scopeKey);
      budget[roleCounter[role]] += 1;
      return true;
    },
    snapshot: () => ({ ...budget }),
  };
};
