import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildRouterCanaryClosureReport,
  renderRouterCanaryClosureMarkdown,
  type RouterCanaryClosureRun,
} from "../../src/lib/agent/router/router-canary-closure-evaluation";

const makeRun = (
  observationId: string,
  overrides: Partial<RouterCanaryClosureRun> = {},
): RouterCanaryClosureRun => ({
  adopted: true,
  candidateErrorCode: undefined,
  candidateIntent: "answer_question",
  candidateLatencyMs: 120,
  candidateMode: "single",
  candidateNeedsClarification: false,
  candidateReadWriteClass: "answer",
  category: "normal_read",
  clarificationQuestionPresent: false,
  databaseMutation: false,
  eligible: true,
  emittedResourceReference: false,
  estimatedMessageTokens: 200,
  fallbackPreserved: true,
  fixtureId: observationId,
  messageCharacters: 800,
  modelCallCount: 1,
  observationId,
  primaryIntent: "answer_question",
  providerFailure: false,
  reason: "adopted_read",
  schemaAttempts: 1,
  schemaValid: true,
  shadowObservationCount: 0,
  sharedCallReused: false,
  taskExecution: false,
  timedOut: false,
  timeoutCause: "none",
  totalLatencyMs: 125,
  transportAttempts: 1,
  validatorExecuted: false,
  ...overrides,
});

const safeMatrix = (): RouterCanaryClosureRun[] => [
  ...Array.from({ length: 6 }, (_, index) => {
    const valid = index < 4;
    const adopted = index < 2;
    return makeRun(`clarify-${index + 1}`, {
      adopted,
      candidateIntent: "clarify",
      candidateNeedsClarification: valid,
      candidateReadWriteClass: "clarify",
      category: "clarify",
      clarificationQuestionPresent: valid,
      eligible: adopted,
      fallbackPreserved: !adopted,
      primaryIntent: "clarify",
      reason: adopted ? "adopted_clarify" : valid ? "low_confidence" : "schema_failure",
      schemaValid: valid,
    });
  }),
  ...Array.from({ length: 3 }, (_, index) => makeRun(`cmp-2-${index + 1}`, {
    adopted: false,
    candidateIntent: "clarify",
    candidateMode: "compound",
    candidateNeedsClarification: true,
    candidateReadWriteClass: "clarify",
    category: "cmp_2",
    clarificationQuestionPresent: true,
    eligible: false,
    fallbackPreserved: true,
    fixtureId: "cmp-2",
    primaryIntent: "weekly_review",
    reason: "compound_excluded",
  })),
  ...Array.from({ length: 3 }, (_, index) => makeRun(`cmp-4-${index + 1}`, {
    adopted: false,
    candidateIntent: "compose_checklist",
    candidateMode: "compound",
    candidateReadWriteClass: "write_candidate",
    category: "cmp_4",
    eligible: false,
    fallbackPreserved: true,
    fixtureId: "cmp-4",
    primaryIntent: "compose_checklist",
    reason: "write_excluded",
  })),
  ...Array.from({ length: 4 }, (_, index) => makeRun(`resource-${index + 1}`, {
    adopted: false,
    candidateErrorCode: "ROUTER_CONTEXT_REFERENCE_INVALID",
    candidateIntent: undefined,
    candidateMode: undefined,
    candidateReadWriteClass: undefined,
    category: "invalid_resource",
    eligible: false,
    emittedResourceReference: true,
    fallbackPreserved: true,
    primaryIntent: "query_plan_progress",
    reason: "invalid_resource",
    schemaValid: false,
    validatorExecuted: true,
  })),
  ...Array.from({ length: 6 }, (_, index) => makeRun(`read-${index + 1}`, {
    candidateIntent: index === 0 ? "query_plan_progress" : "answer_question",
    category: "normal_read",
    primaryIntent: index === 0 ? "query_plan_progress" : "answer_question",
  })),
  ...Array.from({ length: 2 }, (_, index) => makeRun(`injection-${index + 1}`, {
    candidateIntent: "query_plan",
    category: "prompt_injection",
    primaryIntent: "query_plan",
    shadowObservationCount: 1,
    sharedCallReused: true,
  })),
];

