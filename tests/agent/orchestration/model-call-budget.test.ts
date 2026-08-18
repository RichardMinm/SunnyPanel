import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createModelCallBudgetRecorder,
  projectModelCallBudget,
} from "../../../src/lib/agent/orchestration/model-call-budget";
import * as modelCallBudgetModule from "../../../src/lib/agent/orchestration/model-call-budget";

const createAuthorizer = () => {
  assert.equal(
    typeof modelCallBudgetModule.createModelCallAuthorizer,
    "function",
  );
  return modelCallBudgetModule.createModelCallAuthorizer;
};

test("records legitimate model calls by role and scope", () => {
  const recorder = createModelCallBudgetRecorder();

  recorder.record("orchestrator", "attempt-1");
  recorder.record("replan", "event-1");
  recorder.record("conversational_answer", "answer-1");
  recorder.record("query_commentary", "query-1");
  recorder.record("specialist", "task-1");
  recorder.record("specialist", "task-2");
  recorder.recordProviderAttempt("orchestrator");
  recorder.recordProviderAttempt("orchestrator");
  recorder.recordProviderAttempt("conversational_answer");
  recorder.recordProviderAttempt("specialist");

  assert.deepEqual(recorder.snapshot(), {
    answerLogicalCalls: 1,
    answerProviderAttempts: 1,
    conversationalAnswerCalls: 1,
    learningCalls: 0,
    learningLogicalCalls: 0,
    learningProviderAttempts: 0,
    orchestratorCalls: 1,
    orchestratorLogicalCalls: 1,
    orchestratorProviderAttempts: 2,
    queryCommentaryCalls: 1,
    queryCommentaryLogicalCalls: 1,
    queryCommentaryProviderAttempts: 0,
    residualPlannerCalls: 0,
    residualPlannerLogicalCalls: 0,
    residualPlannerProviderAttempts: 0,
    replanCalls: 1,
    replanLogicalCalls: 1,
    replanProviderAttempts: 0,
    specialistCalls: 2,
    specialistLogicalCalls: 2,
    specialistProviderAttempts: 1,
    unexpectedDuplicateCalls: 0,
    unexpectedDuplicateModelCalls: 0,
  });
});

test("counts a repeated role and scope as an unexpected duplicate", () => {
  const recorder = createModelCallBudgetRecorder();

  assert.equal(recorder.record("orchestrator", "attempt-1"), true);
  assert.equal(recorder.record("orchestrator", "attempt-1"), false);
  assert.equal(recorder.record("replan", "event-1"), true);
  assert.equal(recorder.record("replan", "event-1"), false);
  assert.equal(recorder.record("conversational_answer", "answer-1"), true);
  assert.equal(recorder.record("conversational_answer", "answer-1"), false);
  assert.equal(recorder.record("query_commentary", "query-1"), true);
  assert.equal(recorder.record("query_commentary", "query-1"), false);
  assert.equal(recorder.record("specialist", "task-1"), true);
  assert.equal(recorder.record("specialist", "task-1"), false);

  assert.deepEqual(recorder.snapshot(), {
    answerLogicalCalls: 1,
    answerProviderAttempts: 0,
    conversationalAnswerCalls: 1,
    learningCalls: 0,
    learningLogicalCalls: 0,
    learningProviderAttempts: 0,
    orchestratorCalls: 1,
    orchestratorLogicalCalls: 1,
    orchestratorProviderAttempts: 0,
    queryCommentaryCalls: 1,
    queryCommentaryLogicalCalls: 1,
    queryCommentaryProviderAttempts: 0,
    residualPlannerCalls: 0,
    residualPlannerLogicalCalls: 0,
    residualPlannerProviderAttempts: 0,
    replanCalls: 1,
    replanLogicalCalls: 1,
    replanProviderAttempts: 0,
    specialistCalls: 1,
    specialistLogicalCalls: 1,
    specialistProviderAttempts: 0,
    unexpectedDuplicateCalls: 5,
    unexpectedDuplicateModelCalls: 5,
  });
});

test("snapshot exposes counts without retaining scope identifiers", () => {
  const recorder = createModelCallBudgetRecorder();
  recorder.record("specialist", "sensitive-task-id");
  recorder.recordProviderAttempt("specialist");

  assert.equal(JSON.stringify(recorder.snapshot()).includes("sensitive-task-id"), false);
});

