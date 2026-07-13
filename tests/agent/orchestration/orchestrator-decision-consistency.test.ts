import assert from "node:assert/strict";
import { test } from "node:test";

import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  CONSULTATION_INTENTS,
  READ_QUERY_INTENTS,
  validateOrchestratorDecisionConsistency,
} from "../../../src/lib/agent/orchestration/orchestrator-decision-consistency";

const task = (intent: string, args: Record<string, unknown> = {}, id = "t1") => ({
  agentRole: intent === "answer_question" ? "content" : intent.startsWith("query_") ? "query" : "plan",
  args,
  dependsOn: id === "t1" ? [] : ["t1"],
  id,
  intent,
  label: intent,
});
const answerTask = task("answer_question");
const queryTask = task("query_plan");
const writeTask = task("compose_plan");
const clarifyTask = (question: string) => task("clarify", { question });

const output = (
  decisionCode: string,
  mode: "compound" | "single",
  tasks: readonly ReturnType<typeof task>[],
) => ({
  decisionCode,
  mode,
  routingSummary: "sanitized",
  tasks,
  version: 2,
}) as unknown as OrchestratorOutput;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

test("publishes frozen consultation and read-query intent families", () => {
  assert.deepEqual(CONSULTATION_INTENTS, [
    "answer_question", "compare_concepts", "explain_concept", "give_examples", "give_learning_path",
  ]);
  assert.deepEqual(READ_QUERY_INTENTS, [
    "capability_query", "evaluate_plan", "query_checklist_progress", "query_memory",
    "query_plan", "query_plan_progress", "query_progress", "query_schedule",
    "query_timeline", "summarize_answer", "rewrite_answer",
  ]);
  assert.equal(Object.isFrozen(CONSULTATION_INTENTS), true);
  assert.equal(Object.isFrozen(READ_QUERY_INTENTS), true);
});

test("accepts every valid decision mapping without mutating input", () => {
  const validCases = [
    output("pure_consultation", "single", [answerTask]),
    output("pure_read_query", "single", [queryTask]),
    output("explicit_write_ready", "single", [writeTask]),
    output("explicit_write_missing_resource", "single", [clarifyTask("请选择计划")]),
    output("compound_ready", "compound", [queryTask, task("compose_plan", {}, "t2")]),
    output("compound_missing_target", "single", [clarifyTask("请选择目标")]),
    output("unsupported_request", "single", [clarifyTask("请换一种请求")]),
  ];

  for (const input of validCases) {
    const before = JSON.stringify(input);
    deepFreeze(input);
    assert.deepEqual(validateOrchestratorDecisionConsistency(input), { valid: true });
    assert.equal(JSON.stringify(input), before);
  }
});

