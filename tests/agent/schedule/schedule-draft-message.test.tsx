import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AgentChatMessage, PendingAction } from "../../../src/lib/agent/schemas";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";
import {
  attachSchedulingDraftToLastAssistantMessage,
  extractSchedulingDraftFromSessionState,
} from "../../../src/lib/agent/schedule/draft-message";

const read = (path: string) => readFileSync(path, "utf8");

const schemasPath = "src/lib/agent/schemas.ts";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const conversationPath = "src/components/dashboard/agent/AgentConversation.tsx";
const workbenchPath = "src/components/dashboard/agent/AgentWorkbench.tsx";
const clientPath = "src/components/dashboard/agent-chat/use-agent-chat-messaging.ts";
const legacyPipelinePath = "src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts";
const langGraphPath = "src/lib/agent/langgraph/full-adapter.ts";

const sampleDraft: ScheduleDraft = {
  assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
  conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
  items: [
    {
      date: "每天",
      endTime: "22:00",
      sourceTaskTitle: "上线前",
      startTime: "20:00",
      title: "修复登录页",
    },
  ],
  nextActions: ["调整时间", "就按这个创建日程"],
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
};

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

test("Agent schemas expose schedulingDraft for response and messages", () => {
  const source = read(schemasPath);

  assert.match(source, /schedulingDraft\?: ScheduleDraft \| null/);
  assert.match(source, /import type \{ ScheduleDraft \}/);
});

test("MessageCard renders ScheduleDraftCard when schedulingDraft exists", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建日程「不应该显示为结果」。",
      role: "assistant",
      schedulingDraft: sampleDraft,
    }),
  );

  assert.match(markup, /日程草案/);
  assert.match(markup, /尚未写入日程/);
  assert.match(markup, /修复登录页/);
  assert.doesNotMatch(markup, /日程已创建/);
});

test("MessageCard leaves ordinary assistant messages without ScheduleDraftCard", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "可以，我先帮你确认几个关键点。",
      role: "assistant",
    }),
  );

  assert.doesNotMatch(markup, /日程草案/);
  assert.match(markup, /可以，我先帮你确认几个关键点/);
});

test("MessageCard dispatches ScheduleDraftCard without owning schedule JSX details", () => {
  const source = read(messageCardPath);

  assert.match(source, /ScheduleDraftCard/);
  assert.match(source, /schedulingDraft/);
  assert.doesNotMatch(source, /schedulingDraft\.items\.map/);
  assert.doesNotMatch(source, /schedulingDraft\.assumptions\.map/);
});

test("AgentConversation passes schedulingDraft without replacing confirmation cards", () => {
  const source = read(conversationPath);

  assert.match(source, /schedulingDraft=\{message\.schedulingDraft/);
  assert.match(source, /hasPendingConfirmation/);
  assert.match(source, /PlanConfirmationCard/);
  assert.match(source, /AgentApprovalCard/);
});

test("AgentWorkbench wires schedule draft buttons to composer-safe actions", () => {
  const source = read(workbenchPath);

  assert.match(source, /onScheduleDraftRevise/);
  assert.match(source, /我想调整这个日程草案：/);
  assert.match(source, /onScheduleDraftPrepareCreate/);
  assert.match(source, /就按这个日程草案创建日程/);
});

test("client attaches schedulingDraft from agent response", () => {
  const source = read(clientPath);

  assert.match(source, /schedulingDraft/);
  assert.match(source, /attachSchedulingDraftToLastAssistantMessage/);
});

test("agent responses carry schedulingDraft from schedule readiness gate", () => {
  const legacySource = read(legacyPipelinePath);
  const langGraphSource = read(langGraphPath);

  assert.match(legacySource, /schedulingDraft: scheduleReadinessGate\.scheduleDraft/);
  assert.match(langGraphSource, /schedulingDraft: scheduleReadinessGate\.scheduleDraft/);
});

test("scheduling draft can be extracted from session and attached to latest assistant message", () => {
  const messages: AgentChatMessage[] = [
    { content: "排到日程", role: "user" },
    { content: "这是日程草案", role: "assistant" },
  ];
  const draft = extractSchedulingDraftFromSessionState({
    scheduling: {
      draft: sampleDraft,
    },
  });
  const attached = attachSchedulingDraftToLastAssistantMessage(messages, draft, null);

  assert.equal(attached[1].schedulingDraft?.title, sampleDraft.title);
  assert.equal(attached[0].schedulingDraft, undefined);
  assert.equal(messages[1].schedulingDraft, undefined);
});

test("ordinary assistant messages do not receive schedulingDraft data", () => {
  const messages: AgentChatMessage[] = [
    { content: "普通回答", role: "assistant" },
  ];

  const attached = attachSchedulingDraftToLastAssistantMessage(messages, null, null);

  assert.equal(attached[0].schedulingDraft, undefined);
});

test("pendingAction keeps confirmation flow separate from ScheduleDraftCard projection", () => {
  const pendingAction: PendingAction = {
    action: {
      args: { sourceText: "创建日程" },
      changes: [],
      id: "action-schedule-card-test",
      intent: "compose_schedule_item",
      requiresConfirmation: true,
      riskLevel: "medium",
      summary: "创建日程",
    },
    type: "await_confirmation",
  };
  const messages: AgentChatMessage[] = [
    { content: "这是日程草案", role: "assistant" },
  ];

  const attached = attachSchedulingDraftToLastAssistantMessage(messages, sampleDraft, pendingAction);

  assert.equal(attached[0].schedulingDraft, undefined);
});

test("PlanDraftCard and ChecklistDraftCard dispatch remain intact", () => {
  const source = read(messageCardPath);

  assert.match(source, /PlanDraftCard/);
  assert.match(source, /ChecklistDraftCard/);
  assert.match(source, /planningDraft/);
  assert.match(source, /planningChecklistDraft/);
});
