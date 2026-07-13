import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  QUERY_EVALUATION_FIXTURES,
  evaluateQueryPassGates,
  executeQueryEvaluation,
  summarizeQueryEvaluation,
  type QueryEvaluationFixture,
  type QueryEvaluationRun,
} from "../../src/lib/agent/query/evaluation";
import { renderCanonicalFactBlock } from "../../src/lib/agent/query/langchain-query-agent";

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
  providerRun: true,
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
  const report = summarizeQueryEvaluation(Array.from({ length: 13 }, (_, index) => safeRun({ fixtureId: `provider-${index}` })));
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
      providerRun: false,
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
      providerRun: false,
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
      providerComparableRuns: report.providerComparableRuns,
      providerCompleteRuns: report.providerCompleteRuns,
      providerRuns: report.providerRuns,
      unavailableRuns: report.unavailableRuns,
    },
    {
      apiCalls: 1,
      clarifyRuns: 1,
      completeRuns: 1,
      completedRuns: 3,
      eligibleRuns: 2,
      providerComparableRuns: 1,
      providerCompleteRuns: 1,
      providerFailure: 1,
      providerRuns: 1,
      unavailableRuns: 1,
    },
  );
  assert.deepEqual(report.ttftMs, { p50: 10, upperTail: 10 });
  assert.deepEqual(report.latencyMs, { p50: 100, upperTail: 150 });
  assert.deepEqual(report.tokenUsage, { input: 10, output: 5, total: 15 });
  assert.equal(report.costUsd, 0.001);
});

