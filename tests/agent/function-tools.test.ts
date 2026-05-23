import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAgentFunctionTools, intentFromFunctionCall } from "../../src/lib/agent/function-tools";

test("buildAgentFunctionTools exposes writable intents", () => {
  const tools = buildAgentFunctionTools();

  assert.ok(tools.length >= 10);
  assert.ok(tools.some((tool) => tool.function.name === "compose_plan"));
});

test("intentFromFunctionCall parses tool arguments", () => {
  const intent = intentFromFunctionCall("save_memory", JSON.stringify({ title: "偏好", content: "晚上写作" }));

  assert.equal(intent?.intent, "save_memory");
  assert.equal((intent?.args as { title?: string }).title, "偏好");
});
