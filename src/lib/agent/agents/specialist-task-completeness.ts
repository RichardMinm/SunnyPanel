import type { TaskNode } from "../orchestration/types";
import { parseAgentIntentResult, type AgentIntent } from "../schemas";
import type { SpecialistCallDisposition } from "./types";

const deterministicallyCompleteIntents = new Set<AgentIntent["intent"]>([
  "add_completion_note",
  "answer_question",
  "append_plan_item",
  "cancel_schedule_item",
  "complete_plan_item",
  "compose_plan",
  "create_checklist",
  "create_plan",
  "create_schedule_items",
  "evaluate_plan",
  "query_plan_progress",
  "query_progress",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
  "weekly_review",
]);

export const evaluateSpecialistTaskCompleteness = (
  task: TaskNode,
): { disposition: SpecialistCallDisposition; intent: AgentIntent | null } => {
  const intent = parseAgentIntentResult({
    args: task.args,
    confidence: 0.9,
    intent: task.intent,
  });

  const checklistDraftComplete =
    intent?.intent === "compose_checklist"
    && (intent.args.items?.length ?? 0) > 0;

  return {
    disposition:
      intent
      && (
        deterministicallyCompleteIntents.has(intent.intent)
        || checklistDraftComplete
      )
        ? "bypassed_complete"
        : "required_incomplete",
    intent,
  };
};
