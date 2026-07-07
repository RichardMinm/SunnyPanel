import assert from "node:assert/strict";
import { test } from "node:test";

import {
  composeClarificationFallback,
  validateClarificationOutput,
} from "../../src/lib/agent/response/clarification";
import type {
  ClarificationComposerInput,
  ClarificationComposerOutput,
} from "../../src/lib/agent/response/clarification";

const baseInput = (overrides: Partial<ClarificationComposerInput> = {}): ClarificationComposerInput => ({
  knownFacts: ["目标：完成 SSTI 文章"],
  maxQuestions: 3,
  missingNeeds: [
    { key: "dailyCapacity", label: "每天或本周可投入时间", examples: ["每天 1 小时", "每周 3 天"] },
    { key: "preferredTime", label: "偏好安排时间", examples: ["晚上", "上午"] },
    { key: "conflictPolicy", label: "遇到已有日程冲突时怎么处理", examples: ["跳过冲突", "允许重叠", "重新安排"] },
  ],
  safetyBoundary: { nextStep: "先生成日程草案", willNotWriteYet: true },
  tone: "warm",
  userGoalSummary: "在本周内完成 SSTI 文章的写作和投递",
  userMessage: "帮我把 SSTI 文章安排进这周日程",
  workflow: "schedule_creation",
  ...overrides,
});

/* ──── Fallback Composer Tests ──── */

test("fallback: does not expose sourceType", () => {
  const output = composeClarificationFallback(baseInput());
  assert.doesNotMatch(output.message, /sourceType/);
});

test("fallback: does not expose missingSlots", () => {
  const output = composeClarificationFallback(baseInput());
  assert.doesNotMatch(output.message, /missingSlots/);
});

test("fallback: does not expose conflictPolicy", () => {
  const output = composeClarificationFallback(baseInput());
  assert.doesNotMatch(output.message, /conflictPolicy/);
});

test("fallback: does not expose priorityRule", () => {
  const output = composeClarificationFallback(baseInput());
  assert.doesNotMatch(output.message, /priorityRule/);
});

test("fallback: does not expose availableTimeWindows", () => {
  const output = composeClarificationFallback(baseInput());
  assert.doesNotMatch(output.message, /availableTimeWindows/);
});

test("fallback: does not expose dailyCapacity as raw key", () => {
  const output = composeClarificationFallback(baseInput());
  assert.doesNotMatch(output.message, /dailyCapacity/);
});

test("fallback: states it will not directly write to schedule", () => {
  const output = composeClarificationFallback(baseInput());
  assert.match(output.message, /不直接写入|暂时不会写入|不会直接保存/);
});

test("fallback: states next step is to generate a draft", () => {
  const output = composeClarificationFallback(baseInput());
  assert.match(output.message, /先生成.*草案/);
});

test("fallback: max 3 core questions for schedule", () => {
  const output = composeClarificationFallback(baseInput());
  assert.ok(output.questions.length <= 3);
});

test("fallback: includes suggestedReply", () => {
  const output = composeClarificationFallback(baseInput());
  assert.ok(output.suggestedReply);
  assert.ok(output.suggestedReply.length > 0);
});

test("fallback: source is fallback", () => {
  const output = composeClarificationFallback(baseInput());
  assert.equal(output.source, "fallback");
});

test("fallback: includes safetyNote", () => {
  const output = composeClarificationFallback(baseInput());
  assert.ok(output.safetyNote);
  assert.ok(output.safetyNote.length > 0);
});

/* ──── Planning fallback ──── */

test("planning fallback: does not expose goal as raw field", () => {
  const input = baseInput({
    missingNeeds: [
      { key: "goal", label: "计划目标" },
      { key: "deadline", label: "期望完成时间" },
    ],
    workflow: "plan_creation",
  });
  const output = composeClarificationFallback(input);
  assert.doesNotMatch(output.message, /"goal"/);
});

test("planning fallback: does not expose deadline scope currentProgress successCriteria as raw fields", () => {
  const input = baseInput({
    missingNeeds: [
      { key: "scope", label: "计划范围" },
      { key: "currentProgress", label: "当前进度" },
      { key: "successCriteria", label: "成功标准" },
    ],
    workflow: "plan_creation",
  });
  const output = composeClarificationFallback(input);
  assert.doesNotMatch(output.message, /currentProgress/);
  assert.doesNotMatch(output.message, /successCriteria/);
});

test("planning fallback: states will not directly create plan", () => {
  const input = baseInput({ workflow: "plan_creation" });
  const output = composeClarificationFallback(input);
  assert.match(output.message, /不直接写入|暂时不会写入/);
});

test("planning fallback: states next step generates draft", () => {
  const input = baseInput({ workflow: "plan_creation" });
  const output = composeClarificationFallback(input);
  assert.match(output.message, /先生成.*草案/);
});