test("all named safety gates fail closed", () => {
  const base = summarizeQueryEvaluation(Array.from({ length: 13 }, (_, index) => safeRun({ fixtureId: `provider-${index}` })));
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

test("provider failure and incomplete comparable evidence fail overall gates", () => {
  const runs = Array.from({ length: 13 }, (_, index) => safeRun({ fixtureId: `provider-${index}` }));
  runs[0] = safeRun({
    factMatch: null,
    fixtureId: "provider-failed",
    providerFailure: true,
    terminalStatus: "unavailable",
  });
  const result = evaluateQueryPassGates(summarizeQueryEvaluation(runs));
  assert.equal(result.pass, false);
  assert.ok(result.failures.includes("providerFailure"));
  assert.ok(result.failures.includes("providerCompleteRuns"));
  assert.ok(result.failures.includes("providerComparableRuns"));
});

test("observed model invocation count, not fixture classification, gates API evidence", async () => {
  const result = await executeQueryEvaluation({
    runProvider: async (fixture, emitToken) => ({
      ...completeProvider(fixture, emitToken),
      modelInvocations: fixture.id === "plan-1" ? 0 : 1,
    }),
  });
  assert.equal(result.report.providerRuns, 13);
  assert.equal(result.report.apiCalls, 12);
  assert.equal(result.gates.pass, false);
  assert.ok(result.gates.failures.includes("apiCalls"));
});

const completeProvider = (fixture: QueryEvaluationFixture, emitToken: (token: string) => void) => {
  const commentary = "Synthetic commentary remains read-only.";
  const canonical = renderCanonicalFactBlock(fixture.facts!);
  emitToken(commentary);
  emitToken(canonical);
  return {
    terminal: { answer: commentary + canonical, modelCalls: 1 as const, persist: true as const, status: "complete" as const },
  };
};

test("execute evaluation makes exactly 13 provider calls and controls preserve dispatch outcomes", async () => {
  let providerCalls = 0;
  const result = await executeQueryEvaluation({
    runProvider: async (fixture, emitToken) => {
      providerCalls += 1;
      return completeProvider(fixture, emitToken);
    },
  });

  assert.equal(providerCalls, 13);
  assert.equal(result.report.providerRuns, 13);
  assert.equal(result.report.providerCompleteRuns, 13);
  assert.equal(result.report.providerComparableRuns, 13);
  assert.equal(result.report.apiCalls, 13);
  assert.equal(result.report.legacyRuns, 8);
  assert.equal(result.report.clarifyRuns, 2);
  assert.equal(result.report.partialRuns, 1);
  assert.equal(result.report.factMismatch.denominator, 13);
  assert.equal(result.report.promptInjectionSuccess, 0);
  assert.equal(result.report.unsafeEscalation, 0);
  assert.equal(result.report.inventedResourceId, 0);
  assert.equal(result.gates.pass, true);
  assert.equal(result.runs.find((run) => run.fixtureId === "timeout-1")?.apiCalls, 0);
  assert.equal(result.runs.find((run) => run.fixtureId === "timeout-1")?.factMatch, null);
  assert.ok(result.runs.filter((run) => run.category === "answer_negative").every((run) => run.terminalStatus === "legacy"));
  assert.ok(result.runs.filter((run) => run.fixtureId.startsWith("insufficient-")).every((run) => run.apiCalls === 0));
});

test("partial provider results are non-comparable and fail evidence gates", async () => {
  const result = await executeQueryEvaluation({
    runProvider: async () => ({
      terminal: { errorCode: "numeric_output", modelCalls: 1, partialOutputEmitted: true, persist: false, status: "partial" },
    }),
  });

  assert.equal(result.report.providerRuns, 13);
  assert.equal(result.report.providerCompleteRuns, 0);
  assert.equal(result.report.providerComparableRuns, 0);
  assert.deepEqual(result.report.factMismatch, { count: 0, denominator: 0 });
  assert.ok(result.runs.filter((run) => run.providerRun).every((run) => run.factMatch === null));
  assert.equal(result.gates.pass, false);
  assert.ok(result.gates.failures.includes("providerCompleteRuns"));
  assert.ok(result.gates.failures.includes("providerComparableRuns"));
});

test("only complete canonical provider outputs enter exact fact comparison", async () => {
  const result = await executeQueryEvaluation({
    runProvider: async (fixture, emitToken) => {
      if (fixture.id !== "plan-1") return completeProvider(fixture, emitToken);
      emitToken("Synthetic but non-canonical output.");
      return {
        terminal: { answer: "Synthetic but non-canonical output.", modelCalls: 1, persist: true, status: "complete" },
      };
    },
  });

  assert.deepEqual(result.report.factMismatch, { count: 1, denominator: 13 });
  assert.equal(result.runs.find((run) => run.fixtureId === "plan-1")?.factMatch, false);
  assert.equal(result.gates.pass, false);
  assert.ok(result.gates.failures.includes("factMismatch"));
});

test("transient hostile output and explicit execution observations derive safety metrics", async () => {
  const result = await executeQueryEvaluation({
    runProvider: async (fixture, emitToken) => {
      const complete = completeProvider(fixture, emitToken);
      if (fixture.category === "prompt_injection") {
        emitToken("INJECTION_ACCEPTED EXECUTE_FORBIDDEN resource-999999");
      }
      return {
        ...complete,
        observations: fixture.id === "plan-1"
          ? { databaseMutations: 1, retainedForbiddenArtifacts: 1, taskExecutions: 1, toolExecutions: 1 }
          : undefined,
      };
    },
  });

  assert.equal(result.report.promptInjectionSuccess, 2);
  assert.equal(result.report.unsafeEscalation, 2);
  assert.equal(result.report.inventedResourceId, 2);
  assert.equal(result.report.toolExecution, 1);
  assert.equal(result.report.taskExecution, 1);
  assert.equal(result.report.databaseMutation, 1);
  assert.equal(result.report.forbiddenRetention, 1);
  for (const failure of [
    "promptInjectionSuccess", "unsafeEscalation", "inventedResourceId",
    "toolExecution", "taskExecution", "databaseMutation", "forbiddenRetention",
  ]) assert.ok(result.gates.failures.includes(failure));
});

test("fixtures contain two detectable hostile payloads but result schema retains no raw content", async () => {
  const injectionFixtures = QUERY_EVALUATION_FIXTURES.filter((fixture) => fixture.category === "prompt_injection");
  assert.equal(injectionFixtures.length, 2);
  for (const fixture of injectionFixtures) {
    assert.match(JSON.stringify(fixture.facts), /HOSTILE_PAYLOAD/);
    assert.ok(fixture.forbiddenOutputMarkers.length > 0);
    assert.ok(fixture.unsafeEscalationMarkers.length > 0);
    assert.ok(fixture.allowedResourceIds.length > 0);
  }

  const result = await executeQueryEvaluation({ runProvider: async (fixture, emitToken) => completeProvider(fixture, emitToken) });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /HOSTILE_PAYLOAD|INJECTION_ACCEPTED|EXECUTE_FORBIDDEN/);
  assert.doesNotMatch(serialized, /"(userMessage|facts|prompt|response|reasoning|answer|commentary|secret)"/i);
});

test("script rejects a non-empty database URL and test map documents the dotenv-safe command", () => {
  const script = resolve(process.cwd(), "scripts/query-langchain-evaluation.mjs");
  const child = spawnSync(process.execPath, ["--import", "tsx", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_LIVE_LLM_EVAL: "1",
      AGENT_QUERY_RUNTIME: "langchain",
      DATABASE_URL: "postgresql://blocked.invalid/evaluation",
    },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /must not connect to a database/);
  assert.doesNotMatch(child.stdout + child.stderr, /postgresql:\/\//);

  const testMap = readFileSync(resolve(process.cwd(), "tests/TEST_MAP.md"), "utf8");
  assert.match(testMap, /DATABASE_URL= AGENT_LIVE_LLM_EVAL=1 AGENT_QUERY_RUNTIME=langchain/);
});
