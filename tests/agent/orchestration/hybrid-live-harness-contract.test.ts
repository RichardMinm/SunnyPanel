import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { OrchestratorTask } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

type ProductionObservation = Readonly<{
  answerLogicalCalls: number;
  answerProviderAttempts: number;
  boundaryResolutionKind: "clarify" | "compound" | "not_applicable" | "pure_query";
  businessMutations: number;
  candidateValidationResult: "not_called" | "rejected" | "valid";
  databaseConnections: number;
  finalDependencies: readonly Readonly<{
    dependsOn: readonly string[];
    taskId: string;
  }>[];
  finalTaskIntents: readonly string[];
  fixedQueryIntent: string | null;
  fixedTaskOwnership: "deterministic_query_boundary" | null;
  fullOrchestratorLogicalCalls: number;
  fullOrchestratorProviderAttempts: number;
  mapperReached: boolean;
  queryCommentaryLogicalCalls: number;
  queryCommentaryProviderAttempts: number;
  queryDispatcherDecision: "adopted" | "legacy" | "not_called";
  replanLogicalCalls: number;
  replanProviderAttempts: number;
  residualPlannerLogicalCalls: number;
  residualPlannerProviderAttempts: number;
  specialistLogicalCalls: number;
  specialistProviderAttempts: number;
  taskExecutions: number;
  unexpectedDuplicateModelCalls: number;
  usableStatus: "unavailable" | "usable";
}>;

type ProductionEvaluationModule = Readonly<{
  evaluateHybridProductionCase: (input: Readonly<{
    authenticatedActor: Readonly<{
      collection: "users";
      id: number;
      isAdmin: boolean;
    }>;
    context: AgentPromptContext;
    fixtureId: string;
    fullOrchestratorAdapter?: () => Promise<Readonly<{
      mode: "single";
      reasoning: string;
      source: "llm";
      tasks: readonly Readonly<{
        agentRole: "query";
        args: Readonly<{ answer: string }>;
        dependsOn: readonly string[];
        id: string;
        intent: "answer_question";
        label: string;
      }>[];
    }>>;
    message: string;
    queryAdoption: "admin" | "off";
    queryCommentaryAdapter?: () => Promise<Readonly<{
      latencyMs: number;
      modelCalls: 0;
      reason: "provider_error";
      status: "omitted";
      ttftMs: null;
    }>>;
    queryRuntime: "langchain" | "legacy";
    residualInvoke: (
      attempt: number,
    ) => Promise<readonly OrchestratorTask[]>;
  }>) => Promise<ProductionObservation>;
}>;

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-07-17T12:00:00.000+08:00",
  pendingAction: null,
  plans: [{
    id: 101,
    priority: "medium",
    state: "active",
    title: "考研数学复习计划",
  }],
};

const loadHarness = () => loadR4AGreenModule<ProductionEvaluationModule>(
  R4A_GREEN_MODULES.productionEvaluation,
  "hybrid_production_evaluation",
);

const omitCommentary = async () => ({
  latencyMs: 0,
  modelCalls: 0 as const,
  reason: "provider_error" as const,
  status: "omitted" as const,
  ttftMs: null,
});

test("production evaluator owns only the real production entry and Dispatcher seams", () => {
  const source = readFileSync(
    "src/lib/agent/orchestration/hybrid-production-evaluation.ts",
    "utf8",
  );
  assert.match(source, /runOrchestrationStep\(/);
  assert.match(source, /dispatchPreResolvedQuery\(/);
  assert.doesNotMatch(
    source,
    /runHybridOrchestration|runLangChainOrchestratorResult|runResidualPlanner\(|composeFixedTaskPlan\(/,
  );
});

test("explicit Hybrid script fails closed before imports without live approval", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/agent-hybrid-query-boundary-eval.mjs",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
      },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    errorCode: "MISSING_AGENT_HYBRID_QUERY_BOUNDARY_EVAL",
    passed: false,
  });
});

