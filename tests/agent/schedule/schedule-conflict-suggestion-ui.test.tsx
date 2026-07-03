import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProposedAgentAction } from "../../../src/lib/agent/schemas";
import type { ScheduleConflictSuggestion } from "../../../src/lib/agent/schedule/conflict-suggestions";

const approvalCardPath = "src/components/dashboard/agent/AgentApprovalCard.tsx";

const loadAgentApprovalCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/AgentApprovalCard")).AgentApprovalCard;
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

const scheduleAction = (): ProposedAgentAction => ({
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
        endTime: "21:00",
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
        proposedEndTime: "21:00",
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
        endTime: "21:00",
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
  id: "action-schedule-conflict-suggestion-ui",
  intent: "create_schedule_items",
  requiresConfirmation: true,
  riskLevel: "medium",
  rollbackAvailable: true,
  summary: "创建 1 个日程项「清单日程草案：1 项任务」",
});

test("conflict suggestion UI explains suggestions are draft-only local checks", async () => {
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
