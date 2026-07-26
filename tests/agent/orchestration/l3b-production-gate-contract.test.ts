import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

import {
  L3B_EVALUATION_FIXTURES,
  L3B_KNOWN_ID_DIAGNOSTICS,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  L3B_EVALUATION_CONFIG_HASH,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-config";
import {
  assertProductionStageFixtureIds,
  getL3BProductionStageCases,
  L3BProductionGateContractError,
  L3B_PRODUCTION_EXPECTED_BRANCHES,
  L3B_PRODUCTION_FOCUSED_FIXTURE_IDS,
  L3B_PRODUCTION_GATE_PROTOCOL_VERSION,
  L3B_PRODUCTION_STAGE_CONTRACTS,
} from "../../../src/lib/agent/orchestration/l3b-production-gate-contract";
import { calculateProductionStageAuthorizedBudget } from "../../../src/lib/agent/orchestration/l3b-production-gate-budget";
import {
  assertReportSafe,
  classifyProductionSeamFailure,
} from "../../../scripts/agent-production-seam-gate-eval.mjs";
import {
  ProductionGateReportSafetyError,
} from "../../../src/lib/agent/orchestration/l3b-production-gate-report";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

type ProductionGatePreflight = Readonly<{
  budget: Readonly<{
    actualProviderAttempts: number;
    authorizedLogicalCallMaximum: number;
    authorizedMaximum: number;
    businessObservations: number;
    providerAttemptsPerObservationMaximum: number;
  }>;
  evaluationConfigHash: string;
  fixtureIds: readonly string[];
  manifestHash: string;
  observationCount: number;
  providerAttempts: number;
  reportPath: string;
  rounds: readonly number[];
  stage: string;
  status: string;
}>;

type ProductionGateProcessMessage = Readonly<{
  failureCode?: string;
  preflight?: ProductionGatePreflight | null;
  providerAttempts?: number;
}>;

const jsonLines = (value: string): ProductionGateProcessMessage[] =>
  value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as ProductionGateProcessMessage);

const reportSnapshot = (path: string) => {
  if (!existsSync(path)) return { exists: false } as const;
  const { mode, mtimeMs, size } = statSync(path);
  return { exists: true, mode, mtimeMs, size } as const;
};

test("the persisted report accepts bounded signals and legitimate metrics", () => {
  const safeReport = {
    actualCallCounts: {
      logicalCalls: 101,
      providerAttempts: 2,
    },
    observations: [{
      fixtureId: "diag-plan-existing-id",
      roleEvidence: {
        fullOrchestrator: {
          schedulePlanReferenceCorrectionCode: "provider_plan_id_rebound",
        },
      },
    }],
    summary: { metrics: { provider: { providerPlanIdRebounds: 2 } } },
  };

  assert.doesNotThrow(() => assertReportSafe(safeReport, [101]));
});

test("the persisted report accepts a null semantic projection for roles that were not called", () => {
  const safeReport = {
    observations: [{
      roleEvidence: {
        fullOrchestrator: {
          semanticProjection: null,
        },
      },
    }],
  };

  assert.doesNotThrow(() => assertReportSafe(safeReport, []));
  assert.throws(
    () => assertReportSafe({ summary: null }, []),
    (error: unknown) =>
      error instanceof Error && error.message === "REPORT_SHAPE_UNSAFE",
  );
});

test("the persisted report accepts typed request-semantic clarification evidence", () => {
  const safeReport = {
    observations: [{
      roleEvidence: {
        fullOrchestrator: {
          clarificationSource: "request_semantic_boundary",
          requestSemanticBoundaryErrorCode:
            "unfinished_items_schedule_non_clarify",
        },
      },
    }],
  };

  assert.doesNotThrow(() => assertReportSafe(safeReport, []));
});

test("report safety failures retain a typed terminal failure code", () => {
  for (const code of [
    "REPORT_RETENTION_UNSAFE",
    "REPORT_SHAPE_UNSAFE",
  ] as const) {
    assert.equal(
      classifyProductionSeamFailure(
        new ProductionGateReportSafetyError(code),
      ),
      code,
    );
  }
});