test("explicit Hybrid script freezes approval, clean HEAD, /tmp report, and failed-gate exit", () => {
  const source = readFileSync(
    "scripts/agent-hybrid-query-boundary-eval.mjs",
    "utf8",
  );
  assert.match(source, /L3B_HYBRID_PROVIDER_DATA_APPROVED/);
  assert.match(source, /L3B_HYBRID_GATE_ACCEPTED_HEAD/);
  assert.match(source, /DATABASE_URL_MUST_BE_UNSET/);
  assert.match(source, /assertHybridFocusedGatePreflight/);
  assert.match(source, /buildHybridFocusedGatePreflight/);
  assert.match(source, /assertHybridFocusedGateReportReady/);
  assert.match(source, /runHybridFocusedGate/);
  assert.match(source, /writeHybridFocusedGateReport/);
  assert.match(source, /if \(!summary\.passed\) process\.exitCode = 1/);
  assert.doesNotMatch(source, /Targeted\s*15|Fresh\s*99/);

  const reportReady = source.indexOf(
    "assertHybridFocusedGateReportReady()",
  );
  const preflight = source.indexOf(
    "buildHybridFocusedGatePreflight(",
  );
  const preflightValidation = source.indexOf(
    "assertHybridFocusedGatePreflight(preflight)",
  );
  const preflightOutput = source.indexOf(
    "process.stdout.write(`${JSON.stringify({",
    preflightValidation,
  );
  const modelConfig = source.indexOf(
    "const modelConfig = createModelConfig({",
    preflightOutput,
  );
  const runner = source.indexOf("runHybridFocusedGate({");
  const evaluation = source.indexOf(
    "evaluateHybridProductionCase({",
    runner,
  );
  assert.equal(reportReady >= 0, true);
  assert.equal(preflight > reportReady, true);
  assert.equal(preflightValidation > preflight, true);
  assert.equal(preflightOutput > preflightValidation, true);
  assert.equal(modelConfig > preflightOutput, true);
  assert.equal(runner > modelConfig, true);
  assert.equal(evaluation > runner, true);
});

test("production harness runs pure Query through the real dispatcher adoption gate", async () => {
  const { evaluateHybridProductionCase } = await loadHarness();

  const adopted = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context,
    fixtureId: "qry-1",
    message: "看看我的工作计划进度",
    queryAdoption: "admin",
    queryCommentaryAdapter: omitCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query must not call Residual"),
  });
  assert.equal(adopted.boundaryResolutionKind, "pure_query");
  assert.equal(adopted.queryDispatcherDecision, "adopted");
  assert.equal(adopted.fullOrchestratorLogicalCalls, 0);
  assert.equal(adopted.residualPlannerLogicalCalls, 0);

  const adoptionOff = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context,
    fixtureId: "qry-1-off",
    message: "看看我的工作计划进度",
    queryAdoption: "off",
    queryCommentaryAdapter: omitCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query must not call Residual"),
  });
  assert.equal(adoptionOff.queryDispatcherDecision, "legacy");

  const untrusted = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: false },
    context,
    fixtureId: "qry-1-untrusted",
    message: "看看我的工作计划进度",
    queryAdoption: "admin",
    queryCommentaryAdapter: omitCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query must not call Residual"),
  });
  assert.equal(untrusted.queryDispatcherDecision, "legacy");
});

test("production harness routes Compound through real Composer, validator, and Mapper", async () => {
  const { evaluateHybridProductionCase } = await loadHarness();
  let residualAdapterCalls = 0;

  const observation = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context,
    fixtureId: "cmp-4",
    message: "检查项目进度，记录未完成的作为新任务",
    queryAdoption: "admin",
    queryCommentaryAdapter: omitCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => {
      residualAdapterCalls += 1;
      return [{
        agentRole: "plan",
        args: { title: "未完成任务" },
        dependsOn: [],
        id: "draft",
        intent: "compose_checklist",
        label: "整理未完成任务",
      }];
    },
  });

  assert.equal(residualAdapterCalls, 1);
  assert.equal(observation.boundaryResolutionKind, "compound");
  assert.equal(observation.candidateValidationResult, "valid");
  assert.equal(observation.mapperReached, true);
  assert.equal(
    observation.fixedTaskOwnership,
    "deterministic_query_boundary",
  );
  assert.equal(observation.fixedQueryIntent, "query_progress");
  assert.deepEqual(observation.finalTaskIntents, [
    "query_progress",
    "compose_checklist",
  ]);
  assert.equal(observation.fullOrchestratorLogicalCalls, 0);
  assert.equal(observation.residualPlannerLogicalCalls, 1);
  assert.equal(observation.residualPlannerProviderAttempts, 1);
  assert.equal(observation.unexpectedDuplicateModelCalls, 0);
  assert.equal(observation.databaseConnections, 0);
  assert.equal(observation.businessMutations, 0);
  assert.equal(observation.taskExecutions, 0);
});

