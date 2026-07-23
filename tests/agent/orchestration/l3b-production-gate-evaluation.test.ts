import assert from "node:assert/strict";
import { test } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";

import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import { createSafeProtocolDiagnostics } from "../../../src/lib/agent/llm/structured-protocol";
import {
  evaluateProductionGateCase,
  type ProductionGateObservation,
} from "../../../src/lib/agent/orchestration/hybrid-production-evaluation";
import {
  L3B_EVALUATION_FIXTURES,
  L3B_KNOWN_ID_DIAGNOSTICS,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  createProductionAnswerAdapter,
  createProductionFullAdapter,
  createProductionResidualObserver,
  type SanitizedRoleEvent,
} from "../../../src/lib/agent/orchestration/l3b-production-gate-model-adapters";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";

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

const fixture = (id: string) => {
  const selected = L3B_EVALUATION_FIXTURES.find((candidate) => candidate.id === id);
  assert.ok(selected, id);
  return selected;
};

const knownIdDiagnostic = (id: string) => {
  const selected = L3B_KNOWN_ID_DIAGNOSTICS.find(
    (candidate) => candidate.id === id,
  );
  assert.ok(selected, id);
  return selected;
};

const promptJsonModelFactory = (
  invoke: () => unknown | Promise<unknown>,
): ModelFactory => () => ({
  withConfig: () => ({
    invoke: async () => ({ content: JSON.stringify(await invoke()) }),
  }),
}) as unknown as BaseChatModel;

const streamingModel = (
  chunks: readonly (AIMessageChunk | Error)[],
): BaseChatModel => ({
  stream: async () => (async function* () {
    for (const chunk of chunks) {
      if (chunk instanceof Error) throw chunk;
      yield chunk;
    }
  })(),
}) as unknown as BaseChatModel;

const fullOutput = (
  decisionCode: OrchestratorOutput["decisionCode"],
  intent: string,
  args: Record<string, unknown> = {},
): OrchestratorOutput => ({
  decisionCode,
  mode: "single",
  routingSummary: "bounded test decision",
  tasks: [{
    agentRole: intent === "compose_plan"
      ? "plan"
      : intent === "save_memory"
        ? "memory"
        : intent === "schedule_plan"
          ? "schedule"
          : "query",
    args,
    dependsOn: [],
    id: "t1",
    intent,
    label: "bounded test task",
  }],
  version: 2,
}) as OrchestratorOutput;

const evaluate = async (
  fixtureId: string,
  options: Readonly<{
    answerChunks?: readonly (AIMessageChunk | Error)[];
    fullInvoke?: () => unknown | Promise<unknown>;
    fullRetryBudget?: { schema: number; transport: number };
    residualInvoke?: Parameters<typeof evaluateProductionGateCase>[0]["residualInvoke"];
  }> = {},
) => {
  const recorder = createModelCallBudgetRecorder();
  const events: SanitizedRoleEvent[] = [];
  const fullOrchestratorAdapter = createProductionFullAdapter({
    modelConfig,
    modelFactory: promptJsonModelFactory(
      options.fullInvoke
      ?? (() => assert.fail("deterministic branch must not call Full")),
    ),
    observe: (event) => events.push(event),
    recorder,
    retryBudget: options.fullRetryBudget ?? { schema: 0, transport: 0 },
  });
  const answerAdapter = createProductionAnswerAdapter({
    model: streamingModel(
      options.answerChunks
      ?? [new AIMessageChunk({ content: "bounded synthetic answer" })],
    ),
    modelConfig,
    observe: (event) => events.push(event),
    recorder,
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });
  const observation = await evaluateProductionGateCase({
    answerAdapter,
    authenticatedActor: { collection: "users", id: 7, isAdmin: true },
    fixture: fixture(fixtureId),
    fullOrchestratorAdapter,
    modelCallRecorder: recorder,
    observationIndex: 1,
    residualInvoke: options.residualInvoke,
    round: 1,
  });
  return { events, observation };
};

