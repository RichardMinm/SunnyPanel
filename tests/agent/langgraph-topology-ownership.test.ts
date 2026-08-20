import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";

import { compileFullSunnyAgentGraph } from "../../src/lib/agent/langgraph/full-runtime";
import { compileMountedOrchestrationSubgraph } from "../../src/lib/agent/langgraph/orchestration-subgraph";
import {
  COMPOUND_GRAPH_NODES,
  FULL_GRAPH_NODES,
  LANGGRAPH_CONSOLIDATION_CANDIDATES,
  PRODUCTION_NODE_OWNERSHIP,
  PRODUCTION_GRAPH_VERSION,
  validateProductionNodeOwnership,
} from "../../src/lib/agent/langgraph/topology";
import { buildSunnyAgentCheckpointConfig } from "../../src/lib/agent/langgraph/checkpointer";

const read = (path: string) => readFileSync(path, "utf8");
const executableNodeNames = (graph: { getGraph: () => { nodes: Record<string, unknown> } }) =>
  Object.keys(graph.getGraph().nodes)
    .filter((node) => !node.startsWith("__"))
    .sort();

test("production node ownership covers each Full and compound node exactly once", () => {
  const validation = validateProductionNodeOwnership();

  assert.deepEqual(validation, {
    duplicateNodeKeys: [],
    missingNodeKeys: [],
    unknownNodeKeys: [],
  });
  assert.equal(
    PRODUCTION_NODE_OWNERSHIP.length,
    Object.keys(FULL_GRAPH_NODES).length + Object.keys(COMPOUND_GRAPH_NODES).length,
  );
});

test("the executable graphs consume the complete checkpoint-visible node contract", () => {
  const compoundGraph = compileMountedOrchestrationSubgraph({
    executePreparedTask: async () => {
      throw new Error("topology-only dependency");
    },
    prepareTask: async () => {
      throw new Error("topology-only dependency");
    },
  });
  const fullGraph = compileFullSunnyAgentGraph(
    {
      buildContext: async () => {
        throw new Error("topology-only dependency");
      },
      dryRun: async () => {
        throw new Error("topology-only dependency");
      },
      execute: async () => {
        throw new Error("topology-only dependency");
      },
      finalize: async () => {
        throw new Error("topology-only dependency");
      },
      orchestrate: async () => {
        throw new Error("topology-only dependency");
      },
      resolveIntent: async () => {
        throw new Error("topology-only dependency");
      },
    },
    {
      checkpointer: new MemorySaver(),
      compoundSubgraph: compoundGraph,
    },
  );

  assert.deepEqual(
    executableNodeNames(compoundGraph),
    Object.values(COMPOUND_GRAPH_NODES).sort(),
  );
  assert.deepEqual(
    executableNodeNames(fullGraph),
    Object.values(FULL_GRAPH_NODES).sort(),
  );
});

test("only named deterministic services own policy, execution, persistence, and resume effects", () => {
  const effectOwners = PRODUCTION_NODE_OWNERSHIP.filter(
    (entry) => entry.effect !== "coordination_only",
  );

  assert.deepEqual(
    effectOwners.map(({ effect, graph, node, service }) => ({ effect, graph, node, service })),
    [
      {
        effect: "domain_execution",
        graph: "compound",
        node: "execute_read_task",
        service: "NativeOrchestrationTaskExecutor.executePreparedTask",
      },
      {
        effect: "domain_execution",
        graph: "compound",
        node: "execute_write_task",
        service: "NativeOrchestrationTaskExecutor.executePreparedTask",
      },
      {
        effect: "resume_boundary",
        graph: "compound",
        node: "await_compound_user",
        service: "LangGraph.interrupt + NativeOrchestrationTaskExecutor.executeConfirmedAction",
      },
      {
        effect: "domain_execution",
        graph: "full",
        node: "execute",
        service: "runExecuteAndPersistStep + runIdempotentAgentAction",
      },
      {
        effect: "resume_boundary",
        graph: "full",
        node: "await_user",
        service: "LangGraph.interrupt",
      },
      {
        effect: "turn_persistence",
        graph: "full",
        node: "finalize",
        service: "createAgentTurnFinalizer",
      },
    ],
  );
});

test("production composition mounts one compound graph and never selects the inline compatibility runner", () => {
  const adapter = read("src/lib/agent/langgraph/full-adapter.ts");
  const production = read("src/lib/agent/langgraph/production-adapter.ts");
  const handler = read("src/lib/agent/chat-pipeline/handle-agent-chat-post.ts");

  assert.match(handler, /createRunProductionLangGraphAgentChatPipeline\(pipelineDeps\)/);
  assert.equal((production.match(/createRunFullLangGraphAgentChatPipeline/g) ?? []).length, 2);
  assert.match(adapter, /deferCompoundExecution:\s*true/);
  assert.match(adapter, /compileMountedOrchestrationSubgraph/);
  assert.doesNotMatch(adapter, /executeOrchestrationGraph/);
});

test("E2 candidates remain classified and cannot be mistaken for active alternate runtimes", () => {
  assert.deepEqual(
    LANGGRAPH_CONSOLIDATION_CANDIDATES.map(({ id, runtimeStatus }) => ({ id, runtimeStatus })),
    [
      {
        id: "imperative_execution_graph",
        runtimeStatus: "test_only_compatibility",
      },
      {
        id: "inline_compound_runner",
        runtimeStatus: "production_bypassed_compatibility",
      },
      {
        id: "full_adapter",
        runtimeStatus: "active_dependency_adapter",
      },
      {
        id: "chat_pipeline_steps",
        runtimeStatus: "active_domain_services",
      },
    ],
  );
});

test("checkpoint namespace is versioned by the executable topology contract", () => {
  assert.equal(PRODUCTION_GRAPH_VERSION, "v1");
  assert.deepEqual(
    buildSunnyAgentCheckpointConfig({ threadId: 37, userId: 9 }),
    {
      configurable: { thread_id: "sunny-agent:v1:9:37" },
      durability: "sync",
    },
  );
});
