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

/* ---- Semantic intent groups (comparison-only) ---- */

/** Groups of intents that are considered semantically equivalent for
 *  Shadow comparison purposes. This does NOT replace Policy Guard or
 *  production read/write validation.
 *
 *  Groups MUST NOT mix different safety classes. */
export const INTENT_COMPARISON_GROUPS: Record<string, string[]> = {
  progress_query: ["query_progress", "query_plan_progress"],
  direct_answer: ["answer_question"],
  clarification: ["clarify"],
  plan_draft: ["compose_plan"],
  schedule_candidate: ["schedule_plan"],
  plan_query: ["query_plan"],
  schedule_query: ["query_schedule"],
  memory_query: ["query_memory"],
  timeline_query: ["query_timeline"],
  checklist_query: ["query_checklist_progress"],
  evaluation: ["evaluate_plan"],
  memory_save: ["save_memory"],
  weekly_review: ["weekly_review"],
  create_plan: ["create_plan"],
  create_checklist: ["create_checklist"],
  create_schedule: ["create_schedule_items"],
  compose_checklist: ["compose_checklist"],
  compose_schedule: ["compose_schedule_item"],
  compose_timeline: ["compose_timeline_event"],
  reschedule: ["reschedule_item"],
  cancel_schedule: ["cancel_schedule_item"],
  append_plan: ["append_plan_item"],
  complete_plan: ["complete_plan_item"],
  add_note: ["add_completion_note"],
  delete_record: ["delete_record"],
  modify_record: ["modify_record"],
};

/** Map an intent to its semantic group name. Returns the intent
 *  itself if no group is defined. */
export const getSemanticGroup = (intent: string): string => {
  for (const [group, members] of Object.entries(INTENT_COMPARISON_GROUPS)) {
    if (members.includes(intent)) return group;
  }
  return intent; /* unknown → self */
};

/** Check if two intents are semantically equivalent for comparison. */
export const isSemanticMatch = (a: string, b: string): boolean =>
  a === b || getSemanticGroup(a) === getSemanticGroup(b);

/* ---- Parity metrics ---- */

export interface OrchestratorParityMetrics {
  totalRuns: number;
  modeMatchedRuns: number;
  modeMatchRate: number;
  exactIntentMatchedRuns: number;
  exactIntentMatchRate: number;
  semanticIntentMatchedRuns: number;
  semanticIntentMatchRate: number;
  safetyClassMatchedRuns: number;
  safetyClassMatchRate: number;
  dependencyShapeMatchedRuns: number;
  dependencyShapeMatchRate: number;
  resourceReferenceMatchedRuns: number;
  resourceReferenceMatchRate: number;
}

/* ---- Resource reference classification ---- */

export type ResourceReferenceKind =
  | "existing_resource"
  | "task_output"
  | "missing_resource"
  | "none"
  | "invalid_or_invented"
  | "unresolved_resource";

/** Detect if a plan has unresolved resource write candidates.
 *  Checks whether write intents that need resources (schedule_plan etc.)
 *  have a valid resource reference. */
export const detectUnresolvedResourceWrite = (params: {
  intents: string[];
  /** All task args serialized — checked for known fixture IDs. */
  argsJson: string;
  /** Resource IDs extracted from task args (numeric or numeric strings). */
  resourceIds: string[];
  /** Known/valid resource IDs from the fixture context. */
  knownFixtureIds: string[];
}): { hasUnresolved: boolean; kind: ResourceReferenceKind } => {
  const writeIntents = params.intents.filter((i) =>
    classifyIntent(i) === "write_candidate"
    && i !== "compose_plan"
    && i !== "create_plan",
  );

  if (writeIntents.length === 0) {
    return { hasUnresolved: false, kind: params.resourceIds.length > 0 ? "existing_resource" : "none" };
  }

  /* Check for known fixture IDs in args (even non-numeric like test-plan-001) */
  const hasKnownId = params.knownFixtureIds.some((fid) => params.argsJson.includes(fid));

  if (hasKnownId) {
    return { hasUnresolved: false, kind: "existing_resource" };
  }

  /* Check for taskOutput refs */
  const hasTaskOutput = params.argsJson.includes('"type":"taskOutput"');

  if (hasTaskOutput) {
    return { hasUnresolved: false, kind: "task_output" };
  }

  /* Write intent without any valid resource reference */
  return { hasUnresolved: true, kind: "missing_resource" };
};

/* ---- Valid resource ID validator ---- */

const INVALID_IDS = new Set(["", "?", "unknown", "n/a", "none", "null", "undefined"]);

/** Returns true if a value is a usable resource ID (not a placeholder). */
export const isUsableResourceId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && !INVALID_IDS.has(value.trim().toLowerCase());

/* ---- Unified comparison input — the sanitized view of an orchestrator result. */
export interface SafetyComparisonInput {
  mode: string;
  intents: string[];
  taskCount: number;
  dependsOn: string[];
  /** Resource IDs referenced in task args. */
  referencedIds: string[];
}
