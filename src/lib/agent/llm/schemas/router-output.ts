/** Versioned Zod schema for Router structured output.
 *
 * The Router decides: is this a read (answer), write candidate, or a
 * compound request that needs orchestration? It also extracts intent,
 * confidence, and context references from the user's request.
 *
 * This schema defines the STRUCTURE contract. The actual safety policy
 * (no writes without Policy Guard, no execution without confirmation)
 * is enforced by the domain layer, NOT by this schema.
 */

import { z } from "zod";

/* ---- readWriteClass ---- */

/** The three top-level routing classifications the Router LLM produces.
 *  - "answer": query / conversation / clarify (read-only path)
 *  - "write_candidate": the user wants to create/modify/delete (enters write path)
 *  - "clarify": not enough information — ask follow-up questions */
export const readWriteClassSchema = z.enum([
  "answer",
  "clarify",
  "write_candidate",
]);

export type ReadWriteClass = z.infer<typeof readWriteClassSchema>;

/* ---- Intent allowlist ---- */

/** All recognized intent names — synchronized with agentIntentValues +
 *  CONVERSATIONAL_INTENT_NAMES from the existing codebase. */
export const routerIntentNameSchema = z.enum([
  /* Core agent intents */
  "add_completion_note",
  "answer_question",
  "append_plan_item",
  "cancel_schedule_item",
  "capability_query",
  "clarify",
  "delete_record",
  "modify_record",
  "complete_plan_item",
  "compose_checklist",
  "compose_plan",
  "compose_schedule_item",
  "compose_timeline_event",
  "create_checklist",
  "create_plan",
  "create_schedule_items",
  "evaluate_plan",
  "query_checklist_progress",
  "query_memory",
  "query_plan",
  "query_progress",
  "query_plan_progress",
  "query_schedule",
  "query_timeline",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
  "weekly_review",
  /* Conversational follow-up intents */
  "explain_concept",
  "expand_answer",
  "give_examples",
  "compare_concepts",
  "give_learning_path",
  "summarize_answer",
  "rewrite_answer",
] as const);

export type RouterIntentName = z.infer<typeof routerIntentNameSchema>;

/* ---- Context reference ---- */

export const contextReferenceSchema = z.object({
  /** Entity type (collection or logical group). */
  type: z.enum([
    "checklist",
    "memory",
    "plan",
    "schedule",
    "timeline",
    "writing",
  ]),
  /** Optional numeric ID if the entity is an existing database record. */
  id: z.number().int().positive().optional(),
  /** Optional human-readable name or title. */
  name: z.string().max(200).optional(),
});

export type ContextReference = z.infer<typeof contextReferenceSchema>;

/* ---- Risk flags ---- */

const riskFlagSchema = z.enum([
  "ambiguous_intent",
  "batch_operation",
  "destructive_operation",
  "external_reference",
  "high_confidence_write",
  "low_confidence",
  "missing_required_fields",
  "multi_target",
  "out_of_scope",
  "potential_conflict",
]);

/* ---- Main Router Output Schema ---- */

export const ROUTER_OUTPUT_SCHEMA_VERSION = 1;

export const routerOutputSchema = z.object({
  /** Schema version for future migration. */
  version: z.literal(ROUTER_OUTPUT_SCHEMA_VERSION),

  /** The resolved intent from the allowlist. */
  intent: routerIntentNameSchema,

  /** Whether this is a single or compound (multi-task) request. */
  mode: z.enum(["compound", "single"]),

  /** Top-level read/write/clarify classification. */
  readWriteClass: readWriteClassSchema,

  /** 0-1 confidence in this classification. */
  confidence: z.number().min(0).max(1),

  /** The user's request normalised for downstream consumption. */
  normalizedRequest: z.string().min(1).max(2000),

  /** Intent-specific arguments (validated by domain layer, not here). */
  args: z.record(z.string(), z.unknown()).default({}),

  /** Fields the Router determines are missing for the intent. */
  missingFields: z.array(z.string()).default([]),

  /** Whether the Router believes clarification is needed. */
  needsClarification: z.boolean().default(false),

  /** If needsClarification is true, the question to ask the user. */
  clarificationQuestion: z.string().nullable().default(null),

  /** Entities referenced in the user's request / workspace context. */
  contextReferences: z.array(contextReferenceSchema).max(10).default([]),

  /** Structured risk flags for downstream safety evaluation. */
  riskFlags: z.array(riskFlagSchema).default([]),
}).strict();

export type RouterOutput = z.infer<typeof routerOutputSchema>;

/* ---- Classifier (pure function, no LLM) ---- */

/** Maps an intent name to its default readWriteClass.
 *  This is a deterministic fallback — the LLM Router may override it,
 *  but the Router output is always validated by the domain layer. */
export const classifyIntentRoute = (intent: string): ReadWriteClass => {
  /* Read-only intents */
  const READ_INTENTS = new Set([
    "answer_question",
    "capability_query",
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

  if (READ_INTENTS.has(intent)) return "answer";

  /* Clarify is always clarify */
  if (intent === "clarify") return "clarify";

  /* Everything else is a write candidate (enters write path for
   *   Draft → Dry-run → Policy Guard → Confirmation → Execute) */
  return "write_candidate";
};
