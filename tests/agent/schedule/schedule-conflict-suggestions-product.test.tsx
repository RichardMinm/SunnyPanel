import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProposedAgentAction } from "../../../src/lib/agent/schemas";
import type { ScheduleConflictSuggestion } from "../../../src/lib/agent/schedule/conflict-suggestions";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";

const approvalCardPath = "src/components/dashboard/agent/AgentApprovalCard.tsx";

const loadAgentApprovalCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/AgentApprovalCard")).AgentApprovalCard;
};

const loadScheduleDraftCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/ScheduleDraftCard")).ScheduleDraftCard;
};

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

const suggestions: ScheduleConflictSuggestion[] = [
  {
    action: { type: "allow_overlap" },
    description: "只记录允许重叠；准备创建时会再次检查真实冲突。",
    id: "allow-overlap",
    label: "允许重叠并继续",
    riskLevel: "medium",
  },
  {
    action: { itemTitle: "部署验证", type: "remove_item" },
    description: "只是从草案移除，不删除真实日程项。",
    id: "remove-item-部署验证",
    label: "暂不安排部署验证",
    riskLevel: "low",
  },
  {
    action: {
      date: "2026-06-30",
      endTime: "17:00",
      itemTitle: "部署验证",
      startTime: "14:00",
      type: "move_item",
    },
    description: "该建议尚未重新检查真实冲突。",
    id: "move-item-部署验证-2026-06-30-14:00-17:00",
    label: "改到 2026-06-30 14:00-17:00",
    riskLevel: "low",
  },
];

const scheduleAction = (): ProposedAgentAction => ({
  affectedDocuments: [
    {
      collection: "schedule-items",
      operation: "create",
      title: "清单日程草案：2 项任务",
      visibility: "private",
    },
  ],
  afterSnapshot: {
    conflictSuggestions: suggestions,
    conflictSummary: {
      conflictCount: 1,
      conflictPolicy: "ask",
      existingScheduleChecked: true,
      message: "发现 1 个时间冲突。系统不会自动重排，请确认是否仍要写入日程。",
      warningCount: 0,
    },
    dateRange: "2026-06-29",
    items: [
      {
        date: "2026-06-29",
        endTime: "22:30",
        startTime: "21:30",
        title: "部署验证",
      },
    ],
    scheduleConflicts: [
      {
        existingScheduleItemId: 501,
        existingTitle: "已有发布会",
        message: "「部署验证」与已有日程「已有发布会」时间重叠。",
        proposedDate: "2026-06-29",
        proposedEndTime: "22:30",
        proposedStartTime: "21:30",
        proposedTitle: "部署验证",
        severity: "warning",
        type: "existing",
      },
    ],
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceType: "checklist",
    title: "清单日程草案：2 项任务",
  },
  args: {
    conflictPolicy: "ask",
    items: [
      {
        date: "2026-06-29",
        endTime: "22:30",
        startTime: "21:30",
        title: "部署验证",
      },
    ],
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceType: "checklist",
    title: "清单日程草案：2 项任务",
  },
  beforeSnapshot: null,
  changes: [
    {
      afterPreview: "发现 1 个时间冲突。\n系统不会自动重排，请确认是否仍要写入日程。",
      beforePreview: "当前尚未创建这些日程项。",
      collection: "schedule-items",
      operation: "create",
      preview: "创建 1 个日程项；时间范围：2026-06-29；确认后才会写入日程。",
      timelineAffected: false,
      visibility: "private",
    },
  ],
  id: "action-schedule-conflict-suggestions",
  intent: "create_schedule_items",
  requiresConfirmation: true,
  riskLevel: "medium",
  rollbackAvailable: true,
  rollbackPayload: {
    strategy: "delete_created_documents",
    target: {
      collection: "schedule-items",
      documentIds: [],
    },
  },
  summary: "创建 1 个日程项「清单日程草案：2 项任务」",
});

const draft: ScheduleDraft = {
  assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
  conflicts: ["准备创建时会重新检查已有日程冲突。"],
  items: [
    {
      date: "2026-06-30",
      endTime: "17:00",
      startTime: "14:00",
      title: "部署验证",
    },
  ],
  nextActions: ["就按这个创建日程"],
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
};

test("pending schedule confirmation displays optional conflict suggestions", async () => {
  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: scheduleAction(),
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
      onScheduleConflictSuggestionSelect: () => undefined,
    }),
  );

  assert.match(markup, /可选调整建议/);
  assert.match(markup, /准备创建时会重新检查冲突/);
  assert.match(markup, /允许重叠并继续/);
  assert.match(markup, /暂不安排部署验证/);
  assert.match(markup, /改到 2026-06-30 14:00-17:00/);
  assert.doesNotMatch(markup, /确认执行/);
  assert.doesNotMatch(markup, /已创建日程/);
});

test("suggestion buttons are not confirmation buttons in source", () => {
  const source = readFileSync(approvalCardPath, "utf8");

  assert.match(source, /onScheduleConflictSuggestionSelect/);
  assert.match(source, /scheduleConflictSuggestionToUserMessage/);
  assert.match(source, /可选调整建议/);
  assert.doesNotMatch(source, /onScheduleConflictSuggestionSelect\(.*onConfirm/s);
});

test("ScheduleDraftCard still renders revised draft as not written", async () => {
  const ScheduleDraftCard = await loadScheduleDraftCard();
  const markup = renderToStaticMarkup(
    createElement(ScheduleDraftCard, {
      draft,
      onPrepareCreate: () => undefined,
      onRevise: () => undefined,
    }),
  );

  assert.match(markup, /日程草案/);
  assert.match(markup, /尚未写入日程/);
  assert.doesNotMatch(markup, /等待确认/);
  assert.doesNotMatch(markup, /已创建日程/);
});

test("ActionResultCard does not show unresolved suggestions", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建 1 个日程项，时间范围：2026-06-30。\n- #901 2026-06-30 14:00 部署验证",
      role: "assistant",
    }),
  );

  assert.match(markup, /已创建日程/);
  assert.doesNotMatch(markup, /可选调整建议/);
  assert.doesNotMatch(markup, /准备创建时会重新检查冲突/);
});
