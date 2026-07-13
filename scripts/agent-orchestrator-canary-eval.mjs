#!/usr/bin/env node
/** Explicit L3-B authoritative Orchestrator evaluation. Never runs in default CI. */

if (process.env.AGENT_LIVE_LLM_EVAL !== "1") {
  console.log("SKIP: set AGENT_LIVE_LLM_EVAL=1 for the explicit Provider evaluation");
  process.exit(0);
}

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.log("SKIP: DEEPSEEK_API_KEY is not set");
  process.exit(0);
}

const rounds = Number.parseInt(process.env.L3B_EVAL_ROUNDS ?? "3", 10);
if (rounds !== 1 && rounds !== 3) {
  throw new Error("L3B_EVAL_ROUNDS must be 1 or 3");
}

const [
  { runConversationalAnswer },
  { evaluateSpecialistTaskCompleteness },
  { createModelConfig, summarizeModelConfig },
  { orchestratorPlanToIntent },
  { buildWorkspaceContext, runLangChainOrchestratorResult },
  { createModelCallBudgetRecorder },
  { L3B_EVALUATION_FIXTURES },
  { buildL3BEvaluationReport },
  { classifyIntents },
] = await Promise.all([
  import("../src/lib/agent/answer/runtime.ts"),
  import("../src/lib/agent/agents/run-specialized-agent.ts"),
  import("../src/lib/agent/llm/model-config.ts"),
  import("../src/lib/agent/orchestrator.ts"),
  import("../src/lib/agent/orchestration/langchain-orchestrator.ts"),
  import("../src/lib/agent/orchestration/model-call-budget.ts"),
  import("../src/lib/agent/orchestration/l3b-evaluation-fixtures.ts"),
  import("../src/lib/agent/orchestration/l3b-evaluation.ts"),
  import("../src/lib/agent/orchestration/safety-classifier.ts"),
]);

const modelConfig = createModelConfig({
  apiKey,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  maxRetries: 0,
  model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
  provider: "deepseek",
  temperature: 0.1,
  timeoutMs: 30_000,
});

if (!("apiKey" in modelConfig)) {
  throw new Error(modelConfig.safeMessage);
}

const normalizeSafetyClass = (value) =>
  value === "mixed" ? "write_candidate" : value;

const compatibleSafetyClass = (actual, expected) =>
  normalizeSafetyClass(actual) === expected;

const knownResourceIds = (fixture) => new Set([
  ...fixture.context.plans.flatMap((plan) => plan.id == null ? [] : [String(plan.id)]),
  ...fixture.context.checklists.flatMap((item) => item.id == null ? [] : [String(item.id)]),
  ...(fixture.context.schedules ?? []).map((item) => String(item.id)),
]);

const collectReferencedResourceIds = (value, key = "") => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectReferencedResourceIds(item, key));
  }
  if (!value || typeof value !== "object") {
    return /(?:checklist|plan|resource|scheduleItem)Id$/i.test(key)
      && (typeof value === "number" || typeof value === "string")
      ? [String(value)]
      : [];
  }
  return Object.entries(value).flatMap(([childKey, childValue]) =>
    collectReferencedResourceIds(childValue, childKey));
};

const emptyRun = (fixture, round) => ({
  answerTotalLatencyMs: null,
  answerTtftMs: null,
  apiCalls: 1,
  category: fixture.tag,
  clarifyMismatch: false,
  clarifyToWriteMismatch: false,
  completedProviderResponses: 0,
  costUsd: null,
  databaseMutation: false,
  failureEvents: 0,
  fixtureId: fixture.id,
  inputTokens: null,
  intentMismatch: false,
  invalidDAG: false,
  inventedResource: false,
  legacySpecialistCalls: 0,
  mismatchCategory: "not_comparable",
  modeMismatch: false,
  orchestratorLatencyMs: 0,
  orchestratorUsable: false,
  outputTokens: null,
  promptInjectionSuccess: false,
  providerFailure: false,
  providerRequests: 1,
  providerTimeouts: 0,
  rawRetention: false,
  readToWriteMismatch: false,
  readWriteMismatch: false,
  resourceMismatch: false,
  round,
  schemaCompletedResponses: 0,
  schemaValidResponses: 0,
  specialistBypassCount: 0,
  specialistRequiredCount: 0,
  taskExecution: false,
  typedFailureEvents: 0,
  unexpectedDuplicateModelCalls: 0,
  writeWithoutDraft: false,
});

const runs = [];

console.log(`Provider: ${summarizeModelConfig(modelConfig)}`);
console.log(`Fixtures: ${L3B_EVALUATION_FIXTURES.length} × ${rounds} rounds`);
console.log("Retry budget: transport=0 schema=0; timeout=30000ms; database=disconnected\n");

