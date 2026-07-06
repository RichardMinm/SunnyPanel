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
