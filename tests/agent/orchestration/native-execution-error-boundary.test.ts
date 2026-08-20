import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createAgentBus } from "../../../src/lib/agent/agents/bus";
import { createNativeOrchestrationTaskExecutor } from "../../../src/lib/agent/orchestration/native-task-executor";
import { buildIncrementalReplanMessage } from "../../../src/lib/agent/orchestration/replan";
import type { ReplanInput } from "../../../src/lib/agent/orchestration/replan";
import type { SafeExecutionFailureCode } from "../../../src/lib/agent/orchestration/safe-execution-failure";
import type { OrchestratorPlan, TaskNode } from "../../../src/lib/agent/orchestration/types";

const RAW_ERROR = [
  "postgres://agent:private-password@10.20.30.40:5432/sunny",
  "SELECT secret_value FROM private_agent_state",
  "sk-d6c-private-provider-token",
  "/Users/private/SunnyPanel/internal.ts:77",
].join(" | ");

const RAW_MARKERS = [
  "postgres://agent:private-password@10.20.30.40:5432/sunny",
  "SELECT secret_value FROM private_agent_state",
  "sk-d6c-private-provider-token",
  "/Users/private/SunnyPanel/internal.ts:77",
] as const;

const assertNoRawError = (value: unknown) => {
  const serialized = JSON.stringify(value);

  for (const marker of RAW_MARKERS) {
    assert.equal(serialized.includes(marker), false, marker);
  }
};

const taskArgs = (task: TaskNode, plan: OrchestratorPlan) => ({
  bus: createAgentBus(),
  outcomes: [],
  plan,
  task,
});

const buildReplanInput = (
  task: TaskNode,
  plan: OrchestratorPlan,
  observation: {
    error?: string;
    errorCode?: SafeExecutionFailureCode;
    message: string;
  },
): ReplanInput => ({
  failedTask: task,
  failedTaskIndex: 0,
  failureReason: observation.error ?? observation.message,
  failureType: "tool_error",
  message: "取消今天的日程",
  observations: [
    observation as NonNullable<ReplanInput["observations"]>[number],
  ],
  originalPlan: plan,
  promptContext: {
    checklists: [],
    now: "2026-08-18T09:00:00.000+08:00",
    pendingAction: null,
    plans: [],
  },
  proposals: [],
  queueState: {
    autoExecutedTaskIds: [],
    blockedTaskIds: [],
    completedTaskIds: [],
    deferredTaskIds: [],
    failedTaskIds: [task.id],
    pendingTaskIds: [],
    proposedTaskIds: [],
    skippedTaskIds: [],
    totalTasks: 1,
  },
});

test("native task prepare failure never exposes raw error to assistant, observation, result, or replan", async () => {
  const task: TaskNode = {
    agentRole: "schedule",
    args: { itemId: 17 },
    dependsOn: [],
    id: "task-cancel-schedule",
    intent: "cancel_schedule_item",
    label: "取消日程",
  };
  const plan: OrchestratorPlan = {
    mode: "single",
    reasoning: "取消用户明确引用的日程。",
    tasks: [task],
  };
  const executor = createNativeOrchestrationTaskExecutor({
    dryRunContext: {
      resolveScheduleItem: async () => {
        throw new Error(RAW_ERROR);
      },
    },
  });
  const prepared = await executor.prepareTask(taskArgs(task, plan));
  const outcome = await executor.executePreparedTask({
    ...taskArgs(task, plan),
    prepared,
  });
  const observation = outcome.observation as typeof outcome.observation & {
    errorCode?: string;
  };

  assert.equal(observation.errorCode, "task_prepare_failed");
  assertNoRawError(prepared);
  assertNoRawError(outcome.assistantMessage);
  assertNoRawError(observation);
  assertNoRawError(outcome);

  const replanMessage = buildIncrementalReplanMessage(
    buildReplanInput(task, plan, observation),
  );
  assert.match(replanMessage, /task_prepare_failed/u);
  assertNoRawError(replanMessage);
});

