import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("shouldPersistEvaluateReviewFromBody keeps plan evaluation read-only", () => {
  assert.equal(shouldPersistEvaluateReviewFromBody(null), false);
  assert.equal(shouldPersistEvaluateReviewFromBody({}), false);
  assert.equal(shouldPersistEvaluateReviewFromBody({ persistReview: true }), false);
  assert.equal(shouldPersistEvaluateReviewFromBody({ persistReview: false }), false);
});

test("the standalone evaluation API stays deterministic and makes no unaccounted model call", () => {
  const source = readFileSync("src/app/api/agent/evaluate/route.ts", "utf8");

  assert.match(source, /enhanceWithModel:\s*false/u);
  assert.match(source, /persistReview:\s*false/u);
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
