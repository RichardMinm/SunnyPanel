/**
 * Transition Schema — Zod validation for LLM Transition Engine output.
 *
 * Validates TransitionOutput, RouteHint, SessionPatch against the
 * AgentSessionState type system. Rejects outputs that attempt to
 * execute tools, call tool functions, or bypass the safety boundaries.
 */

import { z } from "zod";

/* ──── Enum schemas ──── */

const semanticDomain = z.enum([
  "general", "learning", "memory", "planning",
  "schedule", "security", "writing",
]);

const dialogueStage = z.enum([
  "exploring", "drafting", "refining", "confirming",
  "executing", "reviewing", "completed",
]);

const workflowId = z.enum([
  "none",
  "writing_creation", "writing_revision",
  "plan_creation", "plan_iteration",
  "schedule_composition",
  "learning_explanation", "learning_plan",
  "memory_curation",
  "general_query",
  "weekly_review",
]);

const transitionType = z.enum([
  "continue_current_flow",
  "deepen_current_flow",
  "switch_domain",
  "complete_flow",
  "restart_flow",
  "confirm_pending_action",
  "cancel_pending_action",
  "fallback",
]);

const routeHintSource = z.enum(["transition_engine", "rule", "fallback"]);

const llmRouterAction = z.enum([
  "cancel", "capability", "chat", "clarify", "create",
  "delete", "expand_answer", "explain", "query", "summarize", "update",
]);

const llmRouterTarget = z.enum([
  "agent", "checklist", "last_topic", "memory", "plan",
  "schedule", "timeline", "unknown", "writing",
]);

/* ──── Safety blacklist — must NOT appear in LLM output ──── */

const FORBIDDEN_TOKENS = [
  "executeTool",
  "execute_tool",
  "toolCall",
  "tool_call",
  "toolName",
  "tool_name",
  "dryRun",
  "dry_run",
  "runTool",
  "run_tool",
  "callTool",
  "call_tool",
  "invokeTool",
  "invoke_tool",
] as const;

/** Forbidden object keys (pre-Zod raw scan). Case-insensitive. */
const FORBIDDEN_KEYS = new Set([
  "executetool", "execute_tool",
  "toolcall", "tool_call", "tool_calls",
  "dryrun", "dry_run",
  "runtool", "run_tool",
  "calltool", "call_tool",
  "invoketool", "invoke_tool",
  "execute",                    // overly broad but caught at top-level only
  "function_call", "function_calls",
  "actiontoexecute", "action_to_execute",
  "toolname", "tool_name",
]);

/** Scan a raw (pre-Zod) object for forbidden keys recursively. */
const scanRawKeys = (obj: unknown, path: string = "$"): string | null => {
  if (obj == null || typeof obj !== "object") return null;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const hit = scanRawKeys(obj[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_KEYS.has(lowerKey)) {
      return `${path}.${key} (forbidden key)`;
    }
    const hit = scanRawKeys((obj as Record<string, unknown>)[key], `${path}.${key}`);
    if (hit) return hit;
  }

  return null;
};

/* ──── Compound schemas ──── */

const currentTargetSchema = z.object({
  entityType: z.enum([
    "agent", "article", "checklist", "memory", "plan",
    "project", "schedule", "timeline", "topic", "writing", "unknown",
  ]).nullable().optional(),
  entityName: z.string().max(200).nullable().optional(),
  entityId: z.union([z.string(), z.number()]).nullable().optional(),
  topic: z.string().max(200).nullable().optional(),
}).strict();

const routeHintSchema = z.object({
  suggestedAction: llmRouterAction.optional(),
  suggestedTarget: llmRouterTarget.optional(),
  contextualClues: z.array(z.string().max(500)),
  expectedIntents: z.array(z.string().max(200)),
  confidence: z.number().min(0).max(1),
  source: routeHintSource,
}).strict();

const sessionPatchSchema = z.object({
  domain: semanticDomain.optional(),
  stage: dialogueStage.optional(),
  currentTarget: currentTargetSchema.optional(),
  workflow: workflowId.optional(),
}).strict();

/* ──── TransitionOutput schema ──── */

export const transitionOutputSchema = z.object({
  shouldUpdateSession: z.boolean(),
  sessionPatch: sessionPatchSchema,
  routeHint: routeHintSchema,
  transitionType: transitionType,
  reason: z.string().min(1).max(1000),
}).strict();

export type ValidatedTransitionOutput = z.infer<typeof transitionOutputSchema>;

/* ──── Safety validation ──── */

/**
 * Safety check: reject any output whose stringified form contains
 * forbidden tokens (executeTool, toolCall, dryRun, etc.).
 *
 * Scans string values only — used as the POST-Zod layer after
 * Zod has already verified structure. Complements the PRE-Zod
 * raw key scan in scanRawKeys.
 */
export const isTransitionOutputSafe = (output: unknown): boolean => {
  const serialized = JSON.stringify(output).toLowerCase();
  return !FORBIDDEN_TOKENS.some((token) =>
    serialized.includes(token.toLowerCase()),
  );
};

/**
 * Three-layer validation:
 *   1. PRE-Zod:  scanRawKeys — reject forbidden OBJECT KEYS
 *   2. Zod:      transitionOutputSchema.strict() — reject unknown keys / bad types
 *   3. POST-Zod: isTransitionOutputSafe — reject forbidden STRING VALUES
 *
 * Layer 1 catches { executeTool: "delete_plan" } before Zod .strip()/reject.
 * Layer 2 catches bad enum values, missing fields, type mismatches.
 * Layer 3 catches "executeTool" smuggled inside a valid string field.
 *
 * Returns the parsed output on success, or throws on failure.
 */
export const validateTransitionOutput = (
  raw: unknown,
): ValidatedTransitionOutput => {
  // Layer 1: pre-Zod raw key scan
  const keyHit = scanRawKeys(raw);
  if (keyHit) {
    throw new Error(
      `TransitionOutput rejected at key-scan: forbidden key at ${keyHit}`,
    );
  }

  // Layer 2: Zod strict parse (rejects unknown keys, bad types)
  const parsed = transitionOutputSchema.parse(raw);

  // Layer 3: post-Zod value scan
  if (!isTransitionOutputSafe(parsed)) {
    throw new Error(
      "TransitionOutput rejected: contains forbidden tokens in values (executeTool, toolCall, etc.)",
    );
  }

  return parsed;
};

/**
 * Safe parse variant — returns {success, data} instead of throwing.
 * Use this when you need to handle failures gracefully.
 */
export const safeValidateTransitionOutput = (
  raw: unknown,
):
  | { success: true; data: ValidatedTransitionOutput }
  | { success: false; error: string } => {
  try {
    const data = validateTransitionOutput(raw);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown validation error",
    };
  }
};
