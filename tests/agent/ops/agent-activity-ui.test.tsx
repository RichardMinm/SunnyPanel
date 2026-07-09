import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { backendTraceEventsToActivitySteps } from "../../../src/lib/agent/activity";
import type { AgentActivityStep } from "../../../src/lib/agent/activity";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const loadAgentActivityTimeline = async () =>
  (await import("../../../src/components/dashboard/agent/AgentActivityTimeline")).AgentActivityTimeline;

const loadAgentTracePanel = async () =>
  (await import("../../../src/components/dashboard/agent/AgentTracePanel")).AgentTracePanel;

const loadMessageCard = async () =>
  (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;

const baseStep = (overrides: Partial<AgentActivityStep>): AgentActivityStep => ({
  id: overrides.id ?? "step",
  kind: overrides.kind ?? "understanding",
  status: overrides.status ?? "success",
  title: overrides.title ?? "已理解请求",
  visibility: overrides.visibility ?? "user",
  ...overrides,
});

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

test("AgentActivityTimeline renders visible status states", async () => {
  const AgentActivityTimeline = await loadAgentActivityTimeline();
  const markup = renderToStaticMarkup(
    createElement(AgentActivityTimeline, {
      steps: [
        baseStep({ id: "running", status: "running", title: "正在读取本地日程" }),
        baseStep({ id: "success", status: "success", title: "已完成查询" }),
        baseStep({ id: "waiting", status: "waiting", title: "等待你确认" }),
        baseStep({ id: "failed", status: "failed", title: "执行失败" }),
        baseStep({ id: "skipped", status: "skipped", title: "草案尚未写入日程" }),
      ],
    }),
  );

  assert.match(markup, /Agent 正在处理|执行过程/);
  assert.match(markup, /正在读取本地日程/);
  assert.match(markup, /已完成/);
  assert.match(markup, /等待确认/);
  assert.match(markup, /错误/);
  assert.match(markup, /跳过/);
  assert.match(markup, /data-state="running"/);
  assert.match(markup, /data-active="true"/);
  assert.match(markup, /不展示内部推理/);
});

test("AgentActivityTimeline collapses long step lists by default", async () => {
  const AgentActivityTimeline = await loadAgentActivityTimeline();
  const steps = Array.from({ length: 8 }, (_, index) =>
    baseStep({
      id: `step-${index}`,
      title: `步骤 ${index + 1}`,
    }),
  );
  const markup = renderToStaticMarkup(createElement(AgentActivityTimeline, { steps }));

  assert.match(markup, /展开全部 8 步/);
  assert.doesNotMatch(markup, /步骤 1/);
  assert.match(markup, /步骤 3/);
  assert.match(markup, /步骤 8/);
});

test("AgentActivityTimeline can expand to show all steps", async () => {
  const AgentActivityTimeline = await loadAgentActivityTimeline();
  const steps = Array.from({ length: 8 }, (_, index) =>
    baseStep({
      id: `step-${index}`,
      title: `步骤 ${index + 1}`,
    }),
  );
  const markup = renderToStaticMarkup(
    createElement(AgentActivityTimeline, {
      defaultExpanded: true,
      steps,
    }),
  );

  assert.match(markup, /收起/);
  assert.match(markup, /步骤 1/);
  assert.match(markup, /步骤 8/);
});

test("AgentActivityTimeline keeps developer trace out of the main conversation", async () => {
  const AgentActivityTimeline = await loadAgentActivityTimeline();
  const markup = renderToStaticMarkup(
    createElement(AgentActivityTimeline, {
      steps: [
        baseStep({
          id: "developer",
          summary: "{\"args\":{\"token\":\"secret\"}}",
          title: "LangGraph tool_call api_call policy object",
          visibility: "developer",
        }),
        baseStep({ id: "user", status: "running", title: "正在理解你的请求" }),
      ],
    }),
  );

  assert.match(markup, /正在理解你的请求/);
  assert.doesNotMatch(markup, /LangGraph|tool_call|api_call|policy object|token|secret/);
});

test("AgentActivityTimeline CSS supports subtle motion and reduced-motion fallback", () => {
  const css = readFileSync("src/app/styles/sunny-agent.css", "utf8");

  assert.match(css, /sunny-agent-activity-reveal/);
  assert.match(css, /sunny-agent-activity-pulse/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /data-active="true"/);
});

test("AgentTracePanel renders developer details with redacted sensitive fields", async () => {
  const AgentTracePanel = await loadAgentTracePanel();
  const markup = renderToStaticMarkup(
    createElement(AgentTracePanel, {
      action: null,
      activitySteps: [
        baseStep({
          details: {
            Authorization: "[redacted]",
            query: "schedule-items",
          },
          id: "developer",
          intent: "query_schedule",
          kind: "querying_database",
          latencyMs: 22,
          title: "读取 schedule-items",
          toolName: "query_schedule",
          visibility: "developer",
        }),
      ],
      debugMode: true,
      statusLabel: "已就绪",
      traceSteps: [],
    }),
  );

  assert.match(markup, /Activity/);
  assert.match(markup, /读取 schedule-items/);
  assert.match(markup, /query_schedule/);
  assert.match(markup, /tool: query_schedule/);
  assert.match(markup, /\[redacted\]/);
  assert.doesNotMatch(markup, /Bearer secret/);
});

test("AgentTracePanel renders backend trace events as developer activity", async () => {
  const AgentTracePanel = await loadAgentTracePanel();
  const activitySteps = backendTraceEventsToActivitySteps([
    {
      createdAt: "2026-07-05T08:00:00.000Z",
      inputPreview: {
        Authorization: "Bearer secret-token",
      },
      intent: "create_schedule_items",
      latencyMs: 34,
      phase: "tool_call",
      status: "success",
      threadId: "thread-1",
      title: "Execute 工具调用完成",
      toolName: "create_schedule_items",
    },
  ]);
  const markup = renderToStaticMarkup(
    createElement(AgentTracePanel, {
      action: null,
      activitySteps,
      debugMode: true,
      statusLabel: "已就绪",
      traceSteps: [],
    }),
  );

  assert.match(markup, /Activity/);
  assert.match(markup, /Execute 工具调用完成/);
  assert.match(markup, /create_schedule_items/);
  assert.match(markup, /34ms/);
  assert.match(markup, /查看脱敏 details/);
  assert.doesNotMatch(markup, /secret-token/);
});

test("MessageCard activity timeline does not render raw JSON details", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      activitySteps: [
        baseStep({
          details: {
            token: "abc",
          },
          id: "safe",
          title: "已完成查询",
        }),
      ],
      content: "已查询完成。",
      role: "assistant",
    }),
  );

  assert.match(markup, /已完成查询/);
  assert.doesNotMatch(markup, /token/);
  assert.doesNotMatch(markup, /\{&quot;/);
});

