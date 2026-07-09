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
      collection: "checklists",
      createdAt: "2026-07-03T08:04:00.000Z",
      intent: "create_checklist",
      preview: "创建清单「秋招准备」",
      threadId: 301,
    },
  ],
  recentReceipts: [
    {
      actionId: "action-create-plan",
      collection: "plans",
      createdAt: "2026-07-03T08:02:00.000Z",
      documentId: 55,
      id: 201,
      operation: "execute" as const,
      status: "succeeded",
      threadId: 301,
      title: "SunnyPanel Q3 上线计划",
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
  /* M6-B1: new receipt fields */
  assert.match(markup, /SunnyPanel Q3 上线计划/);
  assert.match(markup, /#55/);
  assert.match(markup, /Pending Confirmations/);
  assert.match(markup, /pending-action/);
  /* M6-B1: new pending fields */
  assert.match(markup, /创建清单「秋招准备」/);
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

/* ── M6-B1: Conditional rendering for new fields ── */

test("AgentOpsPanel renders receipt collection documentId and title only when present", () => {
  // Snapshot with all new fields present → they should render
  const withFields = renderToStaticMarkup(createElement(AgentOpsPanel, { snapshot }));

  assert.match(withFields, /SunnyPanel Q3 上线计划/);
  assert.match(withFields, /#55/);

  // Snapshot with new fields null → they should not leave empty gaps
  const withoutFields: AgentOpsSnapshot = {
    ...snapshot,
    pendingActions: [
      {
        actionId: "pending-minimal",
        collection: null,
        createdAt: "2026-07-03T08:04:00.000Z",
        intent: "create_plan",
        preview: null,
        threadId: 302,
      },
    ],
    recentReceipts: [
      {
        actionId: "action-simple",
        collection: null,
        createdAt: "2026-07-03T08:02:00.000Z",
        documentId: null,
        id: 999,
        operation: "execute" as const,
        status: "succeeded",
        threadId: 301,
        title: null,
      },
    ],
  };
  const markup = renderToStaticMarkup(createElement(AgentOpsPanel, { snapshot: withoutFields }));

  assert.match(markup, /action-simple/);
  assert.match(markup, /pending-minimal/);
  // When title/preview are null, the sunny-agent-ops-field elements must NOT render
  assert.doesNotMatch(markup, /sunny-agent-ops-field/);
});

test("AgentOpsPanel renders pending collection and preview only when present", () => {
  // Snapshot with new fields present → they should render
  const withFields = renderToStaticMarkup(createElement(AgentOpsPanel, { snapshot }));

  assert.match(withFields, /创建清单「秋招准备」/);

  // Snapshot with new fields null → they should not appear
  const withoutFields: AgentOpsSnapshot = {
    ...snapshot,
    pendingActions: [
      {
        actionId: "pending-minimal",
        collection: null,
        createdAt: "2026-07-03T08:04:00.000Z",
        intent: "create_plan",
        preview: null,
        threadId: 302,
      },
    ],
    recentReceipts: [
      {
        actionId: "action-minimal",
        collection: null,
        createdAt: "2026-07-03T08:02:00.000Z",
        documentId: null,
        id: 999,
        operation: "execute" as const,
        status: "succeeded",
        threadId: 301,
        title: null,
      },
    ],
  };
  const markup = renderToStaticMarkup(createElement(AgentOpsPanel, { snapshot: withoutFields }));

  assert.match(markup, /pending-minimal/);
  assert.match(markup, /action-minimal/);
  // When preview/title are null, the sunny-agent-ops-field elements must NOT render
  assert.doesNotMatch(markup, /sunny-agent-ops-field/);
});

test("AgentOpsPanel new fields do not render raw payload or secrets in UI", () => {
  const markup = renderToStaticMarkup(createElement(AgentOpsPanel, { snapshot }));

  // The Ops Panel must never expose raw internals in the displayed fields
  assert.doesNotMatch(markup, /affectedDocuments/);
  assert.doesNotMatch(markup, /beforeSnapshot/);
  assert.doesNotMatch(markup, /afterSnapshot/);
  assert.doesNotMatch(markup, /rollbackPayload/);
  assert.doesNotMatch(markup, /apiKey/);
  assert.doesNotMatch(markup, /api_key/);
  assert.doesNotMatch(markup, /\bauthorization\b/i);
  // "150 tokens" in Run card is fine — check for secret-like token patterns instead
  assert.doesNotMatch(markup, /\bsecret\b/i);
  assert.doesNotMatch(markup, /\bbearer\b/i);
  assert.doesNotMatch(markup, /access_?token/i);
  assert.doesNotMatch(markup, /refresh_?token/i);
});
