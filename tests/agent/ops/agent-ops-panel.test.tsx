import assert from "node:assert/strict";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentOpsPanel } from "../../../src/components/dashboard/agent/AgentOpsPanel";
import type { AgentOpsSnapshot } from "../../../src/lib/agent/ops/snapshot";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const snapshot: AgentOpsSnapshot = {
  failures: [
    {
      createdAt: "2026-07-03T08:03:00.000Z",
      message: "rollback failed",
      source: "rollback",
    },
  ],
  pendingActions: [
    {
      actionId: "pending-action",
      createdAt: "2026-07-03T08:04:00.000Z",
      intent: "create_checklist",
      threadId: 301,
    },
  ],
  recentReceipts: [
    {
      actionId: "action-create-plan",
      createdAt: "2026-07-03T08:02:00.000Z",
      id: 201,
      operation: "execute",
      status: "succeeded",
      threadId: 301,
    },
  ],
  recentRuns: [
    {
      createdAt: "2026-07-03T08:00:00.000Z",
      durationMs: 1200,
      id: 101,
      intent: "planning",
      model: "gpt-5",
      status: "succeeded",
      totalTokens: 150,
    },
  ],
  summary: {
    failureCount: 1,
    pendingCount: 1,
    receiptsCount: 1,
    runsCount: 1,
  },
};

test("AgentOpsPanel renders summary and operations sections", () => {
  const markup = renderToStaticMarkup(createElement(AgentOpsPanel, { snapshot }));

  assert.match(markup, /Agent Ops/);
  assert.match(markup, /Runs/);
  assert.match(markup, /Receipts/);
  assert.match(markup, /Pending/);
  assert.match(markup, /Failures/);
  assert.match(markup, /Recent Runs/);
  assert.match(markup, /planning/);
  assert.match(markup, /gpt-5/);
  assert.match(markup, /150 tokens/);
  assert.match(markup, /1200ms/);
  assert.match(markup, /Recent Receipts/);
  assert.match(markup, /execute/);
  assert.match(markup, /action-create-plan/);
  assert.match(markup, /Pending Confirmations/);
  assert.match(markup, /pending-action/);
  assert.match(markup, /Failures/);
  assert.match(markup, /rollback failed/);
});

test("AgentOpsPanel renders friendly empty states", () => {
  const empty: AgentOpsSnapshot = {
    failures: [],
    pendingActions: [],
    recentReceipts: [],
    recentRuns: [],
    summary: {
      failureCount: 0,
      pendingCount: 0,
      receiptsCount: 0,
      runsCount: 0,
    },
  };
  const markup = renderToStaticMarkup(createElement(AgentOpsPanel, { snapshot: empty }));

  assert.match(markup, /暂无 AgentRun/);
  assert.match(markup, /暂无 receipt/);
  assert.match(markup, /暂无待确认操作/);
  assert.match(markup, /暂无失败或不确定动作/);
});

test("AgentOpsPanel does not render raw JSON blobs", () => {
  const markup = renderToStaticMarkup(createElement(AgentOpsPanel, { snapshot }));

  assert.doesNotMatch(markup, /rollbackPayload/);
  assert.doesNotMatch(markup, /traceSteps/);
  assert.doesNotMatch(markup, /\{&quot;/);
});
