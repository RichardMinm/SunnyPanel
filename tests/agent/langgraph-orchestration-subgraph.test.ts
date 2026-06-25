import assert from "node:assert/strict";
import test from "node:test";

import {
  compileMountedOrchestrationSubgraph,
  compileOrchestrationSubgraph,
  runOrchestrationSubgraph,
} from "../../src/lib/agent/langgraph/orchestration-subgraph";
import { MemorySaver } from "@langchain/langgraph";
import type { OrchestratorPlan } from "../../src/lib/agent/orchestration/types";

const plan: OrchestratorPlan = {
  mode: "compound",
  reasoning: "先查询再创建计划",
  tasks: [
    {
      agentRole: "query",
      args: { scope: "all" },
      dependsOn: [],
      id: "query",
      intent: "query_progress",
      label: "查询进度",
    },
    {
      agentRole: "plan",
      args: { title: "下一阶段" },
      dependsOn: ["query"],
      id: "create",
      intent: "create_plan",
      label: "创建计划",
    },
  ],
};

test("orchestration subgraph exposes the complete execution lifecycle", async () => {
  const order: string[] = [];
  let executionCount = 0;

  const actual = await runOrchestrationSubgraph(
    plan,
    {},
    {
      dependencies: {
        prepareTask: async ({ task }) => ({
          kind: "read",
          task,
        }),
        executePreparedTask: async ({ prepared }) => {
          executionCount += 1;
          return {
            assistantMessage: prepared.task.label,
            observation: {
              agentRole: prepared.task.agentRole,
              intent: prepared.task.intent,
              label: prepared.task.label,
              message: prepared.task.label,
              status: "executed",
              taskId: prepared.task.id,
            },
            taskId: prepared.task.id,
          };
        },
      },
      onNode: (node) => order.push(node),
    },
  );

  assert.deepEqual(order, [
    "prepare",
    "select_ready",
    "execute_layer",
    "collect",
    "evaluate",
  ]);
  assert.equal(executionCount, 2);
  assert.equal(actual.executedCount, 2);
  assert.deepEqual(actual.queueState.completedTaskIds, [
    "query",
    "create",
  ]);
});

test("mounted orchestration subgraph publishes a serializable compound result", async () => {
  const graph = compileMountedOrchestrationSubgraph({
    prepareTask: async ({ task }) => ({
      kind: "read",
      task,
    }),
    executePreparedTask: async ({ prepared }) => ({
      assistantMessage: prepared.task.label,
      observation: {
        agentRole: prepared.task.agentRole,
        intent: prepared.task.intent,
        label: prepared.task.label,
        message: prepared.task.label,
        status: "executed",
        taskId: prepared.task.id,
      },
      taskId: prepared.task.id,
    }),
  });
  const actual = await graph.invoke({
    compoundPlan: plan,
    context: { plans: [] },
    input: {
      baseTokenUsage: {
        contextTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        source: "estimate",
        totalTokens: 0,
      },
      message: "先查询再创建计划",
      pendingAction: null,
      resolvedHistory: [],
      structuredConfirmation: null,
      threadId: 1,
      turnId: "mounted-result",
      userId: 1,
    },
    tokenUsage: {
      contextTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      source: "estimate",
      totalTokens: 0,
    },
    trace: [],
  });

  assert.equal(actual.compoundResult?.executedCount, 2);
  assert.deepEqual(
    actual.compoundResult?.observations.map(
      (observation: { taskId: string }) => observation.taskId,
    ),
    ["query", "create"],
  );
  assert.equal(actual.layerIndex, 2);
});

test("orchestration subgraph rejects circular or orphaned task dependencies", async () => {
  const invalidPlan: OrchestratorPlan = {
    ...plan,
    tasks: [
      {
        ...plan.tasks[0],
        dependsOn: ["create"],
      },
      {
        ...plan.tasks[1],
        dependsOn: ["query"],
      },
    ],
  };

  await assert.rejects(
    runOrchestrationSubgraph(invalidPlan, {}, {
      dependencies: {
        prepareTask: async ({ task }) => ({
          kind: "read",
          task,
        }),
        executePreparedTask: async () => {
          throw new Error("不应执行循环依赖任务");
        },
      },
    }),
    /无法生成可执行层/,
  );
});

