import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProposedAgentAction, PendingAction } from "../../../src/lib/agent/schemas";
import { attachSchedulingDraftToLastAssistantMessage } from "../../../src/lib/agent/schedule/draft-message";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";

const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";

const loadAgentApprovalCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/AgentApprovalCard")).AgentApprovalCard;
};

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

const draft: ScheduleDraft = {
  assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
  conflicts: ["尚未检查已有日程冲突。"],
  items: [
    {
      date: "2026-06-30",
      endTime: "22:00",
      startTime: "20:00",
      title: "部署验证",
    },
  ],
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
};

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
    conflictSuggestions: [],
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
  id: "action-schedule-state-separation",
  intent: "create_schedule_items",
  requiresConfirmation: true,
  riskLevel: "medium",
  rollbackAvailable: true,
  summary: "创建 1 个日程项「清单日程草案：1 项任务」",
});

test("create_schedule_items confirmation shows confirmation-state wording", async () => {
  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: scheduleAction(),
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

test("pendingAction prevents ScheduleDraftCard projection on the assistant message", () => {
  const pendingAction: PendingAction = {
    action: scheduleAction(),
    type: "await_confirmation",
  };
  const messages = [
    { content: "这是日程草案", role: "assistant" as const },
  ];

  const attached = attachSchedulingDraftToLastAssistantMessage(messages, draft, pendingAction);

  assert.equal(attached[0]?.schedulingDraft, undefined);
});

test("ordinary assistant message does not render schedule result or draft cards", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "可以，我先帮你整理一下今天的安排。",
      role: "assistant",
    }),
  );

  assert.doesNotMatch(markup, /sunny-action-result-card/);
  assert.doesNotMatch(markup, /sunny-schedule-draft-card/);
  assert.match(markup, /可以，我先帮你整理一下今天的安排/);
});

test("MessageCard remains a dispatcher and does not own schedule result details", () => {
  const source = readFileSync(messageCardPath, "utf8");

  assert.match(source, /ScheduleDraftCard/);
  assert.match(source, /ActionResultCard/);
  assert.match(source, /parseActionResultMessage/);
  assert.doesNotMatch(source, /createdScheduleItemIds/);
  assert.doesNotMatch(source, /conflictSuggestions\.map/);
});