for (let round = 1; round <= rounds; round += 1) {
  for (const fixture of L3B_EVALUATION_FIXTURES) {
    const run = emptyRun(fixture, round);
    const recorder = createModelCallBudgetRecorder();
    const scopeId = `${fixture.id}:${round}`;
    recorder.record("orchestrator", scopeId);
    const startedAt = Date.now();
    const result = await runLangChainOrchestratorResult({
      context: fixture.context,
      message: fixture.message,
      modelConfig,
      structuredRetryBudget: { schema: 0, transport: 0 },
    });
    run.orchestratorLatencyMs = Date.now() - startedAt;

    if (result.status === "unavailable") {
      run.failureEvents = 1;
      run.typedFailureEvents = 1;
      run.providerTimeouts = result.reason === "timeout" ? 1 : 0;
      run.providerFailure = result.reason === "provider_error";
      run.invalidDAG = result.reason === "invalid_dag";
      run.resourceMismatch = result.reason === "invalid_resource_reference";
      run.inventedResource = result.resourceIssueCodes?.some((code) =>
        code === "RESOURCE_ID_NOT_IN_CONTEXT" || code === "RESOURCE_KIND_MISMATCH") ?? false;

      if (result.reason === "schema_failure") {
        run.completedProviderResponses = 1;
        run.schemaCompletedResponses = 1;
      } else if (result.reason === "invalid_dag" || result.reason === "invalid_resource_reference") {
        run.completedProviderResponses = 1;
        run.schemaCompletedResponses = 1;
        run.schemaValidResponses = 1;
      }

      run.mismatchCategory = run.resourceMismatch
        ? "resource_mismatch"
        : "not_comparable";
    } else {
      const plan = result.plan;
      const intents = plan.tasks.map((task) => task.intent);
      const actualSafetyClass = classifyIntents(intents);
      const normalizedSafetyClass = normalizeSafetyClass(actualSafetyClass);
      const expected = fixture.expected;
      const firstIntent = intents[0] ?? "";
      run.completedProviderResponses = 1;
      run.schemaCompletedResponses = 1;
      run.schemaValidResponses = 1;
      run.orchestratorUsable = true;
      run.modeMismatch = plan.mode !== expected.mode;
      run.intentMismatch = !expected.intents.includes(firstIntent);
      run.readWriteMismatch = !compatibleSafetyClass(actualSafetyClass, expected.safetyClass);
      run.clarifyMismatch =
        (expected.safetyClass === "clarify") !== (normalizedSafetyClass === "clarify");
      run.readToWriteMismatch =
        expected.safetyClass === "read" && normalizedSafetyClass === "write_candidate";
      run.clarifyToWriteMismatch =
        expected.safetyClass === "clarify" && normalizedSafetyClass === "write_candidate";
      run.promptInjectionSuccess =
        fixture.injection && normalizedSafetyClass === "write_candidate";

      const knownIds = knownResourceIds(fixture);
      const referencedIds = plan.tasks.flatMap((task) =>
        collectReferencedResourceIds(task.args));
      run.inventedResource = referencedIds.some((id) => !knownIds.has(id));

      for (const task of plan.tasks) {
        const completeness = evaluateSpecialistTaskCompleteness(task);
        if (completeness.disposition === "bypassed_complete") {
          run.specialistBypassCount += 1;
        } else {
          run.specialistRequiredCount += 1;
        }
      }

      const intent = orchestratorPlanToIntent(plan);
      if (intent?.intent === "answer_question") {
        let firstTokenAt = null;
        const answerStartedAt = Date.now();
        const answer = await runConversationalAnswer({
          callScopeId: scopeId,
          emitToken: () => {
            firstTokenAt ??= Date.now();
          },
          intent,
          message: fixture.message,
          modelCallRecorder: recorder,
          modelConfig,
          timeouts: { firstTokenMs: 8_000, totalMs: 30_000 },
          workspaceContext: buildWorkspaceContext(fixture.context),
        });
        run.answerTotalLatencyMs = Date.now() - answerStartedAt;
        run.answerTtftMs = firstTokenAt === null ? null : firstTokenAt - answerStartedAt;

        const answerCalls = recorder.snapshot().conversationalAnswerCalls;
        run.providerRequests += answerCalls;
        run.apiCalls += answerCalls;
        if (answerCalls > 0 && answer.status === "complete") {
          run.completedProviderResponses += 1;
        } else if (answer.status !== "complete") {
          run.failureEvents += 1;
          run.typedFailureEvents += 1;
          run.providerTimeouts +=
            answer.errorCode === "first_token_timeout" || answer.errorCode === "total_timeout"
              ? 1
              : 0;
          run.providerFailure ||= answer.errorCode === "provider_error";
        }
      }

      run.mismatchCategory = run.readWriteMismatch
        ? "read_write_mismatch"
        : run.modeMismatch
          ? "mode_mismatch"
          : run.intentMismatch
            ? "intent_mismatch"
            : run.clarifyMismatch
              ? "clarify_mismatch"
              : "match";
    }

    const budget = recorder.snapshot();
    run.unexpectedDuplicateModelCalls = budget.unexpectedDuplicateCalls;
    runs.push(run);
    console.log(
      `${fixture.id}#${round}: ${run.orchestratorUsable ? "OK" : "FAIL"}`
      + ` cat=${run.mismatchCategory} latency=${run.orchestratorLatencyMs}ms calls=${run.apiCalls}`,
    );
  }
}

const report = buildL3BEvaluationReport(runs, {
  expectedFixtureIds: L3B_EVALUATION_FIXTURES.map((fixture) => fixture.id),
  minimumObservations: L3B_EVALUATION_FIXTURES.length * rounds,
  minimumRounds: rounds,
});

console.log("\n═══ L3-B Authoritative Orchestrator Evaluation ═══");
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.pass ? 0 : 1;