test("native task execute failure never exposes raw error to assistant, observation, or serialized result", async () => {
  const task: TaskNode = {
    agentRole: "query",
    args: { planId: 7 },
    dependsOn: [],
    id: "task-query-plan-progress",
    intent: "query_plan_progress",
    label: "查询计划进度",
  };
  const plan: OrchestratorPlan = {
    mode: "single",
    reasoning: "执行只读计划进度查询。",
    tasks: [task],
  };
  const executor = createNativeOrchestrationTaskExecutor({
    dryRunContext: {},
    executeIntent: async () => {
      throw new Error(RAW_ERROR);
    },
  });
  const prepared = {
    kind: "read" as const,
    payload: {
      action: {
        args: { planId: 7 },
        changes: [],
        id: "read:task-query-plan-progress",
        intent: "query_plan_progress" as const,
        requiresConfirmation: false,
        riskLevel: "low" as const,
        summary: "查询计划进度",
      },
      busMessages: [],
      intent: {
        args: { planId: 7 },
        confidence: 1,
        intent: "query_plan_progress" as const,
      },
      isWrite: false,
      type: "execute" as const,
    },
    task,
  };
  const outcome = await executor.executePreparedTask({
    ...taskArgs(task, plan),
    prepared,
  });
  const observation = outcome.observation as typeof outcome.observation & {
    errorCode?: string;
  };

  assert.equal(observation.errorCode, "task_execute_failed");
  assertNoRawError(outcome.assistantMessage);
  assertNoRawError(observation);
  assertNoRawError(outcome);
});

test("native executor preserves an explicit typed tool failure for semantic repair", async () => {
  const task: TaskNode = {
    agentRole: "plan",
    args: {
      checklistTitle: "发布清单",
      groupTitle: "研究阶段",
      itemTitle: "漏洞复现",
    },
    dependsOn: [],
    id: "task-complete-missing-item",
    intent: "complete_plan_item",
    label: "完成漏洞复现",
  };
  const plan: OrchestratorPlan = {
    mode: "single",
    reasoning: "完成用户明确引用的清单项。",
    tasks: [task],
  };
  const executor = createNativeOrchestrationTaskExecutor({
    dryRunContext: {},
    executeIntent: async () => ({
      assistantMessage: "没有找到要完成的清单项。",
      errorCode: "checklist_item_not_found",
      pendingAction: null,
      status: "failed",
    }),
  });
  const prepared = {
    kind: "write" as const,
    payload: {
      action: {
        args: task.args,
        changes: [],
        id: "write:task-complete-missing-item",
        intent: "complete_plan_item" as const,
        requiresConfirmation: false,
        riskLevel: "low" as const,
        summary: "完成漏洞复现",
      },
      busMessages: [],
      intent: {
        args: task.args,
        confidence: 1,
        intent: "complete_plan_item" as const,
      },
      isWrite: false,
      type: "execute" as const,
    },
    task,
  };

  const outcome = await executor.executePreparedTask({
    ...taskArgs(task, plan),
    prepared,
  });

  assert.equal(outcome.observation.status, "failed");
  assert.equal(outcome.observation.errorCode, "checklist_item_not_found");
  assert.match(outcome.observation.error ?? "", /checklist_item_not_found/u);
});

test("full adapter rollback compensation uses the shared safe projection and never interpolates raw errors", () => {
  const source = readFileSync("src/lib/agent/langgraph/full-adapter.ts", "utf8");
  const start = source.indexOf("compensate: async");
  const end = source.indexOf("executeConfirmedAction:", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const compensationBoundary = source.slice(start, end);

  assert.match(
    compensationBoundary,
    /projectSafeExecutionFailure\(["']rollback["']\)/u,
  );
  const failureCatch = compensationBoundary.indexOf("catch {");
  const failureMessageStart = compensationBoundary.indexOf(
    "messages.push(",
    failureCatch,
  );
  const failureMessageEnd = compensationBoundary.indexOf(
    ");",
    failureMessageStart,
  );
  assert.notEqual(failureCatch, -1);
  assert.notEqual(failureMessageStart, -1);
  assert.notEqual(failureMessageEnd, -1);
  const clientMessageBoundary = compensationBoundary.slice(
    failureMessageStart,
    failureMessageEnd,
  );
  assert.match(clientMessageBoundary, /failure\.safeUserMessage/u);
  assert.match(
    compensationBoundary,
    /buildSafeExecutionTraceError\(["']rollback["']\)/u,
  );
  assert.doesNotMatch(
    clientMessageBoundary,
    /error\s+instanceof\s+Error|error\.message|String\(error\)/u,
  );
});
