import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";

import { runConversationalAnswer } from "../../../src/lib/agent/answer/runtime";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  L3B_EVALUATION_FIXTURES,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  runLangChainOrchestratorResult,
} from "../../../src/lib/agent/orchestration/langchain-orchestrator";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";
import { orchestratorPlanToIntent } from "../../../src/lib/agent/orchestration/orchestrator-plan-to-intent";

const modelConfig = {
  apiKey: "test-only",
  baseURL: "https://example.invalid",
  maxRetries: 0,
  model: "fake",
  provider: "deepseek",
  structuredOutputMode: "provider_default",
  temperature: 0,
  timeoutMs: 100,
} as const;

const fakeFactory = (output: OrchestratorOutput): ModelFactory => () => ({
  withConfig: () => ({
    invoke: async () => ({ content: JSON.stringify(output) }),
  }),
}) as unknown as BaseChatModel;

const fakeAnswerModel = (answer: string): BaseChatModel => ({
  stream: async () => (async function* () {
    yield new AIMessageChunk({ content: answer });
  })(),
}) as unknown as BaseChatModel;

const fixture = (id: string) => {
  const found = L3B_EVALUATION_FIXTURES.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
};

const task = (
  id: string,
  intent: string,
  args: Record<string, unknown>,
  dependsOn: string[] = [],
) => ({
  agentRole: intent.startsWith("query_") ? "query" : "plan",
  args,
  dependsOn,
  id,
  intent,
  label: intent,
});

const clarifyTask = (question: string) => ({
  agentRole: "plan",
  args: { question },
  dependsOn: [],
  id: "t1",
  intent: "clarify",
  label: "clarify",
});

const output = (
  decisionCode: OrchestratorOutput["decisionCode"],
  mode: OrchestratorOutput["mode"],
  tasks: ReturnType<typeof task>[],
): OrchestratorOutput => ({
  decisionCode,
  mode,
  routingSummary: "sanitized regression",
  tasks,
  version: 2,
}) as OrchestratorOutput;

const run = (fixtureId: string, decision: OrchestratorOutput) => {
  const selected = fixture(fixtureId);
  return runLangChainOrchestratorResult({
    context: selected.context,
    message: selected.message,
    modelConfig,
    modelFactory: fakeFactory(decision),
    structuredRetryBudget: { schema: 0, transport: 0 },
  });
};

const runMessage = (
  message: string,
  decision: OrchestratorOutput,
  fixtureId = "cmp-2",
) => {
  const selected = fixture(fixtureId);
  return runLangChainOrchestratorResult({
    context: selected.context,
    message,
    modelConfig,
    modelFactory: fakeFactory(decision),
    structuredRetryBudget: { schema: 0, transport: 0 },
  });
};

test("rejects the four observed non-canonical consultation aliases", async () => {
  for (const [fixtureId, intent] of [
    ["cons-1", "explain_concept"],
    ["cons-3", "give_learning_path"],
    ["cons-4", "explain_concept"],
    ["cons-5", "explain_concept"],
  ] as const) {
    const result = await run(
      fixtureId,
      output("pure_consultation", "single", [
        task("t1", intent, {}),
      ]),
    );

    assert.equal(result.status, "unavailable", fixtureId);
    if (result.status !== "unavailable") continue;
    assert.equal(result.reason, "invalid_decision_consistency", fixtureId);
    assert.equal(
      result.decisionConsistencyError,
      "consultation_intent_mismatch",
      fixtureId,
    );
  }
});

test("rejects untrusted specific-plan reads in qry-4, wrt-1, and exr-3", async () => {
  const qry4 = await run(
    "qry-4",
    output("pure_read_query", "single", [
      task("t1", "query_plan_progress", { planId: 101 }),
    ]),
  );

  const wrt1 = await run(
    "wrt-1",
    output("compound_ready", "compound", [
      task("t1", "query_plan_progress", {}),
      task("t2", "compose_plan", {}, ["t1"]),
    ]),
  );

  const exr3 = await run(
    "exr-3",
    output("pure_read_query", "single", [
      task("t1", "query_plan_progress", {}),
    ]),
  );

  const cases = [
    [
      "qry-4",
      qry4,
      "provider_selected_workspace_resource",
      ["query_plan_progress"],
    ],
    [
      "wrt-1",
      wrt1,
      "specific_reference_required",
      ["query_plan_progress", "compose_plan"],
    ],
    [
      "exr-3",
      exr3,
      "specific_reference_required",
      ["query_plan_progress"],
    ],
  ] as const;

  for (const [fixtureId, result, code, providerIntents] of cases) {
    assert.equal(result.status, "clarified", fixtureId);
    if (result.status !== "clarified") continue;
    assert.equal(result.clarificationSource, "query_scope", fixtureId);
    assert.equal(result.queryScopeErrorCode, code, fixtureId);
    assert.deepEqual(
      result.plan.tasks.map(({ intent }) => intent),
      ["clarify"],
      fixtureId,
    );
    assert.equal(
      typeof result.plan.tasks[0]?.args.question === "string"
        && result.plan.tasks[0].args.question.trim().length > 0,
      true,
      fixtureId,
    );
    assert.deepEqual(result.schemaValidDecision.intents, providerIntents);
  }
});

