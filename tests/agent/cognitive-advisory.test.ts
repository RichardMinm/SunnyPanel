import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCognitiveAdvisoryAnswer,
  buildCognitiveAdvisoryAnswerWithModel,
  buildAgentCognitiveFrame,
  checkAgentAnswerQuality,
  parseAgentAnswerPlan,
} from "../../src/lib/agent/cognitive-advisory";
import rawCognitiveEvalCases from "./fixtures/cognitive-evals.json";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { PendingAction } from "../../src/lib/agent/schemas";

type CognitiveEvalCase = {
  expectedKind: "decision_support" | "general_advice" | "learning_path" | "project_analysis" | "study_advice";
  message: string;
  name: string;
  pendingLearningSubject?: string;
};

const cognitiveEvalCases = rawCognitiveEvalCases as CognitiveEvalCase[];

const baseContext: AgentPromptContext = {
  checklists: [],
  now: "2026-06-06T10:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const agentProjectContext: AgentPromptContext = {
  checklists: [
    {
      groups: [
        {
          items: ["真实问题评测", "上下文证据选择", "回答自检"],
          title: "咨询智能质量门",
        },
      ],
      title: "Agent 咨询智能核心",
    },
    {
      groups: [
        {
          items: ["收纳盒", "线缆整理"],
          title: "杂项",
        },
      ],
      title: "厨房收纳",
    },
  ],
  memories: [
    {
      confidence: 0.94,
      content: "用户希望尽快进入 Agent 智能化核心能力开发，智能程度必须用真实问题校验。",
      id: 12,
      lastUsedAt: null,
      title: "Agent 开发偏好",
      type: "project_context",
    },
    {
      confidence: 0.81,
      content: "厨房台面需要换收纳盒。",
      id: 13,
      lastUsedAt: null,
      title: "厨房偏好",
      type: "fact",
    },
  ],
  now: "2026-06-06T10:00:00.000+08:00",
  pendingAction: null,
  plans: [
    {
      agentBrief: "把 SunnyPanel Agent 从功能点推进到真实咨询智能，先建立认知回答与评测。",
      priority: "high",
      state: "active",
      title: "Agent 智能化核心开发",
    },
    {
      agentBrief: "整理厨房台面。",
      priority: "low",
      state: "active",
      title: "厨房收纳改造",
    },
  ],
};

test("buildCognitiveAdvisoryAnswer gives a direct learning path without write intent", () => {
  const result = buildCognitiveAdvisoryAnswer({
    context: baseContext,
    history: [],
    message: "请为我规划信息安全学习路径，偏蓝队",
    pendingAction: null,
  });

  assert.equal(result.frame.questionKind, "learning_path");
  assert.equal(result.frame.writeAllowed, false);
  assert.equal(result.quality.answeredQuestion, true);
  assert.equal(result.quality.respectedWriteBoundary, true);
  assert.match(result.answer, /结论/);
  assert.match(result.answer, /信息安全|蓝队/);
  assert.match(result.answer, /阶段|路径|路线/);
  assert.doesNotMatch(result.answer, /最终产出什么|开始日期|创建计划/);
});

test("cognitive frame selects relevant Agent evidence and excludes unrelated context", () => {
  const frame = buildAgentCognitiveFrame({
    context: agentProjectContext,
    history: [],
    message: "SunnyPanel Agent 泛化问题怎么推进？",
    pendingAction: null,
  });

  assert.equal(frame.questionKind, "project_analysis");
  assert.equal(frame.evidence.some((item) => item.title === "Agent 智能化核心开发"), true);
  assert.equal(frame.evidence.some((item) => item.title === "Agent 咨询智能核心"), true);
  assert.equal(frame.evidence.some((item) => /真实问题/.test(item.summary)), true);
  assert.equal(frame.evidence.some((item) => /厨房/.test(item.title) || /厨房/.test(item.summary)), false);
});

test("answer quality check catches over-clarifying answers", () => {
  const result = buildCognitiveAdvisoryAnswer({
    context: baseContext,
    history: [],
    message: "给我参谋一下线性代数的学习",
    pendingAction: null,
  });
  const quality = checkAgentAnswerQuality({
    answer: "你希望最终产出什么？大概需要多长时间？有没有开始日期？",
    frame: result.frame,
    plan: result.plan,
  });

  assert.equal(quality.answeredQuestion, false);
  assert.equal(quality.avoidedUnnecessaryClarification, false);
  assert.ok(quality.issues.some((issue) => /过度反问|没有直接回答/.test(issue)));
});

test("cognitive advisory explicitly cites learned answer preferences", () => {
  const result = buildCognitiveAdvisoryAnswer({
    context: {
      ...baseContext,
      memories: [
        {
          confidence: 0.95,
          content: "用户偏好回答先给结论，再给必要细节。",
          id: 77,
          lastUsedAt: null,
          title: "回答风格偏好",
          type: "preference",
        },
      ],
    },
    history: [],
    message: "给我参谋一下线性代数的学习",
    pendingAction: null,
  });

  assert.equal(result.frame.evidence.some((item) => item.id === "memory:77"), true);
  assert.match(result.answer, /回答风格偏好/);
  assert.match(result.answer, /先给结论/);
});

test("pending plan correction switches to direct answer and clears write boundary", () => {
  const pendingAction: PendingAction = {
    originalMessage: "请为我规划信息安全学习路径，偏蓝队",
    requestedAction: "compose_plan",
    subject: "信息安全",
    type: "await_learning_followup",
  };
  const result = buildCognitiveAdvisoryAnswer({
    context: {
      ...baseContext,
      pendingAction,
    },
    history: [],
    message: "给出路径即可，并不是计划",
    pendingAction,
  });

  assert.equal(result.frame.isCorrection, true);
  assert.equal(result.frame.writeAllowed, false);
  assert.equal(result.plan.needsClarification, false);
  assert.match(result.answer, /不进入计划|只给路径|路径/);
  assert.doesNotMatch(result.answer, /DryRun|确认后写入/);
});