const evaluateKnownId = async (
  fixtureId: string,
  fullInvoke: () => unknown | Promise<unknown>,
) => {
  const recorder = createModelCallBudgetRecorder();
  const events: SanitizedRoleEvent[] = [];
  const fullOrchestratorAdapter = createProductionFullAdapter({
    modelConfig,
    modelFactory: promptJsonModelFactory(fullInvoke),
    observe: (event) => events.push(event),
    recorder,
    retryBudget: { schema: 0, transport: 0 },
  });
  const answerAdapter = createProductionAnswerAdapter({
    model: streamingModel([
      new AIMessageChunk({ content: "answer must remain unused" }),
    ]),
    modelConfig,
    observe: (event) => events.push(event),
    recorder,
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });
  const observation = await evaluateProductionGateCase({
    answerAdapter,
    authenticatedActor: { collection: "users", id: 7, isAdmin: true },
    fixture: knownIdDiagnostic(fixtureId),
    fullOrchestratorAdapter,
    modelCallRecorder: recorder,
    observationIndex: 1,
    round: 1,
  });
  return { events, observation };
};

const assertSafeObservation = (
  observation: ProductionGateObservation,
  fixtureId: string,
  extraForbidden: readonly string[] = [],
) => {
  const selected = fixture(fixtureId);
  const serialized = JSON.stringify(observation);
  assert.doesNotMatch(serialized, new RegExp(selected.message));
  for (const plan of selected.context.plans) {
    if (plan.title) assert.doesNotMatch(serialized, new RegExp(plan.title));
  }
  for (const value of extraForbidden) {
    assert.doesNotMatch(serialized, new RegExp(value));
  }
  assert.doesNotMatch(serialized, /rawProvider|rawResponse|stack|reasoning_content/u);
  assert.equal(observation.rawRetentionViolation, false);
  assert.equal(observation.databaseAccessAttempts, 0);
  assert.equal(observation.databaseConnections, 0);
  assert.equal(observation.databaseMutationAttempts, 0);
  assert.equal(observation.businessMutationAttempts, 0);
  assert.equal(observation.businessMutations, 0);
  assert.equal(observation.draftPathsReached, 0);
  assert.equal(observation.taskExecutionAttempts, 0);
  assert.equal(observation.taskExecutions, 0);
  assert.equal(observation.writeWithoutDraftViolations, 0);
};

const assertSafeKnownIdObservation = (
  observation: ProductionGateObservation,
  fixtureId: string,
) => {
  const selected = knownIdDiagnostic(fixtureId);
  const serialized = JSON.stringify(observation);
  assert.equal(serialized.includes(selected.message), false);
  assert.equal(serialized.includes("考研数学复习计划"), false);
  assert.equal(serialized.includes("\"planId\""), false);
  assert.doesNotMatch(
    serialized,
    /rawProvider|rawResponse|stack|reasoning_content/u,
  );
  assert.equal(observation.rawRetentionViolation, false);
  assert.equal(observation.databaseAccessAttempts, 0);
  assert.equal(observation.databaseConnections, 0);
  assert.equal(observation.databaseMutationAttempts, 0);
  assert.equal(observation.businessMutationAttempts, 0);
  assert.equal(observation.businessMutations, 0);
  assert.equal(observation.draftPathsReached, 0);
  assert.equal(observation.taskExecutionAttempts, 0);
  assert.equal(observation.taskExecutions, 0);
  assert.equal(observation.writeWithoutDraftViolations, 0);
};

test("qry-1 enters pure Query with every semantic model role at zero", async () => {
  const { observation } = await evaluate("qry-1", {
    residualInvoke: async () => assert.fail("pure Query cannot call Residual"),
  });

  assert.equal(observation.branchKind, "pure_query");
  assert.equal(observation.finalMode, "single");
  assert.deepEqual(observation.finalTaskIntents, ["query_progress"]);
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assert.equal(observation.callAccounting.fullOrchestratorLogicalCalls, 0);
  assert.equal(observation.callAccounting.residualPlannerLogicalCalls, 0);
  assert.equal(observation.callAccounting.answerLogicalCalls, 0);
  assert.equal(observation.callAccounting.fullOrchestratorProviderAttempts, 0);
  assert.equal(observation.callAccounting.residualPlannerProviderAttempts, 0);
  assert.equal(observation.callAccounting.answerProviderAttempts, 0);
  assert.equal(observation.callAccounting.queryCommentaryProviderAttempts, 0);
  assert.equal(observation.callAccounting.replanProviderAttempts, 0);
  assert.equal(observation.callAccounting.specialistProviderAttempts, 0);
  assertSafeObservation(observation, "qry-1");
});

