import assert from "node:assert/strict";
import { test } from "node:test";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  Annotation,
  Command,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { Pool } from "pg";

import { buildSunnyAgentCheckpointConfig } from "../../src/lib/agent/langgraph/checkpointer";
import { deleteAgentThreadWithCheckpoint } from "../../src/lib/agent/langgraph/checkpoint-lifecycle";
import {
  compileFullSunnyAgentGraph,
  getInterruptedCompoundResult,
} from "../../src/lib/agent/langgraph/full-runtime";
import { compileMountedOrchestrationSubgraph } from "../../src/lib/agent/langgraph/orchestration-subgraph";
import type { AgentChatResponse, ProposedAgentAction } from "../../src/lib/agent/schemas";
import type { OrchestratorPlan } from "../../src/lib/agent/orchestration/types";

const CounterState = Annotation.Root({
  value: Annotation<number>({
    default: () => 0,
    reducer: (current, next) => next ?? current,
  }),
});

const buildCounterGraph = (checkpointer: PostgresSaver) =>
  new StateGraph(CounterState)
    .addNode("increment", (state) => ({ value: state.value + 1 }))
    .addEdge(START, "increment")
    .addEdge("increment", END)
    .compile({ checkpointer });

test("PostgresSaver restores across independent instances and isolates user/thread keys", async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl,
    "DATABASE_URL is required for the PostgreSQL checkpoint integration test.",
  );

  const firstPool = new Pool({ connectionString: databaseUrl });
  const secondPool = new Pool({ connectionString: databaseUrl });
  const firstSaver = new PostgresSaver(firstPool);
  const secondSaver = new PostgresSaver(secondPool);
  const suffix = (Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1_000);
  const firstConfig = buildSunnyAgentCheckpointConfig({
    threadId: suffix,
    userId: suffix + 1,
  });
  const isolatedConfig = buildSunnyAgentCheckpointConfig({
    threadId: suffix,
    userId: suffix + 2,
  });

  try {
    await firstSaver.setup();

    const firstGraph = buildCounterGraph(firstSaver);
    await firstGraph.invoke({ value: 1 }, firstConfig);
    await firstGraph.invoke({ value: 10 }, isolatedConfig);

    const restartedGraph = buildCounterGraph(secondSaver);
    await restartedGraph.invoke({}, firstConfig);

    const restoredState = await restartedGraph.getState(firstConfig);
    const isolatedState = await restartedGraph.getState(isolatedConfig);

    assert.equal(restoredState.values.value, 3);
    assert.equal(isolatedState.values.value, 11);
    assert.notEqual(
      firstConfig.configurable?.thread_id,
      isolatedConfig.configurable?.thread_id,
    );
  } finally {
    const firstThreadId = String(firstConfig.configurable?.thread_id ?? "");
    const isolatedThreadId = String(isolatedConfig.configurable?.thread_id ?? "");

    if (firstThreadId) await firstSaver.deleteThread(firstThreadId);
    if (isolatedThreadId) await firstSaver.deleteThread(isolatedThreadId);
    await Promise.all([firstPool.end(), secondPool.end()]);
  }
});

test("thread lifecycle deletion removes its PostgreSQL checkpoint before the business record", async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required for the PostgreSQL checkpoint integration test.");

  const pool = new Pool({ connectionString: databaseUrl });
  const saver = new PostgresSaver(pool);
  const suffix = (Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1_000);
  const config = buildSunnyAgentCheckpointConfig({
    threadId: suffix,
    userId: suffix + 1,
  });
  let businessDeleted = false;

  try {
    await saver.setup();
    const graph = buildCounterGraph(saver);
    await graph.invoke({ value: 1 }, config);
    assert.ok(await saver.getTuple(config));

    await deleteAgentThreadWithCheckpoint({
      checkpointer: saver,
      deleteBusinessThread: async () => {
        assert.equal(await saver.getTuple(config), undefined);
        businessDeleted = true;
      },
      threadId: suffix,
      userId: suffix + 1,
    });

    assert.equal(businessDeleted, true);
    assert.equal(await saver.getTuple(config), undefined);
  } finally {
    await saver.deleteThread(String(config.configurable?.thread_id ?? ""));
    await pool.end();
  }
});