test("parseAgentAnswerPlan accepts a valid structured plan", () => {
  const plan = parseAgentAnswerPlan({
    basis: ["Agent 智能化核心开发：当前目标是让回答可评测。"],
    conclusion: "优先推进可评测的结构化咨询回答。",
    needsClarification: false,
    nextActions: ["用 30 分钟补一个真实问题评测。"],
    steps: ["锁定问题", "选择证据", "生成回答计划"],
  });

  assert.equal(plan?.conclusion, "优先推进可评测的结构化咨询回答。");
  assert.deepEqual(plan?.steps, ["锁定问题", "选择证据", "生成回答计划"]);
});

test("buildCognitiveAdvisoryAnswerWithModel uses a valid LLM structured plan", async () => {
  const result = await buildCognitiveAdvisoryAnswerWithModel({
    completeStructuredFn: async ({ parse }) => {
      const data = parse({
        diagnostics: {
          notes: ["只引用 Agent 相关 evidence，没有写入动作。"],
        },
        plan: {
          basis: [
            "Agent 智能化核心开发：把 SunnyPanel Agent 从功能点推进到真实咨询智能，先建立认知回答与评测。",
            "Agent 开发偏好：智能程度必须用真实问题校验。",
          ],
          conclusion: "只有 30 分钟时，优先补一个能稳定暴露回答质量的真实问题评测。",
          needsClarification: false,
          nextActions: ["先写 failing eval，再接入结构化回答规划 trace。"],
          steps: [
            "选一个真实问题，例如 Agent 核心开发该推哪一步。",
            "要求答案必须引用 Agent 智能化核心开发和真实问题评测。",
            "把通过/回退结果写入 trace，便于 Review。",
          ],
        },
      });

      return data
        ? {
            data,
            raw: "{}",
            tokenUsage: {
              contextTokens: 20,
              inputTokens: 10,
              outputTokens: 12,
              source: "provider",
              totalTokens: 42,
            },
          }
        : null;
    },
    context: agentProjectContext,
    history: [],
    message: "我现在只有 30 分钟，Agent 核心开发该推哪一步？",
    pendingAction: null,
  });

  assert.equal(result.source, "llm");
  assert.match(result.answer, /只有 30 分钟/);
  assert.match(result.answer, /真实问题评测/);
  assert.match(result.answer, /Agent 智能化核心开发/);
  assert.doesNotMatch(result.answer, /厨房收纳|已创建|已保存|已写入/);
  assert.equal(result.diagnostics?.notes[0], "只引用 Agent 相关 evidence，没有写入动作。");
  assert.equal(result.tokenUsage?.source, "provider");
});

test("buildCognitiveAdvisoryAnswerWithModel falls back when LLM plan crosses write or relevance boundaries", async () => {
  const result = await buildCognitiveAdvisoryAnswerWithModel({
    completeStructuredFn: async ({ parse }) => {
      const data = parse({
        diagnostics: {
          notes: ["bad"],
        },
        plan: {
          basis: ["厨房收纳：厨房台面需要换收纳盒。"],
          conclusion: "已创建厨房收纳计划，并保存到工作台。",
          needsClarification: false,
          nextActions: ["确认后写入。"],
          steps: ["整理厨房", "写入计划"],
        },
      });

      return data
        ? {
            data,
            raw: "{}",
            tokenUsage: {
              contextTokens: 20,
              inputTokens: 10,
              outputTokens: 12,
              source: "provider",
              totalTokens: 42,
            },
          }
        : null;
    },
    context: agentProjectContext,
    history: [],
    message: "SunnyPanel Agent 泛化问题怎么推进？",
    pendingAction: null,
  });

  assert.equal(result.source, "fallback");
  assert.match(result.answer, /Agent 智能化核心开发/);
  assert.doesNotMatch(result.answer, /厨房收纳|已创建|已保存|已写入|确认后写入/);
  assert.ok(result.diagnostics?.rejectedReason?.length);
});

test("buildCognitiveAdvisoryAnswerWithModel falls back when LLM is disabled", async () => {
  const result = await buildCognitiveAdvisoryAnswerWithModel({
    context: agentProjectContext,
    history: [],
    message: "SunnyPanel Agent 泛化问题怎么推进？",
    pendingAction: null,
  });

  assert.equal(result.source, "fallback");
  assert.match(result.answer, /结论/);
  assert.match(result.answer, /Agent 智能化核心开发/);
});

for (const evalCase of cognitiveEvalCases) {
  test(`cognitive eval answers real advisory prompt: ${evalCase.name}`, () => {
    const pendingAction: null | PendingAction = evalCase.pendingLearningSubject
      ? {
          originalMessage: `请为我规划${evalCase.pendingLearningSubject}学习路径，偏蓝队`,
          requestedAction: "compose_plan",
          subject: evalCase.pendingLearningSubject,
          type: "await_learning_followup",
        }
      : null;
    const result = buildCognitiveAdvisoryAnswer({
      context: agentProjectContext,
      history: [],
      message: evalCase.message,
      pendingAction,
    });

    assert.equal(result.frame.questionKind, evalCase.expectedKind);
    assert.equal(result.frame.writeAllowed, false);
    assert.equal(result.quality.answeredQuestion, true);
    assert.equal(result.quality.respectedWriteBoundary, true);
    assert.ok(result.quality.score >= 0.75);
    assert.match(result.answer, /结论/);
    assert.doesNotMatch(result.answer, /已创建|已保存|已写入|DryRun/);
  });
}
