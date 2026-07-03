import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";

const read = (path: string) => readFileSync(path, "utf8");

const componentPath = "src/components/dashboard/agent/ScheduleDraftCard.tsx";
const agentCssPath = "src/app/styles/sunny-agent.css";

const sampleDraft: ScheduleDraft = {
  assumptions: [
    "这是规则生成的日程草案，尚未写入日程。",
    "将以 6 月 30 日前完成为目标。",
  ],
  conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
  items: [
    {
      date: "每天",
      endTime: "22:00",
      estimatedMinutes: 60,
      sourceChecklistItemKey: "item-login",
      sourceTaskTitle: "上线前",
      startTime: "20:00",
      title: "修复登录页",
    },
    {
      date: "周末",
      endTime: "11:00",
      sourceTaskTitle: "上线前",
      startTime: "09:00",
      title: "整理发布文档",
    },
  ],
  nextActions: ["调整时间", "改成上午", "就按这个创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案（6 月 30 日前）：2 项任务",
};

const loadScheduleDraftCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/ScheduleDraftCard")).ScheduleDraftCard;
};

test("ScheduleDraftCard component exists and uses shared primitives", () => {
  assert.equal(existsSync(componentPath), true);
  const source = read(componentPath);

  assert.match(source, /import\s+\{\s*AppCard\s*\}/);
  assert.match(source, /import\s+\{\s*AppBadge\s*\}/);
  assert.match(source, /import\s+\{\s*AppButton\s*\}/);
  assert.match(source, /import\s+\{\s*AppPanel\s*\}/);
});

test("ScheduleDraftCard renders draft identity and non-persistence note", () => {
  const source = read(componentPath);

  assert.match(source, /draft\.title/);
  assert.match(source, /日程草案/);
  assert.match(source, /尚未写入日程/);
  assert.doesNotMatch(source, /确认执行/);
});

test("ScheduleDraftCard renders source type ids item count date count and conflict hint", () => {
  const source = read(componentPath);

  for (const label of ["来源", "来源计划", "来源清单", "日程项数量", "涉及日期", "冲突提示"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /draft\.sourcePlanId/);
  assert.match(source, /draft\.sourceChecklistId/);
  assert.match(source, /draft\.items\.length/);
});

test("ScheduleDraftCard renders items assumptions and conflicts", async () => {
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
  assert.match(markup, /清单/);
  assert.match(markup, /2/);
  assert.match(markup, /修复登录页/);
  assert.match(markup, /每天/);
  assert.match(markup, /20:00/);
  assert.match(markup, /22:00/);
  assert.match(markup, /上线前/);
  assert.match(markup, /这是规则生成的日程草案/);
  assert.match(markup, /尚未检查已有日程冲突/);
  assert.doesNotMatch(markup, /确认执行/);
});

test("ScheduleDraftCard renders non-executing action buttons with type button", () => {
  const source = read(componentPath);

  for (const label of ["继续修改", "准备创建日程"]) {
    assert.match(source, new RegExp(label));
  }

  const buttonCount = (source.match(/<AppButton/g) ?? []).length;
  const typeButtonCount = (source.match(/type="button"/g) ?? []).length;

  assert.ok(buttonCount >= 2);
  assert.ok(typeButtonCount >= 2);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /compose_schedule_item/);
  assert.doesNotMatch(source, /schedule_plan/);
  assert.doesNotMatch(source, /pendingAction/);
});

test("ScheduleDraftCard CSS uses tokens and no pending confirmation risk styling", () => {
  const source = read(agentCssPath);
  const start = source.indexOf(".sunny-schedule-draft-card");
  const end = source.indexOf("/* ── Progress Bar", start);
  const draftCss = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(draftCss, /var\(--/);
  assert.doesNotMatch(draftCss, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(draftCss, /sunny-agent-approval-banner/);
  assert.doesNotMatch(draftCss, /riskLevelLabelMap/);
});
