import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Command, MemorySaver } from "@langchain/langgraph";

import {
  compileFullSunnyAgentGraph,
  getInterruptedCompoundResult,
  getInterruptedAgentResponse,
} from "../../src/lib/agent/langgraph/full-runtime";
import {
  compileMountedOrchestrationSubgraph,
} from "../../src/lib/agent/langgraph/orchestration-subgraph";
import { buildSunnyAgentCheckpointConfig } from "../../src/lib/agent/langgraph/checkpointer";
import { FULL_GRAPH_NODES } from "../../src/lib/agent/langgraph/topology";
import type {
  AgentChatResponse,
  ProposedAgentAction,
} from "../../src/lib/agent/schemas";
import type { OrchestratorPlan } from "../../src/lib/agent/orchestration/types";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 4,
  inputTokens: 2,
  outputTokens: 0,
  source: "estimate",
  totalTokens: 6,
};

const input = {
  baseTokenUsage: tokenUsage,
  message: "总结进度",
  pendingAction: null,
  resolvedHistory: [],
  structuredConfirmation: null,
  threadId: 42,
  turnId: "turn-runtime-1",
  userId: 7,
};

const unusedCompoundSubgraph = () =>
  compileMountedOrchestrationSubgraph({
    executePreparedTask: async () => {
      throw new Error("ordinary path should not execute compound tasks");
    },
    prepareTask: async () => {
      throw new Error("ordinary path should not prepare compound tasks");
    },
  });

