#!/usr/bin/env node

/**
 * Explicit R4 Hybrid focused Provider gate.
 *
 * This script is excluded from default CI. It fixes four reviewed fixtures
 * across three rounds, omits Query Commentary, enters the real production
 * orchestration step, and writes only a sanitized report to a fixed /tmp path.
 */

class HybridHarnessError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "HybridHarnessError";
  }
}

const requireFlag = (name) => {
  if (process.env[name] !== "1") {
    throw new HybridHarnessError(`MISSING_${name}`);
  }
};

const collectPrimitiveValues = (value) => {
  if (Array.isArray(value)) return value.flatMap(collectPrimitiveValues);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectPrimitiveValues);
  }
  return typeof value === "string" || typeof value === "number"
    ? [value]
    : [];
};

const main = async () => {
  requireFlag("AGENT_HYBRID_QUERY_BOUNDARY_EVAL");
  requireFlag("AGENT_LIVE_LLM_EVAL");
  requireFlag("L3B_HYBRID_PROVIDER_DATA_APPROVED");
  if (process.env.DATABASE_URL) {
    throw new HybridHarnessError("DATABASE_URL_MUST_BE_UNSET");
  }
  if (process.env.AGENT_DISABLE_LLM === "1") {
    throw new HybridHarnessError("AGENT_DISABLE_LLM_MUST_BE_UNSET");
  }
  if (!process.env.PAYLOAD_SECRET) {
    throw new HybridHarnessError("PAYLOAD_SECRET_REQUIRED");
  }
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new HybridHarnessError("DEEPSEEK_API_KEY_REQUIRED");
  }

  const acceptedHead =
    process.env.L3B_HYBRID_GATE_ACCEPTED_HEAD?.trim();
  if (!acceptedHead) {
    throw new HybridHarnessError("ACCEPTED_HEAD_REQUIRED");
  }
  const { execFileSync } = await import("node:child_process");
  const currentHead = execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  if (acceptedHead !== currentHead) {
    throw new HybridHarnessError("ACCEPTED_HEAD_MISMATCH");
  }
  const worktreeStatus = execFileSync(
    "git",
    ["status", "--porcelain"],
    { encoding: "utf8" },
  ).trim();
  if (worktreeStatus) {
    throw new HybridHarnessError("WORKTREE_NOT_CLEAN");
  }

  const [
    { createModelConfig },
    {
      aggregateHybridFocusedGate,
      calculateHybridFocusedGateBudget,
      HYBRID_FOCUSED_FIXTURE_IDS,
    },
    {
      HYBRID_FOCUSED_GATE_REPORT_PATH,
      scanHybridFocusedGateReport,
      writeHybridFocusedGateReport,
    },
    {
      assertHybridFocusedFixtureSnapshot,
      HYBRID_QUERY_COMMENTARY_OMISSION_NOTE,
      runHybridFocusedGate,
    },
    { evaluateHybridProductionCase },
    { L3B_EVALUATION_CONFIG },
    { L3B_EVALUATION_FIXTURES },
  ] = await Promise.all([
    import("../src/lib/agent/llm/model-config.ts"),
    import("../src/lib/agent/orchestration/hybrid-focused-gate.ts"),
    import("../src/lib/agent/orchestration/hybrid-focused-gate-report.ts"),
    import("../src/lib/agent/orchestration/hybrid-focused-gate-runner.ts"),
    import("../src/lib/agent/orchestration/hybrid-production-evaluation.ts"),
    import("../src/lib/agent/orchestration/l3b-evaluation-config.ts"),
    import("../src/lib/agent/orchestration/l3b-evaluation-fixtures.ts"),
  ]);

  assertHybridFocusedFixtureSnapshot();
  const modelConfig = createModelConfig({
    apiKey,
    baseURL: L3B_EVALUATION_CONFIG.baseURL,
    maxOutputTokens:
      L3B_EVALUATION_CONFIG.orchestratorMaxOutputTokens,
    maxRetries: 0,
    model: L3B_EVALUATION_CONFIG.model,
    provider: L3B_EVALUATION_CONFIG.provider,
    structuredOutputMode:
      L3B_EVALUATION_CONFIG.structuredOutputMode,
    temperature: L3B_EVALUATION_CONFIG.temperature,
    thinkingMode:
      L3B_EVALUATION_CONFIG.orchestratorThinkingMode,
    timeoutMs: L3B_EVALUATION_CONFIG.orchestratorTimeoutMs,
  });
  if (!("apiKey" in modelConfig)) {
    throw new HybridHarnessError("MODEL_CONFIG_INVALID");
  }

  const focusedFixtures = new Map(
    L3B_EVALUATION_FIXTURES
      .filter((fixture) =>
        HYBRID_FOCUSED_FIXTURE_IDS.includes(fixture.id))
      .map((fixture) => [fixture.id, fixture]),
  );
  if (focusedFixtures.size !== HYBRID_FOCUSED_FIXTURE_IDS.length) {
    throw new HybridHarnessError("FOCUSED_FIXTURE_SET_INVALID");
  }

  const actor = Object.freeze({
    collection: "users",
    id: 7,
    isAdmin: true,
  });
  const observations = await runHybridFocusedGate({
    evaluate: async (evaluation) => {
      const fixture = focusedFixtures.get(evaluation.fixtureId);
      if (!fixture || fixture.message !== evaluation.message) {
        throw new HybridHarnessError("FOCUSED_FIXTURE_MISMATCH");
      }
      return evaluateHybridProductionCase({
        authenticatedActor: actor,
        context: fixture.context,
        expectation: evaluation.expectation,
        fixtureId: evaluation.fixtureId,
        message: evaluation.message,
        observationIndex: evaluation.observationIndex,
        queryAdoption: "admin",
        queryCommentaryAdapter:
          evaluation.queryCommentaryAdapter,
        queryRuntime: "langchain",
        residualModelConfig: modelConfig,
        round: evaluation.round,
      });
    },
  });

  const budget = calculateHybridFocusedGateBudget(observations);
  const summary = aggregateHybridFocusedGate(observations);
  const report = Object.freeze({
    budget,
    commentaryMode: "omitted",
    commentaryNote: HYBRID_QUERY_COMMENTARY_OMISSION_NOTE,
    observations,
    summary,
  });
  const sensitiveValues = [
    actor.id,
    apiKey,
    ...[...focusedFixtures.values()].flatMap((fixture) => [
      fixture.message,
      ...collectPrimitiveValues(fixture.context),
    ]),
  ];
  const retention = scanHybridFocusedGateReport(
    report,
    sensitiveValues,
  );
  if (retention.rawRetentionViolation) {
    throw new HybridHarnessError("REPORT_RETENTION_UNSAFE");
  }
  await writeHybridFocusedGateReport({
    report,
    sensitiveValues,
  });

  process.stdout.write(`${JSON.stringify({
    budget,
    commentaryMode: "omitted",
    failedGates: summary.failedGates,
    latencyP50Ms: summary.latencyP50Ms,
    latencyUpperTailMs: summary.latencyUpperTailMs,
    observations: summary.observations,
    passed: summary.passed,
    providerAttempts: summary.providerAttempts,
    providerFailures: summary.providerFailures,
    reportPath: HYBRID_FOCUSED_GATE_REPORT_PATH,
    timeouts: summary.timeouts,
  })}\n`);
  if (!summary.passed) process.exitCode = 1;
};

try {
  await main();
} catch (error) {
  const errorCode =
    error instanceof HybridHarnessError
      ? error.code
      : "HYBRID_HARNESS_FAILED";
  process.stdout.write(`${JSON.stringify({
    errorCode,
    passed: false,
  })}\n`);
  process.exitCode = 1;
}
