import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProposedAgentAction, PendingAction } from "../../../src/lib/agent/schemas";
import type { ScheduleConflictSuggestion } from "../../../src/lib/agent/schedule/conflict-suggestions";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";
import { attachSchedulingDraftToLastAssistantMessage } from "../../../src/lib/agent/schedule/draft-message";
import { formatScheduleQueryAssistantMessage } from "../../../src/lib/agent/schedule/query-summary";

const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const approvalCardPath = "src/components/dashboard/agent/AgentApprovalCard.tsx";

const loadActionResultCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/ActionResultCard")).ActionResultCard;
};

const loadAgentApprovalCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/AgentApprovalCard")).AgentApprovalCard;
};

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

const loadScheduleDraftCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/ScheduleDraftCard")).ScheduleDraftCard;
};

const scheduleDraft: ScheduleDraft = {
  assumptions: ["以 6 月 30 日前完成为目标。"],
  conflicts: ["尚未检查已有日程冲突。"],
  items: [
    {
      date: "2026-06-30",
      endTime: "22:00",
      sourceTaskTitle: "上线前验证",
      startTime: "20:00",
      title: "部署验证",
    },
  ],
  nextActions: ["继续修改", "准备创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
};

const suggestions: ScheduleConflictSuggestion[] = [
  {
    action: {
      date: "2026-06-30",
      endTime: "22:00",
      itemTitle: "部署验证",
      startTime: "21:00",
      type: "move_item",
    },
    description: "仅基于 SunnyPanel 本地日程检测，未包含外部日历；准备创建时会再次检查。",
    id: "move-item-deploy-2026-06-30-21-22",
    label: "改到 2026-06-30 21:00-22:00",
    riskLevel: "low",
  },
  {
    action: { type: "allow_overlap" },
    description: "只记录允许重叠；选择后会更新草案，准备创建时会再次检查真实冲突。",
    id: "allow-overlap",
    label: "允许重叠并继续",
    riskLevel: "medium",
  },
  {
    action: { itemTitle: "部署验证", type: "remove_item" },
    description: "只是从草案移除，不删除任何真实日程项。",
    id: "remove-item-deploy",
    label: "暂不安排部署验证",
    riskLevel: "low",
  },
];

const createScheduleAction = (): ProposedAgentAction => ({
  affectedDocuments: [
    {
      collection: "schedule-items",
      operation: "create",
      title: "清单日程草案：1 项任务",
      visibility: "private",
    },
  ],
  afterSnapshot: {
    conflictSuggestions: suggestions,
    conflictSummary: {
      conflictCount: 1,
      conflictPolicy: "ask",
      existingScheduleChecked: true,
      message: "发现 1 个时间冲突。系统不会自动重排。仅基于 SunnyPanel 本地日程检测，未包含外部日历。",
      warningCount: 0,
    },
    dateRange: "2026-06-30",
    items: [
      {
        date: "2026-06-30",
        endTime: "22:00",
        startTime: "20:00",
        title: "部署验证",
      },
    ],
    scheduleConflicts: [
      {
        existingScheduleItemId: 501,
        existingTitle: "已有发布会",
        message: "「部署验证」与已有日程「已有发布会」时间重叠。",
        proposedDate: "2026-06-30",
        proposedEndTime: "22:00",
        proposedStartTime: "20:00",
        proposedTitle: "部署验证",
        severity: "warning",
        type: "existing",
      },
    ],
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceType: "checklist",
    title: "清单日程草案：1 项任务",
  },
  args: {
    conflictPolicy: "ask",
    items: [
      {
        date: "2026-06-30",
        endTime: "22:00",
        startTime: "20:00",
        title: "部署验证",
      },
    ],
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceType: "checklist",
    title: "清单日程草案：1 项任务",
  },
  beforeSnapshot: null,
  changes: [
    {
      afterPreview: "发现 1 个时间冲突。系统不会自动重排。",
      beforePreview: "当前尚未创建这些日程项。",
      collection: "schedule-items",
      operation: "create",
      preview: "创建 1 个日程项；时间范围：2026-06-30；确认后才会写入日程。",
      timelineAffected: false,
      visibility: "private",
    },
  ],
  id: "action-schedule-ui-state-contract",
  intent: "create_schedule_items",
  requiresConfirmation: true,
  riskLevel: "medium",
  rollbackAvailable: true,
  summary: "创建 1 个日程项「清单日程草案：1 项任务」",
});

const schedulePlanAction = (): ProposedAgentAction => {
  const proposal = {
    items: [
      {
        date: "2026-08-19",
        endTime: "10:30",
        isAllDay: false,
        phaseTitle: "研究阶段",
        startTime: "09:00",
        taskKey: "task-001",
        title: "[P0] 复现漏洞",
      },
      {
        date: "2026-08-20",
        endTime: null,
        isAllDay: true,
        phaseTitle: "总结阶段",
        startTime: null,
        taskKey: "task-002",
        title: "整理结论",
      },
    ],
    planFingerprint: "d".repeat(64),
    planId: 101,
    planTitle: "Fastjson 研究计划",
    source: "model" as const,
    startDate: "2026-08-19",
  };

  return {
    affectedDocuments: [{
      collection: "schedule-items",
      operation: "create",
      visibility: "private",
    }],
    afterSnapshot: { proposal },
    args: { planId: 101, proposal },
    beforeSnapshot: null,
    changes: [{
      collection: "schedule-items",
      operation: "create",
      preview: "按已冻结草案创建 2 个日程项",
      visibility: "private",
    }],
    id: "action-schedule-plan-ui-state-contract",
    intent: "schedule_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollbackAvailable: true,
    summary: "将计划「Fastjson 研究计划」的阶段任务排入日程",
  };
};

test("ScheduleDraftCard renders draft-only state without confirmation or result language", async () => {
  const ScheduleDraftCard = await loadScheduleDraftCard();
  const markup = renderToStaticMarkup(
    createElement(ScheduleDraftCard, {
      draft: scheduleDraft,
      onPrepareCreate: () => undefined,
      onRevise: () => undefined,
    }),
  );

  assert.match(markup, /日程草案/);
  assert.match(markup, /尚未写入日程/);
  assert.match(markup, /可以继续调整/);
  assert.match(markup, /准备创建时会再次检查/);
  assert.match(markup, /继续修改/);
  assert.match(markup, /准备创建日程/);
  assert.doesNotMatch(markup, /已创建日程/);
  assert.doesNotMatch(markup, /等待确认/);
  assert.doesNotMatch(markup, /确认执行/);
});

test("create_schedule_items confirmation renders pending write state", async () => {
  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: createScheduleAction(),
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /等待确认/);
  assert.match(markup, /创建日程/);
  assert.match(markup, /确认后将写入日程/);
  assert.match(markup, /将创建 1 个日程项/);
  assert.match(markup, /发现 1 个时间冲突/);
  assert.match(markup, /不会自动重排/);
  assert.doesNotMatch(markup, /已创建日程/);
  assert.doesNotMatch(markup, /尚未写入日程/);
});