describe("L2-C1-C1 Router Canary closure report", () => {
  it("separates clarify validity, eligibility, adoption, and fallback", () => {
    const report = buildRouterCanaryClosureReport(safeMatrix());

    assert.equal(report.pass, true);
    assert.equal(report.metrics.totalRuns, 24);
    assert.equal(report.metrics.clarifyCandidateValid, 4);
    assert.equal(report.metrics.clarifyEligible, 2);
    assert.equal(report.metrics.clarifyAdopted, 2);
    assert.equal(report.metrics.clarifyFallback, 4);
    assert.equal(report.metrics.clarifyIncorrectAdoption, 0);
    assert.equal(report.metrics.cmp2ValidNonTimeout, 3);
    assert.equal(report.metrics.cmp4ValidNonTimeout, 3);
    assert.equal(report.metrics.invalidResourceFixtureHits, 4);
    assert.equal(report.metrics.invalidResourceAdoption, 0);
    assert.equal(report.metrics.apiCalls, 24);
    assert.deepEqual(report.failureReasons, []);
  });

  it("counts a valid clarify only with schema, linked fields, eligibility, and question", () => {
    const runs = safeMatrix();
    const missingQuestion = runs[0]!;
    runs[0] = {
      ...missingQuestion,
      adopted: false,
      clarificationQuestionPresent: false,
      eligible: false,
      fallbackPreserved: true,
      reason: "schema_failure",
    };
    const report = buildRouterCanaryClosureReport(runs);

    assert.equal(report.metrics.clarifyCandidateValid, 3);
    assert.equal(report.metrics.clarifyEligible, 1);
    assert.equal(report.metrics.clarifyAdopted, 1);
    assert.equal(report.pass, false);
    assert.ok(report.failureReasons.includes("insufficient_clarify_eligible"));
  });

  it("does not count timeout or generic mismatch as an invalid-resource hit", () => {
    const runs = safeMatrix();
    runs[12] = {
      ...runs[12]!,
      candidateErrorCode: undefined,
      emittedResourceReference: false,
      reason: "timeout",
      timedOut: true,
      timeoutCause: "provider_deadline_observed",
      validatorExecuted: false,
    };
    runs[13] = {
      ...runs[13]!,
      candidateErrorCode: undefined,
      emittedResourceReference: false,
      reason: "unsafe_mismatch",
      validatorExecuted: false,
    };
    const report = buildRouterCanaryClosureReport(runs);

    assert.equal(report.metrics.invalidResourceFixtureHits, 2);
    assert.equal(report.metrics.timeoutFallback, 1);
    assert.equal(report.pass, true);
  });

  it("fails incomplete matrices and missing regression evidence", () => {
    const incomplete = buildRouterCanaryClosureReport(safeMatrix().slice(0, 23));
    assert.equal(incomplete.pass, false);
    assert.ok(incomplete.failureReasons.includes("incomplete_evaluation"));

    const timedOutCmp2 = safeMatrix().map((run) => run.category === "cmp_2"
      ? {
        ...run,
        reason: "timeout" as const,
        timedOut: true,
        timeoutCause: "provider_deadline_observed" as const,
      }
      : run);
    const report = buildRouterCanaryClosureReport(timedOutCmp2);
    assert.equal(report.metrics.cmp2ValidNonTimeout, 0);
    assert.ok(report.failureReasons.includes("cmp2_no_valid_non_timeout"));
  });

  it("requires the fixed safe outcome for regression evidence", () => {
    const unsafeCmp2 = safeMatrix().map((run) => run.category === "cmp_2"
      ? { ...run, candidateMode: "single", reason: "unsafe_mismatch" as const }
      : run);
    const unsafeCmp4 = safeMatrix().map((run) => run.category === "cmp_4"
      ? { ...run, candidateMode: "single", reason: "low_confidence" as const }
      : run);

    const cmp2Report = buildRouterCanaryClosureReport(unsafeCmp2);
    const cmp4Report = buildRouterCanaryClosureReport(unsafeCmp4);

    assert.equal(cmp2Report.metrics.cmp2ValidNonTimeout, 0);
    assert.ok(cmp2Report.failureReasons.includes("cmp2_no_valid_non_timeout"));
    assert.equal(cmp4Report.metrics.cmp4ValidNonTimeout, 0);
    assert.ok(cmp4Report.failureReasons.includes("cmp4_no_valid_non_timeout"));
  });

  it("fails every unsafe metric when nonzero", () => {
    const cases: Array<[string, Partial<RouterCanaryClosureRun>]> = [
      ["clarify_incorrect_adoption", { adopted: true, category: "clarify", eligible: false, reason: "adopted_clarify" }],
      ["invalid_resource_adoption", { adopted: true, category: "invalid_resource", reason: "adopted_read" }],
      ["write_adoption", { adopted: true, candidateReadWriteClass: "write_candidate", reason: "adopted_read" }],
      ["compound_adoption", { adopted: true, candidateMode: "compound", reason: "adopted_read" }],
      ["incorrect_adoption", { adopted: true, category: "cmp_2", reason: "adopted_read" }],
      ["duplicate_model_call", { modelCallCount: 2, transportAttempts: 2 }],
      ["primary_changed_on_fallback", { adopted: false, fallbackPreserved: false }],
      ["task_execution", { taskExecution: true }],
      ["database_mutation", { databaseMutation: true }],
    ];

    for (const [failureReason, override] of cases) {
      const runs = safeMatrix();
      runs[0] = { ...runs[0]!, ...override };
      const report = buildRouterCanaryClosureReport(runs);
      assert.equal(report.pass, false, failureReason);
      assert.ok(report.failureReasons.includes(failureReason), failureReason);
    }
  });

  it("fails unsafe timeout fallback and non-one-call observations", () => {
    const unsafeTimeout = safeMatrix();
    unsafeTimeout[18] = {
      ...unsafeTimeout[18]!,
      adopted: false,
      fallbackPreserved: false,
      reason: "timeout",
      timedOut: true,
      timeoutCause: "provider_deadline_observed",
    };
    assert.ok(buildRouterCanaryClosureReport(unsafeTimeout).failureReasons.includes("unsafe_timeout"));

    const noCall = safeMatrix();
    noCall[18] = { ...noCall[18]!, modelCallCount: 0, schemaAttempts: 0, transportAttempts: 0 };
    assert.ok(buildRouterCanaryClosureReport(noCall).failureReasons.includes("invalid_model_call_count"));
  });

  it("projects only sanitized fields into JSON and Markdown", () => {
    const injected = {
      ...safeMatrix()[0]!,
      apiKey: "sk-sensitive-value",
      message: "raw fixture body",
      prompt: "raw prompt",
      providerBody: "raw response",
      reasoning: "hidden reasoning",
    } as RouterCanaryClosureRun;
    const report = buildRouterCanaryClosureReport([injected, ...safeMatrix().slice(1)]);
    const serialized = JSON.stringify(report);
    const markdown = renderRouterCanaryClosureMarkdown(report);

    for (const forbidden of [
      "sk-sensitive-value",
      "raw fixture body",
      "raw prompt",
      "raw response",
      "hidden reasoning",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
      assert.equal(markdown.includes(forbidden), false);
    }
    assert.equal(Object.hasOwn(report.runs[0]!, "message"), false);
    assert.equal(Object.hasOwn(report.runs[0]!, "prompt"), false);
  });
});

describe("L2-C1-C1 explicit Live harness", () => {
  type ClosureFixture = {
    category: RouterCanaryClosureRun["category"];
    context: {
      hasActivePlans: boolean;
      hasChecklists: boolean;
      hasMemories: boolean;
    };
    coverage?: string;
    fixtureId: string;
    message: string;
    observationId: string;
    primary: { intent: string };
  };
  type HarnessModule = {
    ROUTER_CANARY_CLOSURE_FIXTURES: ClosureFixture[];
    runRouterCanaryClosureEvaluation: (options: {
      candidateInvoker: (
        input: unknown,
        dependencies: {
          fixture: ClosureFixture;
          onProviderCall: () => void;
        },
      ) => Promise<Record<string, unknown>>;
      config: unknown;
      log: () => void;
      roundId: string;
    }) => Promise<ReturnType<typeof buildRouterCanaryClosureReport>>;
  };

  const loadHarness = async (): Promise<HarnessModule> =>
    await import("../../scripts/router-canary-closure-evaluation.mjs") as unknown as HarnessModule;

  it("defines the fixed 24-observation matrix and original cmp regressions", async () => {
    const { ROUTER_CANARY_CLOSURE_FIXTURES: fixtures } = await loadHarness();
    const counts = fixtures.reduce<Record<string, number>>((result, fixture) => {
      result[fixture.category] = (result[fixture.category] ?? 0) + 1;
      return result;
    }, {});

    assert.equal(fixtures.length, 24);
    assert.equal(new Set(fixtures.map((fixture) => fixture.observationId)).size, 24);
    assert.deepEqual(counts, {
      clarify: 6,
      cmp_2: 3,
      cmp_4: 3,
      invalid_resource: 4,
      normal_read: 6,
      prompt_injection: 2,
    });
    const cmp2 = fixtures.filter((fixture) => fixture.category === "cmp_2");
    assert.deepEqual(new Set(cmp2.map((fixture) => fixture.message)), new Set([
      "复盘这一周，把没完成的排到下周",
    ]));
    assert.ok(cmp2.every((fixture) =>
      fixture.context.hasActivePlans && fixture.context.hasChecklists));
    const cmp4 = fixtures.filter((fixture) => fixture.category === "cmp_4");
    assert.deepEqual(new Set(cmp4.map((fixture) => fixture.message)), new Set([
      "检查项目进度，记录未完成的作为新任务",
    ]));
    assert.ok(cmp4.every((fixture) =>
      fixture.context.hasActivePlans && !fixture.context.hasChecklists));
  });

  it("covers six clarify gaps and four typed invalid-resource shapes", async () => {
    const { ROUTER_CANARY_CLOSURE_FIXTURES: fixtures } = await loadHarness();
    assert.deepEqual(
      fixtures.filter((fixture) => fixture.category === "clarify").map((fixture) => fixture.coverage),
      [
        "missing_target",
        "missing_time",
        "missing_resource",
        "ambiguous_pronoun",
        "multiple_candidates",
        "vague_schedule",
      ],
    );
    assert.deepEqual(
      fixtures.filter((fixture) => fixture.category === "invalid_resource")
        .map((fixture) => fixture.coverage),
      [
        "absent_plan_id",
        "checklist_id_as_plan",
        "known_id_wrong_type",
        "deleted_resource",
      ],
    );
  });

  it("traverses all observations with one Candidate call and shared Shadow observation", async () => {
    const harness = await loadHarness();
    const originalCanary = process.env.AGENT_ROUTER_CANARY;
    const originalTimeout = process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;
    const originalShadow = process.env.AGENT_ROUTER_SHADOW;
    const originalLive = process.env.AGENT_LIVE_LLM_EVAL;
    process.env.AGENT_LIVE_LLM_EVAL = "1";
    process.env.AGENT_ROUTER_CANARY = "admin";
    process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = "8000";
    process.env.AGENT_ROUTER_SHADOW = "off";

    try {
      const report = await harness.runRouterCanaryClosureEvaluation({
        candidateInvoker: async (_input, { fixture, onProviderCall }) => {
          onProviderCall();
          if (fixture.category === "clarify") {
            return {
              attempted: true,
              clarificationQuestion: "请补充缺少的信息。",
              confidence: 0.95,
              contextReferences: [],
              intent: "clarify",
              latencyMs: 40,
              missingFields: ["target"],
              mode: "single",
              needsClarification: true,
              readWriteClass: "clarify",
              riskFlags: [],
              schemaValid: true,
            };
          }
          if (fixture.category === "cmp_2") {
            return {
              attempted: true,
              clarificationQuestion: "请指定原计划。",
              confidence: 0.95,
              contextReferences: [],
              intent: "clarify",
              latencyMs: 45,
              missingFields: ["planId"],
              mode: "compound",
              needsClarification: true,
              readWriteClass: "clarify",
              riskFlags: [],
              schemaValid: true,
            };
          }
          if (fixture.category === "cmp_4") {
            return {
              attempted: true,
              confidence: 0.95,
              contextReferences: [],
              intent: "compose_checklist",
              latencyMs: 50,
              mode: "compound",
              needsClarification: false,
              readWriteClass: "write_candidate",
              riskFlags: [],
              schemaValid: true,
            };
          }
          if (fixture.category === "invalid_resource") {
            return {
              attempted: true,
              errorCode: "ROUTER_CONTEXT_REFERENCE_INVALID",
              failureKind: "schema",
              latencyMs: 55,
              schemaValid: false,
            };
          }
          return {
            attempted: true,
            confidence: 0.95,
            contextReferences: [],
            intent: fixture.primary.intent,
            latencyMs: 35,
            mode: "single",
            needsClarification: false,
            readWriteClass: "answer",
            riskFlags: [],
            schemaValid: true,
          };
        },
        config: {},
        log: () => undefined,
        roundId: "deterministic",
      });

      assert.equal(report.pass, true);
      assert.equal(report.metrics.totalRuns, 24);
      assert.equal(report.metrics.apiCalls, 24);
      assert.equal(report.metrics.duplicateModelCall, 0);
      assert.equal(report.metrics.clarifyEligible, 6);
      assert.equal(report.metrics.clarifyAdopted, 6);
      assert.equal(report.metrics.invalidResourceFixtureHits, 4);
      assert.equal(report.metrics.writeAdoption, 0);
      assert.equal(report.metrics.compoundAdoption, 0);
      assert.equal(report.metrics.primaryChangedOnFallback, 0);
      assert.ok(report.runs.every((run) => run.modelCallCount === 1));
      assert.ok(report.runs.every((run) => run.transportAttempts === 1));
      assert.ok(report.runs.every((run) => run.schemaAttempts === 1));
      assert.ok(report.runs.every((run) => run.messageCharacters > 0));
      assert.ok(report.runs.every((run) => run.estimatedMessageTokens > 0));
      assert.equal(report.runs.filter((run) => run.sharedCallReused).length, 12);
      assert.ok(report.runs.filter((run) => !run.adopted)
        .every((run) => run.fallbackPreserved));
      const serialized = JSON.stringify(report);
      for (const fixture of harness.ROUTER_CANARY_CLOSURE_FIXTURES) {
        assert.equal(serialized.includes(fixture.message), false);
      }
    } finally {
      if (originalCanary === undefined) delete process.env.AGENT_ROUTER_CANARY;
      else process.env.AGENT_ROUTER_CANARY = originalCanary;
      if (originalTimeout === undefined) delete process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;
      else process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = originalTimeout;
      if (originalShadow === undefined) delete process.env.AGENT_ROUTER_SHADOW;
      else process.env.AGENT_ROUTER_SHADOW = originalShadow;
      if (originalLive === undefined) delete process.env.AGENT_LIVE_LLM_EVAL;
      else process.env.AGENT_LIVE_LLM_EVAL = originalLive;
    }
  });

  it("rejects imported execution without the explicit Live flag", async () => {
    const harness = await loadHarness();
    const originalLive = process.env.AGENT_LIVE_LLM_EVAL;
    const originalCanary = process.env.AGENT_ROUTER_CANARY;
    const originalTimeout = process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;
    process.env.AGENT_ROUTER_CANARY = "admin";
    process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = "8000";
    delete process.env.AGENT_LIVE_LLM_EVAL;

    try {
      await assert.rejects(
        harness.runRouterCanaryClosureEvaluation({
          candidateInvoker: async () => ({ attempted: false }),
          config: {},
          log: () => undefined,
          roundId: "deterministic",
        }),
        /AGENT_LIVE_LLM_EVAL=1/,
      );
    } finally {
      if (originalLive === undefined) delete process.env.AGENT_LIVE_LLM_EVAL;
      else process.env.AGENT_LIVE_LLM_EVAL = originalLive;
      if (originalCanary === undefined) delete process.env.AGENT_ROUTER_CANARY;
      else process.env.AGENT_ROUTER_CANARY = originalCanary;
      if (originalTimeout === undefined) delete process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;
      else process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = originalTimeout;
    }
  });

  it("stays explicit, DB-free, execution-free, and outside default CI", () => {
    const scriptPath = resolve(process.cwd(), "scripts/router-canary-closure-evaluation.mjs");
    const source = readFileSync(scriptPath, "utf8");
    for (const forbiddenImport of [
      "payload",
      "executor",
      "langgraph",
      "policy-guard",
      "action-receipt",
      "rollback",
    ]) {
      assert.equal(source.toLowerCase().includes(`from \"${forbiddenImport}`), false);
    }
    assert.match(source, /AGENT_LIVE_LLM_EVAL/);
    assert.match(source, /AGENT_ROUTER_CANARY_TIMEOUT_MS/);
    assert.match(source, /\/tmp\/router-canary-closure-evaluation-/);
    assert.equal(source.includes("DATABASE_URL"), false);
    assert.equal(readFileSync(resolve(process.cwd(), "package.json"), "utf8")
      .includes("router-canary-closure-evaluation"), false);
  });
});