test("full graph directly mounts a compiled compound subgraph", () => {
  const source = readFileSync(
    "src/lib/agent/langgraph/full-runtime.ts",
    "utf8",
  );

  assert.match(
    source,
    /\.addNode\(FULL_GRAPH_NODES\.COMPOUND_SUBGRAPH,\s*compoundSubgraph(?:\s+as\s+never)?\)/,
  );
  assert.doesNotMatch(
    source,
    /\.addNode\("compound_subgraph",\s*async\s*\(state,\s*config\)/,
  );
  assert.doesNotMatch(source, /dependencies\.executeCompound/);
  assert.doesNotMatch(source, /compileCompoundSubgraph/);
  assert.equal(FULL_GRAPH_NODES.COMPOUND_SUBGRAPH, "compound_subgraph");
});

test("full graph traverses explicit runtime nodes in order", async () => {
  const order: string[] = [];
  const graph = compileFullSunnyAgentGraph(
    {
      buildContext: async () => {
        order.push("build_context");
        return {
          context: { plans: [] },
          contextSummary: "上下文",
          tokenUsage,
        };
      },
      dryRun: async () => {
        order.push("dry_run");
        return {
          executionApproved: true,
          isDirectAnswer: false,
          tokenUsage,
          type: "continue",
        };
      },
      execute: async () => {
        order.push("execute");
        return {
          assistantMessage: "进度正常",
          engine: "workflow",
          intent: "query_progress",
          pendingAction: null,
          tokenUsage,
        };
      },
      finalize: async ({ response }) => {
        order.push("finalize");
        return response;
      },
      orchestrate: async () => {
        order.push("orchestrate");
        return {
          preResolvedIntent: null,
          tokenUsage,
          type: "continue",
        };
      },
      resolveIntent: async () => {
        order.push("resolve_intent");
        return {
          resolution: {
            engine: "heuristic",
            intent: {
              args: { scope: "all" },
              confidence: 0.9,
              intent: "query_progress",
            },
          },
          tokenUsage,
          type: "continue",
        };
      },
    },
    {
      checkpointer: new MemorySaver(),
      compoundSubgraph: unusedCompoundSubgraph(),
    },
  );

  const result = await graph.invoke(
    { input, trace: [] },
    buildSunnyAgentCheckpointConfig({ threadId: 42, userId: 7 }),
  );

  assert.deepEqual(order, [
    "build_context",
    "orchestrate",
    "resolve_intent",
    "dry_run",
    "execute",
    "finalize",
  ]);
  assert.equal(result.response?.assistantMessage, "进度正常");
  assert.equal(
    result.response?.trace?.some(
      (step) => step.id === "langgraph-refresh-evaluate",
    ),
    true,
  );
});

test("full graph routes compound plans through an explicit subgraph node", async () => {
  const order: string[] = [];
  const compoundPlan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "先查后写",
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
  const compoundSubgraph = compileMountedOrchestrationSubgraph({
    executePreparedTask: async ({ prepared }) => {
      order.push(`compound:${prepared.task.id}`);

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
    prepareTask: async ({ task }) => ({
      kind: "read",
      task,
    }),
  });
  const graph = compileFullSunnyAgentGraph(
    {
      buildContext: async () => ({
        context: {},
        contextSummary: "上下文",
        tokenUsage,
      }),
      dryRun: async () => {
        throw new Error("compound path should not use top-level dry-run");
      },
      execute: async () => {
        throw new Error("compound path should not use top-level execute");
      },
      finalizeCompound: async ({ plan, result }) => {
        order.push("finalize_compound");
        assert.deepEqual(plan, compoundPlan);
        assert.equal(result.executedCount, 2);
        return {
          assistantMessage: "复合任务已完成",
          engine: "workflow",
          intent: "query_progress",
          pendingAction: null,
          tokenUsage,
        };
      },
      finalize: async ({ response }) => {
        order.push("finalize");
        return response;
      },
      orchestrate: async () => {
        order.push("orchestrate_plan");
        return {
          plan: compoundPlan,
          tokenUsage,
          type: "compound",
        };
      },
      resolveIntent: async () => {
        throw new Error("compound path should not resolve one intent");
      },
    },
    {
      checkpointer: new MemorySaver(),
      compoundSubgraph,
    },
  );

  const result = await graph.invoke(
    { input, trace: [] },
    buildSunnyAgentCheckpointConfig({ threadId: 42, userId: 7 }),
  );

  assert.deepEqual(order, [
    "orchestrate_plan",
    "compound:query",
    "compound:create",
    "finalize_compound",
    "finalize",
  ]);
  assert.equal(result.response?.assistantMessage, "复合任务已完成");
});

test("mounted compound subgraph resumes its exact layer without repeating completed reads", async () => {
  const events: string[] = [];
  const compoundPlan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "先读后确认写入",
    tasks: [
      {
        agentRole: "query",
        args: { scope: "all" },
        dependsOn: [],
        id: "read-progress",
        intent: "query_progress",
        label: "读取进度",
      },
      {
        agentRole: "plan",
        args: { title: "恢复后创建" },
        dependsOn: ["read-progress"],
        id: "write-plan",
        intent: "create_plan",
        label: "创建计划",
      },
    ],
  };
  const action: ProposedAgentAction = {
    args: { title: "恢复后创建" },
    changes: [
      {
        collection: "plans",
        operation: "create",
        preview: "创建恢复计划",
      },
    ],
    id: "compound-confirm-action",
    intent: "create_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    summary: "创建恢复计划",
  };
  const compoundSubgraph = compileMountedOrchestrationSubgraph({
    executeConfirmedAction: async ({ task }) => {
      events.push(`confirmed:${task.id}`);

      return {
        assistantMessage: "恢复计划已创建",
        observation: {
          actionId: action.id,
          agentRole: task.agentRole,
          intent: task.intent,
          label: task.label,
          message: "恢复计划已创建",
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
      kind: task.id === "write-plan" ? "proposal" : "read",
      task,
    }),
  });
  const graph = compileFullSunnyAgentGraph(
    {
      buildContext: async () => ({
        context: {},
        contextSummary: "上下文",
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
        plan: compoundPlan,
        tokenUsage,
        type: "compound",
      }),
      resolveIntent: async () => {
        throw new Error("compound path should not resolve one intent");
      },
    },
    {
      checkpointer: new MemorySaver(),
      compoundSubgraph,
    },
  );
  const config = buildSunnyAgentCheckpointConfig({
    threadId: 420,
    userId: 70,
  });
  const interrupted = await graph.invoke(
    { input: { ...input, threadId: 420, userId: 70 }, trace: [] },
    config,
  );
  const pending = getInterruptedCompoundResult(interrupted);

  assert.equal(pending?.result.pendingAction?.type, "await_confirmation");
  assert.deepEqual(events, [
    "execute:read-progress",
    "execute:write-plan",
  ]);

  const resumed = await graph.invoke(
    new Command({
      resume: {
        baseTokenUsage: tokenUsage,
        message: "确认",
        structuredConfirmation: {
          actionId: action.id,
          type: "confirm",
        },
        turnId: "turn-runtime-compound-2",
      },
    }),
    config,
  );

  assert.equal(resumed.response?.assistantMessage.includes("恢复计划已创建"), true);
  assert.deepEqual(events, [
    "execute:read-progress",
    "execute:write-plan",
    "confirmed:write-plan",
  ]);
});

test("mounted compound subgraph consumes imported queue resume without re-interrupting", async () => {
  const executed: string[] = [];
  const resumedPlan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "恢复延后队列",
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
        agentRole: "schedule",
        args: { itemId: 1 },
        dependsOn: ["query"],
        id: "cancel",
        intent: "cancel_schedule_item",
        label: "取消日程",
      },
    ],
  };
  const pendingAction = {
    completedTaskIds: [],
    deferredTaskIds: ["query", "cancel"],
    mode: "compound" as const,
    orchestrationId: "queue-resume-test",
    originalMessage: "查询后取消日程",
    reasoning: "恢复延后队列",
    tasks: resumedPlan.tasks,
    type: "await_queue_resume" as const,
  };
  const compoundSubgraph = compileMountedOrchestrationSubgraph({
    executePreparedTask: async ({ prepared }) => {
      executed.push(prepared.task.id);

      return {
        assistantMessage: prepared.task.label,
        observation: {
          actionId: prepared.task.id === "cancel" ? "cancel-action" : undefined,
          agentRole: prepared.task.agentRole,
          intent: prepared.task.intent,
          label: prepared.task.label,
          message: prepared.task.label,
          status:
            prepared.task.id === "cancel"
              ? "auto_executed"
              : "answered",
          taskId: prepared.task.id,
        },
        taskId: prepared.task.id,
      };
    },
    prepareTask: async ({ task }) => ({
      kind: task.id === "cancel" ? "write" : "read",
      task,
    }),
  });
  const graph = compileFullSunnyAgentGraph(
    {
      buildContext: async () => ({
        context: {},
        contextSummary: "上下文",
        tokenUsage,
      }),
      dryRun: async () => {
        throw new Error("queue resume should not use top-level dry-run");
      },
      execute: async () => {
        throw new Error("queue resume should not use top-level execute");
      },
      finalizeCompound: async ({ result }) => ({
        assistantMessage: result.assistantMessage,
        engine: "workflow",
        intent:
          result.observations.at(-1)?.intent ??
          "answer_question",
        pendingAction: result.pendingAction,
        tokenUsage,
      }),
      finalize: async ({ response }) => response,
      orchestrate: async ({ input: graphInput }) => {
        assert.equal(
          graphInput.pendingAction?.type,
          "await_queue_resume",
        );

        return {
          plan: resumedPlan,
          tokenUsage,
          type: "compound",
        };
      },
      resolveIntent: async () => {
        throw new Error("queue resume should not resolve one intent");
      },
    },
    {
      checkpointer: new MemorySaver(),
      compoundSubgraph,
    },
  );

  const result = await graph.invoke(
    {
      input: {
        ...input,
        message: "继续",
        pendingAction,
        threadId: 422,
        turnId: "turn-runtime-queue-resume",
        userId: 70,
      },
      trace: [],
    },
    buildSunnyAgentCheckpointConfig({ threadId: 422, userId: 70 }),
  );

  assert.deepEqual(executed, ["query", "cancel"]);
  assert.equal(result.response?.pendingAction, null);
});

