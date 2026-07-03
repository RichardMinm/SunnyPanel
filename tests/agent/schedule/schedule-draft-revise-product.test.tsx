import assert from "node:assert/strict";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

const revisedDraft: ScheduleDraft = {
  assumptions: [
    "这是规则生成的日程草案，尚未写入日程。",
    "修改后的草案尚未重新检查已有日程冲突，准备创建时会再次检查。",
  ],
  conflicts: ["准备创建时会重新检查已有日程冲突。"],
  items: [
    {
      date: "2026-06-30",
      endTime: "17:00",
      sourceChecklistItemKey: "item-deploy",
      startTime: "14:00",
      title: "部署验证",
    },
  ],
  nextActions: ["继续修改", "就按这个创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
};

test("revised schedule draft response renders ScheduleDraftCard", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已更新日程草案。它仍然尚未写入日程。",
      role: "assistant",
      schedulingDraft: revisedDraft,
    }),
  );

  assert.match(markup, /日程草案/);
  assert.match(markup, /尚未写入日程/);
  assert.match(markup, /部署验证/);
  assert.match(markup, /2026-06-30/);
  assert.doesNotMatch(markup, /等待确认/);
  assert.doesNotMatch(markup, /已创建日程/);
});

test("revised schedule draft response does not render confirmation or action result card", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建 1 个日程项，时间范围：2026-06-30。",
      role: "assistant",
      schedulingDraft: revisedDraft,
    }),
  );

  assert.match(markup, /日程草案/);
  assert.match(markup, /尚未写入日程/);
  assert.doesNotMatch(markup, /sunny-action-result-card/);
  assert.doesNotMatch(markup, /等待确认/);
});
