import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";

const read = (path: string) => readFileSync(path, "utf8");

const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const scheduleDraftCardPath = "src/components/dashboard/agent/ScheduleDraftCard.tsx";

const sampleDraft: ScheduleDraft = {
  assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
  conflicts: ["尚未检查已有日程冲突。"],
  items: [
    {
      date: "2026-06-29",
      endTime: "22:00",
      sourceTaskTitle: "上线前",
      startTime: "20:00",
      title: "修复登录页",
    },
  ],
  nextActions: ["继续修改", "就按这个创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
};

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

const loadScheduleDraftCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/ScheduleDraftCard")).ScheduleDraftCard;
};

test("MessageCard renders create_schedule_items success as ActionResultCard", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content:
        "已创建 2 个日程项，时间范围：2026-06-29 → 2026-06-30。\n- #801 2026-06-29 20:00 修复登录页\n- #802 2026-06-30 09:00 整理发布文档",
      role: "assistant",
    }),
  );

  assert.match(markup, /sunny-action-result-card/);
  assert.match(markup, /sunny-action-result-card-schedule_items_created/);
  assert.match(markup, /已创建日程/);
  assert.match(markup, /已创建 2 个日程项/);
  assert.match(markup, /2026-06-29 → 2026-06-30/);
  assert.match(markup, /可撤销/);
  assert.match(markup, /日程已保存/);
});

test("ScheduleDraftCard keeps draft wording and never claims schedule creation", async () => {
  const ScheduleDraftCard = await loadScheduleDraftCard();
  const markup = renderToStaticMarkup(
    createElement(ScheduleDraftCard, {
      draft: sampleDraft,
      onPrepareCreate: () => undefined,
      onRevise: () => undefined,
    }),
  );

  assert.match(markup, /日程草案/);
  assert.match(markup, /尚未写入日程/);
  assert.match(markup, /准备创建日程/);
  assert.doesNotMatch(markup, /已创建日程/);
  assert.doesNotMatch(markup, /这些日程项已经写入日程/);
});

test("pending confirmation text does not become a schedule result card", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "我已整理好一个待确认操作：将创建 2 个日程项。回复「确认」或「执行」后我再真正写入日程。",
      role: "assistant",
    }),
  );

  assert.doesNotMatch(markup, /sunny-action-result-card/);
  assert.doesNotMatch(markup, /已创建日程/);
  assert.match(markup, /待确认操作/);
});

test("K5 no-write defensive text does not become a schedule result card", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "当前未写入日程；批量创建日程将在 K6 实现后才可执行。",
      role: "assistant",
    }),
  );

  assert.doesNotMatch(markup, /sunny-action-result-card/);
  assert.doesNotMatch(markup, /已创建日程/);
  assert.match(markup, /当前未写入日程/);
});

test("ordinary assistant message does not render schedule result card", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "可以，我先帮你把日程安排拆成几个时间段。",
      role: "assistant",
    }),
  );

  assert.doesNotMatch(markup, /sunny-action-result-card/);
  assert.doesNotMatch(markup, /已创建日程/);
  assert.match(markup, /可以，我先帮你把日程安排拆成几个时间段/);
});

test("MessageCard dispatch order keeps draft cards before parsed schedule results", () => {
  const messageSource = read(messageCardPath);

  assert.ok(messageSource.indexOf("schedulingDraft") < messageSource.indexOf("structuredCard"));
  assert.match(messageSource, /ActionResultCard/);
  assert.doesNotMatch(messageSource, /sourcePlanId/);
  assert.doesNotMatch(messageSource, /createdScheduleItemIds/);
});

test("ScheduleDraftCard source keeps draft and result language separate", () => {
  const source = read(scheduleDraftCardPath);

  assert.match(source, /尚未写入日程/);
  assert.doesNotMatch(source, /已创建日程/);
  assert.doesNotMatch(source, /这些日程项已经写入日程/);
});