test("the report validator recursively rejects every raw and identity category", () => {
  const base = {
    observations: [{
      fixtureId: "diag-plan-existing-id",
      roleEvidence: {
        fullOrchestrator: {
          schedulePlanReferenceCorrectionCode: "provider_plan_id_rebound",
        },
      },
    }],
    summary: { metrics: { provider: { providerPlanIdRebounds: 2 } } },
  };
  const forbidden = [
    "message",
    "content",
    "title",
    "prompt",
    "response",
    "reasoning",
    "error",
    "stack",
    "credentials",
    "secret",
    "taskId",
    "planId",
    "resourceId",
    "checklistId",
    "scheduleItemId",
  ] as const;

  for (const key of forbidden) {
    const unsafe = structuredClone(base);
    Object.assign(
      unsafe.observations[0]!.roleEvidence.fullOrchestrator,
      { [key]: key.endsWith("Id") ? 101 : "never-retain" },
    );
    assert.throws(
      () => assertReportSafe(unsafe, []),
      (error: unknown) =>
        error instanceof Error && error.message === "REPORT_SHAPE_UNSAFE",
      key,
    );
  }
});

test("the report validator rejects exact string and numeric fixture values outside metric slots", () => {
  const rawMessage = "把计划 101 安排到下周";
  const numericResourceId = 101;
  const stringUnsafe = {
    observations: [{ fixtureId: rawMessage }],
  };
  const numericUnsafe = {
    observations: [{ fixtureId: numericResourceId }],
  };

  for (const unsafe of [stringUnsafe, numericUnsafe]) {
    assert.throws(
      () => assertReportSafe(unsafe, [rawMessage, numericResourceId]),
      (error: unknown) =>
        error instanceof Error && error.message === "REPORT_RETENTION_UNSAFE",
    );
  }
});

test("the report validator rejects a stringified sensitive numeric fixture identity", () => {
  assert.throws(
    () => assertReportSafe({ fixtureIds: ["101"] }, [101]),
    (error: unknown) =>
      error instanceof Error && error.message === "REPORT_RETENTION_UNSAFE",
  );
});

test("the report validator rejects embedded secrets and unrecognized categorical values", () => {
  assert.throws(
    () => assertReportSafe(
      { observations: [{ failureCodes: ["prefix-secret-value-suffix"] }] },
      ["secret-value"],
    ),
    (error: unknown) =>
      error instanceof Error && error.message === "REPORT_RETENTION_UNSAFE",
  );
  assert.throws(
    () => assertReportSafe(
      { observations: [{ failureCodes: ["rawProviderToken"] }] },
      [],
    ),
    (error: unknown) =>
      error instanceof Error && error.message === "REPORT_SHAPE_UNSAFE",
  );
});

test("the report validator permits a sensitive numeric value only in the rounds metric", () => {
  assert.doesNotThrow(() => assertReportSafe({ rounds: [1] }, [1]));
  assert.throws(
    () => assertReportSafe({ observations: [{ fixtureId: 1 }] }, [1]),
    (error: unknown) =>
      error instanceof Error && error.message === "REPORT_RETENTION_UNSAFE",
  );
});

