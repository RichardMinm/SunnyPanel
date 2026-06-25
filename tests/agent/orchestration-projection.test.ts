import assert from "node:assert/strict";
import test from "node:test";

import {
  projectCompletedOrchestrationToPlan,
  projectConfirmedOrchestrationToPlan,
} from "../../src/lib/agent/orchestration/projection";
import type {
  ExecutionGraphResult,
  OrchestratorPlan,
} from "../../src/lib/agent/orchestration/types";

const plan: OrchestratorPlan = {
  mode: "compound",
  reasoning: "更新现有计划",
  tasks: [
    {
      agentRole: "query",
      args: { planId: 9 },
      dependsOn: [],
      id: "query",
      intent: "query_plan_progress",
      label: "查询计划",
    },
  ],
};

const result: ExecutionGraphResult = {
  assistantMessage: "完成",
  evaluation: {
    action: "complete",
    affectedDocuments: [],
    confidence: 1,
    deferredTaskIds: [],
    nextStep: "完成",
    reason: "完成",
    strategy: {
      confidence: 1,
      constraints: [],
      memoryIds: [],
      mode: "neutral",
      reason: "测试",
      recentRunIds: [],
    },
    summary: "完成",
  },
  executedCount: 1,
  observations: [
    {
      agentRole: "query",
      intent: "query_plan_progress",
      label: "查询计划",
      message: "完成",
      status: "executed",
      taskId: "query",
    },
  ],
  pendingAction: null,
  proposals: [],
  queueState: {
    autoExecutedTaskIds: [],
    blockedTaskIds: [],
    completedTaskIds: ["query"],
    deferredTaskIds: [],
    failedTaskIds: [],
    pendingTaskIds: [],
    proposedTaskIds: [],
    skippedTaskIds: [],
    totalTasks: 1,
  },
};

test("completed orchestration projects metadata only after pending clears", async () => {
  const updates: unknown[] = [];
  const payload = {
    update: async (args: unknown) => {
      updates.push(args);
      return {};
    },
  };

  await projectCompletedOrchestrationToPlan({
    orchestrationId: "orch-1",
    payload,
    plan,
    result: {
      ...result,
      pendingAction: {
        action: {
          args: { planId: 9 },
          changes: [],
          id: "action-1",
          intent: "query_plan_progress",
          riskLevel: "low",
          summary: "确认",
        },
        type: "await_confirmation",
      },
    },
  });
  assert.equal(updates.length, 0);

  await projectCompletedOrchestrationToPlan({
    orchestrationId: "orch-1",
    payload,
    plan,
    result,
  });
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as { id: number }).id, 9);
});

test("confirmed actions project execution metadata to their related plan", async () => {
  const updates: unknown[] = [];

  await projectConfirmedOrchestrationToPlan({
    payload: {
      update: async (args: unknown) => {
        updates.push(args);
        return {};
      },
    },
    pendingAction: {
      action: {
        args: { relatedPlanId: 12 },
        changes: [],
        id: "action-2",
        intent: "schedule_plan",
        riskLevel: "medium",
        summary: "排期",
      },
      orchestrationId: "orch-2",
      type: "await_confirmation",
    },
  });

  assert.equal((updates[0] as { id: number }).id, 12);
});
