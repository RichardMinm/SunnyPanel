import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { AIMessageChunk } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import {
  QUERY_EVALUATION_FIXTURES,
  evaluateQueryPassGates,
  executeQueryEvaluation,
  summarizeQueryEvaluation,
  type QueryEvaluationFixture,
  type QueryEvaluationRun,
} from "../../src/lib/agent/query/evaluation";
import { buildQueryMessages } from "../../src/lib/agent/query/prompt";
import { projectQualitativeQueryFacts } from "../../src/lib/agent/query/qualitative-projection";

const countByCategory = (fixtures: readonly QueryEvaluationFixture[]) =>
  fixtures.reduce<Record<string, number>>((counts, fixture) => {
    counts[fixture.category] = (counts[fixture.category] ?? 0) + 1;
    return counts;
  }, {});

const safeRun = (overrides: Partial<QueryEvaluationRun> = {}): QueryEvaluationRun => ({
  apiCalls: 1,
  canonicalAnswerComplete: true,
  category: "aggregate_progress",
  commentaryStatus: "accepted",
  completed: true,
  databaseMutation: false,
  eligible: true,
  executionClaimAccepted: false,
  factsLoaderInvocations: 1,
  factMatch: true,
  fixtureId: "aggregate-1",
  forbiddenRetention: false,
  inputBoundaryFailure: false,
  inventedResourceInFinalAnswer: false,
  latencyMs: 100,
  legacyFallbackAfterProviderStart: false,
  modelCalls: 1,
  partialUserVisibleOutput: false,
  promptInjectionSuccess: false,
  providerComplete: true,
  providerRun: true,
  providerSawDate: false,
  providerSawFreeText: false,
  providerSawNumericFact: false,
  providerSawRawWorkspaceText: false,
  providerSawResourceId: false,
  providerSawUserRequest: false,
  repositoryCalls: 1,
  taskExecution: false,
  terminalStatus: "complete",
  toolExecution: false,
  ttftMs: 25,
  unsafeEscalation: false,
  ...overrides,
});

const providerObservation = (
  fixture: QueryEvaluationFixture,
  commentary: "accepted" | "omitted" = "accepted",
) => ({
  commentary: commentary === "accepted"
    ? { latencyMs: 20, modelCalls: 1 as const, status: "accepted" as const, text: "整体进展稳定。", ttftMs: 5 }
    : { latencyMs: 20, modelCalls: 1 as const, reason: "numeric_content" as const, status: "omitted" as const, ttftMs: 5 },
  inputMessages: buildQueryMessages({ projection: projectQualitativeQueryFacts(fixture.facts!) }),
  modelInvocations: 1,
});

test("evaluation keeps the original fixed set of 24 sanitized fixtures", () => {
  assert.equal(QUERY_EVALUATION_FIXTURES.length, 24);
  assert.deepEqual(countByCategory(QUERY_EVALUATION_FIXTURES), {
    answer_negative: 6,
    aggregate_progress: 4,
    insufficient_or_legacy: 4,
    long_answer: 2,
    plan_progress: 5,
    prompt_injection: 2,
    simulated_timeout: 1,
  });
  assert.doesNotMatch(JSON.stringify(QUERY_EVALUATION_FIXTURES), /sk-|Bearer |api[_-]?key|password/i);
});

test("summary reports canonical, commentary, boundary, safety, usage, and latency metrics", () => {
  const report = summarizeQueryEvaluation([
    safeRun({ costUsd: 0.001, inputTokens: 10, outputTokens: 5, latencyMs: 50, ttftMs: 10 }),
    safeRun({ commentaryStatus: "omitted", omissionReason: "numeric_content", latencyMs: 150, ttftMs: null }),
  ]);
  assert.equal(report.canonicalAnswerComplete, 2);
  assert.equal(report.commentaryAccepted, 1);
  assert.equal(report.commentaryOmitted, 1);
  assert.equal(report.commentaryAcceptedRate, 0.5);
  assert.deepEqual(report.commentaryOmissionReasons, { numeric_content: 1 });
  assert.deepEqual(report.factMismatch, { count: 0, denominator: 2 });
  assert.deepEqual(report.ttftMs, { p50: 10, upperTail: 10 });
  assert.deepEqual(report.latencyMs, { p50: 50, upperTail: 150 });
  assert.deepEqual(report.tokenUsage, { input: 10, output: 5, total: 15 });
  assert.equal(report.costUsd, 0.001);
});

test("safety gates are independent from the seventy percent product threshold", () => {
  const runs = Array.from({ length: 13 }, (_, index) => safeRun({
    commentaryStatus: "omitted",
    fixtureId: `provider-${index}`,
    omissionReason: "numeric_content",
  }));
  runs.push(safeRun({ apiCalls: 0, commentaryStatus: "omitted", fixtureId: "timeout-1", modelCalls: 1, omissionReason: "total_timeout", providerComplete: false, providerRun: false }));
  const gates = evaluateQueryPassGates(summarizeQueryEvaluation(runs));
  assert.equal(gates.safetyPass, true);
  assert.equal(gates.productPass, false);
  assert.equal(gates.pass, true);
});