test("the disclosure manifest binds stage, complete ordered data, report path, and ceilings", async () => {
  const modulePath =
    "../../../src/lib/agent/orchestration/l3b-production-gate-manifest";
  const manifestModule = await import(modulePath).catch(() => null) as null | {
    createProductionGateDisclosureManifest: (input: Readonly<{
      cases: readonly unknown[];
      evaluationConfigHash: string;
      logicalCallMaximum: number;
      providerAttemptMaximum: number;
      providerAttemptsPerObservationMaximum: number;
      reportPath: string;
      stage: "acceptance" | "focused" | "known_id" | "stability";
    }>) => Readonly<{
      hash: string;
      manifest: Readonly<{
        fullOrchestrator: Readonly<{
          strictSchemaFingerprint: string;
          systemRulesFingerprint: string;
        }>;
        residualPlanner: readonly unknown[];
      }>;
    }>;
  };
  assert.ok(manifestModule);
  const cases = getL3BProductionStageCases("known_id");
  const base = {
    cases,
    evaluationConfigHash: L3B_EVALUATION_CONFIG_HASH,
    logicalCallMaximum: 6,
    providerAttemptMaximum: 24,
    providerAttemptsPerObservationMaximum: 4,
    reportPath: "/tmp/l3b-r8-production-known-id-v4.json",
    stage: "known_id" as const,
  };
  const canonical = manifestModule.createProductionGateDisclosureManifest(base);
  assert.match(canonical.hash, /^[a-f0-9]{64}$/u);
  assert.match(
    canonical.manifest.fullOrchestrator.systemRulesFingerprint,
    /^[a-f0-9]{64}$/u,
  );
  assert.match(
    canonical.manifest.fullOrchestrator.strictSchemaFingerprint,
    /^[a-f0-9]{64}$/u,
  );

  const changedInputs = [
    { ...base, stage: "focused" as const },
    { ...base, cases: [cases[1], cases[0], ...cases.slice(2)] },
    {
      ...base,
      cases: cases.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              source: { ...entry.source, message: `${entry.source.message} ` },
            }
          : entry),
    },
    { ...base, reportPath: "/tmp/l3b-r8-production-known-id-v5.json" },
    { ...base, logicalCallMaximum: 7 },
    { ...base, providerAttemptMaximum: 25 },
    { ...base, providerAttemptsPerObservationMaximum: 5 },
  ] as const;
  for (const changed of changedInputs) {
    assert.notEqual(
      manifestModule.createProductionGateDisclosureManifest(changed).hash,
      canonical.hash,
    );
  }

  const focused = manifestModule.createProductionGateDisclosureManifest({
    ...base,
    cases: getL3BProductionStageCases("focused"),
    logicalCallMaximum: 9,
    reportPath: "/tmp/l3b-r8-production-focused.json",
    stage: "focused",
  });
  assert.ok(focused.manifest.residualPlanner.length > 0);
});

test("freezes the production gate protocol, exact stage sizes, and Focused order", () => {
  assert.equal(
    L3B_PRODUCTION_GATE_PROTOCOL_VERSION,
    "l3b-production-seam-stability-gate-v2",
  );
  assert.deepEqual(L3B_PRODUCTION_FOCUSED_FIXTURE_IDS, [
    "qry-1",
    "qry-4",
    "cmp-4",
    "wrt-1",
    "cmp-1",
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(L3B_PRODUCTION_STAGE_CONTRACTS).map(
      ([stage, contract]) => [
        stage,
        contract.fixtureIds.length * contract.rounds.length,
      ],
    )),
    { acceptance: 33, focused: 15, known_id: 6, stability: 99 },
  );
  assert.deepEqual(L3B_PRODUCTION_EXPECTED_BRANCHES, {
    "qry-1": "pure_query",
    "qry-4": "deterministic_clarify",
    "cmp-4": "hybrid_compound",
    "wrt-1": "full_orchestrator",
    "cmp-1": "full_orchestrator",
  });
});

test("derives Provider authorization from the one reachable production branch per fixture", () => {
  const retryLimits = {
    answerAttemptsPerObservation: 1,
    fullSchemaRetries: 0,
    fullTransportRetries: 1,
    residualSchemaRetries: 1,
    residualTransportRetries: 1,
  } as const;
  const authenticatedActor = {
    collection: "users",
    id: 1,
    isAdmin: true,
  } as const;

  assert.deepEqual(
    calculateProductionStageAuthorizedBudget({
      authenticatedActor,
      retryLimits,
      stage: "focused",
    }),
    { logicalCalls: 9, providerAttempts: 24 },
  );
  assert.deepEqual(
    calculateProductionStageAuthorizedBudget({
      authenticatedActor,
      retryLimits,
      stage: "acceptance",
    }),
    { logicalCalls: 34, providerAttempts: 65 },
  );
});

