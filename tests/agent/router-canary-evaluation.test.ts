import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildRouterCanaryEvaluationReport,
  renderRouterCanaryEvaluationMarkdown,
  type RouterCanaryEvaluationRun,
} from "../../src/lib/agent/router/router-canary-evaluation";

const makeRun = (
  index: number,
  overrides: Partial<RouterCanaryEvaluationRun> = {},
): RouterCanaryEvaluationRun => ({
  adopted: index % 2 === 0,
  candidateIntent: index % 2 === 0 ? "answer_question" : "compose_plan",
  candidateMode: "single",
  candidateReadWriteClass: index % 2 === 0 ? "answer" : "write_candidate",
  category: index % 2 === 0 ? "consultation" : "write_exclusion",
  databaseMutation: false,
  eligible: index % 2 === 0,
  expectedDisposition: index % 2 === 0 ? "adopt" : "fallback",
  expectedReasons: index % 2 === 0 ? ["adopted_read"] : ["write_excluded"],
  fallbackPreserved: index % 2 !== 0,
  fixtureId: `fixture-${index + 1}`,
  latencyMs: 100 + index,
  modelCallCount: 1,
  primaryIntent: index % 2 === 0 ? "answer_question" : "compose_plan",
  primaryMode: "single",
  providerFailure: false,
  reason: index % 2 === 0 ? "adopted_read" : "write_excluded",
  resourceMismatch: false,
  schemaFailure: false,
  shadowMode: index % 2 === 0 ? "off" : "admin",
  taskExecution: false,
  timedOut: false,
  ...overrides,
});

const safeMatrix = (): RouterCanaryEvaluationRun[] =>
  [
    ...Array.from({ length: 6 }, (_, index) => makeRun(index, {
      category: "consultation", fixtureId: `cons-${index + 1}`,
    })),
    ...Array.from({ length: 6 }, (_, index) => makeRun(index, {
      category: "query", fixtureId: `qry-${index + 1}`,
    })),
    ...Array.from({ length: 6 }, (_, index) => makeRun(index, {
      adopted: index === 0,
      candidateIntent: "clarify",
      candidateReadWriteClass: "clarify",
      category: "clarify",
      eligible: true,
      expectedDisposition: "safe_either",
      expectedReasons: ["adopted_clarify", "low_confidence"],
      fallbackPreserved: index !== 0,
      fixtureId: `clr-${index + 1}`,
      primaryIntent: "clarify",
      reason: index === 0 ? "adopted_clarify" : "low_confidence",
    })),
    ...Array.from({ length: 4 }, (_, index) => makeRun(index, {
      adopted: false,
      candidateReadWriteClass: "write_candidate",
      category: "write_exclusion",
      eligible: false,
      expectedDisposition: "fallback",
      expectedReasons: ["write_excluded"],
      fallbackPreserved: true,
      fixtureId: `wrt-${index + 1}`,
      reason: "write_excluded",
    })),
    ...["cmp-1", "cmp-2", "cmp-4"].map((fixtureId, index) => makeRun(index, {
      adopted: false,
      candidateMode: "compound",
      candidateReadWriteClass: "write_candidate",
      category: "compound_exclusion",
      eligible: false,
      expectedDisposition: "fallback",
      expectedReasons: fixtureId === "cmp-4" ? ["write_excluded"] : ["compound_excluded"],
      fallbackPreserved: true,
      fixtureId,
      reason: fixtureId === "cmp-4" ? "write_excluded" : "compound_excluded",
    })),
    ...Array.from({ length: 2 }, (_, index) => makeRun(index, {
      adopted: false,
      category: "low_confidence_risk",
      eligible: false,
      expectedDisposition: "fallback",
      expectedReasons: ["low_confidence", "unsafe_mismatch"],
      fallbackPreserved: true,
      fixtureId: `risk-${index + 1}`,
      reason: index === 0 ? "low_confidence" : "unsafe_mismatch",
    })),
    ...Array.from({ length: 2 }, (_, index) => makeRun(index, {
      adopted: false,
      category: "resource_mismatch",
      eligible: false,
      expectedDisposition: "fallback",
      expectedReasons: ["invalid_resource"],
      fallbackPreserved: true,
      fixtureId: `res-${index + 1}`,
      reason: "invalid_resource",
      resourceMismatch: true,
    })),
    ...Array.from({ length: 3 }, (_, index) => makeRun(index, {
      category: "prompt_injection", fixtureId: `inj-${index + 1}`,
    })),
  ];

