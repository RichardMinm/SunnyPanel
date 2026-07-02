import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProposedAgentAction } from "../../../src/lib/agent/schemas";

const read = (path: string) => readFileSync(path, "utf8");

const componentPath = "src/components/dashboard/agent/PlanConfirmationCard.tsx";
const draftCardPath = "src/components/dashboard/agent/PlanDraftCard.tsx";
const agentCssPath = "src/app/styles/sunny-agent.css";

const loadPlanConfirmationCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/PlanConfirmationCard")).PlanConfirmationCard;
};

const samplePlanAction: ProposedAgentAction = {
  args: {
    decomposed: {
      phases: [
        {
          estimatedDays: 1,
          goal: "完成上线前闭环",
          milestones: [
            {
              tasks: ["修复登录页", "完成部署检查"],
              title: "上线检查",
            },
          ],
          title: "上线收尾",
        },
      ],
      totalEstimatedDays: 1,
    },
    proposal: {
      agentBrief: "从计划草案进入创建确认。",
      goal: "SunnyPanel 第一版上线",
      keySteps: ["修复登录页", "完成部署检查"],
      risks: ["时间紧，需要控制范围"],
      scope: "登录、Agent 对话、部署",
      successCriteria: ["内测环境可用"],
      suggestedDueDate: "2026-06-30",
      suggestedPriority: "high",
      title: "SunnyPanel 第一版上线计划",
    },
  },
  affectedDocuments: [
    {
      collection: "plans",
      operation: "create",
      title: "SunnyPanel 第一版上线计划",
      visibility: "private",
    },
  ],
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "创建计划：SunnyPanel 第一版上线计划",
      visibility: "private",
    },
  ],
  id: "plan-confirmation-test",
  intent: "compose_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  rollbackAvailable: true,
  summary: "创建计划：SunnyPanel 第一版上线计划",
};

test("PlanConfirmationCard component exists and uses shared primitives", () => {
  assert.equal(existsSync(componentPath), true);
  const source = read(componentPath);

  assert.match(source, /import\s+\{\s*AppBadge\s*\}/);
  assert.match(source, /import\s+\{\s*AppButton\s*\}/);
  assert.match(source, /import\s+\{\s*AppCard\s*\}/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /pendingAction\s*=/);
});

test("PlanConfirmationCard renders pending execution semantics", async () => {
  const PlanConfirmationCard = await loadPlanConfirmationCard();
  const markup = renderToStaticMarkup(
    createElement(PlanConfirmationCard, {
      action: samplePlanAction,
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
      onReturnToEdit: () => undefined,
    }),
  );

  assert.match(markup, /等待确认/);
  assert.match(markup, /创建计划/);
  assert.match(markup, /SunnyPanel 第一版上线计划/);
  assert.match(markup, /确认后将创建这项计划/);
  assert.match(markup, /确认后才会真正创建计划/);
  assert.doesNotMatch(markup, /计划草案，尚未写入数据库/);
});

test("PlanConfirmationCard renders summary, risk, rollback and impact", async () => {
  const PlanConfirmationCard = await loadPlanConfirmationCard();
  const markup = renderToStaticMarkup(
    createElement(PlanConfirmationCard, {
      action: samplePlanAction,
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
      onReturnToEdit: () => undefined,
    }),
  );

  for (const label of ["目标", "截止时间", "阶段数量", "任务数量", "影响范围", "可见性"]) {
    assert.match(markup, new RegExp(label));
  }

  assert.match(markup, /中风险/);
  assert.match(markup, /可回滚/);
  assert.match(markup, /新增 1 项计划/);
  assert.match(markup, /私有/);
});

test("PlanConfirmationCard keeps full preview collapsed and scroll constrained", async () => {
  const PlanConfirmationCard = await loadPlanConfirmationCard();
  const source = read(componentPath);
  const markup = renderToStaticMarkup(
    createElement(PlanConfirmationCard, {
      action: samplePlanAction,
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
      onReturnToEdit: () => undefined,
    }),
  );

  assert.match(source, /<details/);
  assert.match(source, /<summary[^>]*>\s*查看完整预览\s*<\/summary>/);
  assert.match(source, /sunny-plan-confirmation-preview-scroll/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen=/);

  const css = read(agentCssPath);
  assert.match(css, /\.sunny-plan-confirmation-preview-scroll/);
  assert.match(css, /max-height:/);
  assert.match(css, /overflow:\s*auto/);
});

test("PlanConfirmationCard actions are cancel, return-to-edit and primary confirm", async () => {
  const PlanConfirmationCard = await loadPlanConfirmationCard();
  const source = read(componentPath);
  const markup = renderToStaticMarkup(
    createElement(PlanConfirmationCard, {
      action: samplePlanAction,
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
      onReturnToEdit: () => undefined,
    }),
  );

  for (const label of ["取消", "返回修改", "确认执行"]) {
    assert.match(markup, new RegExp(label));
  }

  const appButtonCount = (source.match(/<AppButton/g) ?? []).length;
  const typeButtonCount = (source.match(/type="button"/g) ?? []).length;

  assert.ok(appButtonCount >= 3);
  assert.ok(typeButtonCount >= 3);
  assert.match(source, /onClick=\{onConfirm\}/);
  assert.match(source, /onClick=\{onCancel\}/);
  assert.match(source, /onClick=\{onReturnToEdit\}/);
  assert.doesNotMatch(source, /onReturnToEdit[^]*onConfirm\(/);
});

test("PlanDraftCard keeps draft-only wording and never exposes confirm execute", () => {
  const source = read(draftCardPath);

  assert.match(source, /计划草案/);
  assert.match(source, /尚未写入数据库/);
  assert.match(source, /准备创建计划/);
  assert.doesNotMatch(source, /确认执行/);
});
