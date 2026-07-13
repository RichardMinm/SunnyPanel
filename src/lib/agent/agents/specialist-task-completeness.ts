import type { TaskNode } from "../orchestration/types";
import { parseAgentIntentResult, type AgentIntent } from "../schemas";
import type { SpecialistCallDisposition } from "./types";

const deterministicallyCompleteIntents = new Set<AgentIntent["intent"]>([
  "add_completion_note",
  "answer_question",
  "append_plan_item",
  "cancel_schedule_item",
  "complete_plan_item",
  "create_plan",
  "create_schedule_items",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
]);

export const evaluateSpecialistTaskCompleteness = (
  task: TaskNode,
): { disposition: SpecialistCallDisposition; intent: AgentIntent | null } => {
  const intent = parseAgentIntentResult({
    args: task.args,
    confidence: 0.9,
    intent: task.intent,
  });

  return {
    disposition:
      intent && deterministicallyCompleteIntents.has(intent.intent)
        ? "bypassed_complete"
        : "required_incomplete",
    intent,
  };
};
