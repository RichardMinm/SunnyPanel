/** Versioned Zod schema for Orchestrator structured output.
 *
 * The Orchestrator decomposes a user request into a DAG of tasks.
 * Each task has an intent, agentRole, dependencies, and arguments.
 *
 * DAG validation (no cycles, all deps exist, etc.) runs as a separate
 * pass via `validateTaskDAG()` after successful Zod parsing.
 */

import { z } from "zod";
import { routerIntentNameSchema } from "./router-output";

const MAX_TASKS = 8;

export const ORCHESTRATOR_OUTPUT_SCHEMA_VERSION = 1;

/* ---- Agent role ---- */

/** The specialised agent that will execute this task.
 *  Aligned with the existing `AgentRole` type in orchestration/types.ts. */
export const agentRoleSchema = z.enum([
  "content",
  "memory",
  "plan",
  "query",
  "review",
  "schedule",
]);

export type AgentRole = z.infer<typeof agentRoleSchema>;

/* ---- Single task node ---- */

export const orchestratorTaskSchema = z.object({
  /** Stable task identifier within this plan (e.g. "t1", "t2"). */
  id: z.string().regex(/^t[1-9]\d*$/),

  /** User-visible short label (max 80 chars). */
  label: z.string().min(1).max(80),

  /** The intent this task will execute. */
  intent: routerIntentNameSchema,

  /** Intent-specific arguments. */
  args: z.record(z.string(), z.unknown()).default({}),

  /** Task IDs this task depends on (must complete before this one starts). */
  dependsOn: z.array(z.string()).default([]),

  /** Which specialised agent handles this task. */
  agentRole: agentRoleSchema,
});

export type OrchestratorTask = z.infer<typeof orchestratorTaskSchema>;

/* ---- Full orchestrator plan ---- */

export const orchestratorOutputBaseSchema = z.object({
  /** Schema version for future migration. */
  version: z.literal(ORCHESTRATOR_OUTPUT_SCHEMA_VERSION),

  /** Whether this is a single or compound (multi-task) plan. */
  mode: z.enum(["compound", "single"]),

  /** User-visible summary of the task decomposition.
   *  This is NOT raw Chain-of-Thought — it should be suitable for
   *  display as agent activity status. */
  routingSummary: z.string().min(1).max(80),

  /** The decomposed tasks in execution order.
   *  single mode → exactly 1 task. compound mode → ≥ 2 tasks. */
  tasks: z.array(orchestratorTaskSchema).min(1).max(MAX_TASKS),
});

/** Full schema with .strict() for post-hoc validation.
 *  Use orchestratorOutputBaseSchema for LangChain model construction
 *  (LangChain's withStructuredOutput cannot convert .strict() to JSON Schema).
 *  Use orchestratorOutputSchema for post-invoke validation of the result. */
export const orchestratorOutputSchema = orchestratorOutputBaseSchema.strict();

export type OrchestratorOutput = z.infer<typeof orchestratorOutputSchema>;

/* ---- DAG Validation ---- */

export type DAGValidationResult = {
  valid: boolean;
  errors: string[];
};

/** Validates the task DAG structure:
 *  - Single mode has exactly 1 task.
 *  - Compound mode has ≥ 2 tasks.
 *  - All task IDs are unique.
 *  - All dependsOn references point to existing tasks.
 *  - No task depends on itself.
 *  - No duplicate dependencies.
 *  - No circular dependencies (cycles). */
export const validateTaskDAG = (
  output: OrchestratorOutput,
): DAGValidationResult => {
  const errors: string[] = [];
  const taskIds = new Set(output.tasks.map((t) => t.id));

  /* Mode ↔ task count consistency */
  if (output.mode === "single" && output.tasks.length !== 1) {
    errors.push("Single mode requires exactly 1 task.");
  }

  if (output.mode === "compound" && output.tasks.length < 2) {
    errors.push("Compound mode requires at least 2 tasks.");
  }

  /* Unique task IDs */
  if (taskIds.size !== output.tasks.length) {
    errors.push("Duplicate task IDs detected.");
  }

  for (const task of output.tasks) {
    /* Self-dependency check */
    if (task.dependsOn.includes(task.id)) {
      errors.push(`Task "${task.id}" cannot depend on itself.`);
    }

    /* Duplicate dependency check */
    const uniqueDeps = new Set(task.dependsOn);
    if (uniqueDeps.size !== task.dependsOn.length) {
      errors.push(`Task "${task.id}" has duplicate dependencies.`);
    }

    /* Missing dependency check */
    for (const depId of task.dependsOn) {
      if (!taskIds.has(depId)) {
        errors.push(
          `Task "${task.id}" depends on "${depId}" which does not exist.`,
        );
      }
    }
  }

  /* Cycle detection via DFS */
  if (errors.length === 0) {
    const cycleErrors = detectCycles(output.tasks);
    errors.push(...cycleErrors);
  }

  return { valid: errors.length === 0, errors };
};

/* ---- Cycle detection ---- */

const detectCycles = (
  tasks: OrchestratorTask[],
): string[] => {
  const errors: string[] = [];
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  for (const t of tasks) {
    color.set(t.id, WHITE);
  }

  const adjacency = new Map<string, string[]>();
  for (const t of tasks) {
    adjacency.set(t.id, t.dependsOn);
  }

  const dfs = (nodeId: string, path: string[]): boolean => {
    color.set(nodeId, GRAY);
    path.push(nodeId);

    for (const depId of adjacency.get(nodeId) ?? []) {
      const c = color.get(depId);

      if (c === GRAY) {
        const cycleStart = path.indexOf(depId);
        const cycle = path.slice(cycleStart).concat(depId);
        errors.push(`Circular dependency detected: ${cycle.join(" → ")}`);
        return true;
      }

      if (c === WHITE) {
        if (dfs(depId, path)) return true;
      }
    }

    color.set(nodeId, BLACK);
    path.pop();
    return false;
  };

  for (const t of tasks) {
    if (color.get(t.id) === WHITE) {
      dfs(t.id, []);
    }
  }

  return errors;
};
