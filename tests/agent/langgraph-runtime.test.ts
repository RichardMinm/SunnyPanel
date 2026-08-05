import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("the chat entrypoint has one Full LangGraph runtime", () => {
  const source = read("src/lib/agent/chat-pipeline/handle-agent-chat-post.ts");

  assert.match(source, /createRunProductionLangGraphAgentChatPipeline\(pipelineDeps\)/);
  assert.doesNotMatch(source, /createRunAgentChatPipeline/);
  assert.doesNotMatch(source, /createAgentRuntimeRunner/);
  assert.doesNotMatch(source, /getAgentGraphRuntimeConfig/);
  assert.doesNotMatch(source, /runtimeConfig\.mode/);
});

test("production step assembly still uses the Full adapter", () => {
  const source = read("src/lib/agent/langgraph/production-adapter.ts");

  assert.match(source, /createRunFullLangGraphAgentChatPipeline/);
  assert.match(source, /runBuildContextStep/);
  assert.match(source, /runResolveIntentStep/);
  assert.match(source, /runDryRunAndProposeStep/);
  assert.match(source, /runExecuteAndPersistStep/);
});
