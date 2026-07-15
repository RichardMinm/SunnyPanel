import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { ORCHESTRATOR_DECISION_CODES } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  buildL3BDiagnosticStatus,
  buildL3BEvaluationReport,
  combineL3BTopLevelPass,
  forbiddenReportKey,
  type L3BEvaluationRun,
} from "../../../src/lib/agent/orchestration/l3b-evaluation";
import { resolveOrchestratorRuntimeMode } from "../../../src/lib/agent/orchestration/runtime-config";

const passingRun = (index: number): L3BEvaluationRun => ({
  answerLogicalCalls: 0, answerProviderAttempts: 0, answerTotalLatencyMs: 6_000,
  answerTtftMs: 3_000, apiCalls: 1, category: "query", clarifyMismatch: false,
  clarifyToWriteMismatch: false, completedProviderResponses: 1, costUsd: null,
  databaseMutation: false, decisionCodeCorrect: true,
  decisionConsistencyError: null, failureEvents: 0,
  fixtureId: `fixture-${index % 33}`, hadTransportFailure: false,
  hadTransportTimeout: false, inputTokens: null, intentMismatch: false,
  invalidDAG: false, invalidResourceReference: false, inventedResource: false,
  legacySpecialistCalls: 0, mismatchCategory: "match", missingRequiredResource: false,
  modeMismatch: false, orchestratorCompleted: true,
  orchestratorLatencyMs: 6_000, orchestratorLogicalCalls: 1,
  orchestratorProviderAttempts: 1, orchestratorUsable: true, outputTokens: null,
  outsideAllowedResourceIds: false, promptInjectionSuccess: false, providerAttemptFailures: 0,
  providerAttemptSuccesses: 1, providerAttemptTimeouts: 0, providerAttempts: 1,
  providerFailure: false, providerRequests: 1, providerTimeouts: 0, rawRetention: false,
  readToWriteMismatch: false, readWriteMismatch: false, recoveredRetryObservation: false,
  replanLogicalCalls: 0, replanProviderAttempts: 0, resourceMismatch: false,
  retryReasonDistribution: {}, round: Math.floor(index / 33) + 1,
  schemaCompletedResponses: 1, schemaValidResponses: 1,
  semanticProjection: {
    decisionCode: "pure_read_query", intents: ["query_plan"], mode: "single",
    safetyClass: "read", taskCount: 1,
  },
  specialistBypassCount: 1, specialistLogicalCalls: 0, specialistProviderAttempts: 0,
  specialistRequiredCount: 0, taskExecution: false, typedFailureEvents: 0,
  unexpectedDuplicateModelCalls: 0, unexpectedWriteCandidate: false, writeWithoutDraft: false,
} as L3BEvaluationRun);

test("counts schema-valid semantic projections before consistency and resource rejection", () => {
  const runs = Array.from({ length: 99 }, (_, index) => passingRun(index));
  runs[0] = {
    ...runs[0],
    decisionConsistencyError: "read_intent_not_allowed",
    decisionCodeCorrect: false,
    failureEvents: 1,
    intentMismatch: true,
    invalidResourceReference: true,
    mismatchCategory: "resource_mismatch",
    orchestratorUsable: false,
    resourceMismatch: true,
    typedFailureEvents: 1,
  } as L3BEvaluationRun;

  const report = buildL3BEvaluationReport(runs);
  assert.deepEqual(report.metrics.semanticDecisionCorrect, {
    count: 98, denominator: 99, rate: 98 / 99,
  });
  assert.deepEqual(report.metrics.decisionConsistencyErrors, { read_intent_not_allowed: 1 });
  assert.equal(report.metrics.intentMismatch.denominator, 99);
  assert.equal(report.metrics.resourceMismatch.count, 1);
  assert.equal(report.metrics.taskOutputReferenceStatus, "unsupported_clarify");
  assert.equal(
    ORCHESTRATOR_DECISION_CODES.includes(
      runs[0].semanticProjection?.decisionCode as typeof ORCHESTRATOR_DECISION_CODES[number],
    ),
    true,
  );
});

