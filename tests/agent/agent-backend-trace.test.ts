import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendAgentTraceEvent,
  sanitizeAgentTraceEvent,
  type AgentTraceEventPayload,
} from "../../src/lib/agent/trace";
import {
  appendBackendTraceEventToActivitySteps,
  backendTraceEventsToActivitySteps,
  buildAgentActivitySteps,
} from "../../src/lib/agent/activity";

const baseTraceEvent = (
  overrides: Partial<AgentTraceEventPayload> = {},
): AgentTraceEventPayload => ({
  createdAt: "2026-07-05T08:00:00.000Z",
  phase: "router",
  status: "success",
  threadId: "thread-1",
  title: "已完成路由判断",
  ...overrides,
});

test("backend trace sanitizer redacts credentials and raw prompt/response payloads", () => {
  const sanitized = sanitizeAgentTraceEvent(
    baseTraceEvent({
      inputPreview: {
        Authorization: "Bearer live-access-token",
        Cookie: "sid=secret-cookie",
        apiKey: "key-123",
        nested: {
          password: "secret-password",
          rawPrompt: "full user prompt should not be stored",
          token: "nested-token",
        },
        text: "Authorization: Bearer abc.def; Cookie: sid=abc; token=visible",
      },
      outputPreview: {
        rawResponse: "full model response should not be stored",
        secret: "hidden",
      },
      summary: "safe summary",
    }),
  );

  const serialized = JSON.stringify(sanitized);

  assert.equal((sanitized.inputPreview as Record<string, unknown>).Authorization, "[redacted]");
  assert.equal((sanitized.inputPreview as Record<string, unknown>).Cookie, "[redacted]");
  assert.equal((sanitized.inputPreview as Record<string, unknown>).apiKey, "[redacted]");
  assert.doesNotMatch(serialized, /live-access-token|secret-cookie|key-123|secret-password|nested-token/u);
  assert.doesNotMatch(serialized, /full user prompt|full model response|abc\.def|sid=abc|visible/u);
  assert.match(serialized, /\[redacted\]/u);
});

test("backend trace sanitizer truncates large and deeply nested payloads", () => {
  const sanitized = sanitizeAgentTraceEvent(
    baseTraceEvent({
      inputPreview: {
        items: Array.from({ length: 40 }, (_, index) => ({
          index,
          value: "x".repeat(80),
        })),
      },
      outputPreview: {
        payload: "y".repeat(1000),
      },
    }),
  );

  const input = sanitized.inputPreview as { items: unknown[] };
  const output = sanitized.outputPreview as { payload: string };

  assert.equal(Array.isArray(input.items), true);
  assert.equal(input.items.length, 21);
  assert.match(output.payload, /\[truncated\]/u);
});

test("appendAgentTraceEvent keeps the main flow non-blocking when persistence fails", async () => {
  const collector: AgentTraceEventPayload[] = [];
  const result = await appendAgentTraceEvent({
    collector,
    event: baseTraceEvent({
      inputPreview: {
        token: "must-redact-before-collect",
      },
    }),
    sink: async () => {
      throw new Error("trace store unavailable");
    },
  });

  assert.equal(result.persisted, false);
  assert.equal(result.writeFailed, true);
  assert.equal(collector.length, 1);
  assert.equal((collector[0].inputPreview as Record<string, unknown>).token, "[redacted]");
  assert.equal(
    result.errorMessage,
    "trace_write_failed: 追踪记录未能保存。",
  );
  assert.doesNotMatch(result.errorMessage ?? "", /trace store unavailable/u);
});

test("backend trace events map to developer activity steps", () => {
  const steps = backendTraceEventsToActivitySteps([
    baseTraceEvent({ phase: "dry_run", status: "started", title: "开始写入预览", toolName: "create_plan" }),
    baseTraceEvent({ phase: "policy_guard", status: "success", title: "Policy Guard 已通过", intent: "create_plan" }),
    baseTraceEvent({ actionId: "action-1", phase: "pending_confirmation", status: "success", title: "已创建待确认操作" }),
    baseTraceEvent({ actionId: "action-1", phase: "execute", status: "success", title: "已执行写入" }),
    baseTraceEvent({ actionId: "action-1", phase: "receipt", status: "success", title: "已记录 receipt" }),
  ]);

  assert.deepEqual(
    steps.map((step) => step.kind),
    ["dry_run", "policy_guard", "awaiting_confirmation", "executing", "recording_receipt"],
  );
  assert.equal(steps.every((step) => step.visibility === "developer"), true);
  assert.equal(steps[0].status, "running");
  assert.equal(steps[3].actionId, "action-1");
});

test("live backend trace activity appends without replacing user-visible steps", () => {
  const existing = buildAgentActivitySteps({
    assistantMessage: "范围：明天。\n明天没有已安排的日程。",
    intent: "query_schedule",
  });

  const nextSteps = appendBackendTraceEventToActivitySteps(
    existing,
    baseTraceEvent({
      createdAt: "2026-07-05T08:01:00.000Z",
      intent: "query_schedule",
      phase: "api_call",
      status: "started",
      title: "正在查询本地日程",
    }),
  );

  assert.equal(nextSteps.length, existing.length + 1);
  assert.equal(nextSteps[0].visibility, "user");
  assert.equal(nextSteps.at(-1)?.kind, "calling_api");
  assert.equal(nextSteps.at(-1)?.status, "running");
});

