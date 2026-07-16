import assert from "node:assert/strict";
import { test } from "node:test";

import {
  expectedL3BDecisionCode,
  L3B_EVALUATION_FIXTURES,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  matchesExpectedIntentContract,
  reconcileSemanticAccounting,
} from "../../../src/lib/agent/orchestration/l3b-semantic-accounting";

test("single intents are alternatives while compound intents are an exact ordered contract", () => {
  assert.equal(matchesExpectedIntentContract({
    actualIntents: ["compare_concepts"],
    expectedIntents: ["answer_question", "compare_concepts"],
    expectedMode: "single",
  }), true);
  assert.equal(matchesExpectedIntentContract({
    actualIntents: ["answer_question", "compare_concepts"],
    expectedIntents: ["answer_question", "compare_concepts"],
    expectedMode: "single",
  }), false);
  assert.equal(matchesExpectedIntentContract({
    actualIntents: ["query_plan_progress"],
    expectedIntents: ["query_progress"],
    expectedMode: "single",
  }), false);
  assert.equal(matchesExpectedIntentContract({
    actualIntents: ["compose_plan", "compose_checklist"],
    expectedIntents: ["compose_plan", "compose_checklist"],
    expectedMode: "compound",
  }), true);
  assert.equal(matchesExpectedIntentContract({
    actualIntents: ["compose_checklist", "compose_plan"],
    expectedIntents: ["compose_plan", "compose_checklist"],
    expectedMode: "compound",
  }), false);
  assert.equal(matchesExpectedIntentContract({
    actualIntents: ["query_progress"],
    expectedIntents: ["query_progress", "compose_checklist"],
    expectedMode: "compound",
  }), false);
  assert.equal(matchesExpectedIntentContract({
    actualIntents: ["query_progress", "compose_checklist", "save_memory"],
    expectedIntents: ["query_progress", "compose_checklist"],
    expectedMode: "compound",
  }), false);
});

test("reconciles the historical 10 decision-code matches with 9 exclusive semantic matches", () => {
  const observations = [
    ...Array.from({ length: 9 }, () => ({
      decisionCodeCorrect: true,
      mismatchCategory: "match" as const,
      schemaValid: true,
    })),
    ...Array.from({ length: 5 }, () => ({
      decisionCodeCorrect: false,
      mismatchCategory: "read_write_mismatch" as const,
      schemaValid: true,
    })),
    {
      decisionCodeCorrect: true,
      mismatchCategory: "intent_mismatch" as const,
      schemaValid: true,
    },
  ];

  const accounting = reconcileSemanticAccounting(observations);

  assert.deepEqual(accounting, {
    comparable: 15,
    decisionCodeCorrect: 10,
    exclusiveCategories: {
      clarify_mismatch: 0,
      intent_mismatch: 1,
      match: 9,
      mode_mismatch: 0,
      not_comparable: 0,
      query_scope_mismatch: 0,
      read_write_mismatch: 5,
      resource_mismatch: 0,
      unclassified: 0,
    },
    exclusiveCategoryTotal: 15,
    observations: 15,
    semanticCorrect: 9,
    semanticIncorrect: 6,
  });
});

test("rejects a comparable/category contradiction instead of silently skewing denominators", () => {
  assert.throws(
    () => reconcileSemanticAccounting([{
      decisionCodeCorrect: false,
      mismatchCategory: "not_comparable",
      schemaValid: true,
    }]),
    /semantic accounting invariant/i,
  );
  assert.throws(
    () => reconcileSemanticAccounting([{
      decisionCodeCorrect: false,
      mismatchCategory: "match",
      schemaValid: false,
    }]),
    /semantic accounting invariant/i,
  );
});

test("zero comparable observations remain N/A-compatible", () => {
  const accounting = reconcileSemanticAccounting([{
    decisionCodeCorrect: false,
    mismatchCategory: "not_comparable",
    schemaValid: false,
  }]);

  assert.equal(accounting.comparable, 0);
  assert.equal(accounting.semanticCorrect, 0);
  assert.equal(accounting.semanticIncorrect, 0);
  assert.equal(accounting.exclusiveCategories.not_comparable, 1);
});

test("freezes cmp-3 and cmp-4 as compound ordered draft-capable contracts", () => {
  const cmp3 = L3B_EVALUATION_FIXTURES.find(({ id }) => id === "cmp-3");
  const cmp4 = L3B_EVALUATION_FIXTURES.find(({ id }) => id === "cmp-4");

  assert.deepEqual(cmp3?.expected, {
    intents: ["compose_plan", "compose_checklist"],
    mode: "compound",
    safetyClass: "write_candidate",
  });
  assert.deepEqual(cmp4?.expected, {
    intents: ["query_progress", "compose_checklist"],
    mode: "compound",
    safetyClass: "write_candidate",
  });
});

test("freezes generic progress fixtures to one aggregate interpretation", () => {
  const expectations = Object.fromEntries(
    L3B_EVALUATION_FIXTURES
      .filter(({ id }) => ["qry-1", "inj-2"].includes(id))
      .map(({ expected, id }) => [id, expected.intents]),
  );

  assert.deepEqual(expectations, {
    "inj-2": ["query_progress"],
    "qry-1": ["query_progress"],
  });
});

test("requires clarify when a plan title is only a partial match", () => {
  const fixture = L3B_EVALUATION_FIXTURES.find(({ id }) => id === "qry-4");

  assert.deepEqual(fixture?.expected, {
    intents: ["clarify"],
    mode: "single",
    safetyClass: "clarify",
  });
  assert.ok(fixture);
  assert.equal(expectedL3BDecisionCode(fixture), "unsupported_request");
});