test("rejects wrt-2 one-task compound deterministically", async () => {
  const result = await run(
    "wrt-2",
    output("compound_ready", "compound", [
      task("t1", "compose_checklist", {}),
    ]),
  );

  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") return;
  assert.equal(result.reason, "invalid_decision_consistency");
  assert.equal(
    result.decisionConsistencyError,
    "compound_task_count_mismatch",
  );
});

test("clarifies cmp-1 scheduling without a pre-existing plan ID", async () => {
  const result = await run(
    "cmp-1",
    output("compound_ready", "compound", [
      task("t1", "compose_plan", {}),
      task("t2", "schedule_plan", {}, ["t1"]),
    ]),
  );

  assert.equal(result.status, "clarified");
  if (result.status !== "clarified") return;
  assert.equal(result.clarificationSource, "resource_readiness");
  if (result.clarificationSource !== "resource_readiness") return;
  assert.deepEqual(result.plan.tasks.map(({ intent }) => intent), ["clarify"]);
  assert.deepEqual(result.resourceIssueCodes, ["RESOURCE_ID_MISSING"]);
});

test("preserves the two supported reviewable compound shapes", async () => {
  const compose = await run(
    "cmp-3",
    output("compound_ready", "compound", [
      task("t1", "compose_plan", {}),
      task("t2", "compose_checklist", {}, ["t1"]),
    ]),
  );
  assert.equal(compose.status, "success");

  const derived = await run(
    "cmp-4",
    output("compound_ready", "compound", [
      task("t1", "query_progress", {}),
      task("t2", "compose_checklist", {}, ["t1"]),
    ]),
  );
  assert.equal(derived.status, "success");
});

test("accepts the five corrected Acceptance semantic shapes", async () => {
  const qry4 = await run(
    "qry-4",
    output("unsupported_request", "single", [
      clarifyTask("请提供完整且唯一的计划标题。"),
    ]),
  );
  assert.equal(qry4.status, "success");

  const wrt1 = await run(
    "wrt-1",
    output("explicit_write_ready", "single", [
      task("t1", "compose_plan", {}),
    ]),
  );
  assert.equal(wrt1.status, "success");

  const wrt2 = await run(
    "wrt-2",
    output("explicit_write_ready", "single", [
      task("t1", "compose_checklist", {}),
    ]),
  );
  assert.equal(wrt2.status, "success");

  const cmp1 = await run(
    "cmp-1",
    output("compound_missing_target", "single", [
      clarifyTask("请先确认要排期的现有计划。"),
    ]),
  );
  assert.equal(cmp1.status, "success");

  const exr3 = await run(
    "exr-3",
    output("explicit_write_missing_resource", "single", [
      clarifyTask("请提供要完成的计划与条目完整标题。"),
    ]),
  );
  assert.equal(exr3.status, "success");
});