test("derives every stage case from the canonical fixture objects by identity", () => {
  const acceptance = getL3BProductionStageCases("acceptance");
  const stability = getL3BProductionStageCases("stability");
  const knownId = getL3BProductionStageCases("known_id");
  assert.equal(L3B_KNOWN_ID_DIAGNOSTICS.length, 6);
  const conflict = L3B_KNOWN_ID_DIAGNOSTICS.at(-1);
  assert.equal(conflict?.id, "diag-plan-title-conflicting-id");
  assert.equal(conflict?.message, "把英语复习计划 101 安排到下周");
  assert.deepEqual(
    conflict?.context.plans.map(({ id }) => id),
    [101, 102],
  );

  assert.deepEqual(
    acceptance.map(({ fixtureId }) => fixtureId),
    L3B_EVALUATION_FIXTURES.map(({ id }) => id),
  );
  acceptance.forEach((entry, index) => {
    assert.equal(entry.source, L3B_EVALUATION_FIXTURES[index]);
  });
  knownId.forEach((entry, index) => {
    assert.equal(entry.source, L3B_KNOWN_ID_DIAGNOSTICS[index]);
  });
  assert.equal(
    hash(acceptance.map(({ source }) => source)),
    hash(L3B_EVALUATION_FIXTURES),
  );
  assert.equal(
    hash(knownId.map(({ source }) => source)),
    hash(L3B_KNOWN_ID_DIAGNOSTICS),
  );
  for (const entry of stability) {
    assert.equal(
      entry.source,
      L3B_EVALUATION_FIXTURES.find(({ id }) => id === entry.fixtureId),
    );
  }
  assert.equal(new Set(L3B_EVALUATION_FIXTURES.map(({ id }) => id)).size, 33);
  assert.equal(new Set(L3B_KNOWN_ID_DIAGNOSTICS.map(({ id }) => id)).size, 6);
});

test("uses deterministic round-major stage order", () => {
  assert.deepEqual(
    getL3BProductionStageCases("focused").map(
      ({ fixtureId, round }) => `${round}:${fixtureId}`,
    ),
    [1, 2, 3].flatMap((round) =>
      L3B_PRODUCTION_FOCUSED_FIXTURE_IDS.map((id) => `${round}:${id}`)
    ),
  );
});

test("settles Provider attempts in finally and retains the Known-ID outcome", () => {
  const source = readFileSync(
    "scripts/agent-production-seam-gate-eval.mjs",
    "utf8",
  );
  const evaluation = source.indexOf("await evaluateProductionGateCase({");
  const settlement = source.indexOf(
    "providerAttemptCount(projectModelCallBudget(recorder.snapshot()))",
    evaluation,
  );
  const finallyBlock = source.lastIndexOf("finally", settlement);

  assert.notEqual(evaluation, -1);
  assert.ok(finallyBlock > evaluation);
  assert.ok(settlement > finallyBlock);
  assert.doesNotMatch(
    source,
    /providerAttemptCount\(recorder\.snapshot\(\)\)/u,
  );
  assert.match(
    source,
    /knownIdOutcome:\s*observation\.knownIdOutcome/u,
  );
  assert.match(
    source,
    /knownIdRejectionSource:\s*observation\.knownIdRejectionSource/u,
  );
  assert.match(
    source,
    /createModelCallBudgetRecorder,\s*projectModelCallBudget/u,
  );
});

test("fails typed for missing, duplicate, extra, and reordered fixture IDs", () => {
  const expected = [...L3B_PRODUCTION_STAGE_CONTRACTS.focused.fixtureIds];
  const cases = [
    ["fixture_missing", expected.slice(1)],
    ["fixture_duplicate", [...expected, expected[0]]],
    ["fixture_extra", [...expected, "extra-fixture"]],
    ["fixture_reordered", [expected[1], expected[0], ...expected.slice(2)]],
  ] as const;

  for (const [code, ids] of cases) {
    assert.throws(
      () => assertProductionStageFixtureIds("focused", ids),
      (error: unknown) =>
        error instanceof L3BProductionGateContractError
        && error.code === code
        && error.message === code,
    );
  }
});

