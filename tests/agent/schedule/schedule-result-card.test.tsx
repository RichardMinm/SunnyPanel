import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  parseActionResultMessage,
  type ActionResultData,
} from "../../../src/components/dashboard/agent/utils";

const componentPath = "src/components/dashboard/agent/ActionResultCard.tsx";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const cssPath = "src/app/styles/sunny-agent.css";

const read = (path: string) => readFileSync(path, "utf8");

const loadActionResultCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/ActionResultCard")).ActionResultCard;
};

test("parseActionResultMessage detects create_schedule_items execution success only", () => {
  const result = parseActionResultMessage(
    "已创建 6 个日程项，时间范围：2026-06-29 → 2026-06-30。\n- #801 2026-06-29 20:00 修复登录页\n- #802 2026-06-30 09:00 整理发布文档",
  );

  assert.equal(result?.kind, "schedule_items_created");
  assert.equal(result?.itemsCount, 6);
  assert.equal(result?.dateRange, "2026-06-29 → 2026-06-30");
  assert.deepEqual(result?.createdScheduleItemIds, [801, 802]);
  assert.deepEqual(result?.scheduleItemPreviews, [
    "#801 2026-06-29 20:00 修复登录页",
    "#802 2026-06-30 09:00 整理发布文档",
  ]);
  assert.equal(result?.rollbackAvailable, true);
});

test("parseActionResultMessage ignores draft confirmation and K5 no-write schedule text", () => {
  assert.equal(parseActionResultMessage("日程草案：尚未写入日程。准备创建日程后会进入确认。"), null);
  assert.equal(parseActionResultMessage("等待确认：将创建 2 个日程项，确认后写入日程。"), null);
  assert.equal(
    parseActionResultMessage("K6 实现前，当前未写入日程；批量创建日程仍处于防御性 no-write 分支。"),
    null,
  );
  assert.equal(parseActionResultMessage("可以，我先帮你把时间安排确认一下。"), null);
});

test("ActionResultCard renders schedule creation success with source and rollback state", async () => {
  const ActionResultCard = await loadActionResultCard();
  const data: ActionResultData = {
    createdScheduleItemIds: [801, 802, 803],
    dateRange: "2026-06-29 → 2026-06-30",
    itemsCount: 3,
    kind: "schedule_items_created",
    rollbackAvailable: true,
    sourceChecklistId: 12,
    sourcePlanId: 99,
    title: "已创建 3 个日程项",
  };
  const markup = renderToStaticMarkup(createElement(ActionResultCard, { data }));

  assert.match(markup, /已创建日程/);
  assert.match(markup, /已创建 3 个日程项/);
  assert.match(markup, /2026-06-29 → 2026-06-30/);
  assert.match(markup, /来源计划 #99/);
  assert.match(markup, /来源清单 #12/);
  assert.match(markup, /可撤销/);
  assert.match(markup, /日程已保存/);
  assert.match(markup, /href="\/dashboard\?mode=schedule"/);
  assert.doesNotMatch(markup, /尚未写入日程/);
  assert.doesNotMatch(markup, /等待确认/);
  assert.doesNotMatch(markup, /确认执行/);
});

test("ActionResultCard limits long created schedule id lists", async () => {
  const ActionResultCard = await loadActionResultCard();
  const data: ActionResultData = {
    createdScheduleItemIds: [801, 802, 803, 804, 805, 806, 807, 808],
    dateRange: "2026-06-29 → 2026-06-30",
    itemsCount: 8,
    kind: "schedule_items_created",
    rollbackAvailable: true,
    title: "已创建 8 个日程项",
  };
  const markup = renderToStaticMarkup(createElement(ActionResultCard, { data }));

  assert.match(markup, /#801, #802, #803, #804, #805，等 8 个/);
  assert.doesNotMatch(markup, /#806/);
  assert.doesNotMatch(markup, /#807/);
  assert.doesNotMatch(markup, /#808/);
});

test("ActionResultCard renders first five schedule previews when present", async () => {
  const ActionResultCard = await loadActionResultCard();
  const data: ActionResultData = {
    dateRange: "2026-06-29 → 2026-07-01",
    itemsCount: 6,
    kind: "schedule_items_created",
    rollbackAvailable: true,
    scheduleItemPreviews: [
      "#801 2026-06-29 20:00 修复登录页",
      "#802 2026-06-30 09:00 整理发布文档",
      "#803 2026-06-30 14:00 回归测试",
      "#804 2026-06-30 16:00 部署检查",
      "#805 2026-07-01 10:00 复盘记录",
      "#806 2026-07-01 11:00 不应展示",
    ],
    title: "已创建 6 个日程项",
  };
  const markup = renderToStaticMarkup(createElement(ActionResultCard, { data }));

  assert.match(markup, /修复登录页/);
  assert.match(markup, /复盘记录/);
  assert.doesNotMatch(markup, /不应展示/);
});

test("MessageCard stays a dispatcher for schedule action results", () => {
  const source = read(messageCardPath);

  assert.match(source, /ActionResultCard/);
  assert.match(source, /parseActionResultMessage/);
  assert.doesNotMatch(source, /createdScheduleItemIds/);
  assert.doesNotMatch(source, /sourceChecklistId/);
});

test("ActionResultCard schedule variant uses existing component and tokenized CSS", () => {
  assert.equal(existsSync(componentPath), true);
  const componentSource = read(componentPath);
  const cssSource = read(cssPath);
  const start = cssSource.indexOf(".sunny-action-result-card-schedule_items_created");
  const end = cssSource.indexOf("/* ── Plan Draft Card", start);
  const css = cssSource.slice(start, end);

  assert.match(componentSource, /schedule_items_created/);
  assert.ok(start >= 0);
  assert.match(css, /var\(--/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
});
