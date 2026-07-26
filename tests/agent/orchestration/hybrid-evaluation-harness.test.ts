import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import type {
  HybridEvaluationModule,
  HybridOrchestrationResult,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  aggregateMetadata,
  aggregateQueryTask,
  residualWriteTask,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const cmp4Result = (secret = "safe"): HybridOrchestrationResult => ({
  boundaryResolution: "compound",
  callAccounting: {
    fullOrchestratorLogicalCalls: 0,
    fullOrchestratorProviderAttempts: 0,
    queryCommentaryLogicalCalls: 0,
    residualPlannerLogicalCalls: 1,
    residualPlannerProviderAttempts: 1,
    unexpectedDuplicateModelCalls: 0,
  },
  candidate: {
    fixedTaskMetadata: [aggregateMetadata("t1")],
    output: {
      decisionCode: "compound_ready",
      mode: "compound",
      routingSummary: "读取进度并整理任务",
      tasks: [
        aggregateQueryTask("t1"),
        { ...residualWriteTask("t2", ["t1"]), args: { title: secret } },
      ],
      version: 2,
    } satisfies OrchestratorOutput,
  },
  queryDispatcherSelection: "not_called",
  status: "usable",
});

test("the historical Full-only Gate is retired outside the R4 product path", () => {
  const source = readFileSync("scripts/agent-orchestrator-canary-eval.mjs", "utf8");
  assert.match(source, /L3B_AUTHORITATIVE_GATE_RETIRED/);
  assert.match(source, /replacement:\s*"production_seam_gate"/);
  assert.doesNotMatch(source, /runLangChainOrchestratorResult/);
  assert.doesNotMatch(source, /runHybridOrchestration/);
});

test("the hybrid evaluator records the required counters and Boundary task ownership", async () => {
  const { evaluateHybridQueryBoundaryCase } = await loadR4AGreenModule<HybridEvaluationModule>(
    R4A_GREEN_MODULES.evaluation,
    "hybrid_evaluation_counter_contract",
  );
  const observation = await evaluateHybridQueryBoundaryCase({
    fixtureId: "cmp-4",
    runHybridPath: async () => cmp4Result(),
  });
  assert.deepEqual(observation, {
    boundaryResolution: "compound",
    finalDependencies: [
      { dependsOn: [], taskId: "t1" },
      { dependsOn: ["t1"], taskId: "t2" },
    ],
    finalTaskIntents: ["query_progress", "compose_checklist"],
    finalUsableStatus: "usable",
    fixtureId: "cmp-4",
    fixedTaskOwnership: "deterministic_query_boundary",
    fullOrchestratorLogicalCalls: 0,
    queryCommentaryLogicalCalls: 0,
    queryDispatcherSelection: "not_called",
    residualPlannerLogicalCalls: 1,
  });
});

test("hybrid observations exclude raw request, workspace data, prompts, responses, and secrets", async () => {
  const { evaluateHybridQueryBoundaryCase } = await loadR4AGreenModule<HybridEvaluationModule>(
    R4A_GREEN_MODULES.evaluation,
    "hybrid_evaluation_sanitized_observation",
  );
  const sentinel = "R4A_SECRET_WORKSPACE_TITLE";
  const observation = await evaluateHybridQueryBoundaryCase({
    fixtureId: "cmp-4",
    runHybridPath: async () => cmp4Result(sentinel),
  });
  const serialized = JSON.stringify(observation);
  assert.doesNotMatch(serialized, new RegExp(sentinel));
  for (const forbidden of [
    "message",
    "originalRequest",
    "planId",
    "prompt",
    "response",
    "reasoning",
    "secret",
    "workspace",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`\"${forbidden}\"`, "i"));
  }
});
