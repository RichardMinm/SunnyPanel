import assert from "node:assert/strict";
import test from "node:test";

import {
  QUERY_EVALUATION_FIXTURES,
  evaluateQueryPassGates,
  summarizeQueryEvaluation,
  type QueryEvaluationFixture,
  type QueryEvaluationRun,
} from "../../src/lib/agent/query/evaluation";

const countByCategory = (fixtures: readonly QueryEvaluationFixture[]) =>
  fixtures.reduce<Record<string, number>>((counts, fixture) => {
    counts[fixture.category] = (counts[fixture.category] ?? 0) + 1;
    return counts;
  }, {});

const safeRun = (overrides: Partial<QueryEvaluationRun>): QueryEvaluationRun => ({
  apiCalls: 1,
  category: "aggregate_progress",
  completed: true,
  databaseMutation: false,
  eligible: true,
  factMatch: true,
  fixtureId: "agg-1",
  forbiddenRetention: false,
  inventedResourceId: false,
  latencyMs: 100,
  legacyFallbackAfterStreamStart: false,
  modelCalls: 1,
  promptInjectionSuccess: false,
  repositoryCalls: 1,
  taskExecution: false,
  terminalStatus: "complete",
  toolExecution: false,
  ttftMs: 25,
  unsafeEscalation: false,
  ...overrides,
});

test("evaluation fixture set is fixed at 24 sanitized cases", () => {
  assert.equal(QUERY_EVALUATION_FIXTURES.length, 24);
  assert.deepEqual(countByCategory(QUERY_EVALUATION_FIXTURES), {
    answer_negative: 6,
    plan_progress: 5,
    aggregate_progress: 4,
    insufficient_or_legacy: 4,
    prompt_injection: 2,
    long_answer: 2,
    simulated_timeout: 1,
  });
  assert.doesNotMatch(JSON.stringify(QUERY_EVALUATION_FIXTURES), /sk-|Bearer |api[_-]?key|password/i);
});

test("mismatch denominators use only eligible completed samples", () => {
  const report = summarizeQueryEvaluation([
    safeRun({ fixtureId: "agg-1" }),
    safeRun({ fixtureId: "plan-1", category: "plan_progress" }),
    safeRun({
      fixtureId: "answer-1",
      apiCalls: 0,
      category: "answer_negative",
      eligible: false,
      factMatch: null,
      modelCalls: 0,
      repositoryCalls: 0,
      terminalStatus: "legacy",
    }),
  ]);
  assert.equal(report.factMismatch.denominator, 2);
  assert.equal(report.factMismatch.count, 0);
  assert.equal(report.legacyNegativeControls.modelCalls, 0);
});

test("pass gates require every safety zero and exact fact parity", () => {
  const report = summarizeQueryEvaluation([safeRun({})]);
  const result = evaluateQueryPassGates({
    ...report,
    databaseMutation: 1,
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.includes("databaseMutation"));
});

test("summary covers terminal, safety, provider, usage, and latency metrics", () => {
  const report = summarizeQueryEvaluation([
    safeRun({ inputTokens: 10, outputTokens: 5, costUsd: 0.001, ttftMs: 10, latencyMs: 50 }),
    safeRun({
      apiCalls: 0,
      category: "simulated_timeout",
      costUsd: null,
      factMatch: true,
      inputTokens: null,
      latencyMs: 150,
      modelCalls: 0,
      outputTokens: null,
      providerFailure: true,
      terminalStatus: "unavailable",
      ttftMs: null,
    }),
    safeRun({
      apiCalls: 0,
      category: "insufficient_or_legacy",
      eligible: false,
      factMatch: null,
      fixtureId: "clarify-1",
      latencyMs: 100,
      modelCalls: 0,
      repositoryCalls: 1,
      terminalStatus: "clarify",
      ttftMs: null,
    }),
  ]);

  assert.deepEqual(
    {
      apiCalls: report.apiCalls,
      clarifyRuns: report.clarifyRuns,
      completeRuns: report.completeRuns,
      completedRuns: report.completedRuns,
      eligibleRuns: report.eligibleRuns,
      providerFailure: report.providerFailure,
      unavailableRuns: report.unavailableRuns,
    },
    { apiCalls: 1, clarifyRuns: 1, completeRuns: 1, completedRuns: 3, eligibleRuns: 2, providerFailure: 1, unavailableRuns: 1 },
  );
  assert.deepEqual(report.ttftMs, { p50: 10, upperTail: 10 });
  assert.deepEqual(report.latencyMs, { p50: 100, upperTail: 150 });
  assert.deepEqual(report.tokenUsage, { input: 10, output: 5, total: 15 });
  assert.equal(report.costUsd, 0.001);
});

test("all named safety gates fail closed", () => {
  const base = summarizeQueryEvaluation([safeRun({})]);
  const gates = [
    "factMismatch",
    "inventedResourceId",
    "promptInjectionSuccess",
    "unsafeEscalation",
    "duplicateModelCall",
    "legacyFallbackAfterStreamStart",
    "toolExecution",
    "taskExecution",
    "databaseMutation",
    "forbiddenRetention",
  ] as const;

  for (const gate of gates) {
    const report = gate === "factMismatch"
      ? { ...base, factMismatch: { count: 1, denominator: 1 } }
      : { ...base, [gate]: 1 };
    assert.deepEqual(evaluateQueryPassGates(report), { pass: false, failures: [gate] });
  }
});
