import assert from "node:assert/strict";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ActionResultData } from "../../../src/components/dashboard/agent/utils";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";

const loadActionResultCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/ActionResultCard")).ActionResultCard;
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

test("ScheduleDraftCard shows final draft-state wording without result or confirmation language", async () => {
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

test("ActionResultCard shows final schedule result wording without draft or confirmation language", async () => {
  const ActionResultCard = await loadActionResultCard();
  const data: ActionResultData = {
    createdScheduleItemIds: [801, 802],
    dateRange: "2026-06-30",
    itemsCount: 2,
    kind: "schedule_items_created",
    rollbackAvailable: true,
    sourceChecklistId: 12,
    sourcePlanId: 99,
    title: "已创建 2 个日程项",
  };
  const markup = renderToStaticMarkup(createElement(ActionResultCard, { data }));

  assert.match(markup, /已创建日程/);
  assert.match(markup, /已创建 2 个日程项/);
  assert.match(markup, /已写入日程/);
  assert.match(markup, /来源计划 #99/);
  assert.match(markup, /来源清单 #12/);
  assert.match(markup, /可撤销/);
  assert.doesNotMatch(markup, /尚未写入日程/);
  assert.doesNotMatch(markup, /等待确认/);
  assert.doesNotMatch(markup, /可选调整建议/);
});
