#!/usr/bin/env node

/**
 * Explicit Production-Seam L3-B Provider gate. Never runs in default CI.
 *
 * The process is intentionally fail-closed: live data approval, the exact
 * clean HEAD/config, a fixed stage, and an unused fixed report path are all
 * required before the first Provider request can start.
 */

import { execFileSync } from "node:child_process";
import { access, open, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  assertProductionGateReportSafe,
  ProductionGateReportSafetyError,
} from "../src/lib/agent/orchestration/l3b-production-gate-report.ts";
import {
  calculateProductionStageAuthorizedBudget,
} from "../src/lib/agent/orchestration/l3b-production-gate-budget.ts";
import {
  getL3BProductionStageCases,
  L3B_PRODUCTION_GATE_PROTOCOL_VERSION,
} from "../src/lib/agent/orchestration/l3b-production-gate-contract.ts";
import {
  createProductionGateDisclosureManifest,
} from "../src/lib/agent/orchestration/l3b-production-gate-manifest.ts";
import {
  L3B_EVALUATION_CONFIG,
  L3B_EVALUATION_CONFIG_HASH,
} from "../src/lib/agent/orchestration/l3b-evaluation-config.ts";
import {
  RESIDUAL_PLANNER_RETRY_POLICY,
} from "../src/lib/agent/orchestration/residual-planner-contract.ts";

class ProductionSeamGateError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "ProductionSeamGateError";
  }
}

const REPORT_PATHS = Object.freeze({
  acceptance: "/tmp/l3b-r8-production-acceptance.json",
  focused: "/tmp/l3b-r8-production-focused.json",
  known_id: "/tmp/l3b-r8-production-known-id-v4.json",
  stability: "/tmp/l3b-r8-production-stability.json",
});
const STAGES = new Set(Object.keys(REPORT_PATHS));
const ACTOR = Object.freeze({ collection: "users", id: 7, isAdmin: true });
const PROVIDER_ATTEMPTS_PER_OBSERVATION_MAXIMUM = 4;
const MODEL_CALL_AUTHORIZATION_FAILURE_CODES = new Set([
  "MODEL_LOGICAL_CALL_LIMIT_EXCEEDED",
  "MODEL_OBSERVATION_PROVIDER_ATTEMPT_LIMIT_EXCEEDED",
  "MODEL_PROVIDER_ATTEMPT_LIMIT_EXCEEDED",
]);

let actualProviderAttempts = 0;
let preflightForFailure = null;

const fail = (code) => {
  throw new ProductionSeamGateError(code);
};

const requireFlag = (name) => {
  if (process.env[name] !== "1") fail(`MISSING_${name}`);
};

const requireValue = (name) => {
  const value = process.env[name]?.trim();
  if (!value) fail(`MISSING_${name}`);
  return value;
};

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const git = (...args) => execFileSync(
  "git",
  args,
  { cwd: process.cwd(), encoding: "utf8" },
).trim();

const providerAttemptCount = (accounting) =>
  accounting.answerProviderAttempts
  + accounting.fullOrchestratorProviderAttempts
  + accounting.queryCommentaryProviderAttempts
  + accounting.replanProviderAttempts
  + accounting.residualPlannerProviderAttempts
  + accounting.specialistProviderAttempts;

const logicalCallCount = (accounting) =>
  accounting.answerLogicalCalls
  + accounting.fullOrchestratorLogicalCalls
  + accounting.queryCommentaryLogicalCalls
  + accounting.replanLogicalCalls
  + accounting.residualPlannerLogicalCalls
  + accounting.specialistLogicalCalls;

