import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PROJECTABLE_RESOURCE_CLARIFICATION_CODES,
  projectResourceIssuesToClarification,
} from "../../../src/lib/agent/orchestration/resource-clarification-projector";
import type {
  ResourceReadinessErrorCode,
  ResourceReadinessIssue,
} from "../../../src/lib/agent/orchestration/resource-readiness-guard";

const projectableCodes = [
  "RESOURCE_ID_MISSING",
  "RESOURCE_ID_PLACEHOLDER",
  "RESOURCE_ID_NOT_IN_CONTEXT",
  "RESOURCE_TITLE_CONFLICT",
  "RESOURCE_TITLE_NOT_IN_CONTEXT",
  "RESOURCE_TITLE_AMBIGUOUS",
  "RESOURCE_REF_MISSING",
  "RESOURCE_KIND_MISMATCH",
] as const satisfies readonly ResourceReadinessErrorCode[];

const structuralCodes = [
  "RESOURCE_OUTPUT_REF_UNSUPPORTED",
  "RESOURCE_OUTPUT_REF_INVALID",
  "RESOURCE_OUTPUT_PRODUCER_INVALID",
  "RESOURCE_DEPENDENCY_MISSING",
] as const satisfies readonly ResourceReadinessErrorCode[];

const forbiddenMarker = "PRIVATE-RESOURCE-TITLE-DO-NOT-RETAIN";

const issue = (
  code: ResourceReadinessErrorCode,
  resourceKind = "checklist",
): ResourceReadinessIssue => ({
  code,
  intent: `provider-intent-${forbiddenMarker}`,
  resourceKind,
  safeMessage: `provider-safe-message-${forbiddenMarker}`,
  taskId: `provider-task-${forbiddenMarker}`,
});

test("projects the exhaustive user-correctable resource code allowlist", () => {
  assert.deepEqual(
    [...PROJECTABLE_RESOURCE_CLARIFICATION_CODES],
    projectableCodes,
  );

  for (const code of projectableCodes) {
    const result = projectResourceIssuesToClarification([
      issue(code, "checklist"),
    ]);

    assert.ok(result, code);
    assert.equal(result.plan.mode, "single", code);
    assert.equal(result.plan.tasks.length, 1, code);
    assert.equal(result.plan.tasks[0]?.intent, "clarify", code);
    assert.equal(result.plan.tasks[0]?.dependsOn.length, 0, code);
    assert.equal(result.plan.tasks[0]?.agentRole, "query", code);
    assert.equal(
      typeof result.plan.tasks[0]?.args.question === "string"
        && result.plan.tasks[0].args.question.trim().length > 0,
      true,
      code,
    );
    assert.deepEqual(result.resourceIssueCodes, [code], code);

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, new RegExp(forbiddenMarker), code);
    assert.doesNotMatch(serialized, /provider-intent|provider-task|provider-safe-message/u, code);
    assert.doesNotMatch(serialized, /rawPrompt|rawResponse|reasoning_content|secret/u, code);
  }
});

test("keeps structural resource failures unavailable", () => {
  for (const code of structuralCodes) {
    assert.equal(
      projectResourceIssuesToClarification([issue(code)]),
      null,
      code,
    );
  }
});

test("rejects empty and mixed projectable/structural issue sets", () => {
  assert.equal(projectResourceIssuesToClarification([]), null);
  assert.equal(
    projectResourceIssuesToClarification([
      issue("RESOURCE_TITLE_NOT_IN_CONTEXT"),
      issue("RESOURCE_DEPENDENCY_MISSING"),
    ]),
    null,
  );
});

test("uses deterministic resource-kind copy without retaining issue fields", () => {
  const expectations = [
    ["checklist", "清单"],
    ["plan", "计划"],
    ["schedule_item", "日程项"],
    ["timeline_event", "时间线事件"],
  ] as const;

  for (const [resourceKind, expectedCopy] of expectations) {
    const result = projectResourceIssuesToClarification([
      issue("RESOURCE_REF_MISSING", resourceKind),
    ]);
    assert.ok(result, resourceKind);
    assert.match(String(result.plan.tasks[0]?.args.question), new RegExp(expectedCopy));
  }

  const multiple = projectResourceIssuesToClarification([
    issue("RESOURCE_REF_MISSING", "plan"),
    issue("RESOURCE_REF_MISSING", "checklist"),
  ]);
  assert.ok(multiple);
  assert.match(
    String(multiple.plan.tasks[0]?.args.question),
    /资源类型和准确名称/u,
  );
  assert.deepEqual(multiple.resourceIssueCodes, [
    "RESOURCE_REF_MISSING",
    "RESOURCE_REF_MISSING",
  ]);
});
