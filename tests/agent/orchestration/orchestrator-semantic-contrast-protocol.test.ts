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
  ORCHESTRATOR_SEMANTIC_CONTRAST_MARKER,
  ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL,
  ORCHESTRATOR_SEMANTIC_CONTRASTS,
} from "../../../src/lib/agent/orchestration/orchestrator-intent-family-protocol";

const expectedIds = [
  "plan_inventory_query",
  "single_plan_draft",
  "natural_language_checklist_draft",
  "partial_title_query",
  "imperative_completion_mutation",
  "new_plan_schedule",
] as const;

test("freezes the six schema-typed semantic contrasts", () => {
  assert.deepEqual(
    ORCHESTRATOR_SEMANTIC_CONTRASTS.map(({ id }) => id),
    expectedIds,
  );

  for (const contrast of ORCHESTRATOR_SEMANTIC_CONTRASTS) {
    assert.equal(
      ORCHESTRATOR_DECISION_CODES.includes(contrast.admitted.decisionCode),
      true,
      contrast.id,
    );
    assert.equal(
      ORCHESTRATOR_MODES.includes(contrast.admitted.mode),
      true,
      contrast.id,
    );
    for (const intent of [
      ...contrast.admitted.intents,
      ...contrast.forbiddenIntents,
    ]) {
      assert.equal(ROUTER_INTENT_NAMES.includes(intent), true, contrast.id);
    }
    for (const decisionCode of contrast.forbiddenDecisionCodes) {
      assert.equal(
        ORCHESTRATOR_DECISION_CODES.includes(decisionCode),
        true,
        contrast.id,
      );
    }
  }
});

test("renders every semantic contrast only from the shared Full protocol", () => {
  const prompt = buildLangChainSystemPrompt();

  assert.equal(prompt.includes(ORCHESTRATOR_SEMANTIC_CONTRAST_MARKER), true);
  assert.equal(prompt.includes(ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL), true);
  for (const contrast of ORCHESTRATOR_SEMANTIC_CONTRASTS) {
    assert.match(prompt, new RegExp(`\\[${contrast.id}\\]`));
    assert.match(prompt, new RegExp(`decisionCode=${contrast.admitted.decisionCode}`));
    assert.match(prompt, new RegExp(`mode=${contrast.admitted.mode}`));
    for (const intent of contrast.admitted.intents) {
      assert.match(prompt, new RegExp(`\\b${intent}\\b`));
    }
  }
});

test("uses neutral contrasts rather than copying evaluation fixture messages", () => {
  const prompt = buildLangChainSystemPrompt();

  for (const fixture of L3B_EVALUATION_FIXTURES) {
    assert.equal(prompt.includes(fixture.message), false, fixture.id);
  }
});

test("closes imperative completion against read and untrusted write branches", () => {
  const contrast = ORCHESTRATOR_SEMANTIC_CONTRASTS.find(
    ({ id }) => id === "imperative_completion_mutation",
  );

  assert.ok(contrast);
  assert.deepEqual(contrast.admitted, {
    decisionCode: "explicit_write_missing_resource",
    intents: ["clarify"],
    mode: "single",
  });
  assert.deepEqual(
    contrast.forbiddenDecisionCodes,
    ["pure_read_query", "explicit_write_ready"],
  );
  assert.deepEqual(
    contrast.forbiddenIntents,
    ["query_plan_progress", "complete_plan_item"],
  );
  assert.match(contrast.reason, /计划标题不能替代清单标题/);
  assert.match(contrast.reason, /精确且唯一/);

  const prompt = buildLangChainSystemPrompt();
  assert.match(prompt, /禁止 decisionCode=pure_read_query,explicit_write_ready/);
  assert.match(prompt, /禁止 intents=query_plan_progress,complete_plan_item/);
  assert.match(prompt, /计划标题不能替代清单标题/);
});
