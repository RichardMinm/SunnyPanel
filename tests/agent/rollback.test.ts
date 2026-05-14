import assert from "node:assert/strict";
import { test } from "node:test";

import { createProposedAgentAction } from "../../src/lib/agent/safety";
import { isRollbackPayloadExecutable, parseRollbackPayload } from "../../src/lib/agent/rollback-parse";
import type { AgentToolDryRunContext } from "../../src/lib/agent/tool-registry";

const fakeChecklist = {
  createdAt: "2026-05-06T00:00:00.000Z",
  groups: [
    {
      items: [
        {
          completedAt: null,
          completionNote: null,
          id: "item-1",
          isCompleted: false,
          title: "反函数习题",
        },
      ],
      title: "映射与函数",
    },
  ],
  id: 101,
  slug: "higher-math",
  status: "draft",
  title: "高等数学",
  updatedAt: "2026-05-06T00:00:00.000Z",
  visibility: "private",
};

const dryRunContext: AgentToolDryRunContext = {
  createActionId: () => "rollback-action-id",
  findTimelineEvent: async () => null,
  resolveChecklistGroupForAppend: async () => ({
    question: null,
    resolved: {
      checklist: fakeChecklist as never,
      group: fakeChecklist.groups[0] as never,
      groupIndex: 0,
    },
  }),
  resolveChecklistItem: async () => ({
    question: null,
    resolved: {
      checklist: fakeChecklist as never,
      group: fakeChecklist.groups[0] as never,
      groupIndex: 0,
      item: fakeChecklist.groups[0].items[0] as never,
      itemIndex: 0,
    },
  }),
};

test("rollback payload generated for create", async () => {
  const proposal = await createProposedAgentAction(
    {
      args: {
        title: "整理计算机组成原理复习路径",
      },
      intent: "create_plan",
    },
    dryRunContext,
  );

  assert.ok(proposal);
  assert.equal(proposal.rollbackAvailable, false);
  assert.deepEqual(proposal.rollbackPayload, {
    reason: "计划创建前没有 documentId；执行成功后可用 created document id 准备删除式回滚。",
    strategy: "delete_created_document",
    target: {
      collection: "plans",
      documentId: null,
    },
  });
});

test("rollback payload generated for update", async () => {
  const proposal = await createProposedAgentAction(
    {
      args: {
        checklistTitle: "高等数学",
        description: null,
        groupTitle: "映射与函数",
        itemTitle: "反函数习题复盘",
      },
      intent: "append_plan_item",
    },
    dryRunContext,
  );

  assert.ok(proposal);
  assert.equal(proposal.rollbackAvailable, true);
  assert.deepEqual(proposal.rollbackPayload, {
    strategy: "restore_checklist_groups",
    target: {
      collection: "checklists",
      documentId: 101,
    },
  });
});

test("parseRollbackPayload reads delete_created_document", () => {
  const parsed = parseRollbackPayload({
    reason: "test",
    strategy: "delete_created_document",
    target: {
      collection: "plans",
      documentId: 42,
    },
  });

  assert.ok(parsed);
  assert.equal(parsed.reason, "test");
  assert.equal(parsed.strategy, "delete_created_document");
  assert.equal(parsed.target?.collection, "plans");
  assert.equal(parsed.target?.documentId, 42);
});

test("isRollbackPayloadExecutable matches supported delete flows", () => {
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "delete_created_document",
      target: { collection: "plans", documentId: 1 },
    }),
    true,
  );
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "delete_created_document",
      target: { collection: "schedule-items", documentId: 2 },
    }),
    true,
  );
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "delete_created_timeline_event",
      target: { collection: "timeline-events", documentId: 3 },
    }),
    true,
  );
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "delete_created_document",
      target: { collection: "plans", documentId: null },
    }),
    false,
  );
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "restore_checklist_groups",
      target: { collection: "checklists", documentId: 101 },
    }),
    false,
    "restore_checklist_groups without beforeSnapshot is not executable",
  );
});

test("archive_created_memory is executable with documentId", () => {
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "archive_created_memory",
      target: { collection: "agent-memories", documentId: 5 },
    }),
    true,
  );
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "archive_created_memory",
      target: { collection: "agent-memories", documentId: null },
    }),
    false,
  );
});

test("restore_checklist_groups is executable with beforeSnapshot", () => {
  assert.equal(
    isRollbackPayloadExecutable({
      beforeSnapshot: { groups: [] },
      strategy: "restore_checklist_groups",
      target: { collection: "checklists", documentId: 101 },
    }),
    true,
  );
  assert.equal(
    isRollbackPayloadExecutable({
      strategy: "restore_checklist_groups",
      target: { collection: "checklists", documentId: 101 },
    }),
    false,
    "without beforeSnapshot",
  );
});

test("parseRollbackPayload reads beforeSnapshot and extended target fields", () => {
  const parsed = parseRollbackPayload({
    beforeSnapshot: { groups: [{ title: "test" }] },
    strategy: "restore_checklist_groups",
    target: {
      collection: "checklists",
      documentId: 101,
    },
  });

  assert.ok(parsed);
  assert.equal(parsed.strategy, "restore_checklist_groups");
  assert.ok(parsed.beforeSnapshot);
  assert.deepEqual((parsed.beforeSnapshot as Record<string, unknown>).groups, [{ title: "test" }]);
});