test("native orchestration subgraph checkpoints exact layers and serializes writes", async () => {
  const events: string[] = [];
  const layeredPlan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "先并行查询，再串行写入",
    tasks: [
      {
        agentRole: "query",
        args: {},
        dependsOn: [],
        id: "read-a",
        intent: "query_progress",
        label: "读取 A",
      },
      {
        agentRole: "query",
        args: {},
        dependsOn: [],
        id: "read-b",
        intent: "query_plan_progress",
        label: "读取 B",
      },
      {
        agentRole: "plan",
        args: {},
        dependsOn: ["read-a", "read-b"],
        id: "write-a",
        intent: "create_plan",
        label: "写入 A",
      },
      {
        agentRole: "schedule",
        args: {},
        dependsOn: ["read-a", "read-b"],
        id: "write-b",
        intent: "schedule_plan",
        label: "写入 B",
      },
    ],
  };
  const graph = compileOrchestrationSubgraph(
    {
      prepareTask: async ({ task }) => ({
        kind: task.id.startsWith("read") ? "read" : "write",
        task,
      }),
      executePreparedTask: async ({ prepared }) => {
        events.push(`start:${prepared.task.id}`);
        if (prepared.kind === "read") {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        events.push(`end:${prepared.task.id}`);

        return {
          assistantMessage: prepared.task.label,
          observation: {
            agentRole: prepared.task.agentRole,
            intent: prepared.task.intent,
            label: prepared.task.label,
            message: prepared.task.label,
            status: "executed",
            taskId: prepared.task.id,
          },
          taskId: prepared.task.id,
        };
      },
    },
    { checkpointer: new MemorySaver() },
  );
  const config = {
    configurable: {
      thread_id: "native-layer-test",
    },
  };
  const actual = await graph.invoke(
    {
      plan: layeredPlan,
    },
    config,
  );
  const snapshot = await graph.getState(config);

  assert.equal(actual.layerIndex, 2);
  assert.equal(snapshot.values.layerIndex, 2);
  assert.deepEqual(
    actual.outcomes.map((outcome: { taskId: string }) => outcome.taskId),
    ["read-a", "read-b", "write-a", "write-b"],
  );
  assert.ok(events.indexOf("start:read-b") < events.indexOf("end:read-a"));
  assert.ok(events.indexOf("end:write-a") < events.indexOf("start:write-b"));
});

test("native orchestration subgraph stops before writes when dry-run proposes confirmation", async () => {
  const executed: string[] = [];
  const graph = compileOrchestrationSubgraph({
    prepareTask: async ({ task }) => ({
      kind: task.id === "query" ? "proposal" : "write",
      task,
    }),
    executePreparedTask: async ({ prepared }) => {
      executed.push(prepared.task.id);

      return {
        assistantMessage: prepared.task.label,
        observation: {
          agentRole: prepared.task.agentRole,
          intent: prepared.task.intent,
          label: prepared.task.label,
          message: prepared.task.label,
          status:
            prepared.kind === "proposal" ? "proposed" : "executed",
          taskId: prepared.task.id,
        },
        ...(prepared.kind === "proposal"
          ? {
              proposal: {
                args: {},
                changes: [],
                id: "confirm-first",
                intent: "create_plan" as const,
                requiresConfirmation: true,
                riskLevel: "medium" as const,
                summary: "先确认",
              },
            }
          : {}),
        taskId: prepared.task.id,
      };
    },
  });
  const actual = await graph.invoke({ plan });

  assert.deepEqual(executed, ["query"]);
  assert.equal(actual.layerIndex, 0);
  assert.equal(actual.outcomes[0]?.proposal?.id, "confirm-first");
});

test("native orchestration subgraph compensates successful writes in reverse order", async () => {
  const compensated: string[] = [];
  const rollbackPlan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "写入失败后逆序补偿",
    tasks: ["write-a", "write-b", "write-c"].map((id) => ({
      agentRole: "plan" as const,
      args: {},
      dependsOn: [],
      id,
      intent: "create_plan" as const,
      label: id,
    })),
  };
  const graph = compileOrchestrationSubgraph({
    compensate: async ({ outcomes }) => {
      for (const outcome of [...outcomes].reverse()) {
        compensated.push(outcome.taskId);
      }

      return {
        indeterminate: false,
        messages: ["补偿完成"],
      };
    },
    prepareTask: async ({ task }) => ({
      kind: "write",
      task,
    }),
    executePreparedTask: async ({ prepared }) => ({
      assistantMessage: prepared.task.label,
      observation: {
        agentRole: prepared.task.agentRole,
        ...(prepared.task.id === "write-c"
          ? { error: "boom" }
          : {}),
        intent: prepared.task.intent,
        label: prepared.task.label,
        message: prepared.task.label,
        status:
          prepared.task.id === "write-c"
            ? "failed"
            : "auto_executed",
        taskId: prepared.task.id,
      },
      ...(prepared.task.id === "write-c"
        ? {}
        : { rollbackPayload: { taskId: prepared.task.id } }),
      taskId: prepared.task.id,
    }),
  });
  const actual = await graph.invoke({ plan: rollbackPlan });

  assert.deepEqual(compensated, ["write-b", "write-a"]);
  assert.equal(actual.compensationIndeterminate, false);
  assert.deepEqual(actual.compensationMessages, ["补偿完成"]);
});