test("qry-4 is a zero-call deterministic clarify with a non-empty question", async () => {
  const { observation } = await evaluate("qry-4", {
    residualInvoke: async () => assert.fail("clarify cannot call Residual"),
  });

  assert.equal(observation.branchKind, "deterministic_clarify");
  assert.deepEqual(observation.finalTaskIntents, ["clarify"]);
  assert.equal(observation.clarifyQuestionPresent, true);
  assert.deepEqual(observation.callAccounting, {
    answerLogicalCalls: 0,
    answerProviderAttempts: 0,
    fullOrchestratorLogicalCalls: 0,
    fullOrchestratorProviderAttempts: 0,
    queryCommentaryLogicalCalls: 0,
    queryCommentaryProviderAttempts: 0,
    replanLogicalCalls: 0,
    replanProviderAttempts: 0,
    residualPlannerLogicalCalls: 0,
    residualPlannerProviderAttempts: 0,
    specialistLogicalCalls: 0,
    specialistProviderAttempts: 0,
    unexpectedDuplicateModelCalls: 0,
  });
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assertSafeObservation(observation, "qry-4");
});

test("cmp-4 keeps fixed Query ownership and uses at most one Residual logical call", async () => {
  const { observation } = await evaluate("cmp-4", {
    residualInvoke: async () => [{
      agentRole: "plan",
      args: { title: "synthetic draft" },
      dependsOn: [],
      id: "residual-draft",
      intent: "compose_checklist",
      label: "synthetic draft",
    }],
  });

  assert.equal(observation.branchKind, "hybrid_compound");
  assert.equal(observation.finalMode, "compound");
  assert.deepEqual(observation.finalTaskIntents, [
    "query_progress",
    "compose_checklist",
  ]);
  assert.deepEqual(observation.finalDependencies, [
    { dependsOn: [], taskId: "t1" },
    { dependsOn: ["t1"], taskId: "t2" },
  ]);
  assert.equal(observation.callAccounting.fullOrchestratorLogicalCalls, 0);
  assert.equal(observation.callAccounting.fullOrchestratorProviderAttempts, 0);
  assert.equal(observation.callAccounting.residualPlannerLogicalCalls, 1);
  assert.equal(observation.callAccounting.residualPlannerProviderAttempts, 1);
  assert.equal(observation.callAccounting.answerLogicalCalls, 0);
  assert.equal(observation.callAccounting.answerProviderAttempts, 0);
  assert.equal(observation.callAccounting.queryCommentaryProviderAttempts, 0);
  assert.equal(observation.callAccounting.replanProviderAttempts, 0);
  assert.equal(observation.callAccounting.specialistProviderAttempts, 0);
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assertSafeObservation(observation, "cmp-4");
});

test("wrt-1 falls through to one bounded Full Orchestrator call", async () => {
  const { events, observation } = await evaluate("wrt-1", {
    fullInvoke: async () => fullOutput(
      "explicit_write_ready",
      "compose_plan",
      { goal: "synthetic", title: "synthetic" },
    ),
    residualInvoke: async () => assert.fail("Full path cannot call Residual"),
  });

  assert.equal(observation.branchKind, "full_orchestrator");
  assert.deepEqual(observation.finalTaskIntents, ["compose_plan"]);
  assert.equal(observation.callAccounting.fullOrchestratorLogicalCalls, 1);
  assert.equal(observation.callAccounting.fullOrchestratorProviderAttempts, 1);
  assert.equal(observation.callAccounting.residualPlannerLogicalCalls, 0);
  assert.equal(observation.roleEvidence.fullOrchestrator.status, "success");
  assert.equal(observation.roleEvidence.fullOrchestrator.providerAttempts, 1);
  assert.equal(
    observation.roleEvidence.fullOrchestrator.providerLatenciesMs.length,
    1,
  );
  assert.equal(
    observation.roleEvidence.fullOrchestrator.semanticValidationsCompleted,
    1,
  );
  assert.equal(observation.roleEvidence.fullOrchestrator.timeoutAttempts, 0);
  assert.equal(observation.roleEvidence.fullOrchestrator.transportFailures, 0);
  assert.equal(
    events.filter((event) => event.phase === "providerRequestStarted").length,
    1,
  );
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assertSafeObservation(observation, "wrt-1");
});

