import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  orchestratorOutputSchema,
  validateTaskDAG,
} from "../../../src/lib/agent/llm/schemas/orchestrator-output";

describe("orchestrator-output-schema", () => {
  const makeTask = (id: string, deps: string[] = []) => ({
    id,
    label: `Task ${id}`,
    intent: "create_plan" as const,
    args: {},
    dependsOn: deps,
    agentRole: "plan" as const,
  });

  const validSinglePlan = {
    version: 1 as const,
    mode: "single" as const,
    routingSummary: "创建学习计划",
    tasks: [makeTask("t1")],
  };

  const validCompoundPlan = {
    version: 1 as const,
    mode: "compound" as const,
    routingSummary: "创建计划并排入日程",
    tasks: [
      makeTask("t1"),
      makeTask("t2", ["t1"]),
    ],
  };

  describe("orchestratorOutputSchema", () => {
    it("parses valid single plan", () => {
      const result = orchestratorOutputSchema.safeParse(validSinglePlan);

      assert.equal(result.success, true);
    });

    it("parses valid compound plan", () => {
      const result = orchestratorOutputSchema.safeParse(validCompoundPlan);

      assert.equal(result.success, true);
    });

    it("parses complex DAG with multiple dependencies", () => {
      const result = orchestratorOutputSchema.safeParse({
        version: 1,
        mode: "compound",
        routingSummary: "多步骤工作计划",
        tasks: [
          makeTask("t1"),
          makeTask("t2", ["t1"]),
          makeTask("t3", ["t1"]),
          makeTask("t4", ["t2", "t3"]),
        ],
      });

      assert.equal(result.success, true);
    });

    it("rejects plan with 0 tasks", () => {
      const result = orchestratorOutputSchema.safeParse({
        version: 1,
        mode: "single",
        routingSummary: "empty",
        tasks: [],
      });

      assert.equal(result.success, false);
    });

    it("rejects plan with too many tasks", () => {
      const tasks = Array.from({ length: 10 }, (_, i) =>
        makeTask(`t${i + 1}`));

      const result = orchestratorOutputSchema.safeParse({
        version: 1,
        mode: "compound",
        routingSummary: "too many",
        tasks,
      });

      assert.equal(result.success, false);
    });

    it("rejects empty routingSummary", () => {
      const result = orchestratorOutputSchema.safeParse({
        ...validSinglePlan,
        routingSummary: "",
      });

      assert.equal(result.success, false);
    });

    it("rejects routingSummary over 80 chars", () => {
      const result = orchestratorOutputSchema.safeParse({
        ...validSinglePlan,
        routingSummary: "x".repeat(81),
      });

      assert.equal(result.success, false);
    });

    it("rejects invalid agentRole", () => {
      const result = orchestratorOutputSchema.safeParse({
        ...validSinglePlan,
        tasks: [{ ...makeTask("t1"), agentRole: "invalid_role" }],
      });

      assert.equal(result.success, false);
    });

    it("rejects invalid task id format", () => {
      const result = orchestratorOutputSchema.safeParse({
        ...validSinglePlan,
        tasks: [{ ...makeTask("task_1"), id: "task_1" }],
      });

      assert.equal(result.success, false);
    });

    it("rejects extra unknown fields (strict)", () => {
      const result = orchestratorOutputSchema.safeParse({
        ...validSinglePlan,
        rawReasoning: "internal chain of thought",
      });

      assert.equal(result.success, false);
    });
  });

  describe("validateTaskDAG", () => {
    it("validates single plan with 1 task", () => {
      const result = validateTaskDAG(validSinglePlan as Required<typeof validSinglePlan>);

      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it("validates compound plan with linear deps", () => {
      const result = validateTaskDAG(validCompoundPlan as Required<typeof validCompoundPlan>);

      assert.equal(result.valid, true);
    });

    it("validates complex DAG", () => {
      const plan = {
        version: 1 as const,
        mode: "compound" as const,
        routingSummary: "complex",
        tasks: [
          makeTask("t1"),
          makeTask("t2", ["t1"]),
          makeTask("t3", ["t1"]),
          makeTask("t4", ["t2", "t3"]),
        ],
      };
      const result = validateTaskDAG(plan);

      assert.equal(result.valid, true);
    });

    it("detects single mode with multiple tasks", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "single",
        routingSummary: "bad single",
        tasks: [makeTask("t1"), makeTask("t2")],
      } as Required<typeof validSinglePlan>);

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("Single mode")));
    });

    it("detects compound mode with 1 task", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "bad compound",
        tasks: [makeTask("t1")],
      } as Required<typeof validCompoundPlan>);

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("Compound mode")));
    });

    it("detects duplicate task IDs", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "duplicate ids",
        tasks: [makeTask("t1"), makeTask("t1")],
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("Duplicate")));
    });

    it("detects self-dependency", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "single",
        routingSummary: "self dep",
        tasks: [makeTask("t1", ["t1"])],
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("cannot depend on itself")));
    });

    it("detects missing dependency", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "missing dep",
        tasks: [makeTask("t1"), makeTask("t2", ["t3"])],
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("does not exist")));
    });

    it("detects duplicate dependencies", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "dup dep",
        tasks: [makeTask("t1"), makeTask("t2"), makeTask("t3", ["t1", "t1"])],
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("duplicate dependencies")));
    });

    it("detects circular dependency (simple cycle)", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "cycle",
        tasks: [
          makeTask("t1", ["t2"]),
          makeTask("t2", ["t1"]),
        ],
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("Circular")));
    });

    it("detects circular dependency (3-node cycle)", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "3-cycle",
        tasks: [
          makeTask("t1", ["t3"]),
          makeTask("t2", ["t1"]),
          makeTask("t3", ["t2"]),
        ],
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("Circular")));
    });

    it("accepts valid branching DAG", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "branching",
        tasks: [
          makeTask("t1"),
          makeTask("t2", ["t1"]),
          makeTask("t3", ["t1"]),
          makeTask("t4", ["t2"]),
          makeTask("t5", ["t3"]),
        ],
      });

      assert.equal(result.valid, true);
    });
  });
});
