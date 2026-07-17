/**
 * Pure composer for a deterministic fixed Query plus Provider-planned residual
 * tasks. It owns synthetic task IDs and dependency rewriting, but never calls
 * any downstream mapping, model, legacy runtime, task runner, or database.
 */

import {
  ORCHESTRATOR_OUTPUT_SCHEMA_VERSION,
  orchestratorOutputSchema,
  type OrchestratorOutput,
  type OrchestratorTask,
  validateTaskDAG,
} from "../llm/schemas/orchestrator-output";
import {
  READ_QUERY_INTENTS,
  validateOrchestratorDecisionConsistency,
} from "./orchestrator-decision-consistency";
import type {
  FixedTaskMetadata,
  FixedTaskPlanCompositionInput,
  HybridOrchestrationCandidate,
} from "./hybrid-query-boundary-types";

export type FixedTaskPlanCompositionFailureCode =
  | "forbidden_intent"
  | "invalid_fixed_query"
  | "schema_invalid"
  | "unknown_dependency";

export type FixedTaskPlanCompositionResult =
  | Readonly<{
      candidate: HybridOrchestrationCandidate;
      status: "success";
    }>
  | Readonly<{
      code: FixedTaskPlanCompositionFailureCode;
      status: "unavailable";
    }>;

const queryIntents = new Set<string>(READ_QUERY_INTENTS);

const unavailable = (
  code: FixedTaskPlanCompositionFailureCode,
): FixedTaskPlanCompositionResult => ({ code, status: "unavailable" });

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const fixedQueryIsValid = (
  task: OrchestratorTask,
  metadata: FixedTaskMetadata,
): boolean => {
  if (
    metadata.ownership !== "deterministic_query_boundary"
    || metadata.taskId !== task.id
    || !queryIntents.has(task.intent)
    || task.dependsOn.length > 0
  ) {
    return false;
  }

  const provenance = metadata.queryScopeProvenance;
  if (provenance.scope === "aggregate") {
    return provenance.source === "user_unspecified"
      && task.intent === "query_progress"
      && !("planId" in task.args);
  }

  return task.intent === "query_plan_progress"
    && (
      provenance.source === "explicit_plan_id"
      || provenance.source === "resolved_exact_title"
    )
    && isPositiveInteger(provenance.planId)
    && task.args.planId === provenance.planId;
};

const cloneTask = (
  task: OrchestratorTask,
  id: string,
  dependsOn: string[],
): OrchestratorTask => ({
  agentRole: task.agentRole,
  args: { ...task.args },
  dependsOn,
  id,
  intent: task.intent,
  label: task.label,
});

const hasResidualCycle = (
  tasks: readonly OrchestratorTask[],
): boolean => {
  const dependencies = new Map(
    tasks.map((task) => [task.id, task.dependsOn] as const),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    visiting.add(taskId);
    for (const dependency of dependencies.get(taskId) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  };

  return tasks.some((task) => visit(task.id));
};

export const composeFixedTaskPlan = (
  input: FixedTaskPlanCompositionInput,
): FixedTaskPlanCompositionResult => {
  if (!fixedQueryIsValid(input.fixedQueryTask, input.fixedMetadata)) {
    return unavailable("invalid_fixed_query");
  }
  if (input.residualTasks.length === 0) {
    return unavailable("schema_invalid");
  }
  if (input.residualTasks.some((task) => queryIntents.has(task.intent))) {
    return unavailable("forbidden_intent");
  }

  const residualIds = new Set(input.residualTasks.map((task) => task.id));
  if (
    residualIds.size !== input.residualTasks.length
    || input.residualTasks.some((task) => !task.id.trim())
  ) {
    return unavailable("schema_invalid");
  }
  for (const task of input.residualTasks) {
    if (task.dependsOn.some((dependency) => !residualIds.has(dependency))) {
      return unavailable("unknown_dependency");
    }
    if (
      task.dependsOn.includes(task.id)
      || new Set(task.dependsOn).size !== task.dependsOn.length
    ) {
      return unavailable("schema_invalid");
    }
  }
  if (hasResidualCycle(input.residualTasks)) {
    return unavailable("schema_invalid");
  }

  const idMap = new Map<string, string>();
  input.residualTasks.forEach((task, index) => {
    idMap.set(task.id, `t${index + 2}`);
  });

  const fixedTask = cloneTask(input.fixedQueryTask, "t1", []);
  const residualTasks = input.residualTasks.map((task) => {
    const internalDependencies = task.dependsOn.map(
      (dependency) => idMap.get(dependency) as string,
    );
    return cloneTask(
      task,
      idMap.get(task.id) as string,
      internalDependencies.length > 0 ? internalDependencies : ["t1"],
    );
  });

  const output: OrchestratorOutput = {
    decisionCode: "compound_ready",
    mode: "compound",
    routingSummary: "读取确定范围的进度并处理后续请求",
    tasks: [fixedTask, ...residualTasks],
    version: ORCHESTRATOR_OUTPUT_SCHEMA_VERSION,
  };
  if (!orchestratorOutputSchema.safeParse(output).success) {
    return unavailable("schema_invalid");
  }
  if (!validateOrchestratorDecisionConsistency(output).valid) {
    return unavailable("schema_invalid");
  }
  if (!validateTaskDAG(output).valid) {
    return unavailable("schema_invalid");
  }

  return {
    candidate: Object.freeze({
      fixedTaskMetadata: Object.freeze([Object.freeze({
        ...input.fixedMetadata,
        queryScopeProvenance: Object.freeze({
          ...input.fixedMetadata.queryScopeProvenance,
        }),
        taskId: "t1",
      })]),
      output,
    }),
    status: "success",
  };
};
