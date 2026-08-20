/**
 * The production LangGraph topology contract.
 *
 * Node names are checkpoint-visible. Keep this module free of runtime and
 * domain imports so topology ownership can be audited without loading Payload
 * or a model provider.
 */

export const PRODUCTION_GRAPH_VERSION = "v1" as const;

export const FULL_GRAPH_NODES = Object.freeze({
  AWAIT_USER: "await_user",
  BUILD_CONTEXT: "build_context",
  COMPOUND_SUBGRAPH: "compound_subgraph",
  DRY_RUN: "dry_run",
  EXECUTE: "execute",
  FAILURE: "failure",
  FINALIZE: "finalize",
  FINALIZE_COMPOUND: "finalize_compound",
  ORCHESTRATE_PLAN: "orchestrate_plan",
  REFRESH_EVALUATE: "refresh_evaluate",
  RESOLVE_INTENT: "resolve_intent",
} as const);

export const COMPOUND_GRAPH_NODES = Object.freeze({
  ADVANCE_LAYER: "advance_layer",
  AWAIT_COMPOUND_USER: "await_compound_user",
  COLLECT: "collect",
  EVALUATE: "evaluate",
  EXECUTE_READ_TASK: "execute_read_task",
  EXECUTE_WRITE_TASK: "execute_write_task",
  PREPARE: "prepare",
  PUBLISH_RESULT: "publish_result",
  SELECT_READY: "select_ready",
} as const);

export type ProductionGraphName = "compound" | "full";
export type ProductionNodeEffect =
  | "coordination_only"
  | "domain_execution"
  | "resume_boundary"
  | "turn_persistence";

export type ProductionNodeOwnership = Readonly<{
  effect: ProductionNodeEffect;
  graph: ProductionGraphName;
  node: string;
  service: string;
}>;

export const PRODUCTION_NODE_OWNERSHIP = Object.freeze([
  {
    effect: "coordination_only",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.PREPARE,
    service: "groupTasksIntoParallelLayers",
  },
  {
    effect: "coordination_only",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.SELECT_READY,
    service: "NativeOrchestrationTaskExecutor.prepareTask",
  },
  {
    effect: "domain_execution",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.EXECUTE_READ_TASK,
    service: "NativeOrchestrationTaskExecutor.executePreparedTask",
  },
  {
    effect: "domain_execution",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK,
    service: "NativeOrchestrationTaskExecutor.executePreparedTask",
  },
  {
    effect: "coordination_only",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.COLLECT,
    service: "appendBusMessages",
  },
  {
    effect: "coordination_only",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.ADVANCE_LAYER,
    service: "LangGraph layer state transition",
  },
  {
    effect: "coordination_only",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.EVALUATE,
    service: "buildExecutionEvaluation + repair/replan services",
  },
  {
    effect: "resume_boundary",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.AWAIT_COMPOUND_USER,
    service: "LangGraph.interrupt + NativeOrchestrationTaskExecutor.executeConfirmedAction",
  },
  {
    effect: "coordination_only",
    graph: "compound",
    node: COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
    service: "buildNativeResult",
  },
  {
    effect: "coordination_only",
    graph: "full",
    node: FULL_GRAPH_NODES.BUILD_CONTEXT,
    service: "runBuildContextStep",
  },
  {
    effect: "coordination_only",
    graph: "full",
    node: FULL_GRAPH_NODES.ORCHESTRATE_PLAN,
    service: "runOrchestrationStep",
  },
  {
    effect: "coordination_only",
    graph: "full",
    node: FULL_GRAPH_NODES.COMPOUND_SUBGRAPH,
    service: "compileMountedOrchestrationSubgraph",
  },
  {
    effect: "coordination_only",
    graph: "full",
    node: FULL_GRAPH_NODES.FINALIZE_COMPOUND,
    service: "finalizeCompoundResult",
  },
  {
    effect: "coordination_only",
    graph: "full",
    node: FULL_GRAPH_NODES.RESOLVE_INTENT,
    service: "runResolveIntentStep",
  },
  {
    effect: "coordination_only",
    graph: "full",
    node: FULL_GRAPH_NODES.DRY_RUN,
    service: "runDryRunAndProposeStep",
  },
  {
    effect: "domain_execution",
    graph: "full",
    node: FULL_GRAPH_NODES.EXECUTE,
    service: "runExecuteAndPersistStep + runIdempotentAgentAction",
  },
  {
    effect: "coordination_only",
    graph: "full",
    node: FULL_GRAPH_NODES.REFRESH_EVALUATE,
    service: "deterministic result projection",
  },
  {
    effect: "resume_boundary",
    graph: "full",
    node: FULL_GRAPH_NODES.AWAIT_USER,
    service: "LangGraph.interrupt",
  },
  {
    effect: "turn_persistence",
    graph: "full",
    node: FULL_GRAPH_NODES.FINALIZE,
    service: "createAgentTurnFinalizer",
  },
  {
    effect: "coordination_only",
    graph: "full",
    node: FULL_GRAPH_NODES.FAILURE,
    service: "buildLangGraphFailureResponse",
  },
] as const satisfies readonly ProductionNodeOwnership[]);

export type LangGraphConsolidationRuntimeStatus =
  | "active_dependency_adapter"
  | "active_domain_services";

export const LANGGRAPH_CONSOLIDATION_CANDIDATES = Object.freeze([
  {
    id: "full_adapter",
    runtimeStatus: "active_dependency_adapter",
    target: "src/lib/agent/langgraph/full-adapter.ts",
  },
  {
    id: "chat_pipeline_steps",
    runtimeStatus: "active_domain_services",
    target: "src/lib/agent/chat-pipeline/*-step.ts",
  },
] as const satisfies readonly Readonly<{
  id: string;
  runtimeStatus: LangGraphConsolidationRuntimeStatus;
  target: string;
}>[]);

const expectedNodeKeys = () => [
  ...Object.values(COMPOUND_GRAPH_NODES).map((node) => `compound:${node}`),
  ...Object.values(FULL_GRAPH_NODES).map((node) => `full:${node}`),
];

export const validateProductionNodeOwnership = () => {
  const expected = new Set(expectedNodeKeys());
  const counts = new Map<string, number>();

  for (const entry of PRODUCTION_NODE_OWNERSHIP) {
    const key = `${entry.graph}:${entry.node}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    duplicateNodeKeys: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
      .sort(),
    missingNodeKeys: [...expected]
      .filter((key) => !counts.has(key))
      .sort(),
    unknownNodeKeys: [...counts.keys()]
      .filter((key) => !expected.has(key))
      .sort(),
  };
};
