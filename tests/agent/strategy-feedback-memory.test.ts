import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStrategyFeedbackMemoryDraft } from "../../src/lib/agent/orchestration/strategy-feedback";
import {
  buildExecutionEvaluation,
  buildTaskObservation,
} from "../../src/lib/agent/execution-graph";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { ExecutionQueueState, TaskNode } from "../../src/lib/agent/orchestration/types";

const sampleTask = (overrides: Partial<TaskNode> = {}): TaskNode => ({
  agentRole: "plan",
  args: {
    checklistTitle: "线性代数",
    itemTitle: "矩阵习题",
  },
  dependsOn: [],
  id: "task-complete-item",
  intent: "complete_plan_item",
  label: "完成清单项",
  ...overrides,
});

const sampleQueueState = (overrides: Partial<ExecutionQueueState> = {}): ExecutionQueueState => ({
  autoExecutedTaskIds: [],
  blockedTaskIds: [],
  completedTaskIds: [],
  deferredTaskIds: [],
  failedTaskIds: ["task-complete-item"],
  pendingTaskIds: [],
  proposedTaskIds: [],
  skippedTaskIds: [],
  totalTasks: 1,
  ...overrides,
});

const sampleContext = (overrides: Partial<AgentPromptContext> = {}): AgentPromptContext => ({
  checklists: [],
  now: "2026-06-01T23:30:00.000+08:00",
  pendingAction: null,
  plans: [],
  ...overrides,
});

test("buildStrategyFeedbackMemoryDraft distills avoid-recent-failure into workflow rule memory", () => {
  const observation = buildTaskObservation(sampleTask(), {
    error: "找不到清单项：矩阵习题",
    message: "执行失败，等待重规划或用户处理。",
    status: "failed",
  });
  const evaluation = buildExecutionEvaluation({
    canReplan: true,
    context: sampleContext({
      agentRuns: [
        {
          completedAt: "2026-06-01T10:00:00.000Z",
          id: 401,
          relatedPlanTitle: "线性代数",
          startedAt: "2026-06-01T09:59:00.000Z",
          status: "failed",
          summary: "complete_plan_item 找不到清单项",
          title: "完成清单失败",
          workflow: "complete_plan_item",
        },
        {
          completedAt: "2026-06-01T11:00:00.000Z",
          id: 402,
          relatedPlanTitle: "线性代数",
          startedAt: "2026-06-01T10:59:00.000Z",
          status: "failed",
          summary: "complete_plan_item 再次失败",
          title: "完成清单失败",
          workflow: "complete_plan_item",
        },
      ],
    }),
    observations: [observation],
    pendingAction: null,
    proposals: [],
    queueState: sampleQueueState(),
  });

  const memory = buildStrategyFeedbackMemoryDraft({
    evaluation,
    observations: [observation],
    originalMessage: "完成线性代数的矩阵习题",
  });

  assert.ok(memory);
  assert.equal(memory.type, "workflow_rule");
  assert.equal(memory.status, "active");
  assert.equal(memory.visibility, "private");
  assert.equal(memory.sourceRun, 401);
  assert.ok(memory.title);
  assert.match(memory.title, /策略反馈：complete_plan_item/);
  assert.match(memory.content, /complete_plan_item/);
  assert.match(memory.content, /找不到清单项/);
  assert.match(memory.content, /不要直接重复自动重规划/);
  assert.match(memory.content, /先核对目标/);
  assert.ok((memory.confidence as number) >= 0.75);
});

test("buildStrategyFeedbackMemoryDraft ignores neutral strategies", () => {
  const observation = buildTaskObservation(sampleTask(), {
    message: "已完成。",
    status: "answered",
  });
  const evaluation = buildExecutionEvaluation({
    observations: [observation],
    pendingAction: null,
    proposals: [],
    queueState: sampleQueueState({
      completedTaskIds: ["task-complete-item"],
      failedTaskIds: [],
    }),
  });

  assert.equal(
    buildStrategyFeedbackMemoryDraft({
      evaluation,
      observations: [observation],
      originalMessage: "完成线性代数的矩阵习题",
    }),
    null,
  );
});
