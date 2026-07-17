import assert from "node:assert/strict";
import { test } from "node:test";

import {
  reconcileEnrichedIntent,
  runSpecializedAgentForTask,
} from "../../src/lib/agent/agents/run-specialized-agent";
import { evaluateSpecialistTaskCompleteness } from "../../src/lib/agent/agents/specialist-task-completeness";
import type { SpecializedAgentDefinition } from "../../src/lib/agent/agents/types";
import { createModelCallBudgetRecorder } from "../../src/lib/agent/orchestration/model-call-budget";
import type { TaskNode } from "../../src/lib/agent/orchestration/types";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { AgentIntent } from "../../src/lib/agent/schemas";

const queryIntent = (intent: AgentIntent["intent"]): AgentIntent =>
  ({ args: {}, confidence: 0.9, intent } as AgentIntent);

test("keeps the intent untouched when the agent only enriches args", () => {
  const base = queryIntent("query_progress");
  const result = reconcileEnrichedIntent(base, queryIntent("query_progress"), [
    "query_progress",
    "query_plan_progress",
    "answer_question",
  ]);

  assert.equal(result.corrected, false);
  assert.equal(result.intent.intent, "query_progress");
  assert.equal(result.rejectedIntent, undefined);
});

test("accepts a self-correction within the agent's supported intents", () => {
  const base = queryIntent("query_progress");
  const result = reconcileEnrichedIntent(base, queryIntent("answer_question"), [
    "query_progress",
    "query_plan_progress",
    "answer_question",
  ]);

  assert.equal(result.corrected, true);
  assert.equal(result.intent.intent, "answer_question");
});

test("rejects a correction outside the agent's supported intents and reverts to base", () => {
  const base = queryIntent("query_progress");
  const result = reconcileEnrichedIntent(base, queryIntent("create_plan"), [
    "query_progress",
    "query_plan_progress",
    "answer_question",
  ]);

  assert.equal(result.corrected, false);
  assert.equal(result.intent.intent, "query_progress");
  assert.equal(result.rejectedIntent, "create_plan");
});

const promptContext: AgentPromptContext = {
  checklists: [],
  now: "2026-07-14T00:00:00.000Z",
  pendingAction: null,
  plans: [],
};

const task = (overrides: Partial<TaskNode> = {}): TaskNode => ({
  agentRole: "query",
  args: { answer: "现有答案" },
  dependsOn: [],
  id: "task-1",
  intent: "answer_question",
  label: "回答问题",
  ...overrides,
});

test("bypasses the specialist and keeps a deterministically complete intent unchanged", async () => {
  let enrichCalls = 0;
  const definition: SpecializedAgentDefinition = {
    enrichIntent: async () => {
      enrichCalls += 1;
      return queryIntent("query_progress");
    },
    id: "query",
    role: "query",
    supportedIntents: ["answer_question", "query_progress"],
    systemPromptHint: "query",
  };
  const recorder = createModelCallBudgetRecorder();
  const completeTask = task();

  assert.equal(
    evaluateSpecialistTaskCompleteness(completeTask).disposition,
    "bypassed_complete",
  );

  const result = await runSpecializedAgentForTask(
    completeTask,
    {
      dryRunContext: {} as never,
      intent: queryIntent("query_progress"),
      message: "回答这个问题",
      modelCallRecorder: recorder,
      promptContext,
    },
    { getSpecializedAgent: () => definition },
  );

  assert.equal(enrichCalls, 0);
  assert.equal(result.intent.intent, "answer_question");
  assert.equal(result.disposition, "bypassed_complete");
  assert.equal(recorder.snapshot().specialistCalls, 0);
});

test("calls the specialist exactly once for an open-ended incomplete task", async () => {
  let enrichCalls = 0;
  const enriched = {
    args: { goal: "完成迁移", title: "迁移计划" },
    confidence: 0.9,
    intent: "compose_plan",
  } as AgentIntent;
  const definition: SpecializedAgentDefinition = {
    enrichIntent: async (_intent, _context, _message, _upstream, options) => {
      enrichCalls += 1;
      options?.onProviderAttempt?.(1);
      return enriched;
    },
    id: "plan",
    role: "plan",
    supportedIntents: ["compose_plan"],
    systemPromptHint: "plan",
  };
  const recorder = createModelCallBudgetRecorder();
  const incompleteTask = task({
    agentRole: "plan",
    args: {},
    intent: "compose_plan",
    label: "规划迁移",
  });

  assert.equal(
    evaluateSpecialistTaskCompleteness(incompleteTask).disposition,
    "required_incomplete",
  );

  const result = await runSpecializedAgentForTask(
    incompleteTask,
    {
      dryRunContext: {} as never,
      intent: enriched,
      message: "帮我规划迁移",
      modelCallRecorder: recorder,
      promptContext,
    },
    { getSpecializedAgent: () => definition },
  );

  assert.equal(enrichCalls, 1);
  assert.equal(result.intent.intent, "compose_plan");
  assert.equal(result.disposition, "required_incomplete");
  assert.equal(recorder.snapshot().specialistCalls, 1);
  assert.equal(recorder.snapshot().specialistProviderAttempts, 1);
  assert.equal(recorder.snapshot().unexpectedDuplicateCalls, 0);
});

test("keeps unknown and weakly constrained task shapes on the specialist path", () => {
  assert.equal(
    evaluateSpecialistTaskCompleteness(task({ args: {}, intent: "query_progress" })).disposition,
    "required_incomplete",
  );
  assert.equal(
    evaluateSpecialistTaskCompleteness(task({ args: {}, intent: "compose_schedule_item" })).disposition,
    "required_incomplete",
  );
});
