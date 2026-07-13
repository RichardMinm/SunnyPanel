import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUsableResourceId } from "../../../src/lib/agent/orchestration/safety-classifier";
import {
  buildResourceIndex,
  getResourceProtocolProjection,
  validateResourceReadiness,
} from "../../../src/lib/agent/orchestration/resource-readiness-guard";

describe("resource-readiness-guard", () => {
  describe("isUsableResourceId", () => {
    it("valid plan ID", () => assert.equal(isUsableResourceId("test-plan-001"), true));
    it("valid numeric string", () => assert.equal(isUsableResourceId("42"), true));
    it("? is invalid", () => assert.equal(isUsableResourceId("?"), false));
    it("empty string is invalid", () => assert.equal(isUsableResourceId(""), false));
    it("whitespace is invalid", () => assert.equal(isUsableResourceId("   "), false));
    it("null is invalid", () => assert.equal(isUsableResourceId(null), false));
    it("undefined is invalid", () => assert.equal(isUsableResourceId(undefined), false));
    it("unknown is invalid", () => assert.equal(isUsableResourceId("unknown"), false));
    it("n/a is invalid", () => assert.equal(isUsableResourceId("n/a"), false));
    it("none is invalid", () => assert.equal(isUsableResourceId("none"), false));
  });

  describe("validateResourceReadiness", () => {
    const idx = (planIds: string[] = []) => ({ planIds: new Set(planIds), checklistIds: new Set<string>(), scheduleItemIds: new Set<string>() });

    it("schedule_plan with valid existing planId → ready", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: { planId: "test-plan-001" }, dependsOn: [] }],
        resourceIndex: idx(["test-plan-001"]),
      });
      assert.equal(r.ready, true);
    });

    it("schedule_plan accepts a numeric planId present in the context index", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: { planId: 42 }, dependsOn: [] }],
        resourceIndex: idx(["42"]),
      });
      assert.equal(r.ready, true);
    });

    it("schedule_plan without planId → not ready", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: {}, dependsOn: [] }],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, false);
      assert.equal(r.issues[0].code, "RESOURCE_ID_MISSING");
    });

    it("schedule_plan with ? as planId → not ready", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: { planId: "?" }, dependsOn: [] }],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, false);
      assert.equal(r.issues[0].code, "RESOURCE_ID_PLACEHOLDER");
    });

    it("schedule_plan with unknown planId → not ready", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: { planId: "plan-999" }, dependsOn: [] }],
        resourceIndex: idx(["test-plan-001"]),
      });
      assert.equal(r.ready, false);
      assert.equal(r.issues[0].code, "RESOURCE_ID_NOT_IN_CONTEXT");
    });

    it("classifies an unknown numeric planId as not in context", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: { planId: 999 }, dependsOn: [] }],
        resourceIndex: idx(["42"]),
      });
      assert.equal(r.ready, false);
      assert.equal(r.issues[0].code, "RESOURCE_ID_NOT_IN_CONTEXT");
    });

    it("compose_plan → schedule_plan with valid taskOutput → ready", () => {
      const r = validateResourceReadiness({
        tasks: [
          { id: "t1", intent: "compose_plan", args: {}, dependsOn: [] },
          { id: "t2", intent: "schedule_plan", args: { planRef: { type: "taskOutput", taskId: "t1", field: "planId" } }, dependsOn: ["t1"] },
        ],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, true);
    });

    it("query_plan → schedule_plan via taskOutput → not ready (query is not producer)", () => {
      const r = validateResourceReadiness({
        tasks: [
          { id: "t1", intent: "query_plan", args: {}, dependsOn: [] },
          { id: "t2", intent: "schedule_plan", args: { planRef: { type: "taskOutput", taskId: "t1", field: "planId" } }, dependsOn: ["t1"] },
        ],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, false);
    });

    it("schedule_plan with taskOutput but missing dependsOn → not ready", () => {
      const r = validateResourceReadiness({
        tasks: [
          { id: "t1", intent: "compose_plan", args: {}, dependsOn: [] },
          { id: "t2", intent: "schedule_plan", args: { planRef: { type: "taskOutput", taskId: "t1", field: "planId" } }, dependsOn: [] },
        ],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, false);
    });

    it("compose_plan without resource requirement → ready", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "compose_plan", args: {}, dependsOn: [] }],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, true); /* compose_plan has no resource requirement */
    });

    it("answer_question → always ready", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "answer_question", args: {}, dependsOn: [] }],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, true);
    });

    it("title-only reference → not ready (title ≠ ID)", () => {
      const r = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: { planTitle: "考研数学复习计划" }, dependsOn: [] }],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, false);
      assert.equal(r.issues[0].code, "RESOURCE_ID_MISSING");
    });

    it("Guard failure does NOT call model", () => {
      /* Pure function: same input → same output. No network, no randomness. */
      const r1 = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: {}, dependsOn: [] }],
        resourceIndex: idx(),
      });
      const r2 = validateResourceReadiness({
        tasks: [{ id: "t1", intent: "schedule_plan", args: {}, dependsOn: [] }],
        resourceIndex: idx(),
      });
      assert.deepEqual(r1, r2);
      assert.equal(r1.ready, false);
    });
  });

  describe("buildResourceIndex", () => {
    it("builds from context plans", () => {
      const idx = buildResourceIndex({
        plans: [{ id: "p1" }, { id: 42 }, { id: "?" }, { id: "" }, { id: null }],
        checklists: [],
      });
      assert.equal(idx.planIds.has("p1"), true);
      assert.equal(idx.planIds.has("42"), true);
      assert.equal(idx.planIds.has("?"), false);
      assert.equal(idx.planIds.size, 2); /* only p1 and 42 */
    });
  });

  describe("resource protocol projection", () => {
    it("derives immutable prompt metadata from the readiness requirements", () => {
      const projection = getResourceProtocolProjection();

      assert.deepEqual(
        projection.find((entry) => entry.intent === "schedule_plan"),
        {
          allowedProducerIntents: ["compose_plan", "create_plan"],
          existingIdFields: ["planId"],
          intent: "schedule_plan",
          outputRefFields: ["planRef"],
          resourceKind: "plan",
        },
      );
      assert.equal(Object.isFrozen(projection), true);
      assert.equal(Object.isFrozen(projection[0]), true);
      assert.equal(Object.isFrozen(projection[0]?.existingIdFields), true);
    });
  });
});
