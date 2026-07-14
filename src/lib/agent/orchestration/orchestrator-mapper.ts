/** Compatibility mapper: new Zod OrchestratorOutput → existing OrchestrationPlan.
 *
 * This is a PURE function — no side effects, no model calls, no database access.
 * It only maps an already-validated OrchestratorOutput (from the new LangChain
 * path) into the OrchestrationPlan type that downstream production code expects.
 *
 * Key contracts:
 *  - routingSummary → reasoning (compatibility alias, NOT hidden Chain-of-Thought)
 *  - Task args are copied structurally without interpreting or authorizing them
 *  - Existing resource IDs from workspace context are carried through unchanged
 *  - No intent is added, removed, or modified
 *  - Invalid DAGs are rejected upstream (by schema validation), not fixed here
 */

import type { OrchestratorOutput, OrchestratorTask } from "../llm/schemas/orchestrator-output";
import type { OrchestratorPlan, TaskNode } from "./types";
import type { AgentIntent } from "../schemas";

/** Map a new OrchestratorOutput to the existing OrchestrationPlan format. */
export const mapStructuredOutputToPlan = (
  output: OrchestratorOutput,
): OrchestratorPlan => ({
  mode: output.mode,
  /* Compatibility: routingSummary is NOT Chain-of-Thought. It is a
   *   user-visible, sanitized decomposition summary. The downstream
   *   `reasoning` field is populated with this value for compatibility
   *   only — future phases should rename `reasoning` to `routingSummary`. */
  reasoning: output.routingSummary,
  source: "llm",
  tasks: output.tasks.map(mapTask),
});

/** Map a single task node. */
const mapTask = (task: OrchestratorTask): TaskNode => ({
  id: task.id,
  label: task.label,
  intent: task.intent as AgentIntent["intent"],
  args: task.args as Record<string, unknown>,
  dependsOn: task.dependsOn,
  agentRole: task.agentRole,
});

/** Legacy syntactic inspection helper.
 *  Finding a reference does not validate, authorize, or resolve it and does
 *  not imply that the structured runtime supports executing the reference. */
export const extractTaskOutputRefs = (
  task: OrchestratorTask,
): Array<{ taskId: string; field: string }> => {
  const refs: Array<{ taskId: string; field: string }> = [];

  for (const [, value] of Object.entries(task.args)) {
    if (
      typeof value === "object"
      && value !== null
      && "type" in value
      && (value as Record<string, unknown>).type === "taskOutput"
      && typeof (value as Record<string, unknown>).taskId === "string"
      && typeof (value as Record<string, unknown>).field === "string"
    ) {
      refs.push({
        taskId: (value as Record<string, string>).taskId,
        field: (value as Record<string, string>).field,
      });
    }
  }

  return refs;
};
