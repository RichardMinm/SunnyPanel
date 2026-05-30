import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildObservationTraceStep,
  buildTaskObservation,
  executeOrchestrationGraph,
  formatTaskObservation,
} from "../../src/lib/agent/execution-graph";
import type { ProposedAgentAction } from "../../src/lib/agent/schemas";
import type { OrchestratorPlan, TaskNode } from "../../src/lib/agent/orchestration/types";

const sampleTask = (overrides: Partial<TaskNode> = {}): TaskNode => ({
  agentRole: "plan",
  args: {
    title: "测试计划",
  },
  dependsOn: [],
  id: "task-1",
  intent: "create_plan",
  label: "创建测试计划",
  ...overrides,
});

const sampleAction = (overrides: Partial<ProposedAgentAction> = {}): ProposedAgentAction => ({
  args: {
    title: "测试计划",
  },
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "新增计划：测试计划",
    },
  ],
  id: "action-1",
  intent: "create_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建计划「测试计划」",
  ...overrides,
});

test("buildTaskObservation captures action risk and affected collections", () => {
  const observation = buildTaskObservation(sampleTask(), {
    action: sampleAction(),
    message: "等待用户确认后写入。",
    status: "proposed",
  });

  assert.deepEqual(observation, {
    actionId: "action-1",
    agentRole: "plan",
    collections: ["plans"],
    intent: "create_plan",
    label: "创建测试计划",
    message: "等待用户确认后写入。",
    riskLevel: "medium",
    status: "proposed",
    taskId: "task-1",
  });
  assert.match(formatTaskObservation(observation), /待确认/);
  assert.match(formatTaskObservation(observation), /plans/);
});

test("buildObservationTraceStep summarizes task observations for UI trace", () => {
  const traceStep = buildObservationTraceStep([
    buildTaskObservation(sampleTask(), {
      action: sampleAction(),
      message: "等待用户确认后写入。",
      status: "proposed",
    }),
  ]);

  assert.deepEqual(traceStep, {
    detail: "待确认「创建测试计划」 · plans · medium：等待用户确认后写入。",
    id: "orchestrator-observe",
    kind: "analysis",
    status: "done",
    title: "已观察 1 个子任务结果",
  });
});

test("executeOrchestrationGraph returns observations for direct answers", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "只需回答用户问题。",
    tasks: [
      sampleTask({
        agentRole: "query",
        args: {
          answer: "当前没有需要写入的动作。",
        },
        intent: "answer_question",
        label: "回答当前状态",
      }),
    ],
  };

  const result = await executeOrchestrationGraph(plan, {});

  assert.equal(result.pendingAction, null);
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.status, "answered");
  assert.equal(result.observations[0]?.message, "当前没有需要写入的动作。");
});

test("executeOrchestrationGraph returns observations for proposed writes", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "需要先 dry-run 计划创建。",
    tasks: [sampleTask()],
  };

  const result = await executeOrchestrationGraph(plan, {
    createActionId: () => "create-plan-action",
  });

  assert.equal(result.pendingAction?.type, "await_confirmation");
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.actionId, "create-plan-action");
  assert.equal(result.observations[0]?.status, "proposed");
  assert.equal(result.observations[0]?.riskLevel, "medium");
  assert.deepEqual(result.observations[0]?.collections, ["plans"]);
});