test("rejects the complete inconsistent decision matrix deterministically and purely", () => {
  const invalidCases = [
    // pure_consultation: single, exactly one task, consultation family only.
    ["consultation:mode", "pure_consultation", "compound", [
      answerTask, task("answer_question", {}, "t2"),
    ]],
    ["consultation:cardinality", "pure_consultation", "single", [
      answerTask, task("answer_question", {}, "t2"),
    ]],
    ["consultation:read-family", "pure_consultation", "single", [queryTask]],
    ["consultation:write-family", "pure_consultation", "single", [writeTask]],
    ["consultation:clarify-exclusion", "pure_consultation", "single", [clarifyTask("请补充")]],

    // pure_read_query: single, exactly one task, read-query family only.
    ["read:mode", "pure_read_query", "compound", [
      queryTask, task("query_progress", {}, "t2"),
    ]],
    ["read:cardinality", "pure_read_query", "single", [
      queryTask, task("query_progress", {}, "t2"),
    ]],
    ["read:consultation-family", "pure_read_query", "single", [answerTask]],
    ["read:write-family", "pure_read_query", "single", [writeTask]],
    ["read:clarify-exclusion", "pure_read_query", "single", [clarifyTask("请补充")]],

    // explicit_write_ready: single, exactly one write task, no clarify.
    ["write-ready:mode", "explicit_write_ready", "compound", [
      writeTask, task("compose_checklist", {}, "t2"),
    ]],
    ["write-ready:cardinality", "explicit_write_ready", "single", [
      writeTask, task("compose_checklist", {}, "t2"),
    ]],
    ["write-ready:consultation-family", "explicit_write_ready", "single", [answerTask]],
    ["write-ready:read-family", "explicit_write_ready", "single", [queryTask]],
    ["write-ready:clarify-exclusion", "explicit_write_ready", "single", [clarifyTask("请补充")]],

    // explicit_write_missing_resource: single, exactly one non-blank clarify.
    ["write-missing:mode", "explicit_write_missing_resource", "compound", [
      clarifyTask("请选择计划"), task("clarify", { question: "请选择清单" }, "t2"),
    ]],
    ["write-missing:cardinality", "explicit_write_missing_resource", "single", [
      clarifyTask("请选择计划"), task("clarify", { question: "请选择清单" }, "t2"),
    ]],
    ["write-missing:write-family", "explicit_write_missing_resource", "single", [writeTask]],
    ["write-missing:read-family", "explicit_write_missing_resource", "single", [queryTask]],
    ["write-missing:consultation-family", "explicit_write_missing_resource", "single", [answerTask]],
    ["write-missing:missing-question", "explicit_write_missing_resource", "single", [task("clarify")]],
    ["write-missing:non-string-question", "explicit_write_missing_resource", "single", [task("clarify", { question: 42 })]],
    ["write-missing:empty-question", "explicit_write_missing_resource", "single", [clarifyTask("")]],
    ["write-missing:trimmed-question", "explicit_write_missing_resource", "single", [clarifyTask("  \n\t  ")]],

    // compound_ready: compound, at least two tasks, at least one write, no clarify.
    ["compound-ready:mode", "compound_ready", "single", [
      queryTask, task("compose_plan", {}, "t2"),
    ]],
    ["compound-ready:cardinality", "compound_ready", "compound", [writeTask]],
    ["compound-ready:missing-write-read", "compound_ready", "compound", [
      queryTask, task("query_progress", {}, "t2"),
    ]],
    ["compound-ready:missing-write-consultation", "compound_ready", "compound", [
      answerTask, task("give_examples", {}, "t2"),
    ]],
    ["compound-ready:clarify-with-read", "compound_ready", "compound", [
      queryTask, task("clarify", { question: "请选择目标" }, "t2"),
    ]],
    ["compound-ready:clarify-with-write", "compound_ready", "compound", [
      writeTask, task("clarify", { question: "请选择目标" }, "t2"),
    ]],

    // compound_missing_target: single, exactly one non-blank clarify.
    ["compound-missing:mode", "compound_missing_target", "compound", [
      clarifyTask("请选择目标"), task("clarify", { question: "请选择时间" }, "t2"),
    ]],
    ["compound-missing:cardinality", "compound_missing_target", "single", [
      clarifyTask("请选择目标"), task("clarify", { question: "请选择时间" }, "t2"),
    ]],
    ["compound-missing:write-family", "compound_missing_target", "single", [writeTask]],
    ["compound-missing:read-family", "compound_missing_target", "single", [queryTask]],
    ["compound-missing:consultation-family", "compound_missing_target", "single", [answerTask]],
    ["compound-missing:missing-question", "compound_missing_target", "single", [task("clarify")]],
    ["compound-missing:non-string-question", "compound_missing_target", "single", [task("clarify", { question: 42 })]],
    ["compound-missing:empty-question", "compound_missing_target", "single", [clarifyTask("")]],
    ["compound-missing:trimmed-question", "compound_missing_target", "single", [clarifyTask("   ")]],

    // unsupported_request: single, exactly one non-blank clarify.
    ["unsupported:mode", "unsupported_request", "compound", [
      clarifyTask("请换一种请求"), task("clarify", { question: "请缩小范围" }, "t2"),
    ]],
    ["unsupported:cardinality", "unsupported_request", "single", [
      clarifyTask("请换一种请求"), task("clarify", { question: "请缩小范围" }, "t2"),
    ]],
    ["unsupported:write-family", "unsupported_request", "single", [writeTask]],
    ["unsupported:read-family", "unsupported_request", "single", [queryTask]],
    ["unsupported:consultation-family", "unsupported_request", "single", [answerTask]],
    ["unsupported:missing-question", "unsupported_request", "single", [task("clarify")]],
    ["unsupported:non-string-question", "unsupported_request", "single", [task("clarify", { question: 42 })]],
    ["unsupported:empty-question", "unsupported_request", "single", [clarifyTask("")]],
    ["unsupported:trimmed-question", "unsupported_request", "single", [clarifyTask("\t\n")]],
  ] as const;

  for (const [label, decisionCode, mode, tasks] of invalidCases) {
    const input = output(decisionCode, mode, tasks);
    const before = JSON.stringify(input);
    deepFreeze(input);
    const result = validateOrchestratorDecisionConsistency(input);
    assert.equal(result.valid, false, label);
    if (!result.valid) assert.match(result.code, /^[a-z_]+$/);
    assert.equal(JSON.stringify(input), before);
  }
});