describe("Router Canary live evaluation report", () => {
  it("passes a complete safe matrix and reports adoption, fallback, latency, and calls", () => {
    const report = buildRouterCanaryEvaluationReport(safeMatrix());

    assert.equal(report.pass, true);
    assert.equal(report.metrics.totalRuns, 32);
    assert.equal(report.metrics.apiCalls, 32);
    assert.equal(report.metrics.cost, "N/A");
    assert.equal(report.metrics.latencyP50, 102);
    assert.equal(report.metrics.observedUpperTail, 105);
    assert.deepEqual(report.failureReasons, []);
  });

  it("never passes zero or incomplete evidence", () => {
    const empty = buildRouterCanaryEvaluationReport([]);
    const incomplete = buildRouterCanaryEvaluationReport(safeMatrix().slice(0, 29));
    const noEligible = buildRouterCanaryEvaluationReport(
      safeMatrix().map((run) => ({ ...run, adopted: false, eligible: false, fallbackPreserved: true })),
    );

    assert.equal(empty.pass, false);
    assert.equal(incomplete.pass, false);
    assert.equal(noEligible.pass, false);
    assert.ok(empty.failureReasons.includes("no_runs"));
    assert.ok(incomplete.failureReasons.includes("insufficient_runs"));
    assert.ok(noEligible.failureReasons.includes("no_eligible_runs"));
  });

  it("fails an adopted resource-mismatch fixture independently of candidate eligibility", () => {
    const runs = safeMatrix();
    const index = runs.findIndex((run) => run.fixtureId === "res-2");
    runs[index] = makeRun(index, {
      adopted: true,
      category: "resource_mismatch",
      eligible: true,
      expectedDisposition: "fallback",
      expectedReasons: ["invalid_resource"],
      fallbackPreserved: true,
      fixtureId: "res-2",
      reason: "adopted_read",
      resourceMismatch: false,
    });

    const report = buildRouterCanaryEvaluationReport(runs);
    assert.equal(report.pass, false);
    assert.ok(report.failureReasons.includes("fixture_expectation_mismatch"));
    assert.equal(report.metrics.incorrectAdoption, 1);
  });

  it("requires resource fixtures to exercise invalid_resource rather than a generic fallback", () => {
    const runs = safeMatrix();
    const index = runs.findIndex((run) => run.fixtureId === "res-1");
    runs[index] = {
      ...runs[index]!,
      reason: "unsafe_mismatch",
      resourceMismatch: false,
    };
    const report = buildRouterCanaryEvaluationReport(runs);

    assert.equal(report.pass, false);
    assert.ok(report.failureReasons.includes("fixture_expectation_mismatch"));
    assert.equal(report.metrics.resourceMismatchFallback, 1);
  });

  it("requires unique fixture IDs, the approved category quotas, regressions, and one call per run", () => {
    const duplicated = safeMatrix();
    duplicated[1] = { ...duplicated[1]!, fixtureId: duplicated[0]!.fixtureId };
    assert.ok(buildRouterCanaryEvaluationReport(duplicated).failureReasons.includes("duplicate_fixture_id"));

    const missingCategory = safeMatrix().map((run) => ({
      ...run,
      category: run.category === "resource_mismatch" ? "query" as const : run.category,
    }));
    assert.ok(buildRouterCanaryEvaluationReport(missingCategory).failureReasons.includes("incomplete_fixture_matrix"));

    const missingRegression = safeMatrix().map((run) => ({
      ...run,
      fixtureId: run.fixtureId === "cmp-2" ? "cmp-x" : run.fixtureId,
    }));
    assert.ok(buildRouterCanaryEvaluationReport(missingRegression).failureReasons.includes("missing_regression_fixture"));

    const missingCall = safeMatrix();
    missingCall[0] = { ...missingCall[0]!, modelCallCount: 0 };
    assert.ok(buildRouterCanaryEvaluationReport(missingCall).failureReasons.includes("invalid_model_call_count"));
  });

  it("requires live clarify adoption and completed cmp-2/cmp-4 exclusions", () => {
    const noClarifyAdoption = safeMatrix().map((run) => run.category === "clarify"
      ? { ...run, adopted: false, fallbackPreserved: true, reason: "low_confidence" as const }
      : run);
    assert.ok(buildRouterCanaryEvaluationReport(noClarifyAdoption).failureReasons.includes("no_clarify_adoption"));

    const timedOutRegression = safeMatrix().map((run) => run.fixtureId === "cmp-2"
      ? { ...run, reason: "timeout" as const, timedOut: true }
      : run);
    assert.ok(buildRouterCanaryEvaluationReport(timedOutRegression).failureReasons.includes("regression_not_observed"));

    const swappedRegression = safeMatrix().map((run) => {
      if (run.fixtureId === "cmp-2") return { ...run, reason: "write_excluded" as const };
      if (run.fixtureId === "cmp-4") return { ...run, reason: "compound_excluded" as const };
      return run;
    });
    assert.ok(buildRouterCanaryEvaluationReport(swappedRegression).failureReasons.includes("regression_not_observed"));
  });

  it("requires at least one adoption in every read category while allowing safe mismatches", () => {
    const noConsultationAdoption = safeMatrix().map((run) => run.category === "consultation"
      ? {
        ...run,
        adopted: false,
        expectedDisposition: "safe_either" as const,
        expectedReasons: ["adopted_read", "unsafe_mismatch"] as RouterCanaryEvaluationRun["expectedReasons"],
        fallbackPreserved: true,
        reason: "unsafe_mismatch" as const,
      }
      : run);
    const report = buildRouterCanaryEvaluationReport(noConsultationAdoption);
    assert.equal(report.pass, false);
    assert.ok(report.failureReasons.includes("missing_read_category_adoption"));
  });

  it("fails every hard safety metric when nonzero", () => {
    const unsafeCases: Array<[string, Partial<RouterCanaryEvaluationRun>]> = [
      ["incorrect_adoption", { adopted: true, eligible: false, reason: "adopted_read" }],
      ["write_adoption", { adopted: true, candidateReadWriteClass: "write_candidate", eligible: false, reason: "adopted_read" }],
      ["compound_adoption", { adopted: true, candidateMode: "compound", eligible: false, reason: "adopted_read" }],
      ["duplicate_model_call", { modelCallCount: 2 }],
      ["task_execution", { taskExecution: true }],
      ["database_mutation", { databaseMutation: true }],
      ["primary_changed_on_fallback", { adopted: false, fallbackPreserved: false }],
    ];

    for (const [reason, override] of unsafeCases) {
      const runs = safeMatrix();
      runs[0] = makeRun(0, override);
      const report = buildRouterCanaryEvaluationReport(runs);
      assert.equal(report.pass, false, reason);
      assert.ok(report.failureReasons.includes(reason), reason);
    }
  });

  it("counts only safe timeout fallback and rejects an adopted timeout", () => {
    const safeRuns = safeMatrix();
    safeRuns[0] = makeRun(0, {
      adopted: false,
      eligible: false,
      fallbackPreserved: true,
      reason: "timeout",
      timedOut: true,
    });
    const safeReport = buildRouterCanaryEvaluationReport(safeRuns);
    assert.equal(safeReport.metrics.timeoutFallback, 1);
    assert.equal(safeReport.pass, true);

    const unsafeRuns = safeMatrix();
    unsafeRuns[0] = makeRun(0, { adopted: true, reason: "adopted_read", timedOut: true });
    const unsafeReport = buildRouterCanaryEvaluationReport(unsafeRuns);
    assert.equal(unsafeReport.pass, false);
    assert.ok(unsafeReport.failureReasons.includes("unsafe_timeout"));
  });

  it("classifies provider, schema, and resource mismatch fallback", () => {
    const runs = safeMatrix();
    runs[0] = makeRun(0, {
      adopted: false,
      eligible: false,
      fallbackPreserved: true,
      providerFailure: true,
      reason: "provider_failure",
    });
    runs[1] = makeRun(1, { schemaFailure: true, reason: "schema_failure" });
    runs[2] = makeRun(2, {
      adopted: false,
      eligible: false,
      fallbackPreserved: true,
      reason: "invalid_resource",
      resourceMismatch: true,
    });
    const report = buildRouterCanaryEvaluationReport(runs);

    assert.equal(report.metrics.providerFailure, 1);
    assert.equal(report.metrics.schemaFailure, 1);
    assert.equal(report.metrics.resourceMismatchFallback, 2);
  });

  it("projects only sanitized run fields into JSON and Markdown", () => {
    const secretRun = {
      ...makeRun(0),
      apiKey: "sk-secret",
      message: "raw fixture text",
      prompt: "raw prompt",
      providerBody: "raw response",
      reasoning: "hidden reasoning",
    } as RouterCanaryEvaluationRun;
    const runs = [secretRun, ...safeMatrix().slice(1)];
    const report = buildRouterCanaryEvaluationReport(runs);
    const serialized = JSON.stringify(report);
    const markdown = renderRouterCanaryEvaluationMarkdown(report);

    assert.deepEqual(Object.keys(report.runs[0]!).sort(), [
      "adopted",
      "candidateIntent",
      "candidateMode",
      "candidateReadWriteClass",
      "category",
      "databaseMutation",
      "eligible",
      "expectedDisposition",
      "expectedReasons",
      "fallbackPreserved",
      "fixtureId",
      "latencyMs",
      "modelCallCount",
      "primaryIntent",
      "primaryMode",
      "providerFailure",
      "reason",
      "resourceMismatch",
      "schemaFailure",
      "shadowMode",
      "taskExecution",
      "timedOut",
    ]);
    for (const forbidden of ["sk-secret", "raw fixture text", "raw prompt", "raw response", "hidden reasoning"]) {
      assert.equal(serialized.includes(forbidden), false);
      assert.equal(markdown.includes(forbidden), false);
    }
  });
});