const collectSensitiveFixtureValues = (value, key = "") => {
  if (Array.isArray(value)) {
    return value.flatMap((child) =>
      collectSensitiveFixtureValues(child, key)
    );
  }
  if (!value || typeof value !== "object") {
    if (
      typeof value === "string"
      && /^(?:content|description|items|message|name|text|title)$/iu.test(key)
    ) {
      return [value];
    }
    if (
      typeof value === "number"
      && /(?:^id$|ids?$)/iu.test(key)
    ) {
      return [value];
    }
    return [];
  }
  return Object.entries(value).flatMap(([childKey, child]) =>
    collectSensitiveFixtureValues(child, childKey));
};

const projectRoleEvidence = (roleEvidence) => Object.freeze({
  answerRenderer: Object.freeze({ ...roleEvidence.answerRenderer }),
  fullOrchestrator: Object.freeze({
    ...roleEvidence.fullOrchestrator,
    providerLatenciesMs: Object.freeze([
      ...roleEvidence.fullOrchestrator.providerLatenciesMs,
    ]),
    resourceIssueCodes: Object.freeze([
      ...roleEvidence.fullOrchestrator.resourceIssueCodes,
    ]),
    semanticProjection: roleEvidence.fullOrchestrator.semanticProjection
      ? Object.freeze({
          ...roleEvidence.fullOrchestrator.semanticProjection,
          intents: Object.freeze([
            ...roleEvidence.fullOrchestrator.semanticProjection.intents,
          ]),
        })
      : null,
  }),
  queryCommentary: roleEvidence.queryCommentary,
  residualPlanner: Object.freeze({
    ...roleEvidence.residualPlanner,
    providerLatenciesMs: Object.freeze([
      ...roleEvidence.residualPlanner.providerLatenciesMs,
    ]),
  }),
});

const projectObservation = (observation) => Object.freeze({
  branch: observation.branchKind,
  callAccounting: Object.freeze({ ...observation.callAccounting }),
  failureCodes: Object.freeze([...observation.failureCodes]),
  finalIntents: Object.freeze([...observation.finalTaskIntents]),
  finalMode: observation.finalMode,
  fixtureId: observation.fixtureId,
  knownIdOutcome: observation.knownIdOutcome,
  knownIdRejectionSource: observation.knownIdRejectionSource,
  latencyMs: observation.latencyMs,
  roleEvidence: projectRoleEvidence(observation.roleEvidence),
  round: observation.round,
  semantic: observation.semanticMatch,
  sideEffects: Object.freeze({
    businessMutationAttempts: observation.businessMutationAttempts,
    businessMutations: observation.businessMutations,
    databaseAccessAttempts: observation.databaseAccessAttempts,
    databaseConnections: observation.databaseConnections,
    databaseMutationAttempts: observation.databaseMutationAttempts,
    draftPathsReached: observation.draftPathsReached,
    rawRetentionViolation: observation.rawRetentionViolation,
    taskExecutionAttempts: observation.taskExecutionAttempts,
    taskExecutions: observation.taskExecutions,
    writeWithoutDraftViolations: observation.writeWithoutDraftViolations,
  }),
  usable: observation.usable,
});

export const assertReportSafe = (report, sensitiveValues) =>
  assertProductionGateReportSafe(report, sensitiveValues);

export const classifyProductionSeamFailure = (error) => {
  const authorizationFailureCode =
    error
    && typeof error === "object"
    && error.name === "ModelCallAuthorizationError"
    && typeof error.code === "string"
    && MODEL_CALL_AUTHORIZATION_FAILURE_CODES.has(error.code)
      ? error.code
      : null;
  if (error instanceof ProductionSeamGateError) return error.code;
  if (error instanceof ProductionGateReportSafetyError) return error.code;
  return authorizationFailureCode ?? "UNEXPECTED_FAILURE";
};

const writeReport = async (path, encoded) => {
  let handle = null;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(`${encoded}\n`, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined);
      await unlink(path).catch(() => undefined);
    }
    throw error;
  }
};

