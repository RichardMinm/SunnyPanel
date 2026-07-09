import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAgentActivitySteps,
  sanitizeAgentActivityDetailsRecord,
} from "../../src/lib/agent/activity";
import type { ChecklistDraft } from "../../src/lib/agent/planning/checklist-draft";
import type { PlanDraft } from "../../src/lib/agent/planning/draft";
import type { ScheduleDraft } from "../../src/lib/agent/schedule/draft";
import type { PendingAction } from "../../src/lib/agent/schemas";

const titles = (steps: ReturnType<typeof buildAgentActivitySteps>) => steps.map((step) => step.title);
const kinds = (steps: ReturnType<typeof buildAgentActivitySteps>) => steps.map((step) => step.kind);

const planDraft: PlanDraft = {
  goal: "SunnyPanel 第一版上线",
  stages: [
    {
      tasks: ["冻结范围", "完成部署"],
      title: "上线准备",
    },
  ],
  title: "SunnyPanel 第一版上线计划草案",
};

const checklistDraft: ChecklistDraft = {
  groups: [
    {
      items: [{ done: false, title: "冻结范围" }],
      title: "上线准备",
    },
  ],
  title: "SunnyPanel 上线清单草案",
};

const scheduleDraft: ScheduleDraft = {
  items: [
    {
      date: "2026-06-30",
      endTime: "22:00",
      startTime: "20:00",
      title: "修复登录页",
    },
  ],
  sourceType: "manual",
  title: "登录页修复日程草案",
};

const pendingAction: PendingAction = {
  action: {
    args: { title: "SunnyPanel 第一版上线" },
    capability: "preview_create_plan",
    changes: [
      {
        collection: "plans",
        operation: "create",
        preview: "创建计划",
      },
    ],
    id: "action-create-plan",
    intent: "create_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    summary: "将创建计划",
    toolName: "create_plan",
  },
  type: "await_confirmation",
};

test("query_schedule activity stays read-only and skips write stages", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "范围：明天。\n明天没有已安排的日程。",
    intent: "query_schedule",
  });

  assert.match(titles(steps).join("\n"), /已识别为日程查询/);
  assert.match(titles(steps).join("\n"), /已读取本地日程/);
  assert.match(titles(steps).join("\n"), /已确认这是只读操作/);
  assert.doesNotMatch(kinds(steps).join(","), /dry_run/);
  assert.doesNotMatch(kinds(steps).join(","), /policy_guard/);
  assert.doesNotMatch(kinds(steps).join(","), /executing|awaiting_confirmation/);
});

test("PlanDraft activity marks the plan as draft-only", () => {
  const steps = buildAgentActivitySteps({ planningDraft: planDraft });

  assert.match(titles(steps).join("\n"), /已识别为计划创建/);
  assert.match(titles(steps).join("\n"), /已生成计划草案/);
  assert.match(titles(steps).join("\n"), /草案尚未写入数据库/);
});

test("ChecklistDraft activity marks the checklist as draft-only", () => {
  const steps = buildAgentActivitySteps({ planningChecklistDraft: checklistDraft });

  assert.match(titles(steps).join("\n"), /正在从计划草案生成清单/);
  assert.match(titles(steps).join("\n"), /已生成清单草案/);
  assert.match(titles(steps).join("\n"), /草案尚未写入数据库/);
});

test("ScheduleDraft activity marks the schedule as draft-only", () => {
  const steps = buildAgentActivitySteps({ schedulingDraft: scheduleDraft });

  assert.match(titles(steps).join("\n"), /已识别为日程创建/);
  assert.match(titles(steps).join("\n"), /已检查可用时间/);
  assert.match(titles(steps).join("\n"), /已检查本地冲突/);
  assert.match(titles(steps).join("\n"), /草案尚未写入日程/);
});