test("schedule_plan confirmation renders every frozen item with exact date and time", async () => {
  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: schedulePlanAction(),
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /等待确认/);
  assert.match(markup, /Fastjson 研究计划/);
  assert.match(markup, /将创建 2 个日程项/);
  assert.match(markup, /2026-08-19 · 09:00-10:30/);
  assert.match(markup, /\[研究阶段\].*\[P0\] 复现漏洞/s);
  assert.match(markup, /2026-08-20 · 全天/);
  assert.match(markup, /总结阶段.*整理结论/s);
  assert.match(markup, /以下内容将原样写入/);
});

test("conflict suggestions explain draft-only local checks", async () => {
  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: createScheduleAction(),
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
      onScheduleConflictSuggestionSelect: () => undefined,
    }),
  );

  assert.match(markup, /可选调整建议/);
  assert.match(markup, /选择后只会更新草案/);
  assert.match(markup, /不会写入日程/);
  assert.match(markup, /准备创建时会重新检查冲突/);
  assert.match(markup, /仅基于 SunnyPanel 本地日程/);
  assert.match(markup, /改到 2026-06-30 21:00-22:00/);
  assert.match(markup, /允许重叠并继续/);
  assert.match(markup, /暂不安排部署验证/);
  assert.doesNotMatch(markup, /确认执行/);
  assert.doesNotMatch(markup, /已避开所有冲突|自动重排完成/u);
});

