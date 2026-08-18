import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isCancellationReply,
  isConfirmationReply,
  resolveAgentIntent,
} from "../../src/lib/agent/intent-resolution";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { FrozenWeeklyReviewProposal } from "../../src/lib/agent/review/model-schemas";
import {
  buildProposedActionMessage,
  createIntentFromProposedAction,
  createProposedAgentAction,
  dryRunAgentIntent,
  getAgentIntentRiskLevel,
} from "../../src/lib/agent/safety";
import type { AgentIntent, PendingAction } from "../../src/lib/agent/schemas";
import type { AgentToolDryRunContext } from "../../src/lib/agent/tool-registry";

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-05-06T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

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

const frozenWeeklyReviewProposal: FrozenWeeklyReviewProposal = {
  assistantMessage: "本周完成：完成首页改版\n风险：存在逾期计划\n叙事缺口：缺少里程碑记录\n下周建议：先关闭逾期计划",
  completed: ["完成首页改版"],
  createSuggestions: true,
  health: "risk",
  metrics: {
    completedPlans: 1,
    overduePlans: 1,
  },
  narrativeGaps: ["缺少里程碑记录"],
  recommendations: ["先关闭逾期计划"],
  reviewedAt: "2026-05-06T00:00:00.000Z",
  risks: ["存在逾期计划"],
  scope: "overall",
  snapshotFingerprint: "a".repeat(64),
  source: "deterministic",
  suggestionDrafts: [],
  summary: "本周完成：完成首页改版；风险：存在逾期计划。",
  title: "Weekly Review · 2026-05-06",
};

const dryRunContext: AgentToolDryRunContext = {
  createActionId: () => "test-action-id",
  detectScheduleConflicts: async () => [],
  findTimelineEvent: async () => null,
  now: "2026-05-06T00:00:00.000+08:00",
  planCandidates: [
    {
      id: 201,
      priority: "high",
      state: "active",
      title: "整体计划",
    },
  ],
  prepareWeeklyReviewProposal: async () => frozenWeeklyReviewProposal,
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

test("low-risk intents do not require confirmation proposals", async () => {
  const lowRiskIntents: AgentIntent[] = [
    {
      args: {
        answer: "只回答问题。",
        suggestAction: null,
      },
      intent: "answer_question",
    },
    {
      args: {
        checklistTitle: null,
        scope: "all",
      },
      intent: "query_progress",
    },
    {
      args: {
        planTitle: null,
      },
      intent: "evaluate_plan",
    },
    {
      args: {
        missingFields: ["title"],
        question: "还需要计划标题。",
      },
      intent: "clarify",
    },
  ];

  for (const intent of lowRiskIntents) {
    assert.equal(getAgentIntentRiskLevel(intent.intent), "low");
    assert.equal(await createProposedAgentAction(intent), null);
    assert.deepEqual(await dryRunAgentIntent(intent), {
      type: "bypass",
    });
  }
});

test("low-risk writes keep their dry-run action id but still require confirmation", async () => {
  const result = await dryRunAgentIntent(
    {
      args: { itemId: 88 },
      intent: "cancel_schedule_item",
    },
    {
      createActionId: () => "cancel-action-88",
      resolveScheduleItem: async (itemId) => ({
        date: "2026-06-22",
        id: itemId,
        priority: "medium",
        status: "planned",
        title: "晨间复盘",
      }),
    },
  );

  assert.equal(result.type, "proposed_action");
  if (result.type === "proposed_action") {
    assert.equal(result.action.id, "cancel-action-88");
    assert.equal(result.action.requiresConfirmation, true);
  }
});

test("medium-risk write intents are converted into confirmation proposals", async () => {
  const createPlanIntent: AgentIntent = {
    args: {
      title: "整理计算机组成原理复习路径",
    },
    intent: "create_plan",
  };
  const appendItemIntent: AgentIntent = {
    args: {
      checklistTitle: "高等数学",
      description: null,
      groupTitle: "映射与函数",
      itemTitle: "反函数习题复盘",
    },
    intent: "append_plan_item",
  };
  const saveMemoryIntent: AgentIntent = {
    args: {
      confidence: 0.8,
      content: "用户偏好回答先给结论，再给必要细节。",
      title: "回答风格偏好",
      type: "preference",
    },
    intent: "save_memory",
  };

  const createProposal = await createProposedAgentAction(createPlanIntent, dryRunContext);
  const appendProposal = await createProposedAgentAction(appendItemIntent, dryRunContext);
  const memoryProposal = await createProposedAgentAction(saveMemoryIntent, dryRunContext);

  assert.ok(createProposal);
  assert.ok(appendProposal);
  assert.ok(memoryProposal);
  assert.equal(createProposal.riskLevel, "medium");
  assert.equal(appendProposal.riskLevel, "medium");
  assert.equal(memoryProposal.riskLevel, "medium");
  assert.equal(createProposal.requiresConfirmation, true);
  assert.equal(appendProposal.requiresConfirmation, true);
  assert.equal(memoryProposal.requiresConfirmation, true);
  assert.equal(createProposal.changes[0]?.collection, "plans");
  assert.equal(appendProposal.changes[0]?.collection, "checklists");
  assert.equal(memoryProposal.changes[0]?.collection, "agent-memories");
  assert.equal(appendProposal.changes[0]?.documentId, 101);
  assert.equal(appendProposal.changes[0]?.visibility, "private");
  assert.match(buildProposedActionMessage(memoryProposal), /我可以把这个偏好记住/);
  assert.match(buildProposedActionMessage(createProposal), /风险等级：中风险/);
});

test("compose_plan creates rich proposed action", async () => {
  const proposal = await createProposedAgentAction(
    {
      args: {
        sourceText: "两个月内完成计算机组成原理一轮复习，并形成错题复盘节奏",
      },
      intent: "compose_plan",
    },
    dryRunContext,
  );

  assert.ok(proposal);
  assert.equal(proposal.intent, "compose_plan");
  assert.equal(proposal.changes[0]?.collection, "plans");
  assert.equal(proposal.requiresConfirmation, true);
  assert.match(proposal.changes[0]?.afterPreview ?? "", /关键步骤/);

  const restoredIntent = createIntentFromProposedAction(proposal);

  assert.equal(restoredIntent?.intent, "compose_plan");
  assert.ok(restoredIntent?.intent === "compose_plan" && restoredIntent.args.proposal?.agentBrief);
});

test("vague compose_plan asks clarification", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        sourceText: "帮我制定计划",
      },
      intent: "compose_plan",
    },
    dryRunContext,
  );

  assert.equal(result.type, "clarify");

  if (result.type === "clarify") {
    assert.match(result.assistantMessage, /目标/);
  }
});