test("native orchestration subgraph checkpoints a budget pause without losing the remaining layer", async () => {
  const executed: string[] = [];
  const budgetPlan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "预算暂停",
    tasks: ["read-a", "read-b", "read-c"].map((id) => ({
      agentRole: "query" as const,
      args: { scope: "all" },
      dependsOn: [],
      id,
      intent: "query_progress" as const,
      label: id,
    })),
  };
  const graph = compileOrchestrationSubgraph(
    {
      prepareTask: async ({ task }) => ({
        kind: "read",
        task,
      }),
      executePreparedTask: async ({ prepared }) => {
        executed.push(prepared.task.id);

        return {
          assistantMessage: prepared.task.label,
          observation: {
            agentRole: prepared.task.agentRole,
            intent: prepared.task.intent,
            label: prepared.task.label,
            message: prepared.task.label,
            status: "executed",
            taskId: prepared.task.id,
          },
          taskId: prepared.task.id,
        };
      },
    },
    { maxTasksPerRun: 2 },
  );
  const actual = await graph.invoke({ plan: budgetPlan });

  assert.deepEqual(executed, ["read-a", "read-b"]);
  assert.deepEqual(actual.layers[0]?.map((task) => task.id), [
    "read-c",
  ]);
  assert.equal(actual.layerIndex, 0);
});

test("native orchestration subgraph routes semantic repair before generic replan", async () => {
  let repairCalls = 0;
  let replanCalls = 0;
  const graph = compileOrchestrationSubgraph({
    prepareTask: async ({ task }) => ({
      kind: "read",
      task,
    }),
    executePreparedTask: async ({ prepared }) => ({
      assistantMessage: prepared.task.label,
      observation: {
        agentRole: prepared.task.agentRole,
        ...(prepared.task.id === "query"
          ? { error: "missing target" }
          : {}),
        intent: prepared.task.intent,
        label: prepared.task.label,
        message: prepared.task.label,
        status:
          prepared.task.id === "query" ? "failed" : "answered",
        taskId: prepared.task.id,
      },
      taskId: prepared.task.id,
    }),
    repair: async () => {
      repairCalls += 1;
      return {
        mode: "single",
        reasoning: "先解释修复",
        tasks: [
          {
            agentRole: "query",
            args: { answer: "已修复" },
            dependsOn: [],
            id: "repair",
            intent: "answer_question",
            label: "修复说明",
          },
        ],
      };
    },
    replan: async () => {
      replanCalls += 1;
      return null;
    },
  });
  const actual = await graph.invoke({ plan });

  assert.equal(repairCalls, 1);
  assert.equal(replanCalls, 0);
  assert.equal(actual.repairAttempts, 1);
  assert.equal(
    actual.outcomes.find(
      (outcome) => outcome.taskId === "query",
    )?.observation.repairedByTaskId,
    "repair",
  );
});

test("native orchestration subgraph treats skipped read tasks as terminal observations", async () => {
  let repairCalls = 0;
  let replanCalls = 0;
  const graph = compileOrchestrationSubgraph({
    prepareTask: async ({ task }) => ({
      kind: "read",
      task,
    }),
    executePreparedTask: async ({ prepared }) => ({
      assistantMessage: prepared.task.label,
      observation: {
        agentRole: prepared.task.agentRole,
        intent: prepared.task.intent,
        label: prepared.task.label,
        message: "没有可直接执行的工具。",
        status:
          prepared.task.id === "query" ? "skipped" : "answered",
        taskId: prepared.task.id,
      },
      taskId: prepared.task.id,
    }),
    repair: async () => {
      repairCalls += 1;
      return null;
    },
    replan: async () => {
      replanCalls += 1;
      return null;
    },
  });
  const actual = await graph.invoke({ plan });

  assert.equal(repairCalls, 0);
  assert.equal(replanCalls, 0);
  assert.equal(actual.repairAttempts, 0);
  assert.equal(actual.replanAttempts, 0);
  assert.equal(
    actual.outcomes.find((outcome) => outcome.taskId === "query")
      ?.observation.status,
    "skipped",
  );
});
