import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseEvaluatePlanArgs,
  parseEvaluatePlanArgsFromSearchParams,
  parseQueryProgressArgs,
  parseQueryProgressArgsFromSearchParams,
  shouldPersistEvaluateReviewFromBody,
} from "../../src/lib/agent/api/parse-evaluate-progress-args";

test("parseEvaluatePlanArgs accepts planId as number or numeric string", () => {
  assert.deepEqual(parseEvaluatePlanArgs({ planId: 3 }), { planId: 3, planTitle: null });
  assert.deepEqual(parseEvaluatePlanArgs({ planId: " 12 " }), { planId: 12, planTitle: null });
  assert.deepEqual(parseEvaluatePlanArgs({ planId: "x" }), { planId: null, planTitle: null });
});

test("parseEvaluatePlanArgs trims planTitle", () => {
  assert.deepEqual(parseEvaluatePlanArgs({ planTitle: "  hello  " }), {
    planId: null,
    planTitle: "hello",
  });
  assert.deepEqual(parseEvaluatePlanArgs({ planTitle: "   " }), {
    planId: null,
    planTitle: null,
  });
});

test("parseEvaluatePlanArgsFromSearchParams maps query keys", () => {
  const params = new URLSearchParams("planId=9&planTitle=Alpha");
  assert.deepEqual(parseEvaluatePlanArgsFromSearchParams(params), {
    planId: 9,
    planTitle: "Alpha",
  });
});

test("shouldPersistEvaluateReviewFromBody defaults to true except explicit false", () => {
  assert.equal(shouldPersistEvaluateReviewFromBody(null), true);
  assert.equal(shouldPersistEvaluateReviewFromBody({}), true);
  assert.equal(shouldPersistEvaluateReviewFromBody({ persistReview: true }), true);
  assert.equal(shouldPersistEvaluateReviewFromBody({ persistReview: false }), false);
});

test("parseQueryProgressArgs normalizes scope", () => {
  assert.deepEqual(parseQueryProgressArgs(null), { scope: "all" });
  assert.deepEqual(parseQueryProgressArgs({ scope: "plans" }), {
    checklistTitle: null,
    scope: "plans",
  });
  assert.deepEqual(parseQueryProgressArgs({ scope: "unknown" }), {
    checklistTitle: null,
    scope: "all",
  });
});

test("parseQueryProgressArgsFromSearchParams maps query keys", () => {
  const params = new URLSearchParams("checklistTitle=Week&scope=checklists");
  assert.deepEqual(parseQueryProgressArgsFromSearchParams(params), {
    checklistTitle: "Week",
    scope: "checklists",
  });
});