test("terminal projection exposes every production role without compatibility counters", () => {
  const recorder = createModelCallBudgetRecorder();
  recorder.record("orchestrator", "turn");
  recorder.recordProviderAttempt("orchestrator");
  recorder.record("residual_planner", "residual");
  recorder.recordProviderAttempt("residual_planner");

  assert.deepEqual(projectModelCallBudget(recorder.snapshot()), {
    answerLogicalCalls: 0,
    answerProviderAttempts: 0,
    fullOrchestratorLogicalCalls: 1,
    fullOrchestratorProviderAttempts: 1,
    learningLogicalCalls: 0,
    learningProviderAttempts: 0,
    queryCommentaryLogicalCalls: 0,
    queryCommentaryProviderAttempts: 0,
    replanLogicalCalls: 0,
    replanProviderAttempts: 0,
    residualPlannerLogicalCalls: 1,
    residualPlannerProviderAttempts: 1,
    specialistLogicalCalls: 0,
    specialistProviderAttempts: 0,
    unexpectedDuplicateModelCalls: 0,
  });
});

test("authorizer rejects before an eighth logical role call across all seven roles", () => {
  const authorizer = createAuthorizer()({
    logicalCallMaximum: 7,
    providerAttemptMaximum: 24,
    providerAttemptsPerObservationMaximum: 4,
  });
  authorizer.beginObservation();
  const recorder = createModelCallBudgetRecorder({ authorizer });
  const roles = [
    "orchestrator",
    "residual_planner",
    "conversational_answer",
    "query_commentary",
    "replan",
    "specialist",
    "learning",
  ] as const;
  for (const [index, role] of roles.entries()) {
    assert.equal(recorder.record(role, `scope-${index + 1}`), true);
  }

  let forbiddenCallbackCalls = 0;
  assert.throws(
    () => {
      recorder.record("orchestrator", "scope-8");
      forbiddenCallbackCalls += 1;
    },
    (error: unknown) =>
      error instanceof Error
      && error.name === "ModelCallAuthorizationError"
      && error.message === "MODEL_LOGICAL_CALL_LIMIT_EXCEEDED",
  );
  assert.equal(forbiddenCallbackCalls, 0);
});

test("authorizer rejects before the fifth attempt in one observation", () => {
  const authorizer = createAuthorizer()({
    logicalCallMaximum: 6,
    providerAttemptMaximum: 24,
    providerAttemptsPerObservationMaximum: 4,
  });
  authorizer.beginObservation();
  const recorder = createModelCallBudgetRecorder({ authorizer });
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    recorder.recordProviderAttempt("orchestrator");
  }

  let forbiddenCallbackCalls = 0;
  assert.throws(
    () => {
      recorder.recordProviderAttempt("residual_planner");
      forbiddenCallbackCalls += 1;
    },
    (error: unknown) =>
      error instanceof Error
      && error.name === "ModelCallAuthorizationError"
      && error.message === "MODEL_OBSERVATION_PROVIDER_ATTEMPT_LIMIT_EXCEEDED",
  );
  assert.equal(forbiddenCallbackCalls, 0);
});

test("authorizer rejects before a twenty-fifth global Provider attempt", () => {
  const authorizer = createAuthorizer()({
    logicalCallMaximum: 6,
    providerAttemptMaximum: 24,
    providerAttemptsPerObservationMaximum: 4,
  });
  for (let observation = 1; observation <= 6; observation += 1) {
    authorizer.beginObservation();
    const recorder = createModelCallBudgetRecorder({ authorizer });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      recorder.recordProviderAttempt("orchestrator");
    }
  }

  authorizer.beginObservation();
  const recorder = createModelCallBudgetRecorder({ authorizer });
  let forbiddenCallbackCalls = 0;
  assert.throws(
    () => {
      recorder.recordProviderAttempt("orchestrator");
      forbiddenCallbackCalls += 1;
    },
    (error: unknown) =>
      error instanceof Error
      && error.name === "ModelCallAuthorizationError"
      && error.message === "MODEL_PROVIDER_ATTEMPT_LIMIT_EXCEEDED",
  );
  assert.equal(forbiddenCallbackCalls, 0);
});