test("the production-seam CLI reaches the canonical Known-ID preflight without a Provider key", () => {
  const reportPath = "/tmp/l3b-r8-production-known-id-v4.json";
  const preservedReportPaths = [
    "/tmp/l3b-r8-production-known-id.json",
    "/tmp/l3b-r8-production-known-id-v2.json",
    "/tmp/l3b-r8-production-known-id-v3.json",
  ] as const;
  const reportPaths = [reportPath, ...preservedReportPaths] as const;
  const reportsBefore = Object.fromEntries(
    reportPaths.map((path) => [path, reportSnapshot(path)]),
  );
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim().length > 0;

  const baseEnvironment: NodeJS.ProcessEnv = {
    AGENT_LIVE_LLM_EVAL: "1",
    AGENT_PRODUCTION_SEAM_EVAL: "1",
    HOME: process.env.HOME ?? "",
    L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH:
      L3B_EVALUATION_CONFIG_HASH,
    L3B_PRODUCTION_GATE_ACCEPTED_HEAD: head,
    L3B_PRODUCTION_GATE_PREFLIGHT_ONLY: "1",
    L3B_PRODUCTION_GATE_STAGE: "known_id",
    L3B_PRODUCTION_PROVIDER_DATA_APPROVED: "1",
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "",
    PAYLOAD_SECRET: "sunnypanel-agent-test-secret-2026",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
  };
  const runGate = (environment: NodeJS.ProcessEnv) => spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/agent-production-seam-gate-eval.mjs",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
    },
  );
  const child = runGate(baseEnvironment);

  const messages = [
    ...jsonLines(child.stdout),
    ...jsonLines(child.stderr),
  ];
  const terminal = messages.find(
    ({ preflight }) => preflight !== undefined,
  );
  assert.ok(terminal?.preflight);
  const preflight = terminal.preflight;

  assert.equal(preflight.stage, "known_id");
  assert.equal(preflight.observationCount, 6);
  assert.deepEqual(
    preflight.fixtureIds,
    L3B_KNOWN_ID_DIAGNOSTICS.map(({ id }) => id),
  );
  assert.deepEqual(preflight.rounds, [1]);
  assert.equal(preflight.reportPath, reportPath);
  assert.equal(preflight.evaluationConfigHash, L3B_EVALUATION_CONFIG_HASH);
  assert.match(preflight.manifestHash, /^[a-f0-9]{64}$/u);
  assert.equal(preflight.providerAttempts, 0);
  assert.equal(preflight.budget.businessObservations, 6);
  assert.equal(preflight.budget.authorizedLogicalCallMaximum, 6);
  assert.equal(preflight.budget.authorizedMaximum, 24);
  assert.equal(
    preflight.budget.providerAttemptsPerObservationMaximum,
    4,
  );
  assert.equal(preflight.budget.actualProviderAttempts, 0);

  const matchedChild = runGate({
    ...baseEnvironment,
    L3B_PRODUCTION_GATE_ACCEPTED_MANIFEST_HASH: preflight.manifestHash,
  });
  const matchedMessages = [
    ...jsonLines(matchedChild.stdout),
    ...jsonLines(matchedChild.stderr),
  ];
  const matchedTerminal = matchedMessages.find(
    ({ preflight: candidate }) => candidate !== undefined,
  );
  assert.equal(
    matchedTerminal?.preflight?.manifestHash,
    preflight.manifestHash,
  );
  assert.equal(matchedTerminal?.preflight?.providerAttempts, 0);

  const mismatchChild = runGate({
    ...baseEnvironment,
    DEEPSEEK_API_KEY: "unused-deterministic-placeholder",
    L3B_PRODUCTION_GATE_ACCEPTED_MANIFEST_HASH: "0".repeat(64),
    L3B_PRODUCTION_GATE_PREFLIGHT_ONLY: "0",
  });
  const mismatchMessages = [
    ...jsonLines(mismatchChild.stdout),
    ...jsonLines(mismatchChild.stderr),
  ];
  const mismatchTerminal = mismatchMessages.find(
    ({ failureCode }) =>
      failureCode === "ACCEPTED_MANIFEST_HASH_MISMATCH",
  );
  assert.equal(mismatchChild.status, 1);
  assert.equal(
    mismatchTerminal?.failureCode,
    "ACCEPTED_MANIFEST_HASH_MISMATCH",
  );
  assert.equal(mismatchTerminal?.providerAttempts, 0);
  assert.equal(
    mismatchTerminal?.preflight?.manifestHash,
    preflight.manifestHash,
  );

  if (dirty) {
    assert.equal(child.status, 1);
    assert.equal(terminal.failureCode, "WORKTREE_NOT_CLEAN");
    assert.equal(preflight.status, "blocked");
  } else if (reportsBefore[reportPath].exists) {
    assert.equal(child.status, 1);
    assert.equal(terminal.failureCode, "REPORT_PATH_EXISTS");
    assert.equal(preflight.status, "blocked");
  } else {
    assert.equal(child.status, 0);
    assert.equal(terminal.failureCode, undefined);
    assert.equal(preflight.status, "ready");
  }

  const reportsAfter = Object.fromEntries(
    reportPaths.map((path) => [path, reportSnapshot(path)]),
  );
  assert.deepEqual(reportsAfter, reportsBefore);
});