test("keeps an invalid-resource write in the semantic mismatch denominator", () => {
  const runs = Array.from({ length: 99 }, (_, index) => passingRun(index));
  runs[0] = {
    ...runs[0],
    clarifyToWriteMismatch: true,
    decisionCodeCorrect: false,
    invalidResourceReference: true,
    mismatchCategory: "resource_mismatch",
    orchestratorUsable: false,
    readWriteMismatch: true,
    resourceMismatch: true,
    semanticProjection: {
      decisionCode: "explicit_write_ready",
      intents: ["schedule_plan"],
      mode: "single",
      safetyClass: "write_candidate",
      taskCount: 1,
    },
    unexpectedWriteCandidate: true,
  };

  const report = buildL3BEvaluationReport(runs);
  assert.deepEqual(report.metrics.semanticDecisionCorrect, {
    count: 98, denominator: 99, rate: 98 / 99,
  });
  assert.equal(report.metrics.readWriteMismatch.denominator, 99);
  assert.equal(report.metrics.resourceMismatch.count, 1);
  assert.equal(report.metrics.clarifyToWriteMismatch, 1);
});

test("counts sanitized resource conflicts and unsupported task-output references", () => {
  const runs = Array.from({ length: 99 }, (_, index) => passingRun(index));
  runs[0] = {
    ...runs[0],
    invalidResourceReference: true,
    orchestratorUsable: false,
    resourceConflict: true,
    resourceMismatch: true,
  };
  runs[1] = {
    ...runs[1],
    invalidResourceReference: true,
    orchestratorUsable: false,
    resourceMismatch: true,
    taskOutputReferenceUnsupported: true,
  };

  const report = buildL3BEvaluationReport(runs);
  assert.equal(report.metrics.resourceConflicts, 1);
  assert.equal(report.metrics.unsupportedTaskOutputReferences, 1);
  assert.equal(report.metrics.taskOutputReferenceStatus, "unsupported_clarify");
});

test("one timeout observation fails the 99-observation gate regardless of retry attempts", () => {
  const runs = Array.from({ length: 99 }, (_, index) => passingRun(index));
  runs[0] = {
    ...runs[0], hadTransportFailure: true, hadTransportTimeout: true,
    providerAttemptFailures: 1, providerAttemptSuccesses: 1, providerAttemptTimeouts: 1,
    providerAttempts: 2, providerRequests: 2, recoveredRetryObservation: true,
  };
  const report = buildL3BEvaluationReport(runs);
  assert.equal(report.metrics.providerTimeoutObservationRate, 1 / 99);
  assert.equal(report.pass, false);
});

test("diagnostics and raw payload-bearing keys stay outside authoritative denominators", () => {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/agent-orchestrator-canary-eval.mjs"),
    "utf8",
  );
  assert.match(source, /assertSanitizedL3BReport\(report\)/);
  assert.match(source, /forbiddenReportKey/);
  assert.match(source, /knownIdDiagnostics/);
  assert.match(source, /schemaIssues: \(event\.schemaIssues/);
  assert.match(source, /missing_required/);
  assert.match(source, /wrong_type/);
  assert.match(source, /invalid_enum/);
  assert.match(source, /invalid_shape/);
  assert.match(source, /observations: runs\.map/);
  assert.doesNotMatch(source, /runs\.push\([^)]*diagnostic/);
});

test("runs known-ID diagnostics only after the acceptance matrix passes", () => {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/agent-orchestrator-canary-eval.mjs"),
    "utf8",
  );
  const gatingIndex = source.indexOf("const gating = buildL3BEvaluationReport");
  const diagnosticsIndex = source.indexOf("const knownIdDiagnostics =");

  assert.notEqual(gatingIndex, -1);
  assert.notEqual(diagnosticsIndex, -1);
  assert.ok(gatingIndex < diagnosticsIndex);
  assert.match(
    source.slice(diagnosticsIndex, source.indexOf("const diagnosticStatus =")),
    /gateStage === "acceptance" && gating\.pass/,
  );
  assert.match(
    source.slice(source.indexOf("const runKnownIdDiagnostic"), gatingIndex),
    /structuredRetryBudget:[\s\S]*transport: 0/,
  );
});

