import assert from "node:assert/strict";
import { test } from "node:test";

import {
  runReactToolLoop,
  type ReactMessage,
  type ReactModelTurn,
} from "../../src/lib/agent/react-loop";

const writeTools = new Set(["create_plan", "compose_plan", "save_memory"]);
const isWriteTool = (name: string) => writeTools.has(name);

const initialMessages: ReactMessage[] = [
  { content: "system prompt", role: "system" },
  { content: "帮我看看高数进度，然后给我建一个二轮计划", role: "user" },
];

test("loop executes read tools, feeds observations back, then stops at a write proposal", async () => {
  const turns: ReactModelTurn[] = [
    { toolCalls: [{ args: { scope: "all" }, name: "query_progress" }], type: "tool_calls" },
    { toolCalls: [{ args: { title: "高数二轮复习" }, name: "create_plan" }], type: "tool_calls" },
  ];
  let turnIndex = 0;
  const seenByModel: ReactMessage[][] = [];
  const executedReadTools: string[] = [];

  const result = await runReactToolLoop({
    callModel: async (messages) => {
      seenByModel.push([...messages]);

      return turns[turnIndex++] ?? null;
    },
    executeReadTool: async (call) => {
      executedReadTools.push(call.name);

      return "进度观察：高数清单完成 4/10。";
    },
    initialMessages,
    isWriteTool,
  });

  assert.equal(result.kind, "write_proposal");
  assert.equal(result.kind === "write_proposal" ? result.toolCall.name : "", "create_plan");
  assert.deepEqual(executedReadTools, ["query_progress"]);
  // 第二次调用模型时，应已把第一轮的工具观察以 tool role 回灌。
  assert.ok(seenByModel[1].some((message) => message.role === "tool" && message.content.includes("4/10")));
});

test("write tool on the first turn never executes inside the loop", async () => {
  let readExecuted = false;

  const result = await runReactToolLoop({
    callModel: async () => ({
      toolCalls: [{ args: { title: "马上建计划" }, name: "create_plan" }],
      type: "tool_calls",
    }),
    executeReadTool: async () => {
      readExecuted = true;

      return "";
    },
    initialMessages,
    isWriteTool,
  });

  assert.equal(result.kind, "write_proposal");
  assert.equal(readExecuted, false);
});

test("loop returns the final answer when the model stops calling tools", async () => {
  const turns: ReactModelTurn[] = [
    { toolCalls: [{ args: {}, name: "query_progress" }], type: "tool_calls" },
    { content: '{"intent":"answer_question","confidence":0.9,"args":{"answer":"整体进度良好。"}}', type: "final" },
  ];
  let index = 0;

  const result = await runReactToolLoop({
    callModel: async () => turns[index++] ?? null,
    executeReadTool: async () => "进度观察：整体 80%。",
    initialMessages,
    isWriteTool,
  });

  assert.equal(result.kind, "final_answer");
  assert.match(result.kind === "final_answer" ? result.content : "", /answer_question/);
});

test("loop stops at maxSteps when the model keeps requesting read tools", async () => {
  let calls = 0;

  const result = await runReactToolLoop({
    callModel: async () => {
      calls += 1;

      return { toolCalls: [{ args: {}, name: "query_progress" }], type: "tool_calls" };
    },
    executeReadTool: async () => "观察",
    initialMessages,
    isWriteTool,
    maxSteps: 3,
  });

  assert.equal(result.kind, "steps_exhausted");
  assert.equal(calls, 3);
  assert.equal(result.steps.length, 3);
});

test("a failing read tool surfaces as an observation instead of throwing", async () => {
  const turns: ReactModelTurn[] = [
    { toolCalls: [{ args: {}, name: "query_progress" }], type: "tool_calls" },
    { content: "好的", type: "final" },
  ];
  let index = 0;
  let observedError = "";

  const result = await runReactToolLoop({
    callModel: async (messages) => {
      const toolMessage = messages.find((message) => message.role === "tool");

      if (toolMessage) {
        observedError = toolMessage.content;
      }

      return turns[index++] ?? null;
    },
    executeReadTool: async () => {
      throw new Error("DB down");
    },
    initialMessages,
    isWriteTool,
  });

  assert.equal(result.kind, "final_answer");
  assert.match(observedError, /执行失败.*DB down/);
});

test("loop returns no_response when the model yields nothing", async () => {
  const result = await runReactToolLoop({
    callModel: async () => null,
    executeReadTool: async () => "",
    initialMessages,
    isWriteTool,
  });

  assert.equal(result.kind, "no_response");
});