import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySafeExecutionFailure,
  projectSafeExecutionFailure,
  SafeExecutionError,
} from "../../../src/lib/agent/orchestration/safe-execution-failure";

const EXPECTED_CODES = {
  execute: "task_execute_failed",
  prepare: "task_prepare_failed",
  projection: "projection_failed",
  rollback: "rollback_indeterminate",
  runtime: "runtime_failed",
} as const;

test("execution failure projection is phase-only and returns a bounded safe contract", () => {
  for (const [phase, expectedCode] of Object.entries(EXPECTED_CODES)) {
    const projected = projectSafeExecutionFailure(
      phase as keyof typeof EXPECTED_CODES,
    );

    assert.deepEqual(Object.keys(projected).sort(), [
      "code",
      "safeObservationMessage",
      "safeReplanReason",
      "safeUserMessage",
    ]);
    assert.equal(projected.code, expectedCode);
    assert.ok(projected.safeUserMessage.trim().length > 0);
    assert.ok(projected.safeObservationMessage.trim().length > 0);
    assert.ok(projected.safeReplanReason.trim().length > 0);
    assert.match(projected.safeReplanReason, new RegExp(expectedCode));
    assert.doesNotMatch(
      JSON.stringify(projected),
      /postgres(?:ql)?:\/\/|select\s+.+\s+from|sk-[a-z0-9_-]+|\/Users\/|LangGraph|legacy/iu,
    );
  }
});

test("execution failure classification preserves a typed repair signal without raw details", () => {
  const projected = classifySafeExecutionFailure(
    new SafeExecutionError("checklist_item_not_found"),
    "execute",
  );

  assert.equal(projected.code, "checklist_item_not_found");
  assert.match(projected.safeReplanReason, /找不到清单项/u);
  assert.doesNotMatch(
    JSON.stringify(projected),
    /矩阵习题|postgres|10\.0\.0\.1|sk-private/u,
  );
});

test("matching error text without a typed code cannot authorize semantic repair", () => {
  const projected = classifySafeExecutionFailure(
    new Error("找不到清单项：矩阵习题"),
    "execute",
  );

  assert.equal(projected.code, "task_execute_failed");
});
