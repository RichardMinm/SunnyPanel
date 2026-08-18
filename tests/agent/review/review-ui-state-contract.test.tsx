import assert from "node:assert/strict";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { FrozenWeeklyReviewProposal } from "../../../src/lib/agent/review/model-schemas";
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";

const loadAgentApprovalCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/AgentApprovalCard")).AgentApprovalCard;
};

const frozenProposal: FrozenWeeklyReviewProposal = {
  assistantMessage: "本周主线清楚，但需要优先处理逾期风险。",
  completed: ["完成 Review 严格结构化合同"],
  createSuggestions: true,
  health: "risk",
  metrics: {
    failedAgentRuns: 0,
    overduePlans: 1,
  },
  narrativeGaps: ["计划缺少可见产出"],
  recommendations: ["今天为逾期计划确定一个最小动作"],
  reviewedAt: "2026-08-18T10:00:00.000+08:00",
  risks: ["1 项计划逾期：Review 安全收口"],
  scope: "overall",
  snapshotFingerprint: "b".repeat(64),
  source: "model",
  suggestionDrafts: [{
    createdBy: "agent",
    reason: "计划已经逾期",
    relatedPlan: 101,
    riskLevel: "high",
    source: "review",
    status: "pending",
    suggestedPrompt: "为逾期计划确定一个最小动作",
    title: "处理逾期计划",
    uniqueKey: "weekly-review:2026-08-18:overdue-plan:101",
  }],
  summary: "本周主线清楚，但需要优先处理逾期风险。",
  title: "本周复盘 · 2026-08-18",
};

test("Weekly Review confirmation renders the exact frozen facts in user language", async () => {
  const dryRun = await dryRunAgentIntent(
    {
      args: {
        createSuggestions: true,
        persistReview: true,
      },
      intent: "weekly_review",
    },
    {
      createActionId: () => "review-ui-action",
      prepareWeeklyReviewProposal: async () => frozenProposal,
    },
  );

  assert.equal(dryRun.type, "proposed_action");
  if (dryRun.type !== "proposed_action") assert.fail("expected frozen Review proposal");

  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: dryRun.action,
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /等待确认/);
  assert.match(markup, /本周复盘 · 2026-08-18/);
  assert.match(markup, /存在风险/);
  assert.match(markup, /完成 Review 严格结构化合同/);
  assert.match(markup, /1 项计划逾期：Review 安全收口/);
  assert.match(markup, /计划缺少可见产出/);
  assert.match(markup, /今天为逾期计划确定一个最小动作/);
  assert.match(markup, /关键指标/);
  assert.match(markup, /逾期计划.*1/s);
  assert.match(markup, /准备添加的行动建议/);
  assert.match(markup, /已有同一条建议.*不重复创建/s);
  assert.match(markup, /处理逾期计划/);
  assert.match(markup, /为逾期计划确定一个最小动作/);
  assert.match(markup, /确认后仅保存下方展示的复盘内容/);
  assert.doesNotMatch(markup, /snapshotFingerprint|source=model|health=risk/u);
  assert.doesNotMatch(markup, new RegExp(frozenProposal.snapshotFingerprint, "u"));
});
