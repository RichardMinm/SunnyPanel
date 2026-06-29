import type { AgentIntent } from "../schemas";
import type { OrchestratorPlan } from "./types";

export type OrchestratorPlanSource = NonNullable<OrchestratorPlan["source"]>;

export const shouldTrustOrchestratorPreResolve = (
  intent: AgentIntent,
  source: OrchestratorPlanSource | null | undefined,
): boolean => {
  if (source !== "heuristic") {
    return true;
  }

  if (intent.intent === "clarify") {
    return false;
  }

  if (intent.intent === "answer_question") {
    const answer = intent.args.answer?.trim();
    return Boolean(answer);
  }

  return true;
};
