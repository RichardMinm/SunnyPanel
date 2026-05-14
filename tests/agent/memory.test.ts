import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseAgentMemoryInput,
  scoreAgentMemoryRelevance,
  validateAgentMemoryData,
} from "../../src/lib/agent/memory-schema";

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
