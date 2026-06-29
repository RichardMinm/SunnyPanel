import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDefinitionQuestionIntent } from "../../src/lib/agent/intent/heuristics/knowledge";
import { parseHeuristicIntent } from "../../src/lib/agent/intent/heuristics";
import { shouldTrustOrchestratorPreResolve } from "../../src/lib/agent/orchestration/plan-source";
import { createClarifyIntent } from "../../src/lib/agent/schemas";
import {
  parseElaborationFollowupIntent,
} from "../../src/lib/agent/intent/heuristics/knowledge";
import { resolveOrchestrationPreflightIntent } from "../../src/lib/agent/intent-resolution";

test("shouldTrustOrchestratorPreResolve rejects heuristic clarify fast-path", () => {
  assert.equal(
    shouldTrustOrchestratorPreResolve(
      createClarifyIntent("能力介绍"),
      "heuristic",
    ),
    false,
  );
});

test("shouldTrustOrchestratorPreResolve accepts llm clarify fast-path", () => {
  assert.equal(
    shouldTrustOrchestratorPreResolve(
      createClarifyIntent("需要补充字段"),
      "llm",
    ),
    true,
  );
});

test("parseDefinitionQuestionIntent answers 什么是网络安全", () => {
  const intent = parseDefinitionQuestionIntent("什么是网络安全？");

  assert.equal(intent?.intent, "answer_question");
  assert.match(intent?.args.answer ?? "", /信息安全|网络安全/);
  assert.doesNotMatch(intent?.args.answer ?? "", /我现在可以帮你创建计划/);
});

test("parseDefinitionQuestionIntent open domain uses LLM path not curated template", () => {
  const intent = parseDefinitionQuestionIntent("什么是农夫山泉？");

  assert.equal(intent?.intent, "answer_question");
  assert.equal(intent?.args.openDomainTopic, "农夫山泉");
  assert.equal(intent?.args.answer, "");
  assert.equal(intent?.args.learningContext, undefined);
});

test("parseHeuristicIntent routes 什么是网络安全 to answer_question", () => {
  const intent = parseHeuristicIntent("什么是网络安全？");

  assert.equal(intent.intent, "answer_question");
  assert.match(intent.args.answer ?? "", /信息安全|网络安全/);
});

test("parseDefinitionQuestionIntent handles discourse prefix 那么什么是CTF呢", () => {
  const intent = parseDefinitionQuestionIntent("那么什么是CTF呢？");

  assert.equal(intent?.intent, "answer_question");
  assert.match(intent?.args.answer ?? "", /CTF|夺旗/);
  assert.doesNotMatch(intent?.args.answer ?? "", /我还没理解/);
});

test("parseHeuristicIntent routes 那么什么是CTF呢 to answer_question", () => {
  const intent = parseHeuristicIntent("那么什么是CTF呢？");

  assert.equal(intent.intent, "answer_question");
  assert.match(intent.args.answer ?? "", /CTF|夺旗/);
});

test("parseElaborationFollowupIntent expands CTF after conversation history", () => {
  const history = [
    { role: "user" as const, content: "什么是网络安全？" },
    { role: "assistant" as const, content: "信息安全是保护信息系统..." },
    { role: "user" as const, content: "那么什么是CTF？" },
    { role: "assistant" as const, content: "CTF（夺旗赛）是信息安全领域的实战竞赛形式..." },
  ];
  const intent = parseElaborationFollowupIntent("我需要更加详细的信息", history);

  assert.equal(intent?.intent, "answer_question");
  assert.match(intent?.args.answer ?? "", /Jeopardy|Attack-Defense|Web/);
  assert.doesNotMatch(intent?.args.answer ?? "", /我还没理解/);
});

test("resolveOrchestrationPreflightIntent prefers open domain over await_learning_followup", () => {
  const intent = resolveOrchestrationPreflightIntent({
    context: {
      checklists: [],
      now: new Date().toISOString(),
      pendingAction: null,
      plans: [],
    } as import("../../src/lib/agent/prompts").AgentPromptContext,
    message: "什么是农夫山泉？",
    pendingAction: {
      type: "await_learning_followup",
      subject: "这门学科",
      originalMessage: "什么是农夫山泉？",
      requestedAction: "compose_plan",
    },
  });

  assert.equal(intent?.intent, "answer_question");
  assert.equal(intent?.args.openDomainTopic, "农夫山泉");
  assert.equal(intent?.args.answer, "");
});

test("resolveOrchestrationPreflightIntent handles elaboration with await_learning_followup", () => {
  const intent = resolveOrchestrationPreflightIntent({
    context: {
      checklists: [],
      now: new Date().toISOString(),
      pendingAction: null,
      plans: [],
    } as import("../../src/lib/agent/prompts").AgentPromptContext,
    message: "我需要更加详细的信息",
    pendingAction: {
      type: "await_learning_followup",
      subject: "CTF（夺旗赛）",
      originalMessage: "那么什么是CTF？",
    },
  });

  assert.equal(intent?.intent, "expand_answer");
  assert.match(intent?.args.answer ?? "", /Jeopardy|Attack-Defense/);
});
