import assert from "node:assert/strict";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProposedAgentAction } from "../../../src/lib/agent/schemas";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";

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

const scheduleAction = (conflictCount: number): ProposedAgentAction => ({
  affectedDocuments: [
    {
      collection: "schedule-items",
      operation: "create",
      title: "清单日程草案：2 项任务",
      visibility: "private",
    },
  ],
  afterSnapshot: {
    conflictSummary: {
      conflictCount,
      conflictPolicy: "ask",
      existingScheduleChecked: true,
      message: conflictCount > 0
        ? `发现 ${conflictCount} 个时间冲突。系统不会自动重排，请确认是否仍要写入日程。`
        : "未发现明显时间冲突。仅基于 SunnyPanel 当前 schedule-items 检测，未包含外部日历。",
    },
    dateRange: "2026-06-29",
    items: [
      {
        date: "2026-06-29",
        endTime: "22:00",
        startTime: "20:00",
        title: "修复登录页",
      },
    ],
    scheduleConflicts: conflictCount > 0
      ? [
          {
            existingScheduleItemId: 501,
            existingTitle: "已有发布会",
            message: "「修复登录页」与已有日程「已有发布会」时间重叠。",
            proposedDate: "2026-06-29",
            proposedEndTime: "22:00",
            proposedStartTime: "20:00",
            proposedTitle: "修复登录页",
            severity: "warning",
            type: "existing",
          },
        ]
      : [],
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
        endTime: "22:00",
        startTime: "20:00",
        title: "修复登录页",
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
      afterPreview: conflictCount > 0
        ? `发现 ${conflictCount} 个时间冲突。\n系统不会自动重排，请确认是否仍要写入日程。`
        : "未发现明显时间冲突。仅基于 SunnyPanel 当前 schedule-items 检测，未包含外部日历。",
      beforePreview: "当前尚未创建这些日程项。",
      collection: "schedule-items",
      operation: "create",
      preview: "创建 1 个日程项；时间范围：2026-06-29；确认后才会写入日程。",
      timelineAffected: false,
      visibility: "private",
    },
  ],
  id: "action-schedule-conflict-product",
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
  conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
  items: [
    {
      date: "2026-06-29",
      endTime: "22:00",
      startTime: "20:00",
      title: "修复登录页",
    },
  ],
  nextActions: ["就按这个创建日程"],
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
};

test("Confirmation card shows schedule conflicts and no automatic rescheduling", async () => {
  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: scheduleAction(1),
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /发现 1 个时间冲突/);
  assert.match(markup, /已有发布会/);
  assert.match(markup, /不会自动重排/);
  assert.match(markup, /仍要写入日程/);
  assert.doesNotMatch(markup, /尚未写入日程/);
  assert.doesNotMatch(markup, /已创建日程/);
});

test("Confirmation card can show no-conflict local schedule scope", async () => {
  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: scheduleAction(0),
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /未发现明显时间冲突/);
  assert.match(markup, /未包含外部日历/);
  assert.doesNotMatch(markup, /发现 1 个时间冲突/);
});

test("ScheduleDraftCard remains draft-only and ActionResultCard does not show pending conflict warnings", async () => {
  const ScheduleDraftCard = await loadScheduleDraftCard();
  const MessageCard = await loadMessageCard();
  const draftMarkup = renderToStaticMarkup(
    createElement(ScheduleDraftCard, {
      draft,
      onPrepareCreate: () => undefined,
      onRevise: () => undefined,
    }),
  );
  const resultMarkup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建 1 个日程项，时间范围：2026-06-29。\n- #901 2026-06-29 20:00 修复登录页",
      role: "assistant",
    }),
  );

  assert.match(draftMarkup, /日程草案/);
  assert.match(draftMarkup, /尚未写入日程/);
  assert.doesNotMatch(draftMarkup, /发现 1 个时间冲突/);
  assert.match(resultMarkup, /已创建日程/);
  assert.doesNotMatch(resultMarkup, /系统不会自动重排/);
  assert.doesNotMatch(resultMarkup, /等待确认/);
});