test("live backend trace activity uses stable ids to reconcile duplicate events", () => {
  const event = baseTraceEvent({
    createdAt: "2026-07-05T08:02:00.000Z",
    phase: "dry_run",
    status: "started",
    title: "正在 dry-run",
  });

  const first = appendBackendTraceEventToActivitySteps([], event);
  const second = appendBackendTraceEventToActivitySteps(first, {
    ...event,
    status: "success",
  });

  assert.equal(first[0].id, second[0].id);
  assert.equal(second.length, 1);
  assert.equal(second[0].status, "success");
  assert.equal(second[0].title, "已生成写入预览");
});

test("live backend trace activity maps backend phases to user-facing labels", () => {
  const steps = [
    appendBackendTraceEventToActivitySteps([], baseTraceEvent({
      phase: "router",
      status: "started",
      title: "LangGraph router started",
    })).at(-1),
    appendBackendTraceEventToActivitySteps([], baseTraceEvent({
      intent: "query_schedule",
      phase: "api_call",
      status: "started",
      title: "api_call schedule-items",
    })).at(-1),
    appendBackendTraceEventToActivitySteps([], baseTraceEvent({
      phase: "policy_guard",
      status: "started",
      title: "policy_guard decision",
    })).at(-1),
    appendBackendTraceEventToActivitySteps([], baseTraceEvent({
      phase: "pending_confirmation",
      status: "success",
      title: "pending_confirmation created",
    })).at(-1),
    appendBackendTraceEventToActivitySteps([], baseTraceEvent({
      phase: "execute",
      status: "started",
      title: "execute tool",
    })).at(-1),
    appendBackendTraceEventToActivitySteps([], baseTraceEvent({
      phase: "receipt",
      status: "success",
      title: "receipt stored",
    })).at(-1),
  ].filter((step): step is NonNullable<typeof step> => Boolean(step));

  assert.deepEqual(
    steps.map((step) => step.title),
    [
      "正在理解你的请求",
      "正在查询本地日程",
      "正在检查安全边界",
      "等待你确认",
      "正在执行写入",
      "已记录操作凭证",
    ],
  );
  assert.equal(steps.every((step) => step.visibility === "user"), true);
  assert.doesNotMatch(steps.map((step) => step.title).join("\n"), /LangGraph|api_call|policy_guard|execute tool/u);
});

test("query_schedule backend trace remains read-only and excludes write phases", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "范围：明天。\n明天没有已安排的日程。",
    backendTraceEvents: [
      baseTraceEvent({ intent: "query_schedule", phase: "router", title: "已识别为日程查询" }),
      baseTraceEvent({ apiPath: "schedule-items", intent: "query_schedule", phase: "api_call", title: "读取 schedule-items" }),
      baseTraceEvent({ intent: "query_schedule", phase: "finalize", title: "已完成查询" }),
    ],
    intent: "query_schedule",
  });

  const kinds = steps.map((step) => step.kind).join(",");

  assert.match(kinds, /reading_schedule|calling_api/u);
  assert.doesNotMatch(kinds, /dry_run|policy_guard|awaiting_confirmation|executing|recording_receipt|rollback/u);
});

test("write-flow backend trace includes dry-run, guard, confirmation, execute, and receipt", () => {
  const steps = buildAgentActivitySteps({
    assistantMessage: "已创建 1 个日程项，时间范围：2026-07-06。",
    backendTraceEvents: [
      baseTraceEvent({ phase: "dry_run", status: "success", title: "已完成写入预览" }),
      baseTraceEvent({ phase: "policy_guard", status: "success", title: "Policy Guard 已通过" }),
      baseTraceEvent({ phase: "pending_confirmation", status: "success", title: "已创建待确认操作" }),
      baseTraceEvent({ phase: "execute", status: "success", title: "已执行写入" }),
      baseTraceEvent({ phase: "receipt", status: "success", title: "已记录 receipt" }),
    ],
    lastRollbackSourceRunId: 91,
  });

  const kinds = steps.map((step) => step.kind);

  assert.ok(kinds.includes("dry_run"));
  assert.ok(kinds.includes("policy_guard"));
  assert.ok(kinds.includes("awaiting_confirmation"));
  assert.ok(kinds.includes("executing"));
  assert.ok(kinds.includes("recording_receipt"));
});

test("failed tool trace carries sanitized error summary", () => {
  const steps = backendTraceEventsToActivitySteps([
    baseTraceEvent({
      error: {
        code: "payload_error",
        message: "Payload failed with Authorization: Bearer secret-token",
        name: "PayloadError",
      },
      phase: "tool_call",
      status: "failed",
      title: "create_schedule_items 执行失败",
      toolName: "create_schedule_items",
    }),
  ]);

  assert.equal(steps[0].status, "failed");
  assert.equal(steps[0].kind, "calling_tool");
  assert.equal(steps[0].toolName, "create_schedule_items");
  assert.match(JSON.stringify(steps[0]), /\[redacted\]/u);
  assert.doesNotMatch(JSON.stringify(steps[0]), /secret-token/u);
});