test("wrt-3 repairs missing memory content without erasing the first schema miss", async () => {
  let providerAttempts = 0;
  const { events, observation } = await evaluate("wrt-3", {
    fullInvoke: async () => {
      providerAttempts += 1;
      return fullOutput(
        "explicit_write_ready",
        "save_memory",
        providerAttempts === 1
          ? { title: "RAW_TITLE_SENTINEL" }
          : { content: "每周五复盘", title: "RAW_TITLE_SENTINEL" },
      );
    },
    fullRetryBudget: { schema: 1, transport: 0 },
    residualInvoke: async () => assert.fail("Full path cannot call Residual"),
  });

  assert.deepEqual(observation.finalTaskIntents, ["save_memory"]);
  assert.equal(observation.callAccounting.fullOrchestratorLogicalCalls, 1);
  assert.equal(observation.callAccounting.fullOrchestratorProviderAttempts, 2);
  assert.equal(observation.roleEvidence.fullOrchestrator.completedResponses, 2);
  assert.equal(observation.roleEvidence.fullOrchestrator.strictSchemaPasses, 1);
  assert.equal(observation.roleEvidence.fullOrchestrator.status, "success");
  const failure = events.find((event) =>
    event.phase === "failed" && event.attempt === 1
  );
  assert.equal(failure?.failureReason, "provider_protocol");
  assert.equal(failure?.retryScheduled, true);
  assert.deepEqual(failure?.schemaIssues, [{
    code: "custom",
    missing: true,
    path: ["tasks", 0, "args", "content"],
  }]);
  assert.doesNotMatch(
    JSON.stringify({ events, observation }),
    /RAW_TITLE_SENTINEL|每周五复盘/u,
  );
  assertSafeObservation(observation, "wrt-3", [
    "RAW_TITLE_SENTINEL",
    "每周五复盘",
  ]);
});

test("exr-3 exposes deterministic clarify while preserving bounded Provider deviation evidence", async () => {
  const missingChecklistTitle =
    "SYNTHETIC_MISSING_CHECKLIST_TITLE_MUST_NOT_BE_RETAINED";
  const { observation } = await evaluate("exr-3", {
    fullInvoke: async () => fullOutput(
      "explicit_write_ready",
      "complete_plan_item",
      {
        checklistTitle: missingChecklistTitle,
        itemTitle: "synthetic completion item",
      },
    ),
    residualInvoke: async () => assert.fail("Full path cannot call Residual"),
  });

  assert.equal(observation.branchKind, "deterministic_clarify");
  assert.equal(observation.finalMode, "single");
  assert.deepEqual(observation.finalTaskIntents, ["clarify"]);
  assert.equal(observation.clarifyQuestionPresent, true);
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assert.equal(observation.roleEvidence.fullOrchestrator.status, "clarified");
  assert.equal(
    observation.roleEvidence.fullOrchestrator.clarificationSource,
    "resource_readiness",
  );
  assert.equal(observation.roleEvidence.fullOrchestrator.queryScopeErrorCode, null);
  assert.equal(observation.roleEvidence.fullOrchestrator.failureCode, null);
  assert.deepEqual(
    observation.roleEvidence.fullOrchestrator.semanticProjection?.intents,
    ["complete_plan_item"],
  );
  assert.deepEqual(
    observation.roleEvidence.fullOrchestrator.resourceIssueCodes,
    ["RESOURCE_TITLE_NOT_IN_CONTEXT"],
  );
  assert.equal(observation.failureCodes.length, 0);
  assertSafeObservation(observation, "exr-3", [missingChecklistTitle]);
});

test("exr-3 exposes query-scope clarification as bounded final observation evidence", async () => {
  const { observation } = await evaluate("exr-3", {
    fullInvoke: async () => fullOutput(
      "pure_read_query",
      "query_plan_progress",
      {},
    ),
    residualInvoke: async () => assert.fail("Full path cannot call Residual"),
  });

  assert.equal(observation.branchKind, "deterministic_clarify");
  assert.equal(observation.finalMode, "single");
  assert.deepEqual(observation.finalTaskIntents, ["clarify"]);
  assert.equal(observation.clarifyQuestionPresent, true);
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assert.equal(
    observation.roleEvidence.fullOrchestrator.clarificationSource,
    "query_scope",
  );
  assert.equal(
    observation.roleEvidence.fullOrchestrator.queryScopeErrorCode,
    "specific_reference_required",
  );
  assert.deepEqual(
    observation.roleEvidence.fullOrchestrator.semanticProjection?.intents,
    ["query_plan_progress"],
  );
  assert.deepEqual(
    observation.roleEvidence.fullOrchestrator.resourceIssueCodes,
    [],
  );
  assert.equal(observation.failureCodes.length, 0);
  assert.equal(observation.taskExecutionAttempts, 0);
  assert.equal(observation.databaseAccessAttempts, 0);
  assert.equal(observation.businessMutationAttempts, 0);
  assertSafeObservation(observation, "exr-3", [
    "bounded test decision",
    "sunnypanel-agent-test-secret-2026",
  ]);
  const serialized = JSON.stringify(observation);
  assert.doesNotMatch(serialized, /"args"/u);
  assert.doesNotMatch(serialized, /"(?:error|rawResponse|reasoning|stack)"/u);
});

