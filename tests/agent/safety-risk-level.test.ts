import assert from "node:assert/strict";
import { test } from "node:test";

import { getAgentIntentRiskLevel } from "../../src/lib/agent/safety";

test("registered write intents return their configured risk level", () => {
  assert.equal(getAgentIntentRiskLevel("create_plan"), "medium");
  assert.equal(getAgentIntentRiskLevel("complete_plan_item"), "high");
  assert.equal(getAgentIntentRiskLevel("compose_schedule_item"), "medium");
  assert.equal(getAgentIntentRiskLevel("compose_timeline_event"), "high");
  assert.equal(getAgentIntentRiskLevel("save_memory"), "medium");
});

test("read-only intents return low risk", () => {
  assert.equal(getAgentIntentRiskLevel("query_progress"), "low");
  assert.equal(getAgentIntentRiskLevel("evaluate_plan"), "low");
  assert.equal(getAgentIntentRiskLevel("clarify"), "low");
});

test("unknown intent that is not a write intent returns low", () => {
  assert.equal(getAgentIntentRiskLevel("some_unknown_read_intent" as never), "low");
});