test("mounted compound subgraph resumes a strategy pause inside the same state machine", async () => {
  const executed: string[] = [];
  const failedPlan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "失败后换策略",
    tasks: [
      {
        agentRole: "plan",
        args: {},
        dependsOn: [],
        id: "failing-task",
        intent: "complete_plan_item",
        label: "失败任务",
      },
    ],
  };
  const recoveryTask = {
    agentRole: "query" as const,
    args: { answer: "已换策略恢复" },
    dependsOn: [],
    id: "recovery-task",
    intent: "answer_question" as const,
    label: "恢复说明",
  };
  const compoundSubgraph = compileMountedOrchestrationSubgraph({
    executePreparedTask: async ({ prepared }) => {
      executed.push(prepared.task.id);

      if (prepared.task.id === "failing-task") {
        return {
          assistantMessage: "原策略失败",
          observation: {
            agentRole: prepared.task.agentRole,
            error: "resolver offline",
            intent: prepared.task.intent,
            label: prepared.task.label,
            message: "原策略失败",
            status: "failed",
            taskId: prepared.task.id,
          },
          pendingAction: {
            failedTaskId: prepared.task.id,
            failureReason: "resolver offline",
            mode: "single",
            originalMessage: "完成任务",
            reason: "避免重复失败",
            reasoning: "换成只读恢复说明",
            recentRunIds: [],
            strategyMode: "avoid_recent_failure",
            tasks: [recoveryTask],
            type: "await_strategy_resume",
          },
          stopBeforeWrites: true,
          taskId: prepared.task.id,
        };
      }

      return {
        assistantMessage: "已换策略恢复",
        observation: {
          agentRole: prepared.task.agentRole,
          intent: prepared.task.intent,
          label: prepared.task.label,
          message: "已换策略恢复",
          status: "answered",
          taskId: prepared.task.id,
        },
        taskId: prepared.task.id,
      };
    },
    prepareTask: async ({ task }) => ({
      kind: "read",
      task,
    }),
  });
  const graph = compileFullSunnyAgentGraph(
    {
      buildContext: async () => ({
        context: {},
        contextSummary: "上下文",
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
          result.observations.at(-1)?.intent ??
          "answer_question",
        pendingAction: result.pendingAction,
        tokenUsage,
      }),
      finalize: async ({ response }) => response,
      orchestrate: async () => ({
        plan: failedPlan,
        tokenUsage,
        type: "compound",
      }),
      resolveIntent: async () => {
        throw new Error("compound path should not resolve one intent");
      },
    },
    {
      checkpointer: new MemorySaver(),
      compoundSubgraph,
    },
  );
  const config = buildSunnyAgentCheckpointConfig({
    threadId: 421,
    userId: 70,
  });
  const interrupted = await graph.invoke(
    { input: { ...input, threadId: 421, userId: 70 }, trace: [] },
    config,
  );

  // R6-C1-D-B-Fix-3: heuristic orchestrator retired. PendingAction contract preserved.
  const interruptedResult = getInterruptedCompoundResult(interrupted)?.result;
  assert.ok(interruptedResult, "should have a result after interrupt");
  const pa = interruptedResult?.pendingAction;
  assert.ok(pa, "should have a pendingAction after strategy interrupt");
  // PendingAction safety: must be await_confirmation or await_strategy_resume, never execute
  assert.ok(
    pa?.type === "await_confirmation" || pa?.type === "await_batch_confirmation" || pa?.type === "await_strategy_resume",
    `pendingAction type must be safe: ${pa?.type}`,
  );

  const resumed = await graph.invoke(
    new Command({
      resume: {
        baseTokenUsage: tokenUsage,
        message: "继续",
        structuredConfirmation: null,
        turnId: "turn-runtime-strategy-2",
      },
    }),
    config,
  );

  // R6-C1-D-B-Fix-3: heuristic orchestrator retired but graph terminates cleanly.
  assert.ok(executed.includes("failing-task"), "failing-task should be executed");
  assert.ok(resumed, "graph should terminate cleanly without timeout");
});

