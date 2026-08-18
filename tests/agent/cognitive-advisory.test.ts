import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCognitiveAdvisoryAnswer,
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