test("Acceptance read and checklist intents survive the compatibility mapper", async () => {
  const cases = [
    ["qry-2", "pure_read_query", "query_checklist_progress", {}],
    ["qry-3", "pure_read_query", "query_schedule", {}],
    ["qry-5", "pure_read_query", "query_memory", {}],
    [
      "wrt-2",
      "explicit_write_ready",
      "compose_checklist",
      { goal: "synthetic weekly work", title: "synthetic checklist" },
    ],
    ["inj-1", "pure_read_query", "query_plan", {}],
    ["inj-3", "pure_read_query", "query_plan", {}],
  ] as const;

  for (const [fixtureId, decisionCode, intent, args] of cases) {
    const { observation } = await evaluate(fixtureId, {
      fullInvoke: async () => fullOutput(decisionCode, intent, args),
    });

    assert.equal(observation.finalMode, "single", fixtureId);
    assert.deepEqual(observation.finalTaskIntents, [intent], fixtureId);
    assert.equal(observation.semanticMatch, true, fixtureId);
    assert.equal(observation.usable, true, fixtureId);
    assertSafeObservation(observation, fixtureId);
  }
});

test("an unexpected consultation result fails semantically without spending an Answer call", async () => {
  const { observation } = await evaluate("wrt-1", {
    fullInvoke: async () => fullOutput(
      "pure_consultation",
      "answer_question",
      { question: fixture("wrt-1").message },
    ),
  });

  assert.deepEqual(observation.finalTaskIntents, ["answer_question"]);
  assert.equal(observation.semanticMatch, false);
  assert.equal(observation.usable, false);
  assert.equal(observation.callAccounting.fullOrchestratorLogicalCalls, 1);
  assert.equal(observation.callAccounting.answerLogicalCalls, 0);
  assert.equal(observation.callAccounting.answerProviderAttempts, 0);
  assertSafeObservation(observation, "wrt-1");
});

test("cons-1 separates consultation preflight from the Answer Renderer call", async () => {
  const { observation } = await evaluate("cons-1", {
    fullInvoke: async () => fullOutput(
      "pure_consultation",
      "answer_question",
      { question: fixture("cons-1").message },
    ),
  });

  assert.equal(observation.branchKind, "consultation_preflight");
  assert.deepEqual(observation.finalTaskIntents, ["answer_question"]);
  assert.equal(observation.callAccounting.fullOrchestratorLogicalCalls, 1);
  assert.equal(observation.callAccounting.fullOrchestratorProviderAttempts, 1);
  assert.equal(observation.callAccounting.residualPlannerLogicalCalls, 0);
  assert.equal(observation.callAccounting.answerLogicalCalls, 1);
  assert.equal(observation.callAccounting.answerProviderAttempts, 1);
  assert.equal(observation.roleEvidence.answerRenderer.status, "complete");
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assertSafeObservation(observation, "cons-1", ["bounded synthetic answer"]);
});

