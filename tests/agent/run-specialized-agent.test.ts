import assert from "node:assert/strict";
import { test } from "node:test";

import { reconcileEnrichedIntent } from "../../src/lib/agent/agents/run-specialized-agent";
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
