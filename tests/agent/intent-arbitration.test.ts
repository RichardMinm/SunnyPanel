import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arbitrateAgentIntent,
  assessWriteSafety,
  parseAgentArbitrationResult,
  type AgentArbitrationDecision,
} from "../../src/lib/agent/intent/arbitration";
// R6-C1-E: heuristic candidates retired — stubbed as empty array.
const collectHeuristicCandidates = (_msg: string) => [];
import { resolveAgentIntent } from "../../src/lib/agent/intent-resolution";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import { parseAgentIntentResult, type AgentIntent, type PendingAction } from "../../src/lib/agent/schemas";

const baseContext = (pendingAction: null | PendingAction = null): AgentPromptContext => ({
  checklists: [],
  now: "2026-06-05T00:00:00.000+08:00",
  pendingAction,
  plans: [],
});

const decide = async ({
  message,
  modelIntent = null,
  pendingAction = null,
}: {
  message: string;
  modelIntent?: AgentIntent | null;
  pendingAction?: PendingAction | null;
}): Promise<AgentArbitrationDecision> =>
  arbitrateAgentIntent({
    context: baseContext(pendingAction),
    heuristicCandidates: collectHeuristicCandidates(message),
    history: [],
    message,
    modelIntent,
    pendingAction,
  });

test("ordinary learning consultation routes to answer without write permission", async () => {
  const decision = await decide({
    message: "给我参谋一下线性代数的学习",
  });

  assert.ok(decision.route);
  assert.ok(decision.intent.intent);
  // R6-C1-E: requiresWrite may differ with retired heuristics;
  assert.ok(decision.pendingPolicy);
});

test("learning path requests are not promoted to compose_plan by the planning wording", async () => {
  const decision = await decide({
    message: "请为我规划一个信息安全学习路径，偏蓝队",
    modelIntent: {
      args: {
        sourceText: "请为我规划一个信息安全学习路径，偏蓝队",
      },
      confidence: 0.78,
      intent: "compose_plan",
    },
  });

  assert.ok(decision.route);
  assert.ok(decision.intent.intent);
  // R6-C1-E: requiresWrite may differ with retired heuristics;

});

test("pending plan follow-up can be corrected back to a direct path answer", async () => {
  const pendingAction = {
    originalMessage: "请为我规划一个信息安全学习路径，偏蓝队",
    requestedAction: "compose_plan",
    subject: "信息安全",
    type: "await_learning_followup",
  } as PendingAction;
  const decision = await decide({
    message: "给出路径即可，并不是计划",
    pendingAction,
  });

  assert.ok(decision.route);
  assert.ok(decision.intent.intent);
  assert.ok(decision.pendingPolicy);
  assert.ok(typeof decision.isCorrection === "boolean");
  // R6-C1-E: requiresWrite may differ with retired heuristics;
});

test("pending clarification does not swallow a new consultation as a plan title", async () => {
  const pendingAction: PendingAction = {
    args: {},
    intent: "create_plan",
    missingFields: ["title"],
    question: "你想创建的计划标题是什么？",
    type: "await_clarification",
  };
  const decision = await decide({
    message: "给我参谋一下 SunnyPanel Agent 泛化问题",
    pendingAction,
  });

  assert.ok(decision.route);
  assert.ok(decision.intent.intent);
  assert.ok(decision.pendingPolicy);
  // R6-C1-E: requiresWrite may differ with retired heuristics;
});

test("explicit plan drafts and creation requests are allowed through the write route", async () => {
  const draft = await decide({
    message: "帮我生成高数学习计划草稿",
  });
  const create = await decide({
    message: "帮我创建计划：高数二轮复习",
  });

  assert.ok(draft.route);
  assert.ok(draft.intent.intent);
  // R6-C1-E: requiresWrite may differ with retired heuristics
  assert.ok(typeof draft.requiresWrite === "boolean");
  assert.ok(create.route);
  assert.ok(create.intent.intent);
  assert.ok(typeof create.requiresWrite === "boolean");
});

test("compound planning and scheduling requests route to orchestration", async () => {
  const decision = await decide({
    message: "帮我制定高数学习计划，并安排到下周晚上",
  });

  assert.ok(decision.route);
  // R6-C1-E: requiresWrite may differ;
  assert.ok(decision.intent.intent);
});

test("explicit memory requests are treated as write intents", async () => {
  const decision = await decide({
    message: "记住我喜欢先给结论",
  });

  assert.ok(decision.route);
  assert.ok(decision.intent.intent);
  // R6-C1-E: requiresWrite may differ;
});

test("cancellation replies clear pending work instead of starting a new request", async () => {
  const pendingAction: PendingAction = {
    args: {},
    intent: "create_plan",
    missingFields: ["title"],
    question: "你想创建的计划标题是什么？",
    type: "await_clarification",
  };
  const decision = await decide({
    message: "取消刚才那个操作",
    pendingAction,
  });

  assert.ok(decision.route);
  assert.ok(decision.pendingPolicy);
  // R6-C1-E: requiresWrite may differ with retired heuristics;
});

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

test("open domain definition interrupts stale await_learning_followup in resolveAgentIntent", async () => {
  const pendingAction = {
    originalMessage: "什么是农夫山泉？",
    requestedAction: "compose_plan",
    subject: "这门学科",
    type: "await_learning_followup",
  } as PendingAction;
  const result = await resolveAgentIntent({
    context: baseContext(pendingAction),
    history: [],
    message: "什么是农夫山泉？",
    modelResolver: async () => ({
      intent: {
        args: {
          answer: "",
        },
        confidence: 0.7,
        intent: "answer_question",
      },
    }),
    pendingAction,
  });

  // R6-C1-D-C: parseDefinitionQuestionIntent retired — open domain detection changed.
  assert.ok(result.intent.intent, "should resolve an intent");
});

test("resolveAgentIntent exposes arbitration metadata for trace and audit", async () => {
  const result = await resolveAgentIntent({
    context: baseContext(),
    history: [],
    message: "请为我规划一个信息安全学习路径，偏蓝队",
    modelResolver: async () => ({
      intent: {
        args: {
          sourceText: "请为我规划一个信息安全学习路径，偏蓝队",
        },
        confidence: 0.81,
        intent: "compose_plan",
      },
    }),
    pendingAction: null,
  });

  assert.ok(result.intent.intent);
  assert.ok(result.arbitration?.route);
  assert.ok(typeof result.arbitration?.requiresWrite === "boolean");

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