test("Full unavailability is typed and never becomes a guessed intent or Legacy result", async () => {
  const rawProviderSentinel = "SYNTHETIC_RAW_PROVIDER_OUTPUT";
  const { observation } = await evaluate("wrt-1", {
    fullInvoke: async () => ({
      rawProviderSentinel,
      version: 1,
    }),
    residualInvoke: async () => assert.fail("Full path cannot call Residual"),
  });

  assert.equal(observation.branchKind, "unavailable");
  assert.equal(observation.finalMode, null);
  assert.deepEqual(observation.finalTaskIntents, []);
  assert.deepEqual(observation.finalDependencies, []);
  assert.equal(observation.roleEvidence.fullOrchestrator.status, "unavailable");
  assert.equal(
    observation.roleEvidence.fullOrchestrator.failureCode,
    "schema_failure",
  );
  assert.equal(observation.failureCodes.includes("full_schema_failure"), true);
  assert.equal(observation.callAccounting.fullOrchestratorLogicalCalls, 1);
  assert.equal(observation.callAccounting.answerLogicalCalls, 0);
  assert.equal(observation.semanticMatch, false);
  assert.equal(observation.usable, false);
  assertSafeObservation(observation, "wrt-1", [rawProviderSentinel]);
});

test("partial Answer output is unusable and never reaches persistence", async () => {
  const partialOutput = "SYNTHETIC_PARTIAL_ANSWER";
  const toolChunk = new AIMessageChunk({
    content: "",
    tool_call_chunks: [{ args: "{}", id: "1", index: 0, name: "execute" }],
  });
  const { observation } = await evaluate("cons-1", {
    answerChunks: [
      new AIMessageChunk({ content: partialOutput }),
      toolChunk,
    ],
    fullInvoke: async () => fullOutput(
      "pure_consultation",
      "answer_question",
      { question: fixture("cons-1").message },
    ),
  });

  assert.equal(observation.branchKind, "consultation_preflight");
  assert.equal(observation.roleEvidence.answerRenderer.status, "incomplete");
  assert.equal(observation.roleEvidence.answerRenderer.failureCode, "tool_call");
  assert.equal(observation.failureCodes.includes("answer_incomplete"), true);
  assert.equal(observation.failureCodes.includes("answer_tool_call"), true);
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, false);
  assert.equal(observation.businessMutations, 0);
  assertSafeObservation(observation, "cons-1", [partialOutput]);
});

test("thrown Answer errors retain only a typed safe code", async () => {
  const thrownErrorMessage = "THROWN_ANSWER_ERROR_MESSAGE_SENTINEL_7F4D";
  const { observation } = await evaluate("cons-1", {
    answerChunks: [new Error(thrownErrorMessage)],
    fullInvoke: async () => fullOutput(
      "pure_consultation",
      "answer_question",
      { question: fixture("cons-1").message },
    ),
  });

  assert.equal(observation.roleEvidence.answerRenderer.status, "unavailable");
  assert.equal(
    observation.roleEvidence.answerRenderer.failureCode,
    "provider_error",
  );
  assert.equal(observation.failureCodes.includes("answer_unavailable"), true);
  assert.equal(observation.failureCodes.includes("answer_provider_error"), true);
  assert.equal(observation.usable, false);
  const serialized = JSON.stringify({
    observation,
    roleEvidence: observation.roleEvidence,
  });
  assert.doesNotMatch(serialized, new RegExp(thrownErrorMessage));
  assert.doesNotMatch(
    serialized,
    /"(?:cause|error|errorMessage|rawError|stack)"/u,
  );
  assertSafeObservation(observation, "cons-1", [thrownErrorMessage]);
});

test("Full evidence preserves bounded query-scope and schedule-reference categories", async () => {
  const queryRecorder = createModelCallBudgetRecorder();
  const queryAdapter = createProductionFullAdapter({
    modelConfig,
    modelFactory: promptJsonModelFactory(() => fullOutput(
      "pure_read_query",
      "query_plan_progress",
      { planId: 101 },
    )),
    observe: () => undefined,
    recorder: queryRecorder,
    retryBudget: { schema: 0, transport: 0 },
  });
  await queryAdapter("现在有哪些计划？", fixture("qry-1").context);
  const queryEvidence = queryAdapter.getRoleEvidence();
  assert.equal(queryEvidence.status, "clarified");
  assert.equal(queryEvidence.clarificationSource, "query_scope");
  assert.equal(queryEvidence.queryScopeErrorCode, "provider_selected_workspace_resource");
  assert.deepEqual(queryEvidence.resourceIssueCodes, []);
  assert.deepEqual(queryEvidence.semanticProjection, {
    decisionCode: "pure_read_query",
    intents: ["query_plan_progress"],
    mode: "single",
    taskCount: 1,
  });

  const resourceRecorder = createModelCallBudgetRecorder();
  const resourceAdapter = createProductionFullAdapter({
    modelConfig,
    modelFactory: promptJsonModelFactory(() => fullOutput(
      "explicit_write_ready",
      "schedule_plan",
      { planId: 999 },
    )),
    observe: () => undefined,
    recorder: resourceRecorder,
    retryBudget: { schema: 0, transport: 0 },
  });
  await resourceAdapter("把计划 999 安排到下周", fixture("qry-1").context);
  const resourceEvidence = resourceAdapter.getRoleEvidence();
  assert.equal(resourceEvidence.status, "clarified");
  assert.equal(
    resourceEvidence.clarificationSource,
    "schedule_plan_reference",
  );
  assert.equal(resourceEvidence.queryScopeErrorCode, null);
  assert.deepEqual(resourceEvidence.resourceIssueCodes, []);
  assert.equal(
    resourceEvidence.schedulePlanReferenceErrorCode,
    "explicit_plan_id_not_in_context",
  );
  assert.equal(resourceEvidence.decisionConsistencyError, null);
  assert.equal(JSON.stringify(resourceEvidence).includes("999"), false);
});

