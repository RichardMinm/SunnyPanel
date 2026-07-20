import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORCHESTRATOR_DECISION_CODES,
  ORCHESTRATOR_MODES,
} from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  ROUTER_INTENT_NAMES,
} from "../../../src/lib/agent/llm/schemas/router-output";
import {
  L3B_EVALUATION_FIXTURES,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  buildLangChainSystemPrompt,
} from "../../../src/lib/agent/orchestration/langchain-orchestrator";
import {
  ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES,
  ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_MARKER,
  ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_PROTOCOL,
} from "../../../src/lib/agent/orchestration/orchestrator-intent-family-protocol";

const expectedIds = [
  "generic_progress_query",
  "trusted_specific_plan_query",
  "untrusted_specific_plan_attempt",
] as const;

test("freezes three schema-typed query scope precedence cases", () => {
  assert.equal(
    Object.isFrozen(ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES),
    true,
  );
  assert.deepEqual(
    ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES.map(({ id }) => id),
    expectedIds,
  );

  for (const entry of ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES) {
    assert.equal(Object.isFrozen(entry), true, entry.id);
    assert.equal(Object.isFrozen(entry.admitted), true, entry.id);
    assert.equal(Object.isFrozen(entry.admitted.intents), true, entry.id);
    assert.equal(Object.isFrozen(entry.forbiddenIntents), true, entry.id);
    assert.equal(
      ORCHESTRATOR_DECISION_CODES.includes(entry.admitted.decisionCode),
      true,
      entry.id,
    );
    assert.equal(
      ORCHESTRATOR_MODES.includes(entry.admitted.mode),
      true,
      entry.id,
    );
    for (const intent of [
      ...entry.admitted.intents,
      ...entry.forbiddenIntents,
    ]) {
      assert.equal(ROUTER_INTENT_NAMES.includes(intent), true, entry.id);
    }
  }
});

test("freezes the generic and trusted query scope precedence shapes", () => {
  const generic = ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES.find(
    ({ id }) => id === "generic_progress_query",
  );
  const trusted = ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES.find(
    ({ id }) => id === "trusted_specific_plan_query",
  );

  assert.ok(generic);
  assert.deepEqual(generic.admitted, {
    decisionCode: "pure_read_query",
    intents: ["query_progress"],
    mode: "single",
  });
  assert.deepEqual(generic.forbiddenIntents, [
    "query_plan_progress",
    "clarify",
  ]);

  assert.ok(trusted);
  assert.deepEqual(trusted.admitted, {
    decisionCode: "pure_read_query",
    intents: ["query_plan_progress"],
    mode: "single",
  });
  assert.deepEqual(trusted.forbiddenIntents, ["query_progress", "clarify"]);
});

test("forbids aggregate and specific fallback for an untrusted specific attempt", () => {
  const entry = ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES.find(
    ({ id }) => id === "untrusted_specific_plan_attempt",
  );

  assert.ok(entry);
  assert.deepEqual(entry.admitted, {
    decisionCode: "unsupported_request",
    intents: ["clarify"],
    mode: "single",
  });
  assert.deepEqual(entry.forbiddenIntents, [
    "query_progress",
    "query_plan_progress",
  ]);
});

test("renders the precedence protocol after broad reads and before prohibitions", () => {
  const prompt = buildLangChainSystemPrompt();
  const broadReadIndex = prompt.indexOf("对照组一（只读类别）");
  const markerIndex = prompt.indexOf(
    ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_MARKER,
  );
  const strictIndex = prompt.indexOf("严格禁止：");

  assert.ok(broadReadIndex >= 0);
  assert.ok(markerIndex > broadReadIndex);
  assert.ok(strictIndex > markerIndex);
  assert.equal(
    prompt.split(ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_MARKER).length - 1,
    1,
  );
  assert.equal(
    prompt.includes(ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_PROTOCOL),
    true,
  );
});

test("uses neutral precedence examples instead of fixture messages", () => {
  for (const fixture of L3B_EVALUATION_FIXTURES) {
    assert.equal(
      ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_PROTOCOL.includes(fixture.message),
      false,
      fixture.id,
    );
  }
});
