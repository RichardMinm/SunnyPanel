import assert from "node:assert/strict";
import { test } from "node:test";

import { buildConversationStateFromTurn } from "../../src/lib/agent/conversation/conversation-state";
import { classifyFollowUpIntent, routeFollowUpIntent } from "../../src/lib/agent/conversation/follow-up-router";
import { routeDefinitionIntent } from "../../src/lib/agent/conversation/follow-up-router";
import { arbitrateAgentIntent } from "../../src/lib/agent/intent/arbitration";
import { intentRequiresWrite } from "../../src/lib/agent/intent/arbitration";
import { resolveOrchestrationPreflightIntent } from "../../src/lib/agent/intent-resolution";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";

const emptyContext = {
  checklists: [],
  now: new Date().toISOString(),
  pendingAction: null,
  plans: [],
} as AgentPromptContext;

test("classifyFollowUpIntent detects 我需要更加详细的信息 as expand_answer", () => {
  assert.equal(classifyFollowUpIntent("我需要更加详细的信息"), "expand_answer");
});

test("multi-turn CTF: round 1 explain_concept", () => {
  const round1 = routeDefinitionIntent("什么是 CTF？");

  assert.equal(round1?.intent, "explain_concept");
  assert.match(round1?.args.topic ?? "", /CTF/i);
  assert.match(round1?.args.answer ?? "", /夺旗|CTF/i);
  assert.equal(round1?.args.writeRequired, false);
  assert.equal(round1?.args.requiresConfirmation, false);
  assert.equal(round1?.args.riskLevel, "none");
});

test("multi-turn CTF: round 2 expand_answer inherits topic", () => {
  const history = [
    { role: "user" as const, content: "什么是 CTF？" },
    {
      role: "assistant" as const,
      content:
        "CTF（夺旗赛）是信息安全领域的实战竞赛形式：参赛者在授权环境中通过解题获取 flag。常见方向包括 Web、Reverse、Pwn。",
    },
  ];
  const conversationState = buildConversationStateFromTurn({
    assistantAnswer: history[1]!.content,
    intent: "explain_concept",
    message: "什么是 CTF？",
    topic: "CTF（夺旗赛）",
  });

  const round2 = routeFollowUpIntent({
    conversationState,
    history,
    message: "我需要更加详细的信息",
  });

  assert.equal(round2?.intent, "expand_answer");
  assert.match(round2?.args.topic ?? "", /CTF/i);
  assert.equal(round2?.args.target, "last_topic");
  assert.equal(round2?.args.writeRequired, false);
  assert.match(round2?.args.answer ?? "", /Jeopardy|Attack-Defense|Web/);
  assert.doesNotMatch(round2?.args.answer ?? "", /我还没理解/);
});

test("arbitration does not clarify when conversationState has lastTopic", async () => {
  const history = [
    { role: "user" as const, content: "什么是 CTF？" },
    { role: "assistant" as const, content: "CTF（夺旗赛）是..." },
  ];
  const conversationState = buildConversationStateFromTurn({
    assistantAnswer: history[1]!.content,
    intent: "explain_concept",
    message: "什么是 CTF？",
    topic: "CTF（夺旗赛）",
  });

  const decision = await arbitrateAgentIntent({
    context: emptyContext,
    conversationState,
    heuristicCandidates: [],
    history,
    message: "我需要更加详细的信息",
    modelDecision: null,
    modelIntent: null,
    pendingAction: null,
  });

  assert.equal(decision.intent.intent, "expand_answer");
  assert.notEqual(decision.intent.intent, "clarify");
  assert.equal(intentRequiresWrite(decision.intent), false);
});

test("resolveOrchestrationPreflightIntent routes expand_answer before clarify", () => {
  const history = [
    { role: "user" as const, content: "那么什么是CTF？" },
    { role: "assistant" as const, content: "CTF（夺旗赛）是信息安全领域的实战竞赛形式..." },
  ];
  const conversationState = buildConversationStateFromTurn({
    assistantAnswer: history[1]!.content,
    intent: "explain_concept",
    message: "那么什么是CTF？",
    topic: "CTF（夺旗赛）",
  });

  const intent = resolveOrchestrationPreflightIntent({
    context: emptyContext,
    conversationState,
    history,
    message: "我需要更加详细的信息",
    pendingAction: null,
  });

  assert.equal(intent?.intent, "expand_answer");
  assert.match(intent?.args.topic ?? "", /CTF/i);
});

test("give_learning_path follow-up on stored topic", () => {
  const intent = routeFollowUpIntent({
    conversationState: {
      lastAnswerDepth: "brief",
      lastAssistantAnswerSummary: "解释了 CTF",
      lastMentionedEntities: ["CTF", "Web"],
      lastTopic: "CTF（夺旗赛）",
      lastUserIntent: "explain_concept",
      updatedAt: new Date().toISOString(),
    },
    history: [],
    message: "怎么入门？",
  });

  assert.equal(intent?.intent, "give_learning_path");
  assert.match(intent?.args.answer ?? "", /学习路径|入门/);
});