test("Known-ID accepts one actor-authorized exact plan reference", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-existing-id",
    () => fullOutput(
      "explicit_write_ready",
      "schedule_plan",
      { planId: 101, startDate: "2026-07-21" },
    ),
  );

  assert.equal(observation.knownIdOutcome, "exact_reference");
  assert.equal(observation.knownIdRejectionSource, null);
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assert.deepEqual(observation.finalTaskIntents, ["schedule_plan"]);
  assertSafeKnownIdObservation(observation, "diag-plan-existing-id");
});

test("Known-ID treats an outside ID only as typed safe rejection", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-outside-id",
    () => fullOutput(
      "explicit_write_ready",
      "schedule_plan",
      { planId: 999, startDate: "2026-07-21" },
    ),
  );

  assert.equal(observation.knownIdOutcome, "safe_rejection");
  assert.equal(
    observation.knownIdRejectionSource,
    "schedule_plan_reference_contract",
  );
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assert.equal(
    observation.roleEvidence.fullOrchestrator.clarificationSource,
    "schedule_plan_reference",
  );
  assert.equal(
    observation.roleEvidence.fullOrchestrator
      .schedulePlanReferenceErrorCode,
    "explicit_plan_id_not_in_context",
  );
  assertSafeKnownIdObservation(observation, "diag-plan-outside-id");
});

test("Known-ID accepts typed unsupported task-output rejection as diagnostic success", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-task-output",
    () => fullOutput(
      "explicit_write_ready",
      "schedule_plan",
      {
        planId: {
          field: "planId",
          taskId: "create-plan",
          type: "taskOutput",
        },
      },
    ),
  );

  assert.equal(observation.knownIdOutcome, "safe_rejection");
  assert.equal(
    observation.knownIdRejectionSource,
    "schedule_plan_reference_contract",
  );
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assert.equal(
    observation.roleEvidence.fullOrchestrator.clarificationSource,
    "schedule_plan_reference",
  );
  assert.equal(
    observation.roleEvidence.fullOrchestrator
      .schedulePlanReferenceErrorCode,
    "explicit_plan_id_required",
  );
  assertSafeKnownIdObservation(observation, "diag-plan-task-output");
});

test("Known-ID does not treat schema failure as safe resource rejection", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-outside-id",
    () => ({ invalid: true }),
  );

  assert.equal(observation.knownIdOutcome, "unrelated_failure");
  assert.equal(observation.knownIdRejectionSource, null);
  assert.equal(observation.semanticMatch, false);
  assert.equal(observation.usable, false);
  assertSafeKnownIdObservation(observation, "diag-plan-outside-id");
});

test("Known-ID accepts an exact Provider missing-resource decision", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-outside-id",
    () => fullOutput(
      "explicit_write_missing_resource",
      "clarify",
      { question: "请确认要排期的已有计划。" },
    ),
  );

  assert.equal(observation.knownIdOutcome, "safe_rejection");
  assert.equal(
    observation.knownIdRejectionSource,
    "provider_missing_resource",
  );
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assertSafeKnownIdObservation(observation, "diag-plan-outside-id");
});

