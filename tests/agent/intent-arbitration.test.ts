import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessWriteSafety,
  parseAgentArbitrationResult,
} from "../../src/lib/agent/intent/arbitration";
import { parseAgentIntentResult } from "../../src/lib/agent/schemas";

test("write safety blocks implicit write intents when the user only asks for advice", () => {
  const assessment = assessWriteSafety({
    intent: {
      args: {
        sourceText: "请为我规划一个信息安全学习路径，偏蓝队",
      },
      intent: "compose_plan",
    },
    message: "请为我规划一个信息安全学习路径，偏蓝队",
  });

  assert.equal(assessment.requiresWrite, true);
  assert.equal(assessment.allowed, false);
  assert.equal(assessment.explicitWriteSignal, false);
});

test("parses structured LLM arbitration wrapper while keeping AgentIntent compatibility", () => {
  const parsed = parseAgentArbitrationResult({
    decision: {
      confidence: 0.91,
      isCorrection: true,
      pendingPolicy: "correct_pending_intent",
      reason: "用户明确纠偏，只要路径回答。",
      requiresWrite: false,
      route: "answer",
    },
    intent: {
      args: {
        answer: "信息安全蓝队学习路径：先网络基础，再日志分析。",
      },
      confidence: 0.9,
      intent: "answer_question",
    },
  });

  assert.equal(parsed?.route, "answer");
  assert.equal(parsed?.pendingPolicy, "correct_pending_intent");
  assert.equal(parsed?.intent.intent, "answer_question");
  assert.equal(parsed?.requiresWrite, false);
});

test("parseAgentIntentResult parses the flat sub-agent format", () => {
  const parsed = parseAgentIntentResult({
    args: {
      confidence: 0.85,
      content: "用户希望回复默认简洁，先给结论再给必要细节。",
      title: "偏好：回复先结论后细节",
      type: "preference",
    },
    confidence: 0.9,
    intent: "save_memory",
  });

  assert.equal(parsed?.intent, "save_memory");
  assert.equal(parsed?.intent === "save_memory" ? parsed.args.type : null, "preference");
});

test("parseAgentIntentResult unwraps the main-prompt decision wrapper into the same intent", () => {
  const flat = {
    args: { answer: "线性代数先学线性方程组与矩阵运算。" },
    confidence: 0.9,
    intent: "answer_question",
  };
  const wrapped = {
    decision: {
      confidence: 0.9,
      pendingPolicy: "start_new_intent",
      reason: "用户在咨询学习路径，直接回答。",
      requiresWrite: false,
      route: "answer",
    },
    intent: flat,
  };

  const parsedFlat = parseAgentIntentResult(flat);
  const parsedWrapped = parseAgentIntentResult(wrapped);

  assert.equal(parsedWrapped?.intent, "answer_question");
  assert.deepEqual(parsedWrapped, parsedFlat);
});