test("pending confirmation activity exposes dry-run, guard, and waiting states", () => {
  const steps = buildAgentActivitySteps({ pendingAction });

  assert.match(titles(steps).join("\n"), /已完成写入预览/);
  assert.match(titles(steps).join("\n"), /已通过安全检查/);
  assert.match(titles(steps).join("\n"), /等待你确认/);
  assert.match(titles(steps).join("\n"), /确认后才会写入数据库/);
});

test("execute result activity records receipt and rollback availability", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "已创建 2 个日程项，时间范围：2026-06-30。",
    lastRollbackPayload: { strategy: "delete_created_documents" },
  });

  assert.match(titles(steps).join("\n"), /已执行写入/);
  assert.match(titles(steps).join("\n"), /已写入数据库/);
  assert.match(titles(steps).join("\n"), /已记录操作凭证/);
  assert.match(titles(steps).join("\n"), /支持撤销/);
});

test("error activity reports a failed step and a recorded summary", () => {
  const steps = buildAgentActivitySteps({
    error: {
      code: "payload_error",
      message: "Payload write failed",
    },
  });

  assert.equal(steps[0].status, "failed");
  assert.match(titles(steps).join("\n"), /执行失败/);
  assert.match(titles(steps).join("\n"), /已记录错误摘要/);
});

test("activity details sanitizer redacts sensitive keys", () => {
  const sanitized = sanitizeAgentActivityDetailsRecord({
    Authorization: "Bearer secret-token",
    Cookie: "sid=secret",
    nested: {
      password: "pw",
      secret: "hidden",
      token: "abc",
    },
    rawHeader: "Authorization: Bearer abc.def; Cookie: sid=123; token=visible",
    title: "safe",
  });

  assert.equal(sanitized?.Authorization, "[redacted]");
  assert.equal(sanitized?.Cookie, "[redacted]");
  assert.deepEqual(sanitized?.nested, {
    password: "[redacted]",
    secret: "[redacted]",
    token: "[redacted]",
  });
  assert.match(String(sanitized?.rawHeader), /Authorization: \[redacted\]/);
  assert.match(String(sanitized?.rawHeader), /Cookie: \[redacted\]/);
  assert.doesNotMatch(String(sanitized?.rawHeader), /abc\.def|sid=123|visible/);
  assert.equal(sanitized?.title, "safe");
});

test("activity details sanitizer truncates large payloads", () => {
  const longString = "x".repeat(500);
  const sanitized = sanitizeAgentActivityDetailsRecord({
    items: Array.from({ length: 30 }, (_, index) => index),
    payload: longString,
  });

  assert.match(String(sanitized?.payload), /\[truncated\]/);
  assert.equal(Array.isArray(sanitized?.items), true);
  assert.equal((sanitized?.items as unknown[]).length, 21);
});

/* ── M6-A1: New activity paths ── */

test("plan-compose/create result generates structured activity steps", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "已创建完整计划「Sprint Plan」（3 个阶段，14 天）。我已经把目标、关键步骤、验收标准、风险和 Agent Brief 写进计划详情。",
  });

  const titlesStr = titles(steps).join("\n");
  assert.match(titlesStr, /已识别为计划创建/);
  assert.match(titlesStr, /已生成计划草案/);
  assert.match(titlesStr, /已完成写入预览/);
  assert.match(titlesStr, /已通过安全检查/);
  assert.match(titlesStr, /已执行写入/);
  assert.match(titlesStr, /已写入数据库/);
  assert.match(titlesStr, /已记录操作凭证/);
  assert.match(titlesStr, /支持撤销/);
});

test("plan query message generates read-only query steps", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "以下是你的计划进度：Sprint Plan 当前完成 42%。",
    intent: "query_plan_progress",
  });

  assert.match(titles(steps).join("\n"), /已识别为计划查询/);
  assert.match(titles(steps).join("\n"), /已读取计划数据/);
  assert.match(titles(steps).join("\n"), /已确认这是只读操作/);
  assert.match(titles(steps).join("\n"), /已完成查询/);
  // No write steps
  assert.doesNotMatch(kinds(steps).join(","), /dry_run/);
  assert.doesNotMatch(kinds(steps).join(","), /policy_guard/);
  assert.doesNotMatch(kinds(steps).join(","), /executing/);
  assert.doesNotMatch(kinds(steps).join(","), /writing_database/);
});

