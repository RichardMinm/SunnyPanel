import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProposedAgentAction } from "../../../src/lib/agent/schemas";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";

const read = (path: string) => readFileSync(path, "utf8");

const actionResultCardPath = "src/components/dashboard/agent/ActionResultCard.tsx";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";

const sampleDraft: ScheduleDraft = {
  assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
  conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
  items: [
    {
      date: "2026-06-29",
      endTime: "22:00",
      sourceChecklistId: 12,
      sourceChecklistItemKey: "item-login",
      sourcePlanId: 99,
      sourceTaskTitle: "上线前",
      startTime: "20:00",
      title: "修复登录页",
    },
    {
      date: "2026-06-30",
      endTime: "11:00",
      sourceChecklistId: 12,
      sourceChecklistItemKey: "item-docs",
      sourcePlanId: 99,
      sourceTaskTitle: "上线前",
      startTime: "09:00",
      title: "整理发布文档",
    },
  ],
  nextActions: ["继续修改", "就按这个创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案：2 项任务",
};

const createScheduleItemsAction: ProposedAgentAction = {
  affectedDocuments: [
    {
      collection: "schedule-items",
      operation: "create",
      title: "清单日程草案：2 项任务",
      visibility: "private",
    },
  ],
  afterSnapshot: {
    dateRange: "2026-06-29 → 2026-06-30",
    items: sampleDraft.items,
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceType: "checklist",
    title: sampleDraft.title,
  },
  args: {
    items: sampleDraft.items.map((item) => ({
      date: item.date!,
      endTime: item.endTime,
      relatedChecklistId: item.sourceChecklistId,
      relatedChecklistItemKey: item.sourceChecklistItemKey,
      relatedPlanId: item.sourcePlanId,
      startTime: item.startTime,
      title: item.title,
    })),
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceText: "从日程草案准备创建正式日程。",
    sourceType: "checklist",
    title: sampleDraft.title,
  },
  beforeSnapshot: null,
  changes: [
    {
      afterPreview: "时间范围：2026-06-29 → 2026-06-30\n来源：清单\n日程项预览：\n1. 2026-06-29 20:00-22:00 修复登录页\n2. 2026-06-30 09:00-11:00 整理发布文档",
      beforePreview: "当前尚未创建这些日程项。",
      collection: "schedule-items",
      operation: "create",
      preview: "创建 2 个日程项；时间范围：2026-06-29 → 2026-06-30；确认后才会写入日程。",
      timelineAffected: false,
      visibility: "private",
    },
  ],
  id: "action-k8-create-schedule-items",
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
  summary: "创建 2 个日程项「清单日程草案：2 项任务」",
};

const loadScheduleDraftCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/ScheduleDraftCard")).ScheduleDraftCard;
};

const loadAgentApprovalCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/AgentApprovalCard")).AgentApprovalCard;
};

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

test("schedule workflow UI separates draft confirmation and executed result states", async () => {
  const ScheduleDraftCard = await loadScheduleDraftCard();
  const AgentApprovalCard = await loadAgentApprovalCard();
  const MessageCard = await loadMessageCard();
  const draftMarkup = renderToStaticMarkup(
    createElement(ScheduleDraftCard, {
      draft: sampleDraft,
      onPrepareCreate: () => undefined,
      onRevise: () => undefined,
    }),
  );
  const confirmationMarkup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: createScheduleItemsAction,
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );
  const resultMarkup = renderToStaticMarkup(
    createElement(MessageCard, {
      content:
        "已创建 2 个日程项，时间范围：2026-06-29 → 2026-06-30。\n- #901 2026-06-29 20:00 修复登录页\n- #902 2026-06-30 09:00 整理发布文档",
      role: "assistant",
    }),
  );

  assert.match(draftMarkup, /日程草案/);
  assert.match(draftMarkup, /尚未写入日程/);
  assert.match(draftMarkup, /准备创建日程/);
  assert.doesNotMatch(draftMarkup, /已创建日程/);
  assert.doesNotMatch(draftMarkup, /确认执行/);

  assert.match(confirmationMarkup, /等待确认/);
  assert.match(confirmationMarkup, /创建 2 个日程项/);
  assert.match(confirmationMarkup, /确认后写入/);
  assert.doesNotMatch(confirmationMarkup, /尚未写入日程/);
  assert.doesNotMatch(confirmationMarkup, /已创建日程/);

  assert.match(resultMarkup, /sunny-action-result-card/);
  assert.match(resultMarkup, /已创建日程/);
  assert.match(resultMarkup, /已创建 2 个日程项/);
  assert.match(resultMarkup, /可撤销/);
  assert.doesNotMatch(resultMarkup, /尚未写入日程/);
  assert.doesNotMatch(resultMarkup, /等待确认/);
});

test("MessageCard keeps K8 schedule result rendering inside ActionResultCard dispatch", () => {
  const messageSource = read(messageCardPath);
  const resultSource = read(actionResultCardPath);

  assert.match(messageSource, /ActionResultCard/);
  assert.match(messageSource, /parseActionResultMessage/);
  assert.doesNotMatch(messageSource, /schedule_items_created/);
  assert.match(resultSource, /schedule_items_created/);
  assert.match(resultSource, /已创建日程/);
  assert.match(resultSource, /可撤销/);
});
