import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildResourceIndex,
  getResourceProtocolProjection,
  validateResourceReadiness,
} from "../../../src/lib/agent/orchestration/resource-readiness-guard";

const resourceIndex = buildResourceIndex({
  checklists: [{ id: 201, title: "本周任务" }],
  plans: [{ id: 101, title: "  考研数学复习计划  " }],
});

const guard = (args: Record<string, unknown>) => validateResourceReadiness({
  resourceIndex,
  tasks: [{ args, dependsOn: [], id: "t1", intent: "schedule_plan" }],
});

test("accepts exact IDs and normalized matching titles but rejects conflicts", () => {
  const cases = [
    [{ planId: 101 }, true, undefined],
    [{ planId: 101, planTitle: "考研数学复习计划" }, true, undefined],
    [{ planId: 101, planTitle: "  考研数学  复习计划  " }, true, undefined],
    [{ planId: 101, planTitle: "英语复习计划" }, false, "RESOURCE_TITLE_CONFLICT"],
    [{ planTitle: "考研数学复习计划" }, false, "RESOURCE_ID_MISSING"],
    [{ planId: "?" }, false, "RESOURCE_ID_PLACEHOLDER"],
    [{ planId: 999 }, false, "RESOURCE_ID_NOT_IN_CONTEXT"],
    [{ planRef: { type: "taskOutput", taskId: "t1", field: "planId" } }, false, "RESOURCE_OUTPUT_REF_UNSUPPORTED"],
  ] as const;

  for (const [args, ready, code] of cases) {
    const result = guard(args);
    assert.equal(result.ready, ready, JSON.stringify(args));
    if (!result.ready) assert.equal(result.issues[0]?.code, code);
  }
});

test("rejects task-output references nested anywhere before another resource path", () => {
  const result = guard({
    nested: { input: { field: "planId", taskId: "t0", type: "taskOutput" } },
    planId: 101,
  });

  assert.equal(result.ready, false);
  if (!result.ready) assert.equal(result.issues[0]?.code, "RESOURCE_OUTPUT_REF_UNSUPPORTED");
});

test("resource protocol no longer advertises task-output fields or producers", () => {
  for (const entry of getResourceProtocolProjection()) {
    assert.deepEqual(entry.outputRefFields, []);
    assert.deepEqual(entry.allowedProducerIntents, []);
  }
  assert.equal(resourceIndex.planTitlesById.get("101"), "考研数学复习计划");
  assert.equal(resourceIndex.checklistTitlesById.get("201"), "本周任务");
});
