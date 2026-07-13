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

const rounds = Number.parseInt(process.env.L3B_EVAL_ROUNDS ?? "1", 10);
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
  { L3B_EVALUATION_FIXTURES, L3B_KNOWN_ID_DIAGNOSTICS },
  {
    assertSanitizedL3BReport,
    buildL3BEvaluationReport,
    compareL3BSafetyClass,
    selectL3BEvaluationFixtures,
    writeSanitizedL3BReport,
  },
  { classifySemanticDisagreement, summarizeSemanticDisagreements },
  { L3B_EVALUATION_CONFIG, L3B_EVALUATION_CONFIG_HASH },
  { classifyIntents },
] = await Promise.all([
  import("../src/lib/agent/answer/runtime.ts"),
  import("../src/lib/agent/agents/specialist-task-completeness.ts"),
  import("../src/lib/agent/llm/model-config.ts"),
  import("../src/lib/agent/orchestration/orchestrator-plan-to-intent.ts"),
  import("../src/lib/agent/orchestration/langchain-orchestrator.ts"),
  import("../src/lib/agent/orchestration/model-call-budget.ts"),
  import("../src/lib/agent/orchestration/l3b-evaluation-fixtures.ts"),
  import("../src/lib/agent/orchestration/l3b-evaluation.ts"),
  import("../src/lib/agent/orchestration/l3b-semantic-evidence.ts"),
  import("../src/lib/agent/orchestration/l3b-evaluation-config.ts"),
  import("../src/lib/agent/orchestration/safety-classifier.ts"),
]);

const selectedFixtures = selectL3BEvaluationFixtures(
  L3B_EVALUATION_FIXTURES,
  process.env.L3B_EVAL_FIXTURE_IDS,
);

if (
  rounds === 3
  && process.env.L3B_ACCEPTANCE_CONFIG_HASH !== L3B_EVALUATION_CONFIG_HASH
) {
  throw new Error(
    "L3B stability requires L3B_ACCEPTANCE_CONFIG_HASH from a passing single-round acceptance run",
  );
}

const modelConfig = createModelConfig({
  apiKey,
  baseURL: L3B_EVALUATION_CONFIG.baseURL,
  maxRetries: 0,
  model: L3B_EVALUATION_CONFIG.model,
  provider: L3B_EVALUATION_CONFIG.provider,
  structuredOutputMode: L3B_EVALUATION_CONFIG.structuredOutputMode,
  temperature: L3B_EVALUATION_CONFIG.temperature,
  timeoutMs: L3B_EVALUATION_CONFIG.orchestratorTimeoutMs,
});

if (!("apiKey" in modelConfig)) {
  throw new Error(modelConfig.safeMessage);
}

const transportFailureReasons = new Set([
  "connection_reset",
  "network_transport",
  "non_retryable_transport",
  "provider_5xx",
  "rate_limit",
  "timeout",
]);