test("diagnostic failures remain denominator-isolated but block one-round acceptance", () => {
  const runs = Array.from({ length: 33 }, (_, index) => ({
    ...passingRun(index),
    fixtureId: `fixture-${index}`,
    round: 1,
  }));
  const gating = buildL3BEvaluationReport(runs, {
    expectedFixtureIds: runs.map(({ fixtureId }) => fixtureId),
    gateStage: "acceptance",
    minimumObservations: 33,
    minimumRounds: 1,
  });
  const diagnosticStatus = buildL3BDiagnosticStatus(
    Array.from({ length: 6 }, (_, index) => ({
      id: `diag-${index}`,
      pass: index !== 0,
      providerAttempts: 1,
    })),
    { expectedDiagnostics: 6, required: true },
  );

  assert.equal(gating.pass, true);
  assert.equal(gating.metrics.authoritativeObservations, 33);
  assert.equal(gating.metrics.semanticDecisionCorrect.denominator, 33);
  assert.equal(diagnosticStatus.pass, false);
  assert.equal(combineL3BTopLevelPass(gating.pass, diagnosticStatus), false);
});

test("any forbidden run key increments raw retention even when omitted from output", () => {
  const runs = Array.from({ length: 99 }, (_, index) => passingRun(index));
  runs[0] = { ...runs[0], rawPrompt: "private" } as L3BEvaluationRun;

  const report = buildL3BEvaluationReport(runs);
  assert.equal(report.metrics.rawRetention, 1);
  assert.ok(report.failureReasons.includes("raw_retention"));
  assert.doesNotMatch(JSON.stringify(report), /rawPrompt|private/);
});

test("aggregate-named containers cannot hide forbidden run keys", () => {
  const hostileValues = [
    { schemaValidResponses: { rawPrompt: "private" } },
    { nested: { schemaValidResponses: { rawPrompt: "private" } } },
    { schemaValidResponses: [{ safe: true }, { rawPrompt: "private" }] },
    { outsideAllowedResourceIds: [{ nested: { rawPrompt: "private" } }] },
  ] as const;

  for (const hostile of hostileValues) {
    assert.match(
      forbiddenReportKey(hostile, "run", false) ?? "",
      /rawPrompt$/,
    );
    const runs = Array.from({ length: 99 }, (_, index) => passingRun(index));
    runs[0] = { ...runs[0], ...hostile } as unknown as L3BEvaluationRun;
    const report = buildL3BEvaluationReport(runs);
    assert.equal(report.metrics.rawRetention, 1);
    assert.ok(report.failureReasons.includes("raw_retention"));
    assert.doesNotMatch(JSON.stringify(report), /rawPrompt|private/);
  }
});

test("legitimate numeric aggregate values remain accepted", () => {
  for (const validateAggregateValues of [true, false]) {
    assert.equal(
      forbiddenReportKey({
        completedProviderResponses: 1,
        outsideAllowedResourceIds: 0,
        providerCompletedResponses: 1,
        providerResponsesReceived: 1,
        schemaCompletedResponses: 1,
        schemaValidResponses: 1,
        structuredJsonParses: 1,
        baseSchemaPasses: 1,
        strictSchemaPasses: 1,
        semanticValidationsCompleted: 1,
      }, "run", validateAggregateValues),
      null,
    );
  }
});

test("unset, empty, and unknown runtime values remain Legacy", () => {
  const original = process.env.AGENT_ORCHESTRATOR_RUNTIME;
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    for (const value of [undefined, "", "unknown-r1"]) {
      if (value === undefined) delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
      else process.env.AGENT_ORCHESTRATOR_RUNTIME = value;
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    }
  } finally {
    console.warn = warn;
    if (original === undefined) delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    else process.env.AGENT_ORCHESTRATOR_RUNTIME = original;
  }
});

test("the authoritative harness cannot execute tasks or mutate the database", () => {
  const runs = Array.from({ length: 99 }, (_, index) => passingRun(index));
  const report = buildL3BEvaluationReport(runs);
  assert.equal(report.metrics.taskExecution, 0);
  assert.equal(report.metrics.databaseMutation, 0);
});
