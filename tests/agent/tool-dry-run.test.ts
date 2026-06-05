import assert from "node:assert/strict";
import { test } from "node:test";

import { dryRunAgentIntent } from "../../src/lib/agent/safety";
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
  createActionId: () => "tool-dry-run-action-id",
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

test("dry-run resolves target checklist", async () => {
  const result = await dryRunAgentIntent(
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

  assert.equal(result.type, "proposed_action");

  if (result.type === "proposed_action") {
    assert.equal(result.action.changes[0]?.collection, "checklists");
    assert.equal(result.action.changes[0]?.documentId, 101);
    assert.equal(result.action.changes[0]?.operation, "update");
  }
});

test("ambiguous checklist returns clarify", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        checklistTitle: "高等数学",
        description: null,
        groupTitle: null,
        itemTitle: "反函数习题复盘",
      },
      intent: "append_plan_item",
    },
    {
      resolveChecklistGroupForAppend: async () => ({
        question: "「高等数学」有多个分组：映射与函数、极限。这条计划项要放到哪个分组？",
        resolved: null,
      }),
    },
  );

  assert.equal(result.type, "clarify");

  if (result.type === "clarify") {
    assert.equal(result.pendingAction?.type, "await_clarification");
    assert.match(result.assistantMessage, /多个分组/);
  }
});

test("semantic repair append can propose creating a missing checklist group", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        checklistTitle: "高等数学",
        createGroupIfMissing: true,
        description: "语义修复：先补建条目。",
        groupTitle: "线性代数",
        itemTitle: "矩阵习题",
      },
      intent: "append_plan_item",
    },
    {
      createActionId: () => "append-missing-group-action",
      resolveChecklistGroupForAppend: async () => ({
        checklist: fakeChecklist as never,
        question: "我在「高等数学」里没找到「线性代数」这个分组。",
        resolved: null,
      }),
    },
  );

  assert.equal(result.type, "proposed_action");

  if (result.type === "proposed_action") {
    assert.equal(result.action.intent, "append_plan_item");
    assert.equal(result.action.id, "append-missing-group-action");
    assert.match(result.action.summary, /新建分组/);
    assert.match(result.action.changes[0]?.preview ?? "", /新建分组「线性代数」/);
    assert.deepEqual(result.action.afterSnapshot, {
      appendedItem: {
        description: "语义修复：先补建条目。",
        isCompleted: false,
        title: "矩阵习题",
      },
      checklistId: 101,
      checklistTitle: "高等数学",
      createdGroup: true,
      groupTitle: "线性代数",
    });
  }
});

test("dry-run preview includes collection and operation", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        title: "整理计算机组成原理复习路径",
      },
      intent: "create_plan",
    },
    dryRunContext,
  );

  assert.equal(result.type, "proposed_action");

  if (result.type === "proposed_action") {
    assert.equal(result.action.changes[0]?.collection, "plans");
    assert.equal(result.action.changes[0]?.operation, "create");
    assert.match(result.action.changes[0]?.preview ?? "", /创建私有草稿计划/);
  }
});

test("complete item preview includes timeline impact", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        checklistTitle: "高等数学",
        completedAt: null,
        completionNote: null,
        groupTitle: "映射与函数",
        itemTitle: "反函数习题",
      },
      intent: "complete_plan_item",
    },
    dryRunContext,
  );

  assert.equal(result.type, "proposed_action");

  if (result.type === "proposed_action") {
    assert.equal(result.action.riskLevel, "high");
    assert.equal(
      result.action.changes.some((change) => change.collection === "timeline-events" && change.timelineAffected),
      true,
    );
  }
});