test("compose_schedule_item auto-adjusts to the next available slot on timed conflicts", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        sourceText: "把这个计划放到明天上午，安排 90 分钟",
      },
      intent: "compose_schedule_item",
    },
    {
      ...dryRunContext,
      detectScheduleConflicts: async () => [
        {
          endTime: "10:00",
          id: 301,
          startTime: "09:30",
          title: "已有复习块",
        },
      ],
    },
  );

  assert.equal(result.type, "proposed_action");

  if (result.type === "proposed_action") {
    assert.equal(result.action.intent, "compose_schedule_item");
    assert.equal(result.action.riskLevel, "medium");
    assert.equal(result.action.changes[0]?.collection, "schedule-items");
    assert.match(result.action.changes[0]?.preview ?? "", /自动避让/);
    assert.match(result.action.changes[0]?.beforePreview ?? "", /已有复习块/);
    assert.equal(
      typeof result.action.afterSnapshot === "object" && result.action.afterSnapshot !== null
        ? (result.action.afterSnapshot as { startTime?: string }).startTime
        : null,
      "10:00",
    );
    assert.equal(
      typeof result.action.afterSnapshot === "object" && result.action.afterSnapshot !== null
        ? (result.action.afterSnapshot as { endTime?: string }).endTime
        : null,
      "11:30",
    );
  }
});

test("compose_schedule_item without date asks clarification", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        sourceText: "安排复盘反函数习题",
      },
      intent: "compose_schedule_item",
    },
    dryRunContext,
  );

  assert.equal(result.type, "clarify");

  if (result.type === "clarify") {
    assert.match(result.assistantMessage, /哪一天/);
  }
});

test("weekly review preview bypasses confirmation but saved review requires confirmation", async () => {
  const previewResult = await dryRunAgentIntent({
    args: {
      createSuggestions: true,
      persistReview: false,
    },
    intent: "weekly_review",
  });
  const savedProposal = await createProposedAgentAction(
    {
      args: {
        createSuggestions: true,
        persistReview: true,
      },
      intent: "weekly_review",
    },
    dryRunContext,
  );

  assert.equal(previewResult.type, "bypass");
  assert.equal(previewResult.action?.requiresConfirmation, false);
  assert.deepEqual(previewResult.action?.affectedDocuments, []);
  assert.ok(savedProposal);
  assert.equal(savedProposal.riskLevel, "medium");
  assert.equal(savedProposal.requiresConfirmation, true);
  assert.equal(savedProposal.changes[0]?.collection, "plan-reviews");
  assert.match(buildProposedActionMessage(savedProposal), /保存本周复盘/);

  const restoredIntent = createIntentFromProposedAction(savedProposal);

  assert.equal(restoredIntent?.intent, "weekly_review");
  assert.deepEqual(restoredIntent?.args, {
    createSuggestions: true,
    now: null,
    persistReview: true,
    proposal: frozenWeeklyReviewProposal,
  });
});

test("cancellation clears pending confirmation", async () => {
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

  const pendingAction: PendingAction = {
    action: proposal,
    type: "await_confirmation",
  };
  const nextPendingAction = isCancellationReply("取消") ? null : pendingAction;

  assert.equal(nextPendingAction, null);
});

