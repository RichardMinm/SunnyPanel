import type { QueryPlanProgressArgs } from "../schemas";
import type { AgentToolResult } from "../tool-shared";
import { formatPlanProgressAssistantMessage } from "../query/facts";
import { loadPlanProgressFacts } from "../query/facts-repository";

export const queryPlanProgressFromIntent = async (
  args: QueryPlanProgressArgs,
): Promise<AgentToolResult> => {
  const facts = await loadPlanProgressFacts(args);
  if (!facts) {
    return {
      assistantMessage: "找不到对应的计划。请告诉我计划的标题或 ID。",
      pendingAction: null,
    };
  }

  return {
    assistantMessage: formatPlanProgressAssistantMessage(facts),
    pendingAction: null,
  };
};
