import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAgentSystemPrompt } from "../../src/lib/agent/prompts";
import {
  buildAgentThreadSummary,
  shouldRefreshAgentThreadSummary,
  toPromptThreadSummary,
} from "../../src/lib/agent/thread-summary";
import type { AgentChatMessage, PendingAction } from "../../src/lib/agent/schemas";

const messages: AgentChatMessage[] = [
  { content: "帮我做一个高等数学二轮复习计划。", role: "user" },
  { content: "我会先拆成函数、极限、积分三个阶段。", role: "assistant" },
  { content: "每天晚上优先安排 2 小时，不要太满。", role: "user" },
  { content: "已记录晚上 2 小时的节奏，并降低每日任务密度。", role: "assistant" },
  { content: "先把第一周排到日程。", role: "user" },
  { content: "我准备创建 7 条日程，等待你确认。", role: "assistant" },
  { content: "确认。", role: "user" },
  { content: "已创建第一周日程，并准备继续后续任务。", role: "assistant" },
];

const pendingAction: PendingAction = {
  completedTaskIds: ["t1"],
  deferredTaskIds: ["t2", "t3"],
  mode: "compound",
  orchestrationId: "orch-1",
  originalMessage: "帮我做一个高等数学二轮复习计划并排进日程。",
  reasoning: "先创建复习计划，再排入第一周日程，剩余任务等待继续。",
  tasks: [],
  type: "await_queue_resume",
};

test("thread summary condenses recent goals, assistant outcomes, and pending actions", () => {
  const summary = buildAgentThreadSummary({
    messages,
    pendingAction,
    previousSummary: "用户正在围绕考研数学建立长期复习系统。",
  });

  assert.match(summary.summary, /用户正在围绕考研数学建立长期复习系统/);
  assert.match(summary.summary, /帮我做一个高等数学二轮复习计划/);
  assert.match(summary.summary, /先把第一周排到日程/);
  assert.match(summary.summary, /已创建第一周日程/);
  assert.match(summary.summary, /await_queue_resume/);
  assert.equal(summary.messageCount, messages.length);
});

test("thread summary refresh waits until conversation is long enough", () => {
  assert.equal(shouldRefreshAgentThreadSummary({ messageCount: 3, previousMessageCount: null }), false);
  assert.equal(shouldRefreshAgentThreadSummary({ messageCount: 8, previousMessageCount: null }), true);
  assert.equal(shouldRefreshAgentThreadSummary({ messageCount: 9, previousMessageCount: 8 }), false);
  assert.equal(shouldRefreshAgentThreadSummary({ messageCount: 12, previousMessageCount: 8 }), true);
});

test("agent prompt includes compact thread summary when available", () => {
  const summary = toPromptThreadSummary({
    summary: "目标：继续高等数学二轮复习；当前状态：第一周日程已写入，等待继续后续排期。",
    summaryMessageCount: 8,
    summaryUpdatedAt: "2026-06-01T09:00:00.000Z",
  });

  const prompt = buildAgentSystemPrompt({
    checklists: [],
    memories: [],
    now: "2026-06-01T09:05:00.000Z",
    pendingAction: null,
    plans: [],
    threadSummary: summary,
  });

  assert.match(prompt, /线程摘要/);
  assert.match(prompt, /继续高等数学二轮复习/);
  assert.match(prompt, /coveredMessages=8/);
});