test("unrelated reply keeps awaiting confirmation", async () => {
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

  const pendingAction: PendingAction = {
    action: proposal,
    type: "await_confirmation",
  };
  const reply = "我想再想一下";
  const nextPendingAction = isConfirmationReply(reply) || isCancellationReply(reply) ? null : pendingAction;

  assert.equal(nextPendingAction, pendingAction);
});

test("append plan item restore preserves semantic repair group creation flag", async () => {
  const proposal = await createProposedAgentAction(
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

  assert.ok(proposal);

  const restoredIntent = createIntentFromProposedAction(proposal);

  assert.equal(restoredIntent?.intent, "append_plan_item");
  assert.equal(
    restoredIntent?.intent === "append_plan_item" ? restoredIntent.args.createGroupIfMissing : false,
    true,
  );
});

test("public timeline composer writes require confirmation", async () => {
  const proposal = await createProposedAgentAction(
    {
      args: {
        createEvent: true,
        sourceId: 7,
        sourceText: "Agent Inbox 让建议从临时 prompt 变成可追踪队列。",
        sourceTitle: "发布 Agent Inbox",
        sourceType: "update",
        visibility: "public",
      },
      intent: "compose_timeline_event",
    },
    dryRunContext,
  );

  assert.ok(proposal);
  assert.equal(proposal.riskLevel, "high");
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(proposal.changes[0]?.collection, "timeline-events");
  assert.match(proposal.changes[0]?.preview ?? "", /Visibility：public/);
  assert.match(proposal.changes[0]?.preview ?? "", /Featured：yes/);

  const restoredIntent = createIntentFromProposedAction(proposal);

  assert.equal(restoredIntent?.intent, "compose_timeline_event");
});

test("ambiguous timeline composer source asks for clarification", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        createEvent: true,
        sourceType: "update",
      },
      intent: "compose_timeline_event",
    },
    dryRunContext,
  );

  assert.equal(result.type, "clarify");

  if (result.type === "clarify") {
    assert.match(result.assistantMessage, /来源/);
  }
});

test("high-risk completion intents include timeline impact and can be restored after confirmation", async () => {
  const completionIntent: AgentIntent = {
    args: {
      checklistTitle: "高等数学",
      completedAt: null,
      completionNote: null,
      groupTitle: "映射与函数",
      itemTitle: "反函数习题",
    },
    intent: "complete_plan_item",
  };
  const proposal = await createProposedAgentAction(completionIntent, dryRunContext);

  assert.ok(proposal);
  assert.equal(proposal.riskLevel, "high");
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(proposal.changes.some((change) => change.collection === "timeline-events" && change.timelineAffected), true);

  const restoredIntent = createIntentFromProposedAction(proposal);

  assert.equal(restoredIntent?.intent, "complete_plan_item");
  assert.deepEqual(restoredIntent?.args, {
    ...completionIntent.args,
    groupTitle: "映射与函数",
    itemTitle: "反函数习题",
  });
});

test("dry-run returns clarification when checklist target is ambiguous", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        checklistTitle: "高等数学",
        completedAt: null,
        completionNote: null,
        groupTitle: null,
        itemTitle: "反函数习题",
      },
      intent: "complete_plan_item",
    },
    {
      resolveChecklistItem: async () => ({
        question: "我在「高等数学」里找到了多个接近「反函数习题」的条目。你想操作哪一个？",
        resolved: null,
      }),
    },
  );

  assert.equal(result.type, "clarify");

  if (result.type === "clarify") {
    assert.equal(result.pendingAction?.type, "await_clarification");
    assert.match(result.assistantMessage, /多个接近/);
  }
});

test("destructive requests are clarified and never converted into proposed actions", async () => {
  const result = await resolveAgentIntent({
    context,
    history: [],
    message: "把所有内容删掉",
    modelResolver: async () => null,
    pendingAction: null,
  });

  assert.equal(result.intent.intent, "clarify");
  assert.equal(await createProposedAgentAction(result.intent), null);
});

test("registered write intents return their configured risk level", () => {
  assert.equal(getAgentIntentRiskLevel("create_plan"), "medium");
  assert.equal(getAgentIntentRiskLevel("complete_plan_item"), "high");
  assert.equal(getAgentIntentRiskLevel("compose_schedule_item"), "medium");
  assert.equal(getAgentIntentRiskLevel("compose_timeline_event"), "high");
  assert.equal(getAgentIntentRiskLevel("save_memory"), "medium");
});

test("read-only intents return low risk", () => {
  assert.equal(getAgentIntentRiskLevel("query_progress"), "low");
  assert.equal(getAgentIntentRiskLevel("evaluate_plan"), "low");
  assert.equal(getAgentIntentRiskLevel("clarify"), "low");
});

test("unknown intent that is not a write intent returns low", () => {
  assert.equal(getAgentIntentRiskLevel("some_unknown_read_intent" as never), "low");
});
