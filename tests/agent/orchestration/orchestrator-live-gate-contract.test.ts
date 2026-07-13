import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { ORCHESTRATOR_DECISION_CODES } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  buildL3BEvaluationReport,
  type L3BEvaluationRun,
} from "../../../src/lib/agent/orchestration/l3b-evaluation";
import { resolveOrchestratorRuntimeMode } from "../../../src/lib/agent/orchestration/runtime-config";

const passingRun = (index: number): L3BEvaluationRun => ({
  answerLogicalCalls: 0, answerProviderAttempts: 0, answerTotalLatencyMs: 6_000,
  answerTtftMs: 3_000, apiCalls: 1, category: "query", clarifyMismatch: false,
  clarifyToWriteMismatch: false, completedProviderResponses: 1, costUsd: null,
  databaseMutation: false, decisionConsistencyError: null, failureEvents: 0,
  fixtureId: `fixture-${index % 33}`, hadTransportFailure: false,
  hadTransportTimeout: false, inputTokens: null, intentMismatch: false,
  invalidDAG: false, invalidResourceReference: false, inventedResource: false,
  legacySpecialistCalls: 0, mismatchCategory: "match", missingRequiredResource: false,
  modeMismatch: false, orchestratorLatencyMs: 6_000, orchestratorLogicalCalls: 1,
  orchestratorProviderAttempts: 1, orchestratorUsable: true, outputTokens: null,
  outsideAllowedResourceIds: false, promptInjectionSuccess: false, providerAttemptFailures: 0,
  providerAttemptSuccesses: 1, providerAttemptTimeouts: 0, providerAttempts: 1,
  providerFailure: false, providerRequests: 1, providerTimeouts: 0, rawRetention: false,
  readToWriteMismatch: false, readWriteMismatch: false, recoveredRetryObservation: false,
  replanLogicalCalls: 0, replanProviderAttempts: 0, resourceMismatch: false,
  retryReasonDistribution: {}, round: Math.floor(index / 33) + 1,
  schemaCompletedResponses: 1, schemaValidResponses: 1,
  semanticDecisionCorrect: true,
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
    failureEvents: 1,
    intentMismatch: true,
    invalidResourceReference: true,
    mismatchCategory: "resource_mismatch",
    orchestratorUsable: false,
    resourceMismatch: true,
    semanticDecisionCorrect: false,
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
  assert.equal(ORCHESTRATOR_DECISION_CODES.includes("pure_read_query"), true);
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
  assert.match(source, /assertSanitizedReport\(report\)/);
  assert.match(source, /forbiddenReportKey/);
  assert.match(source, /knownIdDiagnostics/);
  assert.match(source, /observations: runs\.map/);
  assert.doesNotMatch(source, /runs\.push\([^)]*diagnostic/);
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