test("query_schedule activity does not show confirmation-write language", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      activitySteps: [
        baseStep({ id: "query", kind: "classifying_intent", title: "已识别为日程查询" }),
        baseStep({
          id: "readonly",
          kind: "checking_read_write_boundary",
          summary: "没有创建或修改任何日程。",
          title: "已确认这是只读操作",
        }),
      ],
      content: "范围：明天。\n明天没有已安排的日程。",
      role: "assistant",
    }),
  );

  assert.match(markup, /已识别为日程查询/);
  assert.match(markup, /已确认这是只读操作/);
  assert.doesNotMatch(markup, /确认后才会写入/);
  assert.doesNotMatch(markup, /等待你确认/);
});

test("MessageCard keeps product cards and activity timeline side by side", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      activitySteps: [
        baseStep({ id: "draft", kind: "generating_draft", title: "已生成计划草案" }),
        baseStep({ id: "not-written", kind: "writing_database", status: "skipped", title: "草案尚未写入数据库" }),
      ],
      content: "计划草案",
      planningDraft: planDraft,
      role: "assistant",
    }),
  );

  assert.match(markup, /计划草案/);
  assert.match(markup, /准备创建计划/);
  assert.match(markup, /已生成计划草案/);
  assert.match(markup, /草案尚未写入数据库/);
});

/* ── M6-C2: Loading Text Cleanup ── */

test("MessageCard does not show loading text when activitySteps are present", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      activitySteps: [
        baseStep({ id: "running", status: "running", title: "正在理解你的请求" }),
        baseStep({ id: "success", status: "success", title: "已读取工作区上下文" }),
      ],
      content: "",
      isStreaming: true,
      role: "assistant",
    }),
  );

  assert.match(markup, /正在理解你的请求/);
  assert.match(markup, /已读取工作区上下文/);
  assert.doesNotMatch(markup, /正在处理请求/);
});

test("MessageCard shows loading fallback when no activitySteps and streaming", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      activitySteps: [],
      content: "",
      isStreaming: true,
      role: "assistant",
    }),
  );

  assert.match(markup, /正在处理请求/);
});

test("MessageCard loading fallback hidden with developer-only activity steps", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      activitySteps: [
        baseStep({
          id: "dev",
          status: "running",
          title: "debug trace",
          visibility: "developer",
        }),
      ],
      content: "",
      isStreaming: true,
      role: "assistant",
    }),
  );

  // developer-only steps are filtered out, so fallback should show
  assert.match(markup, /正在处理请求/);
  assert.doesNotMatch(markup, /debug trace/);
});

test("MessageCard does not expose developer vocabulary in main chat area", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      activitySteps: [
        baseStep({ id: "user-step", title: "正在处理" }),
      ],
      content: "正常回复内容",
      role: "assistant",
    }),
  );

  assert.match(markup, /正在处理/);
  assert.match(markup, /正常回复内容/);
  assert.doesNotMatch(markup, /LangGraph/);
  assert.doesNotMatch(markup, /tool_call/);
  assert.doesNotMatch(markup, /api_call/);
  assert.doesNotMatch(markup, /policy_guard/);
  assert.doesNotMatch(markup, /backendTraceEvents/);
  assert.doesNotMatch(markup, /raw JSON/);
});

test("Draft cards still render correctly when activitySteps are present", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      activitySteps: [
        baseStep({ id: "draft-step", title: "已生成计划草案" }),
      ],
      content: "计划草案",
      planningDraft: planDraft,
      role: "assistant",
    }),
  );

  assert.match(markup, /准备创建计划/);
  assert.match(markup, /已生成计划草案/);
  // Draft card is present — the activity timeline sits below it
});
