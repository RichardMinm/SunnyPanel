/** Deterministic safety-class normalizer for comparison-only use.
 *
 * Maps intent names → "read" | "clarify" | "write_candidate" for
 * comparing Primary and Shadow orchestrator outputs.
 *
 * This is NOT a replacement for Policy Guard or the production
 * read/write validator. It exists solely to detect safety mismatches
 * between two orchestrator implementations.
 *
 * A "write_candidate" classification here does NOT mean the action
 * is executable — it only means the orchestrator PROPOSED a write.
 */

export type SafetyClass = "clarify" | "mixed" | "read" | "write_candidate";

const READ_INTENTS = new Set([
  "answer_question",
  "capability_query",
  "evaluate_plan",
  "explain_concept",
  "expand_answer",
  "give_examples",
  "compare_concepts",
  "give_learning_path",
  "summarize_answer",
  "rewrite_answer",
  "query_checklist_progress",
  "query_memory",
  "query_plan",
  "query_plan_progress",
  "query_progress",
  "query_schedule",
  "query_timeline",
]);

const WRITE_INTENTS = new Set([
  "add_completion_note",
  "append_plan_item",
  "cancel_schedule_item",
  "complete_plan_item",
  "compose_checklist",
  "compose_plan",
  "compose_schedule_item",
  "compose_timeline_event",
  "create_checklist",
  "create_plan",
  "create_schedule_items",
  "delete_record",
  "modify_record",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
  "weekly_review",
]);

/** Classify a single intent string. */
export const classifyIntent = (intent: string): SafetyClass => {
  if (intent === "clarify") return "clarify";
  if (READ_INTENTS.has(intent)) return "read";
  if (WRITE_INTENTS.has(intent)) return "write_candidate";
  return "write_candidate"; /* unknown → assume write (conservative) */
};

/** Classify a list of intents from an orchestrator plan.
 *  For compound plans with mixed intent types, returns "mixed". */
export const classifyIntents = (intents: string[]): SafetyClass => {
  if (intents.length === 0) return "read";

  const classes = new Set(intents.map(classifyIntent));

  if (classes.has("write_candidate") && classes.has("read")) return "mixed";
  if (classes.has("write_candidate")) return "write_candidate";
  if (classes.has("clarify")) return "clarify";
  return "read";
};

/** Unified comparison input — the sanitized view of an orchestrator result. */
export interface SafetyComparisonInput {
  mode: string;
  intents: string[];
  taskCount: number;
  dependsOn: string[];
  /** Resource IDs referenced in task args. */
  referencedIds: string[];
}