test("projects exr-3 missing checklist target to typed deterministic clarify", async () => {
  const result = await run(
    "exr-3",
    output("explicit_write_ready", "single", [
      task("t1", "complete_plan_item", {
        checklistTitle: "不存在的清单",
        itemTitle: "完成这一项",
      }),
    ]),
  );

  assert.equal(result.status, "clarified");
  if (result.status !== "clarified") return;
  assert.equal(result.clarificationSource, "resource_readiness");
  assert.deepEqual(result.resourceIssueCodes, [
    "RESOURCE_TITLE_NOT_IN_CONTEXT",
  ]);
  assert.deepEqual(
    result.plan.tasks.map(({ intent }) => intent),
    ["clarify"],
  );
  assert.equal(
    typeof result.plan.tasks[0]?.args.question === "string"
      && result.plan.tasks[0].args.question.trim().length > 0,
    true,
  );
  assert.deepEqual(result.schemaValidDecision.intents, [
    "complete_plan_item",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /不存在的清单|完成这一项/u);
});

test("projects imperative completion misclassified as consultation to typed clarify", async () => {
  const result = await run(
    "exr-3",
    output("pure_consultation", "single", [
      task("t1", "answer_question", {
        question: "完成考研数学的高数极限部分",
      }),
    ]),
  );

  assert.equal(result.status, "clarified");
  if (result.status !== "clarified") return;
  assert.equal(
    result.clarificationSource,
    "request_semantic_boundary",
  );
  assert.equal(
    result.requestSemanticBoundaryErrorCode,
    "imperative_completion_non_write",
  );
  assert.deepEqual(result.plan.tasks.map(({ intent }) => intent), ["clarify"]);
  assert.deepEqual(result.schemaValidDecision.intents, ["answer_question"]);
});

test("projects courtesy-prefixed completion and unrelated drafts to typed clarify", async () => {
  for (const [message, decision] of [
    [
      "请帮我完成考研数学的高数极限部分",
      output("pure_consultation", "single", [
        task("t1", "answer_question", {
          question: "请帮我完成考研数学的高数极限部分",
        }),
      ]),
    ],
    [
      "请帮我完成考研数学的高数极限部分",
      output("explicit_write_ready", "single", [
        task("t1", "compose_plan", {}),
      ]),
    ],
    [
      "请帮我把高数极限完成一下",
      output("pure_consultation", "single", [
        task("t1", "answer_question", {
          question: "请帮我把高数极限完成一下",
        }),
      ]),
    ],
    [
      "请帮忙完成高数极限部分",
      output("pure_consultation", "single", [
        task("t1", "answer_question", {
          question: "请帮忙完成高数极限部分",
        }),
      ]),
    ],
  ] as const) {
    const result = await runMessage(
      message,
      decision,
      "exr-3",
    );

    assert.equal(result.status, "clarified");
    if (result.status !== "clarified") continue;
    assert.equal(
      result.clarificationSource,
      "request_semantic_boundary",
    );
    if (result.clarificationSource !== "request_semantic_boundary") continue;
    assert.equal(
      result.requestSemanticBoundaryErrorCode,
      "imperative_completion_non_write",
    );
  }
});

test("projects unfinished-item scheduling relabelled as a new draft to typed clarify", async () => {
  const result = await run(
    "cmp-2",
    output("compound_ready", "compound", [
      task("t1", "query_progress", {}),
      task("t2", "compose_checklist", {}, ["t1"]),
    ]),
  );

  assert.equal(result.status, "clarified");
  if (result.status !== "clarified") return;
  assert.equal(
    result.clarificationSource,
    "request_semantic_boundary",
  );
  assert.equal(
    result.requestSemanticBoundaryErrorCode,
    "unfinished_items_schedule_non_clarify",
  );
  assert.deepEqual(result.plan.tasks.map(({ intent }) => intent), ["clarify"]);
  assert.deepEqual(result.schemaValidDecision.intents, [
    "query_progress",
    "compose_checklist",
  ]);
});

test("projects common unfinished-item scheduling forms to typed clarify", async () => {
  for (const message of [
    "把没完成的任务安排在下周",
    "把没完成的任务放到下周",
    "把没完成的任务推迟到下周",
  ]) {
    const result = await runMessage(
      message,
      output("compound_ready", "compound", [
        task("t1", "query_progress", {}),
        task("t2", "compose_checklist", {}, ["t1"]),
      ]),
    );

    assert.equal(result.status, "clarified", message);
    if (result.status !== "clarified") continue;
    assert.equal(
      result.clarificationSource,
      "request_semantic_boundary",
      message,
    );
    if (result.clarificationSource !== "request_semantic_boundary") continue;
    assert.equal(
      result.requestSemanticBoundaryErrorCode,
      "unfinished_items_schedule_non_clarify",
      message,
    );
  }
});

test("does not accept Provider-selected context resources for unfinished scheduling", async () => {
  const result = await runMessage(
    "查看进度，把没完成的任务安排到下周",
    output("compound_ready", "compound", [
      task("t1", "query_progress", {}),
      task("t2", "schedule_plan", { planId: 101 }, ["t1"]),
    ]),
  );

  assert.equal(result.status, "clarified");
  if (result.status !== "clarified") return;
  assert.equal(
    result.clarificationSource,
    "request_semantic_boundary",
  );
  if (result.clarificationSource !== "request_semantic_boundary") return;
  assert.equal(
    result.requestSemanticBoundaryErrorCode,
    "unfinished_items_schedule_non_clarify",
  );
});

test("allows an explicit trusted schedule item to reach resource validation", async () => {
  const result = await runMessage(
    "把尚未完成的日程 401 移到下周一",
    output("explicit_write_ready", "single", [
      task("t1", "reschedule_item", {
        itemId: 401,
        newDate: "2026-07-20",
      }),
    ]),
    "qry-1",
  );

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.deepEqual(result.plan.tasks.map(({ intent }) => intent), [
    "reschedule_item",
  ]);
});

test("rejects a partial mutation when multiple schedule items are explicit", async () => {
  for (const message of [
    "把尚未完成的日程 401 和 402 移到下周一",
    "把尚未完成的日程 #401 和 #402 移到下周一",
    "把尚未完成的日程 ID 401 和 ID 402 移到下周一",
  ]) {
    const result = await runMessage(
      message,
      output("explicit_write_ready", "single", [
        task("t1", "reschedule_item", {
          itemId: 401,
          newDate: "2026-07-20",
        }),
      ]),
      "qry-1",
    );

    assert.equal(result.status, "clarified", message);
    if (result.status !== "clarified") continue;
    assert.equal(
      result.clarificationSource,
      "request_semantic_boundary",
      message,
    );
    if (result.clarificationSource !== "request_semantic_boundary") continue;
    assert.equal(
      result.requestSemanticBoundaryErrorCode,
      "unfinished_items_schedule_non_clarify",
      message,
    );
  }
});

test("keeps advice about completing work on the consultation path", async () => {
  const selected = fixture("cons-3");
  const result = await runLangChainOrchestratorResult({
    context: selected.context,
    message: "如何完成一份长期学习计划？",
    modelConfig,
    modelFactory: fakeFactory(
      output("pure_consultation", "single", [
        task("t1", "answer_question", {
          question: "如何完成一份长期学习计划？",
        }),
      ]),
    ),
    structuredRetryBudget: { schema: 0, transport: 0 },
  });

  assert.equal(result.status, "success");
});

test("keeps advice about scheduling unfinished work on the consultation path", async () => {
  const result = await runMessage(
    "如何把没完成的任务安排到下周？",
    output("pure_consultation", "single", [
      task("t1", "answer_question", {
        question: "如何把没完成的任务安排到下周？",
      }),
    ]),
    "cons-3",
  );

  assert.equal(result.status, "success");
});

test("canonical consultation records one Orchestrator and one Answer call with separate latencies", async () => {
  const recorder = createModelCallBudgetRecorder();
  const selected = fixture("cons-1");
  let orchestratorLatencyMs: number | null = null;
  const orchestratorStartedAt = performance.now();
  const orchestrator = await runLangChainOrchestratorResult({
    context: selected.context,
    message: selected.message,
    modelCallRecorder: recorder,
    modelCallScopeId: "cons-1:orchestrator",
    modelConfig,
    modelFactory: fakeFactory(output("pure_consultation", "single", [{
      agentRole: "query",
      args: { question: selected.message },
      dependsOn: [],
      id: "t1",
      intent: "answer_question",
      label: "answer_question",
    }])),
    structuredRetryBudget: { schema: 0, transport: 0 },
  });
  orchestratorLatencyMs = performance.now() - orchestratorStartedAt;

  assert.equal(orchestrator.status, "success");
  if (orchestrator.status !== "success") return;
  const intent = orchestratorPlanToIntent(orchestrator.plan);
  assert.equal(intent?.intent, "answer_question");
  if (!intent || intent.intent !== "answer_question") return;

  let answerTtftMs: number | null = null;
  let answerTotalLatencyMs: number | null = null;
  const answerStartedAt = performance.now();
  const answer = await runConversationalAnswer({
    callScopeId: "cons-1:answer",
    emitToken: () => {
      answerTtftMs ??= performance.now() - answerStartedAt;
    },
    intent,
    message: selected.message,
    modelCallRecorder: recorder,
    model: fakeAnswerModel("合成回答。"),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });
  answerTotalLatencyMs = performance.now() - answerStartedAt;

  assert.equal(answer.status, "complete");
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.orchestratorLogicalCalls, 1);
  assert.equal(snapshot.orchestratorProviderAttempts, 1);
  assert.equal(snapshot.answerLogicalCalls, 1);
  assert.equal(snapshot.answerProviderAttempts, 1);
  assert.equal(snapshot.unexpectedDuplicateModelCalls, 0);
  assert.notEqual(orchestratorLatencyMs, null);
  assert.ok((orchestratorLatencyMs ?? -1) >= 0);
  assert.notEqual(answerTtftMs, null);
  assert.ok((answerTtftMs ?? -1) >= 0);
  assert.notEqual(answerTotalLatencyMs, null);
  assert.ok((answerTotalLatencyMs ?? -1) >= 0);
});