test("every named input and output safety metric fails the safety gate", () => {
  const baseRuns = Array.from({ length: 13 }, (_, index) => safeRun({ fixtureId: `provider-${index}` }));
  baseRuns.push(safeRun({ apiCalls: 0, fixtureId: "timeout", modelCalls: 1, providerComplete: false, providerRun: false }));
  const base = summarizeQueryEvaluation(baseRuns);
  for (const gate of [
    "inputBoundaryFailure", "inventedResourceInFinalAnswer", "promptInjectionSuccess", "unsafeEscalation",
    "executionClaimAccepted", "partialUserVisibleOutput", "duplicateModelCall", "legacyFallbackAfterProviderStart",
    "toolExecution", "taskExecution", "databaseMutation", "forbiddenRetention", "providerSawRawWorkspaceText",
    "providerSawUserRequest", "providerSawResourceId", "providerSawNumericFact", "providerSawDate", "providerSawFreeText",
  ] as const) {
    const result = evaluateQueryPassGates({ ...base, [gate]: 1 });
    assert.equal(result.safetyPass, false, gate);
    assert.ok(result.failures.includes(gate), gate);
  }
});

test("evaluation completes all eligible canonical answers with one facts load and fixed provider input", async () => {
  const result = await executeQueryEvaluation({ runProvider: async (fixture) => providerObservation(fixture) });
  assert.equal(result.report.totalRuns, 24);
  assert.equal(result.report.completedRuns, 24);
  assert.equal(result.report.eligibleRuns, 14);
  assert.equal(result.report.canonicalAnswerComplete, 14);
  assert.equal(result.report.providerRuns, 13);
  assert.equal(result.report.apiCalls, 13);
  assert.equal(result.report.providerCompleteRuns, 13);
  assert.equal(result.report.commentaryAccepted, 13);
  assert.equal(result.report.commentaryOmitted, 0);
  assert.equal(result.report.factMismatch.count, 0);
  assert.equal(result.report.factsLoaderInvocationMax, 1);
  assert.equal(result.report.partialUserVisibleOutput, 0);
  assert.equal(result.report.inputBoundaryFailure, 0);
  assert.equal(result.gates.safetyPass, true);
  assert.equal(result.gates.productPass, true);
});

test("omitted commentary remains canonical-complete and never becomes partial or unavailable", async () => {
  const result = await executeQueryEvaluation({ runProvider: async (fixture) => providerObservation(fixture, "omitted") });
  assert.equal(result.report.commentaryAccepted, 0);
  assert.equal(result.report.commentaryOmitted, 13);
  assert.equal(result.report.canonicalAnswerComplete, 14);
  assert.equal(result.report.factMismatch.count, 0);
  assert.ok(result.runs.every((run) => run.terminalStatus !== ("partial" as never) && run.terminalStatus !== ("unavailable" as never)));
  assert.equal(result.gates.safetyPass, true);
  assert.equal(result.gates.productPass, false);
});

test("input boundary instrumentation detects leaked user, workspace, IDs, numbers, and dates", async () => {
  const result = await executeQueryEvaluation({
    runProvider: async (fixture) => ({
      ...providerObservation(fixture),
      inputMessages: [
        { content: "changed protocol", role: "system" },
        { content: `${fixture.userMessage} ${JSON.stringify(fixture.facts)}`, role: "user" },
      ],
    }),
  });
  assert.equal(result.report.inputBoundaryFailure, 13);
  assert.ok(result.report.providerSawUserRequest > 0);
  assert.ok(result.report.providerSawRawWorkspaceText > 0);
  assert.ok(result.report.providerSawResourceId > 0);
  assert.ok(result.report.providerSawNumericFact > 0);
  assert.ok(result.report.providerSawDate > 0);
  assert.ok(result.report.providerSawFreeText > 0);
  assert.equal(result.gates.safetyPass, false);
});

test("default runner omits numeric Provider output but preserves every canonical answer", async () => {
  const model = {
    stream: async () => (async function* () { yield new AIMessageChunk({ content: "进展达到 60%。" }); })(),
  } as unknown as BaseChatModel;
  const result = await executeQueryEvaluation({ model });
  assert.equal(result.report.providerRuns, 13);
  assert.equal(result.report.apiCalls, 13);
  assert.equal(result.report.commentaryAccepted, 0);
  assert.equal(result.report.commentaryOmitted, 13);
  assert.deepEqual(result.report.commentaryOmissionReasons, { numeric_content: 13 });
  assert.equal(result.report.canonicalAnswerComplete, 14);
  assert.equal(result.report.partialUserVisibleOutput, 0);
  assert.equal(result.report.factMismatch.count, 0);
  assert.equal(result.gates.safetyPass, true);
});

test("evaluation result retains no raw prompt, response, facts, reasoning, or commentary", async () => {
  const result = await executeQueryEvaluation({ runProvider: async (fixture) => providerObservation(fixture) });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /HOSTILE_PAYLOAD|INJECTION_ACCEPTED|EXECUTE_FORBIDDEN/);
  assert.doesNotMatch(serialized, /"(userMessage|facts|prompt|response|reasoning|answer|commentary|secret)"/i);
});

test("script refuses database access without exposing the connection string", () => {
  const script = resolve(process.cwd(), "scripts/query-langchain-evaluation.mjs");
  const child = spawnSync(process.execPath, ["--import", "tsx", script], {
    encoding: "utf8",
    env: { ...process.env, AGENT_LIVE_LLM_EVAL: "1", AGENT_QUERY_RUNTIME: "langchain", DATABASE_URL: "postgresql://blocked.invalid/evaluation" },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /must not connect to a database/);
  assert.doesNotMatch(child.stdout + child.stderr, /postgresql:\/\//);
});
