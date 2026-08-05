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

test("ActionResultCard component exists and uses shared primitives", () => {
  assert.equal(existsSync(componentPath), true);
  const source = read(componentPath);

  assert.match(source, /import\s+\{\s*AppBadge\s*\}/);
  assert.match(source, /import\s+\{\s*AppCard\s*\}/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /pendingAction\s*=/);
});

test("parseActionResultMessage detects plan creation success", () => {
  const result = parseActionResultMessage(
    "已帮你创建计划「SunnyPanel 第一版上线」。目前它会以私有草稿的形式进入待办队列。",
  );

  assert.equal(result?.kind, "plan_created");
  assert.equal(result?.title, "SunnyPanel 第一版上线");
  assert.equal(result?.rollbackAvailable, true);
});

test("parseActionResultMessage detects checklist creation and linked plan", () => {
  const result = parseActionResultMessage(
    "已创建清单「SunnyPanel 上线任务清单」，包含 3 个分组 / 12 个条目，并已关联到计划 #42。",
  );

  assert.equal(result?.kind, "checklist_created");
  assert.equal(result?.title, "SunnyPanel 上线任务清单");
  assert.equal(result?.groupsCount, 3);
  assert.equal(result?.itemsCount, 12);
  assert.equal(result?.linkedPlanId, 42);
  assert.equal(result?.rollbackAvailable, true);
});

test("parseActionResultMessage detects completed checklist item and timeline sync", () => {
  const result = parseActionResultMessage(
    "已把 「SunnyPanel 上线任务清单 / 上线收尾 / 修复登录页」 标记完成，对应 Timeline 节点也已同步。",
  );

  assert.equal(result?.kind, "checklist_item_completed");
  assert.equal(result?.title, "修复登录页");
  assert.equal(result?.checklistTitle, "SunnyPanel 上线任务清单");
  assert.equal(result?.groupTitle, "上线收尾");
  assert.equal(result?.timelineStatus, "synced");
  assert.equal(result?.rollbackAvailable, true);
});

test("parseActionResultMessage ignores ordinary assistant messages", () => {
  assert.equal(parseActionResultMessage("可以，我先帮你确认几个关键点。"), null);
});

test("ActionResultCard renders plan creation as executed result with rollback", async () => {
  const ActionResultCard = await loadActionResultCard();
  const data: ActionResultData = {
    kind: "plan_created",
    rollbackAvailable: true,
    title: "SunnyPanel 第一版上线",
  };
  const markup = renderToStaticMarkup(createElement(ActionResultCard, { data }));

  assert.match(markup, /计划已创建/);
  assert.match(markup, /SunnyPanel 第一版上线/);
  assert.match(markup, /完成/);
  assert.match(markup, /可撤销/);
  assert.match(markup, /继续拆成清单/);
  assert.match(markup, /计划已保存/);
  assert.match(markup, /打开计划/);
});

test("ActionResultCard renders checklist creation linkage and counts", async () => {
  const ActionResultCard = await loadActionResultCard();
  const data: ActionResultData = {
    groupsCount: 3,
    itemsCount: 12,
    kind: "checklist_created",
    linkedPlanId: 42,
    rollbackAvailable: true,
    title: "SunnyPanel 上线任务清单",
  };
  const markup = renderToStaticMarkup(createElement(ActionResultCard, { data }));

  assert.match(markup, /清单已创建/);
  assert.match(markup, /SunnyPanel 上线任务清单/);
  assert.match(markup, /3 个分组/);
  assert.match(markup, /12 个条目/);
  assert.match(markup, /已关联到计划 #42/);
  assert.match(markup, /可撤销/);
  assert.match(markup, /href="\/dashboard\?mode=checklist"/);
});

test("ActionResultCard renders completed item, timeline feedback and rollback", async () => {
  const ActionResultCard = await loadActionResultCard();
  const data: ActionResultData = {
    checklistTitle: "SunnyPanel 上线任务清单",
    groupTitle: "上线收尾",
    kind: "checklist_item_completed",
    rollbackAvailable: true,
    timelineStatus: "synced",
    title: "修复登录页",
  };
  const markup = renderToStaticMarkup(createElement(ActionResultCard, { data }));

  assert.match(markup, /清单项已完成/);
  assert.match(markup, /修复登录页/);
  assert.match(markup, /SunnyPanel 上线任务清单/);
  assert.match(markup, /时间线/);
  assert.match(markup, /已记录\/更新/);
  assert.match(markup, /可撤销/);
});

test("MessageCard imports ActionResultCard but does not own result card body JSX", () => {
  const source = read(messageCardPath);

  assert.match(source, /ActionResultCard/);
  assert.match(source, /parseActionResultMessage/);
  assert.doesNotMatch(source, /timelineStatus/);
  assert.doesNotMatch(source, /linkedPlanId/);
});

test("ActionResultCard CSS uses tokens and no hardcoded hex colors", () => {
  const source = read(cssPath);
  const start = source.indexOf(".sunny-action-result-card");
  const end = source.indexOf("/* ── Plan Draft Card", start);
  const css = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(css, /var\(--/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
});