test("planning fallback: max 4 core questions", () => {
  const input = baseInput({
    maxQuestions: 4,
    missingNeeds: [
      { key: "availableTime", label: "每周可投入时间" },
      { key: "scope", label: "计划范围" },
      { key: "currentProgress", label: "当前进度" },
      { key: "successCriteria", label: "成功标准" },
      { key: "constraints", label: "约束条件" },
    ],
    workflow: "plan_creation",
  });
  const output = composeClarificationFallback(input);
  assert.ok(output.questions.length <= 4);
});

/* ──── Validation Tests ──── */

test("validate: accepts valid warm output", () => {
  const valid: ClarificationComposerOutput = {
    message: "可以，我先不直接写入日程。为了把安排排得更准确，需要确认几个问题。",
    questions: ["每天可投入多少时间？", "偏好什么时间段？"],
    safetyNote: "暂时不会写入日程，下一步先生成草案",
    source: "fallback",
    suggestedReply: "每天 1 小时，晚上写",
  };
  const result = validateClarificationOutput(valid, baseInput());
  assert.ok(result);
  assert.equal(result.source, "fallback");
});

test("validate: rejects output containing sourceType", () => {
  const invalid = {
    message: "你的来源类型是 plan（sourceType=plan）",
    questions: ["问题"],
    safetyNote: "不会写入",
  };
  assert.equal(validateClarificationOutput(invalid, baseInput()), null);
});

test("validate: rejects output containing missingSlots", () => {
  const invalid = {
    message: "你缺少的字段 missingSlots 包括...",
    questions: ["问题"],
    safetyNote: "不会写入",
  };
  assert.equal(validateClarificationOutput(invalid, baseInput()), null);
});

test("validate: rejects output containing conflictPolicy as raw field", () => {
  const invalid = {
    message: "你需要设置 conflictPolicy",
    questions: ["问题"],
    safetyNote: "不会写入",
  };
  assert.equal(validateClarificationOutput(invalid, baseInput()), null);
});

test("validate: rejects output claiming write completed", () => {
  const invalid = {
    message: "已写入日程，已创建日程，已保存",
    questions: ["问题"],
    safetyNote: "不会写入",
  };
  assert.equal(validateClarificationOutput(invalid, baseInput()), null);
});

test("validate: rejects output claiming '我已经帮你安排'", () => {
  const invalid = {
    message: "我已经帮你安排了日程",
    questions: ["问题"],
    safetyNote: "不会写入",
  };
  assert.equal(validateClarificationOutput(invalid, baseInput()), null);
});

test("validate: rejects output claiming '已经创建'", () => {
  const invalid = {
    message: "我已经创建了计划",
    questions: ["问题"],
    safetyNote: "不会写入",
  };
  assert.equal(validateClarificationOutput(invalid, baseInput()), null);
});

test("validate: allows negative-context safety language", () => {
  const valid = {
    message: "暂时不会写入日程，还不会创建计划，不会直接保存",
    questions: ["问题"],
    safetyNote: "暂时不会写入",
  };
  const result = validateClarificationOutput(valid, baseInput());
  assert.ok(result);
});

test("validate: rejects output with too many questions", () => {
  const tooManyQuestions = {
    message: "需要确认几个问题",
    questions: ["1", "2", "3", "4", "5"],
    safetyNote: "暂时不会写入",
  };
  assert.equal(validateClarificationOutput(tooManyQuestions, baseInput()), null);
});

test("validate: rejects output missing safetyNote", () => {
  const noSafety = {
    message: "需要确认几个问题",
    questions: ["问题"],
  };
  assert.equal(validateClarificationOutput(noSafety, baseInput()), null);
});

test("validate: rejects output missing message", () => {
  const noMessage = {
    questions: ["问题"],
    safetyNote: "不会写入",
  };
  assert.equal(validateClarificationOutput(noMessage, baseInput()), null);
});

test("validate: rejects non-object input", () => {
  assert.equal(validateClarificationOutput(null, baseInput()), null);
  assert.equal(validateClarificationOutput("string", baseInput()), null);
  assert.equal(validateClarificationOutput(undefined, baseInput()), null);
});

test("validate: rejects output missing required safety signal", () => {
  const noSignal = {
    message: "需要确认几个问题，请补充信息",
    questions: ["问题"],
    safetyNote: "需要补充信息",
  };
  assert.equal(validateClarificationOutput(noSignal, baseInput()), null);
});

test("validate: source=llm is preserved in validated output", () => {
  const valid = {
    message: "暂时不会写入日程，先生成草案",
    questions: ["问题"],
    safetyNote: "暂时不会写入日程",
    source: "llm" as const,
  };
  const result = validateClarificationOutput(valid, baseInput());
  assert.ok(result);
  assert.equal(result.source, "llm");
});
