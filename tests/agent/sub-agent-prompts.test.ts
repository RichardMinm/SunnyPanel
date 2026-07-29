import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAgentSystemPrompt, type AgentPromptContext } from "../../src/lib/agent/prompts";
import { buildContentAgentSystemPrompt } from "../../src/lib/agent/prompts/content";
import { buildMemoryAgentSystemPrompt } from "../../src/lib/agent/prompts/memory";

const baseContext = (): AgentPromptContext => ({
  checklists: [],
  now: "2026-06-14T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
});

test("main prompt layers intents into read-only vs write-gated", () => {
  const prompt = buildAgentSystemPrompt(baseContext());

  assert.match(prompt, /意图分层/);
  assert.match(prompt, /只读 \/ 直接回答/);
  assert.match(prompt, /DryRun→确认→Execute 安全门/);
  assert.match(prompt, /reschedule_item、cancel_schedule_item.*schedule_plan/);
});

test("content agent prompt carries few-shot and a consultation negative example", () => {
  const prompt = buildContentAgentSystemPrompt(baseContext());

  assert.match(prompt, /negative example/);
  assert.match(prompt, /compose_timeline_event/);
  assert.match(prompt, /add_completion_note/);
  assert.match(prompt, /不要包 decision/);
});

test("memory agent prompt forbids saving one-off statements and shows few-shot", () => {
  const prompt = buildMemoryAgentSystemPrompt(baseContext());

  assert.match(prompt, /negative example/);
  assert.match(prompt, /save_memory/);
  assert.match(prompt, /workflow_rule/);
  assert.match(prompt, /不要包 decision/);
});
