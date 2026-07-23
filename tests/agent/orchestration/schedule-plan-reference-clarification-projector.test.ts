import assert from "node:assert/strict";
import { test } from "node:test";

import {
  projectSchedulePlanReferenceErrorToClarification,
} from "../../../src/lib/agent/orchestration/schedule-plan-reference-clarification-projector";
import type {
  SchedulePlanReferenceErrorCode,
} from "../../../src/lib/agent/orchestration/schedule-plan-reference-contract";

const codes: SchedulePlanReferenceErrorCode[] = [
  "explicit_plan_id_required",
  "multiple_explicit_plan_ids",
  "provider_plan_id_mismatch",
  "explicit_plan_id_not_in_context",
  "multiple_exact_plan_titles",
  "plan_id_title_conflict",
];

test("every schedule reference error becomes one sanitized clarify plan", () => {
  for (const code of codes) {
    const projection =
      projectSchedulePlanReferenceErrorToClarification(code);

    assert.equal(projection.schedulePlanReferenceErrorCode, code);
    assert.equal(projection.plan.mode, "single");
    assert.deepEqual(
      projection.plan.tasks.map(({ intent }) => intent),
      ["clarify"],
    );
    assert.equal(
      String(projection.plan.tasks[0]?.args.question).trim().length > 0,
      true,
    );
    assert.doesNotMatch(
      JSON.stringify(projection),
      /101|102|999|考研|英语|planId/u,
    );
  }
});