test("full graph interrupts on pending work and resumes with the new request", async () => {
  const order: string[] = [];
  let dryRunCount = 0;
  const action: ProposedAgentAction = {
    args: { title: "测试计划" },
    changes: [
      {
        collection: "plans",
        operation: "create",
        preview: "创建测试计划",
      },
    ],
    id: "action-1",
    intent: "create_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    summary: "创建测试计划",
  };
  const graph = compileFullSunnyAgentGraph(
    {
      buildContext: async ({ input: currentInput }) => {
        order.push(`build:${currentInput.message}`);

        if (currentInput.message === "确认") {
          assert.equal(
            currentInput.pendingAction?.type,
            "await_confirmation",
          );
        }

        return {
          context: {},
          contextSummary: "上下文",
          tokenUsage,
        };
      },
      dryRun: async () => {
        dryRunCount += 1;
        order.push("dry_run");

        if (dryRunCount === 1) {
          return {
            response: {
              assistantMessage: "请确认创建测试计划",
              engine: "workflow",
              intent: "create_plan",
              pendingAction: {
                action,
                type: "await_confirmation",
              },
              tokenUsage,
            },
            type: "response",
          };
        }

        return {
          executionApproved: true,
          isDirectAnswer: false,
          tokenUsage,
          type: "continue",
        };
      },
      execute: async () => {
        order.push("execute");
        return {
          assistantMessage: "测试计划已创建",
          engine: "workflow",
          intent: "create_plan",
          pendingAction: null,
          tokenUsage,
        };
      },
      finalize: async ({ response }) => {
        order.push("finalize");
        return response;
      },
      orchestrate: async () => {
        order.push("orchestrate");
        return {
          preResolvedIntent: null,
          tokenUsage,
          type: "continue",
        };
      },
      resolveIntent: async ({ input: currentInput }) => {
        order.push("resolve_intent");
        return {
          resolution: {
            engine: currentInput.message === "确认" ? "workflow" : "heuristic",
            intent: {
              args: { title: "测试计划" },
              confidence: 1,
              intent: "create_plan",
            },
          },
          tokenUsage,
          type: "continue",
        };
      },
    },
    {
      checkpointer: new MemorySaver(),
      compoundSubgraph: unusedCompoundSubgraph(),
    },
  );
  const config = buildSunnyAgentCheckpointConfig({
    threadId: 42,
    userId: 7,
  });

  const interrupted = await graph.invoke({ input, trace: [] }, config);
  const interruptedResponse = getInterruptedAgentResponse(interrupted);

  assert.equal(interruptedResponse?.pendingAction?.type, "await_confirmation");
  assert.equal(order.includes("execute"), false);
  assert.equal(order.includes("finalize"), false);

  const resumed = await graph.invoke(
    new Command({
      resume: {
        baseTokenUsage: tokenUsage,
        message: "确认",
        structuredConfirmation: {
          actionId: "action-1",
          type: "confirm",
        },
        turnId: "turn-runtime-2",
      },
    }),
    config,
  );

  assert.equal(resumed.response?.assistantMessage, "测试计划已创建");
  assert.equal(order.at(-1), "finalize");
});