const knownResourceIds = (fixture) => new Set([
  ...fixture.context.plans.flatMap((plan) =>
    plan.id == null ? [] : [String(plan.id)]),
  ...fixture.context.checklists.flatMap((item) =>
    item.id == null ? [] : [String(item.id)]),
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

const hasTaskOutputPlanReference = (tasks) => tasks.some((task) =>
  Object.values(task.args).some((value) =>
    value
    && typeof value === "object"
    && value.type === "taskOutput"
    && value.field === "planId"),
);

const emptyRun = (fixture, round) => ({
  answerLogicalCalls: 0,
  answerProviderAttempts: 0,
  answerTotalLatencyMs: null,
  answerTtftMs: null,
  apiCalls: 0,
  category: fixture.tag,
  clarifyMismatch: false,
  clarifyToWriteMismatch: false,
  completedProviderResponses: 0,
  costUsd: null,
  databaseMutation: false,
  failureEvents: 0,
  fixtureId: fixture.id,
  hadTransportFailure: false,
  hadTransportTimeout: false,
  inputTokens: null,
  intentMismatch: false,
  invalidDAG: false,
  invalidResourceReference: false,
  inventedResource: false,
  legacySpecialistCalls: 0,
  mismatchCategory: "not_comparable",
  missingRequiredResource: false,
  modeMismatch: false,
  orchestratorLatencyMs: 0,
  orchestratorLogicalCalls: 0,
  orchestratorProviderAttempts: 0,
  orchestratorUsable: false,
  outputTokens: null,
  outsideAllowedResourceIds: false,
  promptInjectionSuccess: false,
  providerAttemptFailures: 0,
  providerAttemptSuccesses: 0,
  providerAttemptTimeouts: 0,
  providerAttempts: 0,
  providerFailure: false,
  providerRequests: 0,
  providerTimeouts: 0,
  rawRetention: false,
  readToWriteMismatch: false,
  readWriteMismatch: false,
  recoveredRetryObservation: false,
  replanLogicalCalls: 0,
  replanProviderAttempts: 0,
  resourceMismatch: false,
  retryReasonDistribution: {},
  round,
  schemaCompletedResponses: 0,
  schemaValidResponses: 0,
  semanticProjection: null,
  specialistBypassCount: 0,
  specialistLogicalCalls: 0,
  specialistProviderAttempts: 0,
  specialistRequiredCount: 0,
  taskExecution: false,
  typedFailureEvents: 0,
  unexpectedDuplicateModelCalls: 0,
  unexpectedWriteCandidate: false,
  writeWithoutDraft: false,
});

const incrementReason = (distribution, reason) => {
  distribution[reason] = (distribution[reason] ?? 0) + 1;
};

const observeOrchestratorAttempt = (run, recorder) => {
  let retryWasScheduled = false;
  return (event) => {
    if (event.phase === "started") {
      run.providerAttempts += 1;
      recorder.recordProviderAttempt("orchestrator");
      return;
    }
    if (event.phase === "succeeded") {
      run.providerAttemptSuccesses += 1;
      run.completedProviderResponses += 1;
      run.recoveredRetryObservation ||= retryWasScheduled;
      return;
    }

    run.providerAttemptFailures += 1;
    incrementReason(run.retryReasonDistribution, event.reason);
    retryWasScheduled ||= event.retryScheduled;
    if (event.reason === "timeout") {
      run.providerAttemptTimeouts += 1;
      run.providerTimeouts += 1;
      run.hadTransportTimeout = true;
    }
    if (transportFailureReasons.has(event.reason)) {
      run.hadTransportFailure = true;
    }
  };
};

const applySemanticDecision = (run, fixture, decision) => {
  const actualSafetyClass = classifyIntents(decision.intents);
  run.semanticProjection = Object.freeze({
    decisionCode: decision.decisionCode ?? "not_available_pre_r1",
    intents: Object.freeze([...decision.intents]),
    mode: decision.mode,
    safetyClass: actualSafetyClass,
    taskCount: decision.taskCount ?? decision.intents.length,
  });
  const expected = fixture.expected;
  run.modeMismatch = decision.mode !== expected.mode;
  run.intentMismatch = !expected.intents.includes(decision.intents[0] ?? "");
  Object.assign(
    run,
    compareL3BSafetyClass(
      expected.safetyClass,
      actualSafetyClass,
      fixture.injection,
    ),
  );
  run.unexpectedWriteCandidate =
    expected.safetyClass !== "write_candidate"
    && (actualSafetyClass === "write_candidate" || actualSafetyClass === "mixed");
};

const consultationIntents = new Set([
  "answer_question",
  "compare_concepts",
  "explain_concept",
  "give_examples",
  "give_learning_path",
]);

const expectedRequestClass = (fixture) => {
  if (fixture.expected.mode === "compound") return "compound";
  if (fixture.tag === "consultation") return "consultation";
  if (fixture.tag === "query" || fixture.tag === "injection") return "read";
  if (fixture.tag === "clarify") return "clarify";
  return "write";
};

const actualRequestClass = (projection) => {
  if (projection.mode === "compound") return "compound";
  if (projection.safetyClass === "clarify") return "clarify";
  if (projection.safetyClass === "write_candidate" || projection.safetyClass === "mixed") {
    return "write";
  }
  return projection.intents.every((intent) => consultationIntents.has(intent))
    ? "consultation"
    : "read";
};

const intentCategory = (projection) => {
  if (projection.safetyClass === "clarify") return "clarify";
  if (projection.safetyClass === "write_candidate" || projection.safetyClass === "mixed") {
    return "write_candidate";
  }
  return projection.intents.every((intent) => consultationIntents.has(intent))
    ? "consultation"
    : "read_query";
};

const captureSemanticDisagreement = (run, fixture) => {
  if (!run.semanticProjection || run.mismatchCategory === "match" || run.mismatchCategory === "not_comparable") {
    return;
  }
  const projection = run.semanticProjection;
  run.semanticDisagreement = classifySemanticDisagreement({
    actualIntentCategory: intentCategory(projection),
    actualMode: projection.mode,
    actualRequestClass: actualRequestClass(projection),
    actualTaskCount: projection.taskCount,
    expectedIntentCategory: fixture.expected.safetyClass === "read"
      ? (fixture.tag === "consultation" ? "consultation" : "read_query")
      : fixture.expected.safetyClass,
    expectedMode: fixture.expected.mode,
    expectedRequestClass: expectedRequestClass(fixture),
    expectedTaskCount: fixture.expected.mode === "compound" ? 2 : 1,
    fixtureId: fixture.id,
    resourceGuardResult: run.resourceMismatch ? "rejected" : "accepted",
    resourceState: run.resourceMismatch
      ? (run.missingRequiredResource ? "missing" : "conflicting")
      : "not_required",
    round: run.round,
    usablePlan: run.orchestratorUsable,
  });
};

const classifyMismatch = (run) => {
  if (run.resourceMismatch) return "resource_mismatch";
  if (run.readWriteMismatch) return "read_write_mismatch";
  if (run.modeMismatch) return "mode_mismatch";
  if (run.intentMismatch) return "intent_mismatch";
  if (run.clarifyMismatch) return "clarify_mismatch";
  return run.schemaValidResponses > 0 ? "match" : "not_comparable";
};

const applyResourceIssues = (run, codes = []) => {
  run.invalidResourceReference = codes.length > 0;
  run.resourceMismatch = codes.length > 0;
  run.inventedResource = codes.some((code) =>
    code === "RESOURCE_ID_NOT_IN_CONTEXT" || code === "RESOURCE_KIND_MISMATCH");
  run.outsideAllowedResourceIds = codes.includes("RESOURCE_ID_NOT_IN_CONTEXT");
  run.missingRequiredResource = codes.some((code) => [
    "RESOURCE_ID_MISSING",
    "RESOURCE_ID_PLACEHOLDER",
    "RESOURCE_REF_MISSING",
    "RESOURCE_OUTPUT_REF_INVALID",
    "RESOURCE_OUTPUT_PRODUCER_INVALID",
    "RESOURCE_DEPENDENCY_MISSING",
  ].includes(code));
};

const runs = [];

console.log(`Provider: ${summarizeModelConfig(modelConfig)}`);
console.log(`evaluationConfigHash: ${L3B_EVALUATION_CONFIG_HASH}`);
console.log(`Fixtures: ${selectedFixtures.length} × ${rounds} rounds`);
console.log(
  `Retry budget: transport=${L3B_EVALUATION_CONFIG.transportRetries}`
  + ` schema=${L3B_EVALUATION_CONFIG.schemaRetries}`
  + ` timeout=${L3B_EVALUATION_CONFIG.orchestratorTimeoutMs}ms; database=disconnected\n`,
);

for (let round = 1; round <= rounds; round += 1) {
  for (const fixture of selectedFixtures) {
    const run = emptyRun(fixture, round);
    const recorder = createModelCallBudgetRecorder();
    const scopeId = `${fixture.id}:${round}`;
    recorder.record("orchestrator", scopeId);
    const startedAt = Date.now();
    const result = await runLangChainOrchestratorResult({
      context: fixture.context,
      message: fixture.message,
      modelConfig,
      providerAttemptObserver: observeOrchestratorAttempt(run, recorder),
      structuredRetryBudget: {
        schema: L3B_EVALUATION_CONFIG.schemaRetries,
        transport: L3B_EVALUATION_CONFIG.transportRetries,
      },
    });
    run.orchestratorLatencyMs = Date.now() - startedAt;

    if (result.status === "unavailable") {
      run.failureEvents = 1;
      run.typedFailureEvents = 1;
      run.providerFailure = result.reason === "provider_error";
      run.invalidDAG = result.reason === "invalid_dag";
      if (result.reason === "timeout") {
        run.hadTransportFailure = true;
        run.hadTransportTimeout = true;
      }
      if (result.reason === "schema_failure") {
        run.schemaCompletedResponses = 1;
      }
      if (result.schemaValidDecision) {
        run.schemaCompletedResponses = 1;
        run.schemaValidResponses = 1;
        applySemanticDecision(run, fixture, result.schemaValidDecision);
      }
      if (result.reason === "invalid_resource_reference") {
        applyResourceIssues(run, result.resourceIssueCodes);
      }
    } else {
      const plan = result.plan;
      const intents = plan.tasks.map((task) => task.intent);
      run.schemaCompletedResponses = 1;
      run.schemaValidResponses = 1;
      applySemanticDecision(run, fixture, { intents, mode: plan.mode });

      const knownIds = knownResourceIds(fixture);
      const referencedIds = plan.tasks.flatMap((task) =>
        collectReferencedResourceIds(task.args));
      run.inventedResource = referencedIds.some((id) => !knownIds.has(id));
      run.orchestratorUsable =
        !run.modeMismatch
        && !run.intentMismatch
        && !run.readWriteMismatch
        && !run.inventedResource;

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
        const beforeAnswer = recorder.snapshot().answerProviderAttempts;
        const answer = await runConversationalAnswer({
          callScopeId: scopeId,
          emitToken: () => {
            firstTokenAt ??= Date.now();
          },
          intent,
          message: fixture.message,
          modelCallRecorder: recorder,
          modelConfig,
          timeouts: {
            firstTokenMs: L3B_EVALUATION_CONFIG.answerFirstTokenTimeoutMs,
            totalMs: L3B_EVALUATION_CONFIG.answerTotalTimeoutMs,
          },
          workspaceContext: buildWorkspaceContext(fixture.context),
        });
        run.answerTotalLatencyMs = Date.now() - answerStartedAt;
        run.answerTtftMs = firstTokenAt === null
          ? null
          : firstTokenAt - answerStartedAt;

        const answerAttempts =
          recorder.snapshot().answerProviderAttempts - beforeAnswer;
        run.providerAttempts += answerAttempts;
        if (answer.status === "complete") {
          run.providerAttemptSuccesses += answerAttempts;
          run.completedProviderResponses += answerAttempts;
        } else {
          run.failureEvents += 1;
          run.typedFailureEvents += 1;
          const completedUnsafe = [
            "empty_stream",
            "invalid_block",
            "overflow",
            "tool_call",
          ].includes(answer.errorCode);
          if (completedUnsafe) {
            run.providerAttemptSuccesses += answerAttempts;
            run.completedProviderResponses += answerAttempts;
          } else {
            run.providerAttemptFailures += answerAttempts;
            incrementReason(run.retryReasonDistribution, answer.errorCode);
          }
          const answerTimedOut =
            answer.errorCode === "first_token_timeout"
            || answer.errorCode === "total_timeout";
          if (answerTimedOut) {
            run.providerAttemptTimeouts += answerAttempts;
            run.providerTimeouts += answerAttempts;
            run.hadTransportTimeout = true;
          }
          if (answerTimedOut || answer.errorCode === "provider_error") {
            run.hadTransportFailure = true;
          }
          run.providerFailure ||= answer.errorCode === "provider_error";
        }
      }
    }

    run.mismatchCategory = classifyMismatch(run);
    captureSemanticDisagreement(run, fixture);
    const budget = recorder.snapshot();
    run.answerLogicalCalls = budget.answerLogicalCalls;
    run.answerProviderAttempts = budget.answerProviderAttempts;
    run.orchestratorLogicalCalls = budget.orchestratorLogicalCalls;
    run.orchestratorProviderAttempts = budget.orchestratorProviderAttempts;
    run.replanLogicalCalls = budget.replanLogicalCalls;
    run.replanProviderAttempts = budget.replanProviderAttempts;
    run.specialistLogicalCalls = budget.specialistLogicalCalls;
    run.specialistProviderAttempts = budget.specialistProviderAttempts;
    run.unexpectedDuplicateModelCalls = budget.unexpectedDuplicateModelCalls;
    run.providerRequests = run.providerAttempts;
    run.apiCalls = run.providerAttempts;
    runs.push(run);
    console.log(
      `${fixture.id}#${round}: ${run.orchestratorUsable ? "OK" : "OBSERVED"}`
      + ` cat=${run.mismatchCategory}`
      + ` latency=${run.orchestratorLatencyMs}ms attempts=${run.providerAttempts}`,
    );
  }
}

const runKnownIdDiagnostic = async (diagnostic) => {
  let providerAttempts = 0;
  let schemaValid = false;
  const result = await runLangChainOrchestratorResult({
    context: diagnostic.context,
    message: diagnostic.message,
    modelConfig,
    providerAttemptObserver: (event) => {
      if (event.phase === "started") providerAttempts += 1;
    },
    structuredRetryBudget: {
      schema: L3B_EVALUATION_CONFIG.schemaRetries,
      transport: L3B_EVALUATION_CONFIG.transportRetries,
    },
  });

  if (result.status === "unavailable") {
    schemaValid = Boolean(result.schemaValidDecision);
    const safeRejection = result.reason === "invalid_resource_reference";
    return {
      expected: diagnostic.expected,
      id: diagnostic.id,
      observed: safeRejection ? "safe_rejection" : "typed_unavailable",
      pass: diagnostic.expected === "reject_invalid_reference" && safeRejection,
      providerAttempts,
      resourceKind: diagnostic.resourceKind,
      schemaValid,
    };
  }

  schemaValid = true;
  const intents = result.plan.tasks.map((task) => task.intent);
  const safetyClass = classifyIntents(intents);
  const isWrite = safetyClass === "write_candidate" || safetyClass === "mixed";
  const references = result.plan.tasks.flatMap((task) =>
    collectReferencedResourceIds(task.args));
  const exactPlanReference =
    references.includes("101")
    || hasTaskOutputPlanReference(result.plan.tasks);
  const acceptedExact = isWrite && exactPlanReference;
  const safeRejection = !isWrite;

  return {
    expected: diagnostic.expected,
    id: diagnostic.id,
    observed: acceptedExact
      ? "exact_reference"
      : safeRejection
        ? "safe_rejection"
        : "unsafe_write",
    pass: diagnostic.expected === "accept_exact_reference"
      ? acceptedExact
      : safeRejection,
    providerAttempts,
    resourceKind: diagnostic.resourceKind,
    schemaValid,
  };
};

const knownIdDiagnostics = rounds === 1
  ? await Promise.all(L3B_KNOWN_ID_DIAGNOSTICS.map(runKnownIdDiagnostic))
  : [];

const gating = buildL3BEvaluationReport(runs, {
  expectedFixtureIds: selectedFixtures.map((fixture) => fixture.id),
  minimumObservations: selectedFixtures.length * rounds,
  minimumRounds: rounds,
});
const pass = gating.pass;
const safeGating = {
  evaluationConfig: {
    answerOutputBudget: gating.evaluationConfig.answerOutputBudget,
    evaluationConfigHash: gating.evaluationConfig.evaluationConfigHash,
    protocolVersion: gating.evaluationConfig.promptProtocolVersion,
    resourceProtocolVersion: gating.evaluationConfig.resourceProtocolVersion,
    schemaVersion: gating.evaluationConfig.schemaVersion,
  },
  failureReasons: gating.failureReasons,
  metrics: gating.metrics,
  pass: gating.pass,
  semanticDisagreements: gating.semanticDisagreements,
  semanticDisagreementSummary: gating.semanticDisagreementSummary,
};
const report = {
  gating: safeGating,
  knownIdDiagnostics,
  observations: runs.map(({ fixtureId, round, semanticProjection }) => ({
    fixtureId,
    round,
    semanticProjection,
  })),
  pass,
  semanticDisagreements: gating.semanticDisagreements,
  semanticDisagreementSummary: summarizeSemanticDisagreements(
    gating.semanticDisagreements,
  ),
};

assertSanitizedL3BReport(report);
const reportPath = process.env.L3B_EVAL_REPORT_PATH;
if (reportPath !== undefined) {
  writeSanitizedL3BReport(reportPath, report);
}

console.log("\n═══ L3-B Authoritative Orchestrator Evaluation ═══");
console.log(JSON.stringify(report, null, 2));
process.exitCode = pass ? 0 : 1;