const main = async () => {
  requireFlag("AGENT_PRODUCTION_SEAM_EVAL");
  requireFlag("AGENT_LIVE_LLM_EVAL");
  requireFlag("L3B_PRODUCTION_PROVIDER_DATA_APPROVED");
  if (Object.hasOwn(process.env, "DATABASE_URL")) {
    fail("DATABASE_URL_MUST_BE_UNSET");
  }
  if (process.env.AGENT_DISABLE_LLM === "1") {
    fail("AGENT_DISABLE_LLM_MUST_BE_UNSET");
  }

  const stage = requireValue("L3B_PRODUCTION_GATE_STAGE");
  if (!STAGES.has(stage)) fail("INVALID_STAGE");
  const acceptedHead = requireValue("L3B_PRODUCTION_GATE_ACCEPTED_HEAD");
  const acceptedConfigHash = requireValue(
    "L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH",
  );
  const payloadSecret = requireValue("PAYLOAD_SECRET");
  const preflightOnly = process.env.L3B_PRODUCTION_GATE_PREFLIGHT_ONLY === "1";
  const reportPath = REPORT_PATHS[stage];

  const cases = getL3BProductionStageCases(stage);
  const rounds = Object.freeze([...new Set(cases.map(({ round }) => round))]);
  const fixtureIds = Object.freeze([
    ...new Set(cases.map(({ fixtureId }) => fixtureId)),
  ]);
  const retryLimits = Object.freeze({
    answerAttemptsPerObservation: 1,
    fullSchemaRetries: L3B_EVALUATION_CONFIG.schemaRetries,
    fullTransportRetries: L3B_EVALUATION_CONFIG.transportRetries,
    residualSchemaRetries: RESIDUAL_PLANNER_RETRY_POLICY.maxSchemaRetries,
    residualTransportRetries:
      RESIDUAL_PLANNER_RETRY_POLICY.maxTransportRetries,
  });
  const conservativeAttemptsPerObservation = retryLimits.answerAttemptsPerObservation
    + (retryLimits.fullSchemaRetries + 1)
      * (retryLimits.fullTransportRetries + 1)
    + (retryLimits.residualSchemaRetries + 1)
      * (retryLimits.residualTransportRetries + 1);
  const stageBudget = calculateProductionStageAuthorizedBudget({
    authenticatedActor: ACTOR,
    retryLimits,
    stage,
  });
  const authorizedMaximum = stageBudget.providerAttempts;
  const currentHead = git("rev-parse", "HEAD");
  const disclosureManifest = createProductionGateDisclosureManifest({
    cases,
    evaluationConfigHash: L3B_EVALUATION_CONFIG_HASH,
    logicalCallMaximum: stageBudget.logicalCalls,
    providerAttemptMaximum: stageBudget.providerAttempts,
    providerAttemptsPerObservationMaximum:
      PROVIDER_ATTEMPTS_PER_OBSERVATION_MAXIMUM,
    reportPath,
    stage,
  });
  const budget = Object.freeze({
    actualProviderAttempts: 0,
    authorizedLogicalCallMaximum: stageBudget.logicalCalls,
    authorizedMaximum,
    businessObservations: cases.length,
    conservativeAttemptsPerObservation,
    providerAttemptsPerObservationMaximum:
      PROVIDER_ATTEMPTS_PER_OBSERVATION_MAXIMUM,
    retryLimits,
  });
  const preflightBase = Object.freeze({
    budget,
    evaluationConfigHash: L3B_EVALUATION_CONFIG_HASH,
    evaluationConfigVersion: L3B_EVALUATION_CONFIG.evaluationConfigVersion,
    fixtureIds,
    head: currentHead,
    manifestHash: disclosureManifest.hash,
    observationCount: cases.length,
    protocolVersion: L3B_PRODUCTION_GATE_PROTOCOL_VERSION,
    providerAttempts: 0,
    reportPath,
    rounds,
    stage,
  });
  preflightForFailure = preflightBase;

  if (acceptedHead !== currentHead) fail("ACCEPTED_HEAD_MISMATCH");
  if (acceptedConfigHash !== L3B_EVALUATION_CONFIG_HASH) {
    fail("ACCEPTED_CONFIG_HASH_MISMATCH");
  }
  const acceptedManifestHash =
    process.env.L3B_PRODUCTION_GATE_ACCEPTED_MANIFEST_HASH?.trim() ?? "";
  if (!preflightOnly || acceptedManifestHash) {
    if (!acceptedManifestHash) {
      fail("MISSING_L3B_PRODUCTION_GATE_ACCEPTED_MANIFEST_HASH");
    }
    if (acceptedManifestHash !== disclosureManifest.hash) {
      fail("ACCEPTED_MANIFEST_HASH_MISMATCH");
    }
  }
  if (git("status", "--porcelain")) fail("WORKTREE_NOT_CLEAN");
  if (await exists(reportPath)) fail("REPORT_PATH_EXISTS");

  const preflight = Object.freeze({ ...preflightBase, status: "ready" });
  process.stdout.write(`${JSON.stringify({ preflight })}\n`);
  if (preflightOnly) return;

  const apiKey = requireValue("DEEPSEEK_API_KEY");
  const [
    { createModelConfig },
    { evaluateProductionGateCase },
    { aggregateProductionGate },
    {
      createProductionAnswerAdapter,
      createProductionFullAdapter,
      createProductionResidualObserver,
    },
    {
      createModelCallAuthorizer,
      createModelCallBudgetRecorder,
      projectModelCallBudget,
    },
  ] = await Promise.all([
    import("../src/lib/agent/llm/model-config.ts"),
    import("../src/lib/agent/orchestration/hybrid-production-evaluation.ts"),
    import("../src/lib/agent/orchestration/l3b-production-gate.ts"),
    import("../src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts"),
    import("../src/lib/agent/orchestration/model-call-budget.ts"),
  ]);

  process.stdout.write(`${JSON.stringify({
    liveCallBudget: budget,
    providerAttempts: actualProviderAttempts,
  })}\n`);

  const fullModelConfig = createModelConfig({
    apiKey,
    baseURL: L3B_EVALUATION_CONFIG.baseURL,
    maxOutputTokens: L3B_EVALUATION_CONFIG.orchestratorMaxOutputTokens,
    maxRetries: 0,
    model: L3B_EVALUATION_CONFIG.model,
    provider: L3B_EVALUATION_CONFIG.provider,
    structuredOutputMode: L3B_EVALUATION_CONFIG.structuredOutputMode,
    temperature: L3B_EVALUATION_CONFIG.temperature,
    thinkingMode: L3B_EVALUATION_CONFIG.orchestratorThinkingMode,
    timeoutMs: L3B_EVALUATION_CONFIG.orchestratorTimeoutMs,
  });
  const answerModelConfig = createModelConfig({
    apiKey,
    baseURL: L3B_EVALUATION_CONFIG.baseURL,
    maxOutputTokens: L3B_EVALUATION_CONFIG.answerMaxOutputTokens,
    maxRetries: 0,
    model: L3B_EVALUATION_CONFIG.model,
    provider: L3B_EVALUATION_CONFIG.provider,
    structuredOutputMode: L3B_EVALUATION_CONFIG.structuredOutputMode,
    temperature: L3B_EVALUATION_CONFIG.temperature,
    thinkingMode: L3B_EVALUATION_CONFIG.orchestratorThinkingMode,
    timeoutMs: L3B_EVALUATION_CONFIG.answerTotalTimeoutMs,
  });
  if (!("apiKey" in fullModelConfig) || !("apiKey" in answerModelConfig)) {
    fail("MODEL_CONFIG_INVALID");
  }

  const observations = [];
  const providerEvents = [];
  const authorizer = createModelCallAuthorizer({
    logicalCallMaximum: stageBudget.logicalCalls,
    providerAttemptMaximum: stageBudget.providerAttempts,
    providerAttemptsPerObservationMaximum:
      PROVIDER_ATTEMPTS_PER_OBSERVATION_MAXIMUM,
  });
  for (const [index, entry] of cases.entries()) {
    if (actualProviderAttempts >= authorizedMaximum) {
      fail("LIVE_CALL_BUDGET_EXHAUSTED");
    }
    authorizer.beginObservation();
    const recorder = createModelCallBudgetRecorder({ authorizer });
    const observe = (event) => providerEvents.push(event);
    const residualObserver = createProductionResidualObserver({ observe });
    const fullOrchestratorAdapter = createProductionFullAdapter({
      modelConfig: fullModelConfig,
      observe,
      recorder,
      retryBudget: {
        schema: L3B_EVALUATION_CONFIG.schemaRetries,
        transport: L3B_EVALUATION_CONFIG.transportRetries,
      },
    });
    const answerAdapter = createProductionAnswerAdapter({
      modelConfig: answerModelConfig,
      observe,
      recorder,
      timeouts: {
        firstTokenMs: L3B_EVALUATION_CONFIG.answerFirstTokenTimeoutMs,
        totalMs: L3B_EVALUATION_CONFIG.answerTotalTimeoutMs,
      },
    });
    let observation;
    try {
      observation = await evaluateProductionGateCase({
        answerAdapter,
        authenticatedActor: ACTOR,
        fixture: entry.source,
        fullOrchestratorAdapter,
        modelCallRecorder: recorder,
        observationIndex: index + 1,
        residualModelConfig: fullModelConfig,
        residualPlannerProviderAttemptObserver: residualObserver,
        round: entry.round,
      });
    } finally {
      actualProviderAttempts += providerAttemptCount(projectModelCallBudget(recorder.snapshot()));
      if (
        actualProviderAttempts
        !== authorizer.snapshot().providerAttempts
      ) {
        fail("LIVE_CALL_ACCOUNTING_MISMATCH");
      }
      if (actualProviderAttempts > authorizedMaximum) {
        fail("LIVE_CALL_BUDGET_EXCEEDED");
      }
    }
    observations.push(observation);
  }

  const summary = aggregateProductionGate({
    observations,
    providerEvents,
    stage,
  });
  const actualLogicalCalls = observations.reduce(
    (total, observation) => total + logicalCallCount(observation.callAccounting),
    0,
  );
  const report = Object.freeze({
    actualCallCounts: Object.freeze({
      logicalCalls: actualLogicalCalls,
      providerAttempts: actualProviderAttempts,
    }),
    evaluationConfigHash: L3B_EVALUATION_CONFIG_HASH,
    evaluationConfigVersion: L3B_EVALUATION_CONFIG.evaluationConfigVersion,
    fixtureIds,
    head: currentHead,
    manifestHash: disclosureManifest.hash,
    observationCount: observations.length,
    observations: Object.freeze(observations.map(projectObservation)),
    protocolVersion: L3B_PRODUCTION_GATE_PROTOCOL_VERSION,
    rounds,
    stage,
    summary,
  });
  const sensitiveValues = [
    apiKey,
    payloadSecret,
    ACTOR.id,
    ...cases.flatMap(({ source }) =>
      collectSensitiveFixtureValues(source)
    ),
  ];
  assertReportSafe(report, sensitiveValues);
  const encoded = JSON.stringify(report, null, 2);
  await writeReport(reportPath, encoded);
  process.stdout.write(`${JSON.stringify({
    actualLogicalCalls,
    actualProviderAttempts,
    passed: summary.passed,
    reportPath,
    stage,
  })}\n`);
};

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const failureCode = classifyProductionSeamFailure(error);
    process.stderr.write(`${JSON.stringify({
      failureCode,
      preflight: preflightForFailure
        ? { ...preflightForFailure, failureCode, status: "blocked" }
        : null,
      providerAttempts: actualProviderAttempts,
    })}\n`);
    process.exitCode = 1;
  });
}