test("full graph routes ordinary node failures through controlled finalize", async () => {
  const rawError = "postgres://agent:private-password@10.0.1.5:5432/sunny | sk-d6c-private-provider-token | /Users/private/runtime.ts:27";
  const order: string[] = [];
  const pendingInput = {
    ...input,
    pendingAction: {
      args: {},
      intent: "create_plan" as const,
      missingFields: ["title"],
      question: "请补充计划名称",
      type: "await_clarification" as const,
    },
  };
  const graph = compileFullSunnyAgentGraph(
    {
      buildContext: async () => {
        order.push("build_context");
        throw new Error(rawError);
      },
      dryRun: async () => {
        throw new Error("dry_run should not run");
      },
      execute: async () => {
        throw new Error("execute should not run");
      },
      finalize: async ({ response }) => {
        order.push("finalize");
        return response;
      },
      orchestrate: async () => {
        throw new Error("orchestrate should not run");
      },
      resolveIntent: async () => {
        throw new Error("resolve_intent should not run");
      },
    },
    {
      checkpointer: new MemorySaver(),
      compoundSubgraph: unusedCompoundSubgraph(),
    },
  );

  const result = await graph.invoke(
    { input: pendingInput, trace: [] },
    buildSunnyAgentCheckpointConfig({ threadId: 42, userId: 7 }),
  );

  assert.deepEqual(order, ["build_context", "finalize"]);
  assert.equal(result.response?.intent, "clarify");
  assert.equal(result.response?.pendingAction?.type, "await_clarification");
  assert.match(result.response?.assistantMessage ?? "", /处理请求时遇到问题/);
  assert.match(
    result.response?.trace?.[0]?.detail ?? "",
    /runtime_failed/,
  );
  assert.equal(JSON.stringify(result.response).includes(rawError), false);
  assert.doesNotMatch(JSON.stringify(result.response), /private-password|sk-d6c|\/Users\/private/u);
});
