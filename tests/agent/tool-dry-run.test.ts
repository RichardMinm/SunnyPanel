import assert from "node:assert/strict";
import { test } from "node:test";

import { dryRunAgentIntent } from "../../src/lib/agent/safety";
import { runDryRunAndProposeStep } from "../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { dryRunAgentTool, type AgentToolDryRunContext } from "../../src/lib/agent/tool-registry";
import { isRollbackPayloadExecutable } from "../../src/lib/agent/rollback-parse";

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

  assert.equal(result!.type, "proposed_action");

  if (result!.type === "proposed_action") {
    assert.equal(result!.action.changes[0]?.collection, "checklists");
    assert.equal(result!.action.changes[0]?.documentId, 101);
    assert.equal(result!.action.changes[0]?.operation, "update");
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

  assert.equal(result!.type, "clarify");

  if (result!.type === "clarify") {
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

  assert.equal(result!.type, "proposed_action");

  if (result!.type === "proposed_action") {
    assert.equal(result!.action.intent, "append_plan_item");
    assert.equal(result!.action.id, "append-missing-group-action");
    assert.match(result!.action.summary, /新建分组/);
    assert.match(result!.action.changes[0]?.preview ?? "", /新建分组「线性代数」/);
    assert.deepEqual(result!.action.afterSnapshot, {
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

  assert.equal(result!.type, "proposed_action");

  if (result!.type === "proposed_action") {
    assert.equal(result!.action.changes[0]?.collection, "plans");
    assert.equal(result!.action.changes[0]?.operation, "create");
    assert.match(result!.action.changes[0]?.preview ?? "", /创建私有草稿计划/);
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

  assert.equal(result!.type, "proposed_action");

  if (result!.type === "proposed_action") {
    assert.equal(result!.action.riskLevel, "high");
    assert.equal(
      result!.action.changes.some((change) => change.collection === "timeline-events" && change.timelineAffected),
      true,
    );
  }
});

test("complete item dry-run uses a rollback strategy that rollback.ts can execute", async () => {
  const result = await dryRunAgentTool(
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

  assert.equal(result!.type, "proposed_action");

  if (result!.type === "proposed_action") {
    // 之前误用了 rollback.ts 不支持的 restore_checklist_item_and_timeline。
    assert.equal(
      (result!.action.rollbackPayload as { strategy?: string }).strategy,
      "restore_checklist_groups_and_timeline",
    );
    assert.equal(
      (result!.action.rollbackPayload as { target?: { collection?: string } }).target?.collection,
      "checklists",
    );
  }
});

test("query_plan_progress dry-run is read-only and records no write changes", async () => {
  const result = await dryRunAgentTool(
    {
      args: { planTitle: "考研数学" },
      intent: "query_plan_progress",
    },
    {
      planCandidates: [{ id: 7, priority: "high", state: "active", title: "考研数学二" }],
    },
  );

  assert.equal(result!.type, "proposed_action");

  if (result!.type === "proposed_action") {
    assert.equal(result!.action.requiresConfirmation, false);
    assert.deepEqual(result!.action.changes, []);
    assert.deepEqual(result!.action.affectedDocuments, []);
  }
});

test("reschedule dry-run captures the real before snapshot and an executable rollback payload", async () => {
  const result = await dryRunAgentTool(
    {
      args: { itemId: 55, newDate: "2026-06-20" },
      intent: "reschedule_item",
    },
    {
      resolveScheduleItem: async (itemId) => ({
        date: "2026-06-14",
        endTime: "11:00",
        id: itemId,
        isAllDay: false,
        priority: "medium",
        startTime: "09:30",
        status: "planned",
        title: "复习线性代数",
      }),
    },
  );

  assert.equal(result!.type, "proposed_action");

  if (result!.type === "proposed_action") {
    const before = result!.action.beforeSnapshot as Record<string, unknown>;
    assert.equal(before.date, "2026-06-14");
    assert.equal(before.startTime, "09:30");
    assert.equal(before.title, "复习线性代数");
    // 携带真实快照后，预览阶段的 rollbackPayload 应当可执行。
    assert.equal(isRollbackPayloadExecutable(result!.action.rollbackPayload), true);
  }
});

test("cancel dry-run reflects the real current status instead of a hardcoded value", async () => {
  const result = await dryRunAgentTool(
    {
      args: { itemId: 88 },
      intent: "cancel_schedule_item",
    },
    {
      resolveScheduleItem: async (itemId) => ({
        date: "2026-06-14",
        id: itemId,
        priority: "low",
        status: "done",
        title: "晨间复盘",
      }),
    },
  );

  assert.equal(result!.type, "proposed_action");

  if (result!.type === "proposed_action") {
    const before = result!.action.beforeSnapshot as { status?: string };
    assert.equal(before.status, "done");
    assert.match(result!.action.changes[0]?.beforePreview ?? "", /done/);
    assert.equal(isRollbackPayloadExecutable(result!.action.rollbackPayload), true);
  }
});

test("low-risk write dry-run forwards an action id without asking for confirmation", async () => {
  const result = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context: {
      checklists: [],
      now: "2026-06-22T08:00:00.000+08:00",
      pendingAction: null,
      plans: [],
    },
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: {
      findByID: async () => ({
        date: "2026-06-22",
        id: 88,
        priority: "medium",
        sourceType: "manual",
        status: "planned",
        title: "晨间复盘",
      }),
    } as never,
    persistAgentTurn: async () => {
      throw new Error("low-risk write must continue to execution");
    },
    pushTrace: () => undefined,
    resolution: {
      engine: "heuristic",
      intent: {
        args: { itemId: 88 },
        intent: "cancel_schedule_item",
      },
    },
    tokenUsage: {
      contextTokens: 0,
      inputTokens: 1,
      outputTokens: 0,
      source: "estimate",
      totalTokens: 1,
    },
    trace: [],
    user: { id: 1 },
  });

  assert.equal(result.outcome, "execute");
  if (result.outcome === "execute") {
    assert.equal(typeof result.data.approvedActionId, "string");
  }
});
