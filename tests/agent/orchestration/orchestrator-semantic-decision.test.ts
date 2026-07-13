import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORCHESTRATOR_DECISION_CODES,
  ORCHESTRATOR_OUTPUT_SCHEMA_VERSION,
  orchestratorDecisionCodeSchema,
  orchestratorOutputSchema,
} from "../../../src/lib/agent/llm/schemas/orchestrator-output";

const decisionCodes = [
  "pure_consultation",
  "pure_read_query",
  "explicit_write_ready",
  "explicit_write_missing_resource",
  "compound_ready",
  "compound_missing_target",
  "unsupported_request",
] as const;

test("exports the single shared closed semantic decision enum", () => {
  assert.deepEqual(ORCHESTRATOR_DECISION_CODES, decisionCodes);
  assert.equal(ORCHESTRATOR_OUTPUT_SCHEMA_VERSION, 2);
  for (const code of decisionCodes) {
    assert.equal(orchestratorDecisionCodeSchema.safeParse(code).success, true);
  }
  assert.equal(orchestratorDecisionCodeSchema.safeParse("legacy_guess").success, false);
});

test("requires decisionCode on the one strict orchestrator output schema", () => {
  const output = {
    version: 2,
    decisionCode: "pure_consultation",
    mode: "single",
    routingSummary: "直接回答概念问题",
    tasks: [{
      agentRole: "content",
      args: {},
      dependsOn: [],
      id: "t1",
      intent: "answer_question",
      label: "回答问题",
    }],
  };

  assert.equal(orchestratorOutputSchema.safeParse(output).success, true);
  const { decisionCode: _decisionCode, ...withoutDecision } = output;
  assert.equal(orchestratorOutputSchema.safeParse(withoutDecision).success, false);
});