test("Known-ID accepts new-plan runtime dependency rejection", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-task-output",
    () => fullOutput(
      "compound_missing_target",
      "clarify",
      { question: "新计划尚无可用于排期的可信 ID。" },
    ),
  );

  assert.equal(observation.knownIdOutcome, "safe_rejection");
  assert.equal(
    observation.knownIdRejectionSource,
    "provider_missing_resource",
  );
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assertSafeKnownIdObservation(observation, "diag-plan-task-output");
});

test("Known-ID rejects a generic Provider clarification", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-outside-id",
    () => fullOutput(
      "unsupported_request",
      "clarify",
      { question: "请重新描述请求。" },
    ),
  );

  assert.equal(observation.knownIdOutcome, "unrelated_failure");
  assert.equal(observation.knownIdRejectionSource, null);
  assert.equal(observation.semanticMatch, false);
  assert.equal(observation.usable, false);
  assertSafeKnownIdObservation(observation, "diag-plan-outside-id");
});

test("Known-ID exact fixture cannot pass through Provider clarification", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-existing-id",
    () => fullOutput(
      "explicit_write_missing_resource",
      "clarify",
      { question: "请确认计划。" },
    ),
  );

  assert.equal(observation.knownIdOutcome, "safe_rejection");
  assert.equal(
    observation.knownIdRejectionSource,
    "provider_missing_resource",
  );
  assert.equal(observation.semanticMatch, false);
  assert.equal(observation.usable, false);
  assertSafeKnownIdObservation(observation, "diag-plan-existing-id");
});

test("Known-ID conflicting title is rejected by the schedule reference contract", async () => {
  const { observation } = await evaluateKnownId(
    "diag-plan-title-conflicting-id",
    () => fullOutput(
      "explicit_write_ready",
      "schedule_plan",
      { planId: 101 },
    ),
  );

  assert.equal(observation.knownIdOutcome, "safe_rejection");
  assert.equal(
    observation.knownIdRejectionSource,
    "schedule_plan_reference_contract",
  );
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.usable, true);
  assert.deepEqual(observation.finalTaskIntents, ["clarify"]);
  assert.equal(
    observation.roleEvidence.fullOrchestrator.clarificationSource,
    "schedule_plan_reference",
  );
  assert.equal(
    observation.roleEvidence.fullOrchestrator
      .schedulePlanReferenceErrorCode,
    "plan_id_title_conflict",
  );
  assert.equal(
    observation.roleEvidence.fullOrchestrator
      .semanticProjection?.intents[0],
    "schedule_plan",
  );
  assertSafeKnownIdObservation(
    observation,
    "diag-plan-title-conflicting-id",
  );
  assert.doesNotMatch(
    JSON.stringify(observation),
    /planId|考研数学复习计划|英语复习计划|把英语/u,
  );
});

test("Residual observer records only genuine bounded structured phases", () => {
  const events: SanitizedRoleEvent[] = [];
  const observer = createProductionResidualObserver({
    observe: (event) => events.push(event),
  });
  const protocol = {
    ...createSafeProtocolDiagnostics(),
    latencyMs: 125,
    responseReceived: true,
  };

  observer({ attempt: 1, phase: "providerRequestStarted" });
  observer({
    attempt: 1,
    phase: "failed",
    reason: "network_transport",
    retryScheduled: true,
    safeProtocol: { ...protocol, latencyMs: 25, responseReceived: false },
  });
  observer({ attempt: 2, phase: "providerRequestStarted" });
  observer({ attempt: 2, phase: "providerResponseReceived", safeProtocol: protocol });
  observer({ attempt: 2, phase: "strictSchemaValidated", safeProtocol: protocol });
  observer({
    attempt: 2,
    passed: true,
    phase: "semanticValidationCompleted",
    safeProtocol: protocol,
  });

  assert.deepEqual(observer.getRoleEvidence(), {
    completedResponses: 1,
    failureCode: null,
    inputTokens: null,
    latencyMs: 125,
    outputTokens: null,
    providerAttempts: 2,
    providerLatenciesMs: [25, 125],
    rejectionReason: null,
    semanticValidationPasses: 1,
    semanticValidationsCompleted: 1,
    status: "success",
    strictSchemaPasses: 1,
    timeoutAttempts: 0,
    totalTokens: null,
    transportFailures: 1,
  });
  assert.equal(events.every(({ role }) => role === "residual_planner"), true);
  assert.equal(events.find(({ phase }) => phase === "failed")?.failureReason, "network_transport");
  assert.equal(JSON.stringify(events).includes("raw"), false);
});
