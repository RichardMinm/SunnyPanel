import assert from "node:assert/strict";
import { test } from "node:test";

import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import type {
  ActorAuthorizedResourceSnapshot,
  HybridOrchestrationCandidate,
} from "../../../src/lib/agent/orchestration/hybrid-query-boundary-types";
import {
  aggregateMetadata,
  aggregateQueryTask,
  residualWriteTask,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

type ValidationStep =
  | "strict_structure"
  | "provenance"
  | "decision"
  | "dag"
  | "resource"
  | "sidecar_projection";

type CandidateValidationResult =
  | Readonly<{ output: OrchestratorOutput; status: "valid" }>
  | Readonly<{
      code:
        | "decision_consistency_failure"
        | "invalid_candidate_structure"
        | "invalid_dag"
        | "invalid_fixed_task_provenance"
        | "residual_query_intent_forbidden"
        | "resource_readiness_failure";
      status: "rejected";
    }>;

type CandidateValidatorModule = Readonly<{
  validateHybridOrchestrationCandidate: (input: Readonly<{
    allowedResourceIds: ReadonlySet<number>;
    authorizedSnapshot: ActorAuthorizedResourceSnapshot;
    candidate: HybridOrchestrationCandidate;
    onValidationStep?: (step: ValidationStep) => void;
  }>) => CandidateValidationResult;
}>;

const snapshot: ActorAuthorizedResourceSnapshot = {
  actorKind: "authenticated_payload_user",
  plans: [{ id: 101, normalizedTitle: "考研数学复习计划" }],
};

const validCandidate = (): HybridOrchestrationCandidate => ({
  fixedTaskMetadata: [aggregateMetadata("t1")],
  output: {
    decisionCode: "compound_ready",
    mode: "compound",
    routingSummary: "读取确定范围的进度并处理后续请求",
    tasks: [
      aggregateQueryTask("t1"),
      residualWriteTask("t2", ["t1"]),
    ],
    version: 2,
  },
});

const validate = async (
  candidate: HybridOrchestrationCandidate,
  onValidationStep?: (step: ValidationStep) => void,
) => {
  const module = await loadR4AGreenModule<CandidateValidatorModule>(
    R4A_GREEN_MODULES.candidateValidator,
    "hybrid_candidate_validator",
  );
  return module.validateHybridOrchestrationCandidate({
    allowedResourceIds: new Set([101]),
    authorizedSnapshot: snapshot,
    candidate,
    onValidationStep,
  });
};

test("valid hybrid candidate passes without exposing its provenance sidecar", async () => {
  const candidate = validCandidate();
  const result = await validate(candidate);

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;
  assert.deepEqual(result.output, candidate.output);
  assert.equal("fixedTaskMetadata" in result.output, false);
  assert.doesNotMatch(JSON.stringify(result.output), /queryScopeProvenance|deterministic_query_boundary/);
});

test("invalid fixed-task provenance is rejected", async () => {
  const candidate = validCandidate();
  const result = await validate({
    ...candidate,
    fixedTaskMetadata: [{
      ...candidate.fixedTaskMetadata[0],
      taskId: "t2",
    }],
  });

  assert.deepEqual(result, {
    code: "invalid_fixed_task_provenance",
    status: "rejected",
  });
});

test("a Query-family residual task is rejected", async () => {
  const candidate = validCandidate();
  const result = await validate({
    ...candidate,
    output: {
      ...candidate.output,
      tasks: [
        candidate.output.tasks[0],
        {
          ...candidate.output.tasks[1],
          agentRole: "query",
          args: { planId: 101 },
          intent: "query_plan_progress",
        },
      ],
    },
  });

  assert.deepEqual(result, {
    code: "residual_query_intent_forbidden",
    status: "rejected",
  });
});

test("decision, DAG, and resource failures retain distinct typed codes", async () => {
  const candidate = validCandidate();
  const decision = await validate({
    ...candidate,
    output: { ...candidate.output, decisionCode: "pure_read_query" },
  });
  assert.deepEqual(decision, {
    code: "decision_consistency_failure",
    status: "rejected",
  });

  const dag = await validate({
    ...candidate,
    output: {
      ...candidate.output,
      tasks: [
        candidate.output.tasks[0],
        { ...candidate.output.tasks[1], dependsOn: ["missing"] },
      ],
    },
  });
  assert.deepEqual(dag, { code: "invalid_dag", status: "rejected" });

  const resource = await validate({
    ...candidate,
    output: {
      ...candidate.output,
      tasks: [
        candidate.output.tasks[0],
        {
          ...candidate.output.tasks[1],
          args: { planId: 999 },
          intent: "schedule_plan",
        },
      ],
    },
  });
  assert.deepEqual(resource, {
    code: "resource_readiness_failure",
    status: "rejected",
  });
});

test("validation order is fixed and candidate validation is non-mutating", async () => {
  const candidate = validCandidate();
  const before = structuredClone(candidate);
  const observed: ValidationStep[] = [];

  const result = await validate(candidate, (step) => observed.push(step));

  assert.equal(result.status, "valid");
  assert.deepEqual(observed, [
    "strict_structure",
    "provenance",
    "decision",
    "dag",
    "resource",
    "sidecar_projection",
  ]);
  assert.deepEqual(candidate, before);
});
