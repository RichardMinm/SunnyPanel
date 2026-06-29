import type { AgentRouterAction } from "../router/types";
import type { AgentIntent, AgentWriteIntentName } from "../schemas";

/** 只读 intent：禁止进入 dryRun 写入链。 */
export const READ_ONLY_INTENTS = new Set<AgentIntent["intent"]>([
  "answer_question",
  "capability_query",
  "clarify",
  "evaluate_plan",
  "query_checklist_progress",
  "query_memory",
  "query_plan",
  "query_plan_progress",
  "query_progress",
  "query_schedule",
  "query_timeline",
  "explain_concept",
  "expand_answer",
  "give_examples",
  "compare_concepts",
  "give_learning_path",
  "summarize_answer",
  "rewrite_answer",
]);

/** action → 允许的写入 tool intent（空集表示禁止任何写入 tool）。 */
const WRITE_TOOLS_BY_ACTION: Record<AgentRouterAction, readonly AgentWriteIntentName[]> = {
  answer: [],
  capability: [],
  clarify: [],
  create: [
    "create_plan",
    "compose_plan",
    "compose_schedule_item",
    "compose_timeline_event",
    "save_memory",
    "schedule_plan",
    "weekly_review",
  ],
  delete: ["delete_record", "cancel_schedule_item"],
  expand: [],
  query: ["query_plan_progress"],
  update: [
    "modify_record",
    "reschedule_item",
    "complete_plan_item",
    "add_completion_note",
    "append_plan_item",
  ],
};

export const getWriteToolsForAction = (action: AgentRouterAction): readonly AgentWriteIntentName[] =>
  WRITE_TOOLS_BY_ACTION[action] ?? [];

export const isReadOnlyIntent = (intent: AgentIntent["intent"]) => READ_ONLY_INTENTS.has(intent);

export const actionAllowsDryRun = (action: AgentRouterAction) =>
  action === "create" || action === "update" || action === "delete";

export const actionForbidsDryRun = (action: AgentRouterAction) =>
  action === "query" || action === "capability" || action === "answer" || action === "expand" || action === "clarify";

/** delete / 批量删除类必须高风险。 */
export const requiresHighRisk = (intent: AgentIntent["intent"]) =>
  intent === "delete_record";
