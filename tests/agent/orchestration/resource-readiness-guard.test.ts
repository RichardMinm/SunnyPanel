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
    const idx = (planIds: string[] = []) => ({
      checklistIds: new Set<string>(),
      checklistTitlesById: new Map<string, string>(),
      planIds: new Set(planIds),
      planTitlesById: new Map<string, string>(),
      scheduleItemIds: new Set<string>(),
    });

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

    it("rejects taskOutput references even when the producer and dependency are valid", () => {
      const r = validateResourceReadiness({
        tasks: [
          { id: "t1", intent: "compose_plan", args: {}, dependsOn: [] },
          { id: "t2", intent: "schedule_plan", args: { planRef: { type: "taskOutput", taskId: "t1", field: "planId" } }, dependsOn: ["t1"] },
        ],
        resourceIndex: idx(),
      });
      assert.equal(r.ready, false);
      assert.equal(r.issues[0]?.code, "RESOURCE_OUTPUT_REF_UNSUPPORTED");
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
      assert.equal(r.issues[0]?.code, "RESOURCE_OUTPUT_REF_UNSUPPORTED");
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
      assert.equal(r.issues[0]?.code, "RESOURCE_OUTPUT_REF_UNSUPPORTED");
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

    it("reschedule_item and cancel_schedule_item use the AgentIntent itemId contract", () => {
      const scheduleIndex = {
        ...idx(),
        scheduleItemIds: new Set(["77"]),
      };

      for (const intent of ["reschedule_item", "cancel_schedule_item"] as const) {
        const result = validateResourceReadiness({
          tasks: [{
            id: "t1",
            intent,
            args: { itemId: 77 },
            dependsOn: [],
          }],
          resourceIndex: scheduleIndex,
        });

        assert.equal(result.ready, true, intent);
      }
    });

    it("does not accept the stale scheduleItemId field from the retired function-tool contract", () => {
      const result = validateResourceReadiness({
        tasks: [{
          id: "t1",
          intent: "cancel_schedule_item",
          args: { scheduleItemId: 77 },
          dependsOn: [],
        }],
        resourceIndex: {
          ...idx(),
          scheduleItemIds: new Set(["77"]),
        },
      });

      assert.equal(result.ready, false);
      assert.equal(result.issues[0]?.code, "RESOURCE_ID_MISSING");
    });

    it("append and complete accept an exact unique checklistTitle from AgentIntent", () => {
      const checklistIndex = buildResourceIndex({
        checklists: [{ id: 201, title: "  本周   任务  " }],
        plans: [],
      });

      for (const intent of ["append_plan_item", "complete_plan_item"] as const) {
        const result = validateResourceReadiness({
          tasks: [{
            id: "t1",
            intent,
            args: {
              checklistTitle: "本周 任务",
              itemTitle: "完成复盘",
            },
            dependsOn: [],
          }],
          resourceIndex: checklistIndex,
        });

        assert.equal(result.ready, true, intent);
      }
    });

    it("add_completion_note requires the same exact unique checklistTitle contract", () => {
      const checklistIndex = buildResourceIndex({
        checklists: [{ id: 201, title: "本周任务" }],
        plans: [],
      });
      const valid = validateResourceReadiness({
        tasks: [{
          id: "t1",
          intent: "add_completion_note",
          args: {
            checklistTitle: "本周任务",
            completionNote: "按计划完成",
            itemTitle: "完成复盘",
          },
          dependsOn: [],
        }],
        resourceIndex: checklistIndex,
      });
      const invalid = validateResourceReadiness({
        tasks: [{
          id: "t1",
          intent: "add_completion_note",
          args: {
            checklistTitle: "不存在的清单",
            completionNote: "按计划完成",
            itemTitle: "完成复盘",
          },
          dependsOn: [],
        }],
        resourceIndex: checklistIndex,
      });

      assert.equal(valid.ready, true);
      assert.equal(invalid.ready, false);
      assert.equal(invalid.issues[0]?.code, "RESOURCE_TITLE_NOT_IN_CONTEXT");
    });

    it("rejects a checklist title that is absent from context", () => {
      const result = validateResourceReadiness({
        tasks: [{
          id: "t1",
          intent: "append_plan_item",
          args: {
            checklistTitle: "不存在的清单",
            itemTitle: "完成复盘",
          },
          dependsOn: [],
        }],
        resourceIndex: buildResourceIndex({
          checklists: [{ id: 201, title: "本周任务" }],
          plans: [],
        }),
      });

      assert.equal(result.ready, false);
      assert.equal(result.issues[0]?.code, "RESOURCE_TITLE_NOT_IN_CONTEXT");
    });

    it("rejects an ambiguous normalized checklist title", () => {
      const result = validateResourceReadiness({
        tasks: [{
          id: "t1",
          intent: "complete_plan_item",
          args: {
            checklistTitle: "本周任务",
            itemTitle: "完成复盘",
          },
          dependsOn: [],
        }],
        resourceIndex: buildResourceIndex({
          checklists: [
            { id: 201, title: "本周任务" },
            { id: 202, title: "  本周任务  " },
          ],
          plans: [],
        }),
      });

      assert.equal(result.ready, false);
      assert.equal(result.issues[0]?.code, "RESOURCE_TITLE_AMBIGUOUS");
    });

    it("rejects the stale planId shape when checklistTitle is missing", () => {
      const result = validateResourceReadiness({
        tasks: [{
          id: "t1",
          intent: "append_plan_item",
          args: { itemTitle: "完成复盘", planId: 42 },
          dependsOn: [],
        }],
        resourceIndex: buildResourceIndex({
          checklists: [{ id: 201, title: "本周任务" }],
          plans: [{ id: 42, title: "复习计划" }],
        }),
      });

      assert.equal(result.ready, false);
      assert.equal(result.issues[0]?.code, "RESOURCE_REF_MISSING");
    });
  });

  describe("buildResourceIndex", () => {
    it("builds from context plans", () => {
      const idx = buildResourceIndex({
        plans: [
          { id: "p1", title: "  Study   PLAN  " },
          { id: 42, title: "考研数学复习计划" },
          { id: "?", title: "ignored" },
          { id: "", title: "ignored" },
          { id: null, title: "ignored" },
        ],
        checklists: [],
      });
      assert.equal(idx.planIds.has("p1"), true);
      assert.equal(idx.planIds.has("42"), true);
      assert.equal(idx.planIds.has("?"), false);
      assert.equal(idx.planIds.size, 2); /* only p1 and 42 */
      assert.equal(idx.planTitlesById.get("p1"), "study plan");
      assert.equal(idx.planTitlesById.get("42"), "考研数学复习计划");
    });

    it("indexes valid schedule item IDs from prompt context", () => {
      const idx = buildResourceIndex({
        checklists: [],
        plans: [],
        schedules: [
          { id: 77, title: "数学复习" },
          { id: 88, title: "英语复习" },
        ],
      });

      assert.deepEqual([...idx.scheduleItemIds], ["77", "88"]);
    });
  });

  describe("resource protocol projection", () => {
    it("derives immutable prompt metadata from the readiness requirements", () => {
      const projection = getResourceProtocolProjection();

      assert.deepEqual(
        projection.find((entry) => entry.intent === "schedule_plan"),
        {
          allowedProducerIntents: [],
          existingIdFields: ["planId"],
          existingTitleFields: [],
          intent: "schedule_plan",
          outputRefFields: [],
          resourceKind: "plan",
        },
      );
      assert.equal(Object.isFrozen(projection), true);
      assert.equal(Object.isFrozen(projection[0]), true);
      assert.equal(Object.isFrozen(projection[0]?.existingIdFields), true);
    });

    it("publishes itemId for schedule mutations from the same guard contract", () => {
      const projection = getResourceProtocolProjection();

      for (const intent of ["reschedule_item", "cancel_schedule_item"] as const) {
        assert.deepEqual(
          projection.find((entry) => entry.intent === intent)?.existingIdFields,
          ["itemId"],
        );
      }
    });

    it("publishes checklistTitle for append and complete from the guard contract", () => {
      const projection = getResourceProtocolProjection() as ReadonlyArray<
        Record<string, unknown>
      >;

      for (const intent of ["append_plan_item", "complete_plan_item"] as const) {
        assert.deepEqual(
          projection.find((entry) => entry.intent === intent)?.existingTitleFields,
          ["checklistTitle"],
        );
        assert.deepEqual(
          projection.find((entry) => entry.intent === intent)?.existingIdFields,
          [],
        );
      }
    });

    it("publishes checklistTitle for completion-note mutation", () => {
      const entry = getResourceProtocolProjection()
        .find((candidate) => candidate.intent === "add_completion_note");

      assert.deepEqual(entry?.existingIdFields, []);
      assert.deepEqual(entry?.existingTitleFields, ["checklistTitle"]);
      assert.equal(entry?.resourceKind, "checklist");
    });
  });
});
