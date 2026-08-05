import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldTrustOrchestratorPreResolve } from "../../src/lib/agent/orchestration/plan-source";
import { createClarifyIntent } from "../../src/lib/agent/schemas";

test("shouldTrustOrchestratorPreResolve rejects heuristic clarify fast-path", () => {
  assert.equal(shouldTrustOrchestratorPreResolve(createClarifyIntent("能力介绍"), "heuristic"), false);
});

test("shouldTrustOrchestratorPreResolve accepts llm clarify fast-path", () => {
  assert.equal(shouldTrustOrchestratorPreResolve(createClarifyIntent("需要补充字段"), "llm"), true);
});
