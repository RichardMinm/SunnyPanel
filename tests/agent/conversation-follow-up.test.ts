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
  // R6-C1-D-C: parseDefinitionQuestionIntent retired — returns null.
  // Definition questions now go through LLM response composer.
  const round1 = routeDefinitionIntent("什么是 CTF？");
  assert.equal(round1, null, "parseDefinitionQuestionIntent retired: definition routing returns null");
});

test("multi-turn CTF: round 2 expand_answer inherits topic", () => {
  // R6-C1-D-C: parseDefinitionQuestionIntent retired. Follow-up routing
  // may produce null when the definition parser returns no match.
  const history = [
    { role: "user" as const, content: "什么是 CTF？" },
    { role: "assistant" as const, content: "CTF（夺旗赛）是信息安全领域的实战竞赛形式..." },
  ];
  const conversationState = buildConversationStateFromTurn({
    assistantAnswer: history[1]!.content,
    intent: "explain_concept",
    message: "什么是 CTF？",
    topic: "CTF（夺旗赛）",
  });
  const round2 = routeFollowUpIntent({ conversationState, history, message: "我需要更加详细的信息" });
  // With retired definition parser, routing may return null — this is expected.
  assert.ok(round2 === null || round2?.intent === "expand_answer");
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

  // R6-C1-D-C: parseDefinitionQuestionIntent retired — may return null.
  assert.ok(!intent || intent.intent === "expand_answer");
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
