import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAgentSystemPrompt, type AgentPromptContext } from "../../src/lib/agent/prompts";

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
