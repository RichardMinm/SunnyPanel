import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseAgentMemoryInput,
  scoreAgentMemoryRelevance,
  validateAgentMemoryData,
} from "../../src/lib/agent/memory-schema";
import {
  computeMemoryRankScore,
  computeRecencyDecay,
  reinforceMemoryConfidence,
} from "../../src/lib/agent/memory-ranking";

test("parses and validates memory input", () => {
  const parsed = parseAgentMemoryInput({
    confidence: 1.4,
    content: " 用户希望回答先给结论，再给必要细节。 ",
    type: "偏好",
  });

  assert.ok(parsed);
  assert.equal(parsed.type, "preference");
  assert.equal(parsed.confidence, 1);
  assert.equal(parsed.title, "用户希望回答先给结论，再给必要细节。");
  assert.equal(parsed.visibility, "private");

  const validated = validateAgentMemoryData(parsed);

  assert.equal(validated.content, "用户希望回答先给结论，再给必要细节。");
  assert.equal(validated.status, "active");
  assert.equal(validated.visibility, "private");
});

test("rejects invalid memory without content", () => {
  assert.equal(parseAgentMemoryInput({ type: "fact" }), null);
  assert.throws(() => validateAgentMemoryData({ title: "空记忆" }), /content is required/);
});

test("scores relevant memory higher than unrelated memory", () => {
  const relevant = scoreAgentMemoryRelevance(
    {
      content: "用户偏好先给结论，再给必要细节。",
      title: "回答风格偏好",
      type: "preference",
    },
    "回答时先给结论",
  );
  const unrelated = scoreAgentMemoryRelevance(
    {
      content: "SunnyPanel 使用 Payload。",
      title: "技术栈事实",
      type: "fact",
    },
    "回答时先给结论",
  );

  assert.equal(relevant > unrelated, true);
});

test("intent hint boosts memory type relevance", () => {
  const withoutHint = scoreAgentMemoryRelevance(
    {
      content: "创建计划时优先考虑截止日期",
      title: "计划规则",
      type: "workflow_rule",
    },
    "创建一个新计划",
  );
  const withHint = scoreAgentMemoryRelevance(
    {
      content: "创建计划时优先考虑截止日期",
      title: "计划规则",
      type: "workflow_rule",
    },
    "创建一个新计划",
    "create_plan",
  );

  assert.ok(withHint > withoutHint, "intent hint should boost score for matching memory type");
});

test("stopwords filtering prevents noise tokens from inflating scores", () => {
  const scoreWithStopwords = scoreAgentMemoryRelevance(
    {
      content: "关于技术栈的说明",
      title: "技术选型",
      type: "fact",
    },
    "我的计划是什么",
  );
  const scoreWithContent = scoreAgentMemoryRelevance(
    {
      content: "关于技术栈的说明",
      title: "技术选型",
      type: "fact",
    },
    "技术栈选择",
  );

  assert.ok(scoreWithContent > scoreWithStopwords, "content match should score higher than stopword-heavy query");
});

test("recency decay drops toward 0.5 around the half-life and stays in (0,1]", () => {
  const now = Date.parse("2026-06-14T00:00:00.000Z");
  const fresh = computeRecencyDecay("2026-06-14T00:00:00.000Z", now);
  const halfLife = computeRecencyDecay("2026-05-01T00:00:00.000Z", now, 44);
  const stale = computeRecencyDecay("2026-01-01T00:00:00.000Z", now);
  const neverUsed = computeRecencyDecay(null, now);

  assert.ok(fresh > 0.99 && fresh <= 1);
  assert.ok(Math.abs(halfLife - 0.5) < 0.05);
  assert.ok(stale < halfLife);
  assert.ok(neverUsed > 0 && neverUsed < 1);
});

test("confidence reinforcement nudges upward but is capped", () => {
  assert.equal(reinforceMemoryConfidence(0.7), 0.72);
  assert.equal(reinforceMemoryConfidence(0.97), 0.97);
  assert.equal(reinforceMemoryConfidence(0.965), 0.97);
  assert.equal(reinforceMemoryConfidence(undefined), 0.72);
});

test("rank score ranks a frequently-used confident memory above a stale low-confidence one", () => {
  const now = Date.parse("2026-06-14T00:00:00.000Z");
  const freshConfident = computeMemoryRankScore({
    baseScore: 60,
    confidence: 0.95,
    lastUsedAt: "2026-06-13T00:00:00.000Z",
    now,
  });
  const staleWeak = computeMemoryRankScore({
    baseScore: 60,
    confidence: 0.4,
    lastUsedAt: "2025-09-01T00:00:00.000Z",
    now,
  });

  assert.ok(freshConfident > staleWeak);
});
