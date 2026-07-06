import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyScheduleIntentBoundary,
  type ScheduleIntentBoundaryLlmClassifier,
} from "../../../src/lib/agent/schedule/intent-boundary";

test("schedule intent boundary classifies read-only schedule queries", () => {
  const messages = [
    "帮我查看最近的日程安排",
    "查看一下本周日程",
    "今天有什么安排",
    "最近有什么日程",
    "日程安排是什么",
  ];

  for (const message of messages) {
    const result = classifyScheduleIntentBoundary({ userMessage: message });
    assert.equal(result.intent, "query_schedule", message);
    assert.equal(result.readOrWrite, "read");
    assert.equal(result.source, "rule");
  }
});

test("schedule intent boundary classifies explicit schedule creation", () => {
  const messages = [
    "帮我把这些任务安排进日程",
    "把计划排到下周日程里",
    "把这个清单安排到周末",
    "创建日程",
    "保存到日程",
    "生成日程草案",
    "帮我排一下学习日程",
    "每天晚上 8 点安排学习",
  ];

  for (const message of messages) {
    const result = classifyScheduleIntentBoundary({ userMessage: message });
    assert.equal(result.intent, "schedule_creation", message);
    assert.equal(result.readOrWrite, "write");
    assert.equal(result.source, "rule");
  }
});

test("日程安排 as a noun phrase is not schedule creation", () => {
  const result = classifyScheduleIntentBoundary({ userMessage: "日程安排" });

  assert.equal(result.intent, "query_schedule");
  assert.equal(result.readOrWrite, "read");
});

test("schedule draft revision is separated from schedule creation", () => {
  const result = classifyScheduleIntentBoundary({
    hasSchedulingDraft: true,
    userMessage: "把第一项改到明天晚上 8 点",
  });

  assert.equal(result.intent, "revise_schedule_draft");
  assert.equal(result.readOrWrite, "write");
});

test("LLM low-confidence create_schedule cannot upgrade to write path", () => {
  const classifier: ScheduleIntentBoundaryLlmClassifier = () => ({
    confidence: 0.7,
    intent: "create_schedule",
    readOrWrite: "write",
    reason: "模型不确定地猜测为创建日程",
  });

  const result = classifyScheduleIntentBoundary({
    llmEnabled: true,
    llmClassifier: classifier,
    userMessage: "帮我处理一下日程",
  });

  assert.equal(result.intent, "ambiguous");
  assert.equal(result.readOrWrite, "unclear");
  assert.equal(result.source, "llm");
});

test("AGENT_DISABLE_LLM=1 uses deterministic fallback and does not call LLM", () => {
  const previous = process.env.AGENT_DISABLE_LLM;
  process.env.AGENT_DISABLE_LLM = "1";
  let llmCalled = false;
  const classifier: ScheduleIntentBoundaryLlmClassifier = () => {
    llmCalled = true;
    return {
      confidence: 0.95,
      intent: "create_schedule",
      readOrWrite: "write",
      reason: "should not be used",
    };
  };

  try {
    const result = classifyScheduleIntentBoundary({
      llmClassifier: classifier,
      userMessage: "帮我处理一下日程",
    });

    assert.equal(llmCalled, false);
    assert.equal(result.intent, "ambiguous");
    assert.equal(result.source, "fallback");
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_DISABLE_LLM;
    } else {
      process.env.AGENT_DISABLE_LLM = previous;
    }
  }
});
