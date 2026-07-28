import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRollbackConsumedAgentRunPatch,
  canRollbackAgentRunDetail,
  formatAgentRunRollbackAction,
  toAgentRunDetail,
  toAgentRunSummary,
} from "../../src/lib/agent/run-summary";

test("toAgentRunSummary exposes rollback impact for recent runs", () => {
  assert.deepEqual(
    toAgentRunSummary({
      affectedDocuments: [
        {
          collection: "checklists",
          documentId: 101,
          operation: "update",
          visibility: "unknown",
        },
        {
          collection: "timeline-events",
          documentId: 501,
          operation: "delete",
          visibility: "unknown",
        },
      ],
      beforeSnapshot: {
        note: "rollback_executed",
      },
      id: 9,
      startedAt: "2026-06-01T03:00:00.000Z",
      status: "succeeded",
      summary: "已执行回滚 restore_checklist_groups_and_timeline，影响 2 个对象。",
      title: "Agent rollback executed · restore_checklist_groups_and_timeline",
      workflow: "sync",
    }),
    {
      affectedDocuments: [
        {
          collection: "checklists",
          documentId: 101,
          operation: "update",
          visibility: "unknown",
        },
        {
          collection: "timeline-events",
          documentId: 501,
          operation: "delete",
          visibility: "unknown",
        },
      ],
      id: 9,
      impactSummary: "影响 2 个对象：清单 #101 已恢复；时间线 #501 已删除",
      runKind: "rollback",
      startedAt: "2026-06-01T03:00:00.000Z",
      status: "succeeded",
      summary: "已执行回滚 restore_checklist_groups_and_timeline，影响 2 个对象。",
      title: "Agent rollback executed · restore_checklist_groups_and_timeline",
      workflow: "sync",
    },
  );
});

test("toAgentRunSummary keeps ordinary runs without rollback impact", () => {
  assert.deepEqual(
    toAgentRunSummary({
      id: 10,
      status: "failed",
      summary: "日程创建失败。",
      title: "Create schedule",
      workflow: "planning",
    }),
    {
      id: 10,
      runKind: "write",
      status: "failed",
      summary: "日程创建失败。",
      title: "Create schedule",
      workflow: "planning",
    },
  );
});

test("toAgentRunDetail exposes trace fields but omits executable rollback payload", () => {
  assert.deepEqual(
    toAgentRunDetail({
      affectedDocuments: [
        {
          collection: "plans",
          documentId: 42,
          operation: "create",
          visibility: "private",
        },
      ],
      afterSnapshot: {
        title: "线性代数复习计划",
      },
      beforeSnapshot: null,
      completedAt: "2026-06-01T03:00:05.000Z",
      durationMs: 5200,
      goal: "创建学习计划并记录审计。",
      id: 11,
      nextAction: "安排到下周日程。",
      rollbackAvailable: true,
      rollbackPayload: {
        strategy: "delete_created_document",
        target: {
          collection: "plans",
          documentId: 42,
        },
      },
      startedAt: "2026-06-01T03:00:00.000Z",
      status: "succeeded",
      steps: [
        {
          level: "info",
          message: "CREATE_PLAN_EXECUTED plan#42",
          recordedAt: "2026-06-01T03:00:03.000Z",
        },
      ],
      summary: "已创建计划。",
      title: "创建计划「线性代数复习计划」",
      workflow: "planning",
    }),
    {
      affectedDocuments: [
        {
          collection: "plans",
          documentId: 42,
          operation: "create",
          visibility: "private",
        },
      ],
      afterSnapshot: {
        title: "线性代数复习计划",
      },
      beforeSnapshot: null,
      completedAt: "2026-06-01T03:00:05.000Z",
      durationMs: 5200,
      goal: "创建学习计划并记录审计。",
      id: 11,
      impactSummary: "影响 1 个对象：计划 #42 已创建",
      nextAction: "安排到下周日程。",
      rollbackAvailable: true,
      runKind: "write",
      startedAt: "2026-06-01T03:00:00.000Z",
      status: "succeeded",
      steps: [
        {
          level: "info",
          message: "CREATE_PLAN_EXECUTED plan#42",
          recordedAt: "2026-06-01T03:00:03.000Z",
        },
      ],
      summary: "已创建计划。",
      title: "创建计划「线性代数复习计划」",
      workflow: "planning",
    },
  );
});

test("canRollbackAgentRunDetail uses only public availability and positive source run ID", () => {
  const run = toAgentRunDetail({
    id: 12,
    rollbackAvailable: true,
    rollbackPayload: {
      strategy: "delete_created_document",
      target: {
        collection: "plans",
        documentId: 42,
      },
    },
    status: "succeeded",
    title: "创建计划",
    workflow: "planning",
  });

  assert.equal(canRollbackAgentRunDetail(run), true);
  assert.equal(formatAgentRunRollbackAction(run), "撤销这次执行");

  assert.equal(
    canRollbackAgentRunDetail({
      ...run,
      rollbackAvailable: false,
    }),
    false,
  );
  assert.equal(
    canRollbackAgentRunDetail({
      ...run,
      id: 0,
    }),
    false,
  );
});

test("buildRollbackConsumedAgentRunPatch disables repeated rollback and appends audit step", () => {
  const run = toAgentRunDetail({
    id: 12,
    rollbackAvailable: true,
    rollbackPayload: {
      strategy: "delete_created_document",
      target: {
        collection: "plans",
        documentId: 42,
      },
    },
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: "CREATE_PLAN_EXECUTED plan#42",
        recordedAt: "2026-06-01T03:00:03.000Z",
      },
    ],
    title: "创建计划",
    workflow: "planning",
  });

  assert.deepEqual(
    buildRollbackConsumedAgentRunPatch(
      run,
      {
        collection: "plans",
        documentId: 42,
        strategy: "delete_created_document",
        summary: "已执行回滚 delete_created_document，影响 1 个对象：plans #42 已删除",
      },
      "2026-06-01T03:10:00.000Z",
    ),
    {
      nextAction: "已执行撤销：已执行回滚 delete_created_document，影响 1 个对象：plans #42 已删除",
      rollbackAvailable: false,
      steps: [
        {
          level: "info",
          message: "CREATE_PLAN_EXECUTED plan#42",
          recordedAt: "2026-06-01T03:00:03.000Z",
        },
        {
          level: "warn",
          message: "ROLLBACK_CONSUMED sourceRun#12 strategy=delete_created_document",
          recordedAt: "2026-06-01T03:10:00.000Z",
        },
      ],
    },
  );
});