test("suggestion buttons route through revise flow instead of confirmation", () => {
  const source = readFileSync(approvalCardPath, "utf8");

  assert.match(source, /onScheduleConflictSuggestionSelect/);
  assert.match(source, /scheduleConflictSuggestionToUserMessage/);
  assert.doesNotMatch(source, /onScheduleConflictSuggestionSelect\(.*onConfirm/s);
});

test("ActionResultCard renders executed schedule result without draft or confirmation language", async () => {
  const ActionResultCard = await loadActionResultCard();
  const markup = renderToStaticMarkup(
    createElement(ActionResultCard, {
      data: {
        createdScheduleItemIds: [801, 802],
        dateRange: "2026-06-30",
        itemsCount: 2,
        kind: "schedule_items_created",
        rollbackAvailable: true,
        sourceChecklistId: 12,
        sourcePlanId: 99,
        title: "已创建 2 个日程项",
      },
    }),
  );

  assert.match(markup, /已创建日程/);
  assert.match(markup, /已创建 2 个日程项/);
  assert.match(markup, /日程已保存/);
  assert.match(markup, /来源计划 #99/);
  assert.match(markup, /来源清单 #12/);
  assert.match(markup, /可撤销/);
  assert.doesNotMatch(markup, /尚未写入日程/);
  assert.doesNotMatch(markup, /等待确认/);
  assert.doesNotMatch(markup, /可选调整建议/);
});

test("query_schedule summary stays read-only and avoids schedule creation UI states", async () => {
  const MessageCard = await loadMessageCard();
  const content = formatScheduleQueryAssistantMessage({
    rangeLabel: "未来 7 天",
    schedules: [
      {
        date: "2026-06-29",
        endTime: "10:00",
        id: 801,
        priority: "high",
        relatedChecklist: null,
        relatedPlan: { id: 99, title: "SunnyPanel 上线计划" },
        startTime: "09:00",
        status: "planned",
        title: "修复登录页",
      },
    ],
  });
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content,
      role: "assistant",
    }),
  );

  assert.match(markup, /未来 7 天/);
  assert.match(markup, /修复登录页/);
  assert.match(markup, /09:00-10:00/);
  assert.match(markup, /sunny-schedule-query-card/);
  assert.match(markup, /计划中/);
  assert.match(markup, /高优先级/);
  assert.doesNotMatch(markup, />planned</);
  assert.doesNotMatch(markup, />high</);
  assert.doesNotMatch(markup, /schedule-items|不会创建|不会修改|只读查询/);
  assert.doesNotMatch(markup, /sunny-schedule-draft-card/);
  assert.doesNotMatch(markup, /sunny-agent-approval/);
  assert.doesNotMatch(markup, /日程草案/);
  assert.doesNotMatch(markup, /等待确认/);
  assert.doesNotMatch(markup, /确认后将写入日程/);
  assert.doesNotMatch(markup, /截止时间|可用时段|冲突处理策略/);
});

test("query_schedule empty state uses range-specific labels", () => {
  const tomorrow = formatScheduleQueryAssistantMessage({
    rangeLabel: "明天",
    schedules: [],
  });
  const today = formatScheduleQueryAssistantMessage({
    rangeLabel: "今天",
    schedules: [],
  });
  const upcoming = formatScheduleQueryAssistantMessage({
    rangeLabel: "未来 7 天",
    schedules: [],
  });

  assert.match(tomorrow, /明天没有已安排的日程/);
  assert.match(today, /今天没有已安排的日程/);
  assert.match(upcoming, /未来 7 天没有已安排的日程/);
  assert.doesNotMatch(tomorrow, /最近没有已安排的日程/);
  assert.doesNotMatch(tomorrow, /范围：|准备创建|确认执行|写入日程|只读查询/);
});

test("pendingAction prevents ScheduleDraftCard projection on assistant messages", () => {
  const pendingAction: PendingAction = {
    action: createScheduleAction(),
    type: "await_confirmation",
  };
  const messages = [
    { content: "这是日程草案", role: "assistant" as const },
  ];

  const attached = attachSchedulingDraftToLastAssistantMessage(messages, scheduleDraft, pendingAction);

  assert.equal(attached[0]?.schedulingDraft, undefined);
});

test("ordinary assistant messages and MessageCard stay outside schedule result ownership", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "可以，我先帮你整理一下今天的安排。",
      role: "assistant",
    }),
  );
  const source = readFileSync(messageCardPath, "utf8");

  assert.doesNotMatch(markup, /sunny-action-result-card/);
  assert.doesNotMatch(markup, /sunny-schedule-draft-card/);
  assert.match(markup, /可以，我先帮你整理一下今天的安排/);
  assert.match(source, /ScheduleDraftCard/);
  assert.match(source, /ActionResultCard/);
  assert.match(source, /parseActionResultMessage/);
  assert.doesNotMatch(source, /createdScheduleItemIds/);
  assert.doesNotMatch(source, /conflictSuggestions\.map/);
});
