import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAgentFunctionTools,
  buildAgentReadTools,
  intentFromFunctionCall,
  isReadToolName,
  isWriteToolName,
  parseModelTurn,
} from "../../src/lib/agent/function-tools";

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

test("buildAgentReadTools exposes only read-only observation tools", () => {
  const tools = buildAgentReadTools();
  const names = tools.map((tool) => tool.function.name);

  assert.deepEqual(names.sort(), ["evaluate_plan", "query_progress"]);
  assert.equal(isReadToolName("query_progress"), true);
  assert.equal(isWriteToolName("query_progress"), false);
  assert.equal(isWriteToolName("create_plan"), true);
});

test("parseModelTurn reads native multi tool_calls", () => {
  const turn = parseModelTurn({
    tool_calls: [
      { function: { arguments: '{"checklistTitle":"高数"}', name: "query_progress" } },
      { function: { arguments: '{"title":"高数二轮"}', name: "create_plan" } },
    ],
  });

  assert.equal(turn?.type, "tool_calls");
  assert.equal(turn?.type === "tool_calls" ? turn.toolCalls.length : 0, 2);
  assert.equal(turn?.type === "tool_calls" ? turn.toolCalls[1].name : "", "create_plan");
});

test("parseModelTurn falls back to content JSON tool call for glm/zai", () => {
  const turn = parseModelTurn({
    content: '{"tool":"query_progress","args":{"scope":"all"}}',
  });

  assert.equal(turn?.type, "tool_calls");
  assert.equal(turn?.type === "tool_calls" ? turn.toolCalls[0].name : "", "query_progress");
});

test("parseModelTurn treats plain content as a final answer", () => {
  const turn = parseModelTurn({
    content: '{"intent":"answer_question","confidence":0.9,"args":{"answer":"线代先学矩阵。"}}',
  });

  assert.equal(turn?.type, "final");
});

test("parseModelTurn returns null for empty responses", () => {
  assert.equal(parseModelTurn({ content: "" }), null);
  assert.equal(parseModelTurn({}), null);
});