test("production observation has complete role counters and retains no raw fixture data", async () => {
  const { evaluateHybridProductionCase } = await loadHarness();
  const sentinel = "R4A_TASK5_SECRET_TITLE";
  const observation = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context: {
      ...context,
      plans: [{ ...context.plans[0], title: sentinel }],
    },
    fixtureId: "qry-secret",
    message: "看看我的工作计划进度",
    queryAdoption: "admin",
    queryCommentaryAdapter: omitCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query must not call Residual"),
  });

  for (const field of [
    "fullOrchestratorLogicalCalls",
    "fullOrchestratorProviderAttempts",
    "residualPlannerLogicalCalls",
    "residualPlannerProviderAttempts",
    "queryCommentaryLogicalCalls",
    "queryCommentaryProviderAttempts",
    "answerLogicalCalls",
    "answerProviderAttempts",
    "specialistLogicalCalls",
    "specialistProviderAttempts",
    "replanLogicalCalls",
    "replanProviderAttempts",
    "unexpectedDuplicateModelCalls",
  ] as const) {
    assert.equal(typeof observation[field], "number", field);
  }
  assert.doesNotMatch(JSON.stringify(observation), new RegExp(sentinel));
});

test("production harness keeps deterministic clarify at zero model calls", async () => {
  const { evaluateHybridProductionCase } = await loadHarness();
  const observation = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context,
    fixtureId: "qry-invalid",
    message: "检查不存在的计划 999 的完成情况",
    queryAdoption: "admin",
    queryCommentaryAdapter: omitCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("clarify must not call Residual"),
  });

  assert.equal(observation.boundaryResolutionKind, "clarify");
  assert.equal(observation.queryDispatcherDecision, "not_called");
  assert.equal(observation.fullOrchestratorLogicalCalls, 0);
  assert.equal(observation.residualPlannerLogicalCalls, 0);
  assert.equal(observation.queryCommentaryLogicalCalls, 0);
  assert.equal(observation.answerLogicalCalls, 0);
  assert.equal(observation.specialistLogicalCalls, 0);
  assert.equal(observation.unexpectedDuplicateModelCalls, 0);
});

test("not-applicable production turn uses the injected Full adapter exactly once", async () => {
  const { evaluateHybridProductionCase } = await loadHarness();
  let fullAdapterCalls = 0;
  const observation = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context,
    fixtureId: "full-1",
    fullOrchestratorAdapter: async () => {
      fullAdapterCalls += 1;
      return {
        mode: "single",
        reasoning: "回答一般问题",
        source: "llm",
        tasks: [{
          agentRole: "query",
          args: { answer: "测试回答" },
          dependsOn: [],
          id: "t1",
          intent: "answer_question",
          label: "回答问题",
        }],
      };
    },
    message: "解释一下什么是任务依赖",
    queryAdoption: "admin",
    queryCommentaryAdapter: omitCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("full path must not call Residual"),
  });

  assert.equal(fullAdapterCalls, 1);
  assert.equal(observation.boundaryResolutionKind, "not_applicable");
  assert.equal(observation.fullOrchestratorLogicalCalls, 1);
  assert.equal(observation.residualPlannerLogicalCalls, 0);
  assert.equal(observation.unexpectedDuplicateModelCalls, 0);
});