test("query-plan: Chinese text without creation keywords triggers query path", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "当前计划的进度如下：Sprint Plan 完成 42%，3 个清单关联中。",
  });

  const titlesStr = titles(steps).join("\n");
  assert.match(titlesStr, /已识别为计划查询/);
  assert.doesNotMatch(titlesStr, /创建/);
});

test("plan query: does not generate write/confirmation/rollback steps", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "查看计划进度",
    intent: "query_plan_progress",
  });

  const kindsStr = kinds(steps).join(",");
  assert.doesNotMatch(kindsStr, /dry_run/);
  assert.doesNotMatch(kindsStr, /executing/);
  assert.doesNotMatch(kindsStr, /awaiting_confirmation/);
  assert.doesNotMatch(kindsStr, /rollback/);
});

/* ── Developer-only filtering ── */

test("backendTraceEventToActivityStep: developer steps are marked visibility=developer", async () => {
  const { backendTraceEventToActivityStep } = await import("../../src/lib/agent/activity/build-activity-steps");

  const step = backendTraceEventToActivityStep({
    phase: "tool_call",
    status: "success",
    title: "create_plan executed",
    toolName: "create_plan",
    intent: "create_plan",
    threadId: "t1",
  });

  assert.equal(step.visibility, "developer");
  assert.ok(step.toolName !== undefined);
});

test("backendTraceEventToUserActivityStep: user-visible steps exclude tool names and raw details", async () => {
  const { backendTraceEventToUserActivityStep } = await import("../../src/lib/agent/activity/build-activity-steps");

  const step = backendTraceEventToUserActivityStep({
    phase: "tool_call",
    status: "success",
    title: "create_plan executed",
    toolName: "create_plan",
    intent: "create_plan",
    threadId: "t1",
  });

  assert.equal(step.visibility, "user");
  assert.doesNotMatch(step.title, /create_plan/);
  assert.doesNotMatch(step.title, /tool_call/);
  assert.equal(step.toolName, undefined);
});

/* ── Sensitive data redaction ── */

test("buildAgentActivitySteps: no raw sensitive data in user-visible steps", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "已创建完整计划「Demo」。",
  });

  for (const step of steps) {
    if (step.visibility !== "user") continue;
    const raw = JSON.stringify(step);
    assert.doesNotMatch(raw, /Authorization/);
    assert.doesNotMatch(raw, /Cookie/);
    assert.doesNotMatch(raw, /secret/i);
    assert.doesNotMatch(raw, /token/i);
  }
});

/* ── Streaming fallback ── */

test("MessageCard source: streaming without activity shows structured fallback", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("src/components/dashboard/agent/MessageCard.tsx", "utf8");

  assert.ok(source.includes("正在处理请求"), "streaming fallback must be structured");
  assert.doesNotMatch(source, /正在生成回复/);
});

/* ── tool_call user-visible title mapping ── */

test("tool_call phase maps to user-friendly titles in user-visible activity", async () => {
  const { backendTraceEventToUserActivityStep } = await import("../../src/lib/agent/activity/build-activity-steps");

  const running = backendTraceEventToUserActivityStep({
    phase: "tool_call",
    status: "started",
    title: "raw tool title",
    threadId: "t1",
  });
  assert.match(running.title, /正在读取或整理数据/);
  assert.equal(running.visibility, "user");

  const success = backendTraceEventToUserActivityStep({
    phase: "tool_call",
    status: "success",
    title: "raw tool title",
    threadId: "t1",
  });
  assert.match(success.title, /数据整理完成/);
  assert.equal(success.visibility, "user");
});
