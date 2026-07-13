import { parseAgentIntentResult, type AgentIntent } from "../schemas";
import type { OrchestratorPlan } from "./types";

export const orchestratorPlanToIntent = (
  plan: OrchestratorPlan,
): AgentIntent | null => {
  if (plan.tasks.length !== 1) {
    return null;
  }

  const task = plan.tasks[0];
  const parsed = parseAgentIntentResult({
    args: task.args,
    confidence: 0.9,
    intent: task.intent,
  });

  if (parsed) return parsed;

  if (task.intent === "answer_question") {
    const question =
      typeof task.args.question === "string"
        ? task.args.question.trim()
        : "";

    if (question) {
      return {
        args: {
          answer: "",
          learningContext: null,
          openDomainTopic: question,
          suggestAction: null,
        },
        confidence: 0.9,
        intent: "answer_question",
      };
    }
  }

  return null;
};