test("PostgresSaver resumes a mounted compound layer across independent graph instances", async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl,
    "DATABASE_URL is required for the PostgreSQL checkpoint integration test.",
  );

  const firstPool = new Pool({ connectionString: databaseUrl });
  const secondPool = new Pool({ connectionString: databaseUrl });
  const firstSaver = new PostgresSaver(firstPool);
  const secondSaver = new PostgresSaver(secondPool);
  const events: string[] = [];
  const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
    contextTokens: 1,
    inputTokens: 1,
    outputTokens: 0,
    source: "estimate",
    totalTokens: 2,
  };
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "跨实例先读后写",
    tasks: [
      {
        agentRole: "query",
        args: { scope: "all" },
        dependsOn: [],
        id: "read-once",
        intent: "query_progress",
        label: "读取一次",
      },
      {
        agentRole: "plan",
        args: { title: "跨实例恢复" },
        dependsOn: ["read-once"],
        id: "write-once",
        intent: "create_plan",
        label: "写入一次",
      },
    ],
  };
  const action: ProposedAgentAction = {
    args: { title: "跨实例恢复" },
    changes: [
      {
        collection: "plans",
        operation: "create",
        preview: "创建跨实例恢复计划",
      },
    ],
    id: "postgres-compound-action",
    intent: "create_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    summary: "创建跨实例恢复计划",
  };
  const buildGraph = (checkpointer: PostgresSaver) => {
    const compoundSubgraph =
      compileMountedOrchestrationSubgraph({
        executeConfirmedAction: async ({ task }) => {
          events.push(`confirmed:${task.id}`);

          return {
            assistantMessage: "跨实例计划已创建",
            observation: {
              actionId: action.id,
              agentRole: task.agentRole,
              intent: task.intent,
              label: task.label,
              message: "跨实例计划已创建",
              status: "executed",
              taskId: task.id,
            },
            taskId: task.id,
          };
        },
        executePreparedTask: async ({ prepared }) => {
          events.push(`execute:${prepared.task.id}`);

          if (prepared.kind === "proposal") {
            return {
              assistantMessage: action.summary,
              observation: {
                actionId: action.id,
                agentRole: prepared.task.agentRole,
                intent: prepared.task.intent,
                label: prepared.task.label,
                message: action.summary,
                status: "proposed",
                taskId: prepared.task.id,
              },
              proposal: action,
              taskId: prepared.task.id,
            };
          }

          return {
            assistantMessage: "读取完成",
            observation: {
              agentRole: prepared.task.agentRole,
              intent: prepared.task.intent,
              label: prepared.task.label,
              message: "读取完成",
              status: "answered",
              taskId: prepared.task.id,
            },
            taskId: prepared.task.id,
          };
        },
        prepareTask: async ({ task }) => ({
          kind:
            task.id === "write-once"
              ? "proposal"
              : "read",
          task,
        }),
      });

    return compileFullSunnyAgentGraph(
      {
        buildContext: async () => ({
          context: {},
          contextSummary: "PostgreSQL 集成上下文",
          tokenUsage,
        }),
        dryRun: async () => {
          throw new Error("compound path should not use top-level dry-run");
        },
        execute: async () => {
          throw new Error("compound path should not use top-level execute");
        },
        finalizeCompound: async ({ result }) => ({
          assistantMessage: result.assistantMessage,
          engine: "workflow",
          intent:
            result.proposals[0]?.intent ??
            result.observations[0]?.intent ??
            "answer_question",
          pendingAction: result.pendingAction,
          tokenUsage,
        }),
        finalize: async ({ response }) => response,
        orchestrate: async () => ({
          plan,
          tokenUsage,
          type: "compound",
        }),
        resolveIntent: async () => {
          throw new Error("compound path should not resolve one intent");
        },
      },
      { checkpointer, compoundSubgraph },
    );
  };
  const suffix =
    (Date.now() % 1_000_000_000) +
    Math.floor(Math.random() * 1_000);
  const config = buildSunnyAgentCheckpointConfig({
    threadId: suffix,
    userId: suffix + 10,
  });
  const threadKey = String(
    config.configurable?.thread_id ?? "",
  );

  try {
    await firstSaver.setup();
    const firstGraph = buildGraph(firstSaver);
    const interrupted = await firstGraph.invoke(
      {
        input: {
          baseTokenUsage: tokenUsage,
          message: "跨实例执行复合任务",
          pendingAction: null,
          resolvedHistory: [],
          structuredConfirmation: null,
          threadId: suffix,
          turnId: "postgres-compound-turn-1",
          userId: suffix + 10,
        },
        trace: [],
      },
      config,
    );

    assert.equal(
      getInterruptedCompoundResult(interrupted)?.result
        .pendingAction?.type,
      "await_confirmation",
    );
    assert.deepEqual(events, [
      "execute:read-once",
      "execute:write-once",
    ]);

    const restartedGraph = buildGraph(secondSaver);
    const resumed = await restartedGraph.invoke(
      new Command({
        resume: {
          baseTokenUsage: tokenUsage,
          message: "确认",
          structuredConfirmation: {
            actionId: action.id,
            type: "confirm",
          },
          turnId: "postgres-compound-turn-2",
        },
      }),
      config,
    );

    assert.equal(
      resumed.response?.assistantMessage.includes(
        "跨实例计划已创建",
      ),
      true,
    );
    assert.deepEqual(events, [
      "execute:read-once",
      "execute:write-once",
      "confirmed:write-once",
    ]);
  } finally {
    if (threadKey) {
      await firstSaver.deleteThread(threadKey);
    }
    await Promise.all([firstPool.end(), secondPool.end()]);
  }
});