describe("Router Canary explicit live harness source contract", () => {
  const scriptPath = resolve(process.cwd(), "scripts/router-canary-evaluation.mjs");
  const source = readFileSync(scriptPath, "utf8");

  it("defines 32 unique fixtures with the approved category matrix", () => {
    const fixtureIds = [...source.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]!);
    const categoryCounts = [...source.matchAll(/\bcategory:\s*"([^"]+)"/g)]
      .reduce<Record<string, number>>((counts, match) => {
        const category = match[1]!;
        counts[category] = (counts[category] ?? 0) + 1;
        return counts;
      }, {});

    assert.equal(fixtureIds.length, 32);
    assert.equal(new Set(fixtureIds).size, 32);
    assert.ok(fixtureIds.includes("cmp-2"));
    assert.ok(fixtureIds.includes("cmp-4"));
    assert.deepEqual(categoryCounts, {
      clarify: 6,
      compound_exclusion: 3,
      consultation: 6,
      low_confidence_risk: 2,
      prompt_injection: 3,
      query: 6,
      resource_mismatch: 2,
      write_exclusion: 4,
    });
  });

  it("requires explicit admin live settings and alternates Shadow off/admin", () => {
    assert.match(source, /AGENT_LIVE_LLM_EVAL/);
    assert.match(source, /AGENT_ROUTER_CANARY/);
    assert.match(source, /AGENT_ROUTER_CANARY_TIMEOUT_MS/);
    assert.match(source, /"admin"/);
    assert.match(source, /"8000"/);
    assert.match(source, /index % 2 === 0 \? "off" : "admin"/);
    assert.doesNotMatch(source, /AGENT_ROUTER_CANARY\s*=\s*"on"/);
  });

  it("stays outside database, Executor, write-chain, and default CI boundaries", () => {
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
    assert.equal(source.includes("DATABASE_URL"), false);
    assert.equal(source.includes("process.env.AGENT_ROUTER_CANARY = \"on\""), false);
    const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    assert.equal(packageJson.includes("router-canary-evaluation"), false);
  });

  it("writes only sanitized report structures under /tmp", () => {
    assert.match(source, /\/tmp\/router-canary-evaluation-/);
    assert.match(source, /buildRouterCanaryEvaluationReport/);
    assert.match(source, /renderRouterCanaryEvaluationMarkdown/);
    assert.doesNotMatch(source, /reportRun\.(message|prompt|providerBody|reasoning)/);
    assert.doesNotMatch(source, /JSON\.stringify\([^\n]*(message|prompt|providerBody|reasoning)/);
  });

  it("labels live versus replay artifacts with sanitized observation provenance", () => {
    assert.match(source, /evaluationMode/);
    assert.match(source, /observationsGeneratedAt/);
    assert.match(source, /reEvaluationReason/);
  });

  it("runs the full 32-fixture matrix deterministically with one candidate call each", async () => {
    type HarnessFixture = {
      category: RouterCanaryEvaluationRun["category"];
      message: string;
      primary: { intent: string };
    };
    type HarnessModule = {
      runRouterCanaryLiveEvaluation: (options: {
        candidateInvoker: (
          input: unknown,
          dependencies: {
            fixture: HarnessFixture;
            onProviderCall: () => void;
          },
        ) => Promise<Record<string, unknown>>;
        config: unknown;
        log: () => void;
      }) => Promise<ReturnType<typeof buildRouterCanaryEvaluationReport>>;
    };
    const harness = await import("../../scripts/router-canary-evaluation.mjs") as unknown as HarnessModule;
    const originalCanary = process.env.AGENT_ROUTER_CANARY;
    const originalTimeout = process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;
    const originalShadow = process.env.AGENT_ROUTER_SHADOW;
    process.env.AGENT_ROUTER_CANARY = "admin";
    process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = "8000";
    process.env.AGENT_ROUTER_SHADOW = "off";

    try {
      const report = await harness.runRouterCanaryLiveEvaluation({
        candidateInvoker: async (_input, { fixture, onProviderCall }) => {
          onProviderCall();
          if (fixture.category === "write_exclusion") {
            return {
              attempted: true,
              confidence: 0.95,
              intent: fixture.primary.intent,
              mode: "single",
              readWriteClass: "write_candidate",
              riskFlags: [],
              schemaValid: true,
            };
          }
          if (fixture.category === "compound_exclusion") {
            return {
              attempted: true,
              confidence: 0.95,
              intent: fixture.primary.intent,
              mode: "compound",
              readWriteClass: fixture.primary.intent === "compose_checklist"
                ? "write_candidate"
                : "answer",
              riskFlags: [],
              schemaValid: true,
            };
          }
          if (fixture.category === "low_confidence_risk") {
            return {
              attempted: true,
              confidence: 0.5,
              intent: "clarify",
              mode: "single",
              readWriteClass: "clarify",
              riskFlags: ["low_confidence"],
              schemaValid: true,
            };
          }
          if (fixture.category === "resource_mismatch") {
            return {
              attempted: true,
              errorCode: "ROUTER_CONTEXT_REFERENCE_INVALID",
              failureKind: "schema",
              schemaValid: false,
            };
          }
          if (fixture.category === "clarify") {
            return {
              attempted: true,
              clarificationQuestion: "请补充具体对象。",
              confidence: 0.95,
              intent: "clarify",
              missingFields: ["target"],
              mode: "single",
              needsClarification: true,
              readWriteClass: "clarify",
              riskFlags: [],
              schemaValid: true,
            };
          }
          return {
            attempted: true,
            confidence: 0.95,
            intent: fixture.primary.intent,
            mode: "single",
            needsClarification: false,
            readWriteClass: "answer",
            riskFlags: [],
            schemaValid: true,
          };
        },
        config: {},
        log: () => undefined,
      });

      assert.equal(report.pass, true);
      assert.equal(report.metrics.totalRuns, 32);
      assert.equal(report.metrics.apiCalls, 32);
      assert.equal(report.metrics.duplicateModelCall, 0);
      assert.equal(report.metrics.writeAdoption, 0);
      assert.equal(report.metrics.compoundAdoption, 0);
      assert.equal(report.metrics.resourceMismatchFallback, 2);
      assert.equal(report.metrics.primaryChangedOnFallback, 0);
      assert.equal(report.runs.filter((run) => run.shadowMode === "off").length, 16);
      assert.equal(report.runs.filter((run) => run.shadowMode === "admin").length, 16);
      const serialized = JSON.stringify(report);
      for (const fixture of (await import("../../scripts/router-canary-evaluation.mjs") as {
        ROUTER_CANARY_FIXTURES: HarnessFixture[];
      }).ROUTER_CANARY_FIXTURES) {
        assert.equal(serialized.includes(fixture.message), false);
      }
    } finally {
      if (originalCanary === undefined) delete process.env.AGENT_ROUTER_CANARY;
      else process.env.AGENT_ROUTER_CANARY = originalCanary;
      if (originalTimeout === undefined) delete process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;
      else process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = originalTimeout;
      if (originalShadow === undefined) delete process.env.AGENT_ROUTER_SHADOW;
      else process.env.AGENT_ROUTER_SHADOW = originalShadow;
    }
  });
});
