import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestratorOutputSchema, validateTaskDAG } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import { mapStructuredOutputToPlan } from "../../../src/lib/agent/orchestration/orchestrator-mapper";

describe("langchain-orchestrator (schema + mapper contracts)", () => {
  describe("orchestrator output schema", () => {
    it("valid single plan parses correctly", () => {
      const output = {
        version: 1,
        mode: "single",
        routingSummary: "创建学习计划",
        tasks: [
          {
            id: "t1",
            label: "制定计划",
            intent: "compose_plan",
            args: {},
            dependsOn: [],
            agentRole: "plan",
          },
        ],
      };
      const result = orchestratorOutputSchema.safeParse(output);
      assert.equal(result.success, true);
    });

    it("valid compound plan parses correctly", () => {
      const output = {
        version: 1,
        mode: "compound",
        routingSummary: "创建并排期",
        tasks: [
          { id: "t1", label: "a", intent: "compose_plan", args: {}, dependsOn: [], agentRole: "plan" },
          { id: "t2", label: "b", intent: "schedule_plan", args: {}, dependsOn: ["t1"], agentRole: "schedule" },
        ],
      };
      const result = orchestratorOutputSchema.safeParse(output);
      assert.equal(result.success, true);
    });

    it("rejects unknown intent", () => {
      const output = {
        version: 1,
        mode: "single",
        routingSummary: "bad",
        tasks: [
          { id: "t1", label: "x", intent: "execute_all", args: {}, dependsOn: [], agentRole: "plan" },
        ],
      };
      const result = orchestratorOutputSchema.safeParse(output);
      assert.equal(result.success, false);
    });

    it("rejects invalid agentRole", () => {
      const output = {
        version: 1,
        mode: "single",
        routingSummary: "bad",
        tasks: [
          { id: "t1", label: "x", intent: "answer_question", args: {}, dependsOn: [], agentRole: "executor" },
        ],
      };
      const result = orchestratorOutputSchema.safeParse(output);
      assert.equal(result.success, false);
    });

    it("rejects extra unknown fields (strict)", () => {
      const output = {
        version: 1,
        mode: "single",
        routingSummary: "test",
        tasks: [
          { id: "t1", label: "x", intent: "answer_question", args: {}, dependsOn: [], agentRole: "query" },
        ],
        rawReasoning: "hidden chain-of-thought",
      };
      const result = orchestratorOutputSchema.safeParse(output);
      assert.equal(result.success, false);
    });

    it("accepts routingSummary at max 80 chars", () => {
      const output = {
        version: 1,
        mode: "single",
        routingSummary: "x".repeat(80),
        tasks: [
          { id: "t1", label: "x", intent: "answer_question", args: {}, dependsOn: [], agentRole: "query" },
        ],
      };
      const result = orchestratorOutputSchema.safeParse(output);
      assert.equal(result.success, true);
    });

    it("rejects routingSummary over 80 chars", () => {
      const output = {
        version: 1,
        mode: "single",
        routingSummary: "x".repeat(81),
        tasks: [
          { id: "t1", label: "x", intent: "answer_question", args: {}, dependsOn: [], agentRole: "query" },
        ],
      };
      const result = orchestratorOutputSchema.safeParse(output);
      assert.equal(result.success, false);
    });
  });

  describe("DAG validation", () => {
    it("detects cyclic dependency", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "cycle",
        tasks: [
          { id: "t1", label: "a", intent: "answer_question", args: {}, dependsOn: ["t2"], agentRole: "query" },
          { id: "t2", label: "b", intent: "answer_question", args: {}, dependsOn: ["t1"], agentRole: "query" },
        ],
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("Circular")));
    });

    it("detects nonexistent dependency", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "compound",
        routingSummary: "missing dep",
        tasks: [
          { id: "t1", label: "a", intent: "answer_question", args: {}, dependsOn: [], agentRole: "query" },
          { id: "t2", label: "b", intent: "answer_question", args: {}, dependsOn: ["t3"], agentRole: "query" },
        ],
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("does not exist")));
    });

    it("detects self-dependency", () => {
      const result = validateTaskDAG({
        version: 1,
        mode: "single",
        routingSummary: "self-dep",
        tasks: [
          { id: "t1", label: "a", intent: "answer_question", args: {}, dependsOn: ["t1"], agentRole: "query" },
        ],
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("cannot depend on itself")));
    });
  });

  describe("mapper: read/write boundary", () => {
    it("consultation stays read-only", () => {
      const plan = mapStructuredOutputToPlan({
        version: 1,
        mode: "single",
        routingSummary: "回答咨询问题",
        tasks: [
          { id: "t1", label: "回答", intent: "answer_question", args: { answer: "建议..." }, dependsOn: [], agentRole: "query" },
        ],
      });
      assert.equal(plan.tasks[0].intent, "answer_question");
    });

    it("query stays read-only", () => {
      const plan = mapStructuredOutputToPlan({
        version: 1,
        mode: "single",
        routingSummary: "查询进度",
        tasks: [
          { id: "t1", label: "查询", intent: "query_progress", args: {}, dependsOn: [], agentRole: "query" },
        ],
      });
      assert.equal(plan.tasks[0].intent, "query_progress");
    });

    it("explicit write is only a candidate", () => {
      const plan = mapStructuredOutputToPlan({
        version: 1,
        mode: "single",
        routingSummary: "创建计划",
        tasks: [
          { id: "t1", label: "创建", intent: "create_plan", args: { title: "计划" }, dependsOn: [], agentRole: "plan" },
        ],
      });
      assert.equal(plan.tasks[0].intent, "create_plan");
      /* Domain layer still gates with Dry-run / Policy Guard / confirmation */
    });

    it("ambiguity should clarify, not write", () => {
      const plan = mapStructuredOutputToPlan({
        version: 1,
        mode: "single",
        routingSummary: "需要更多信息",
        tasks: [
          { id: "t1", label: "追问", intent: "clarify", args: { question: "请补充标题" }, dependsOn: [], agentRole: "query" },
        ],
      });
      assert.equal(plan.tasks[0].intent, "clarify");
    });
  });

  describe("mapper: existing resources + output refs", () => {
    it("existing plan ID is preserved", () => {
      const plan = mapStructuredOutputToPlan({
        version: 1,
        mode: "single",
        routingSummary: "使用已有计划",
        tasks: [
          { id: "t1", label: "追加", intent: "append_plan_item", args: { planId: 42, item: "new" }, dependsOn: [], agentRole: "plan" },
        ],
      });
      assert.equal((plan.tasks[0].args as Record<string, unknown>).planId, 42);
    });

    it("task output reference is preserved", () => {
      const plan = mapStructuredOutputToPlan({
        version: 1,
        mode: "compound",
        routingSummary: "创建并排期",
        tasks: [
          { id: "t1", label: "创建", intent: "compose_plan", args: {}, dependsOn: [], agentRole: "plan" },
          {
            id: "t2", label: "排期", intent: "schedule_plan",
            args: { planRef: { type: "taskOutput", taskId: "t1", field: "planId" } },
            dependsOn: ["t1"], agentRole: "schedule",
          },
        ],
      });

      const t2Args = plan.tasks[1].args as Record<string, unknown>;
      const ref = t2Args.planRef as Record<string, string>;
      assert.equal(ref.type, "taskOutput");
      assert.equal(ref.taskId, "t1");
      assert.equal(ref.field, "planId");
    });

    it("output ref does not become a fake real ID", () => {
      const plan = mapStructuredOutputToPlan({
        version: 1,
        mode: "compound",
        routingSummary: "test",
        tasks: [
          { id: "t1", label: "c", intent: "compose_plan", args: {}, dependsOn: [], agentRole: "plan" },
          {
            id: "t2", label: "s", intent: "schedule_plan",
            args: { planRef: { type: "taskOutput", taskId: "t1", field: "planId" } },
            dependsOn: ["t1"], agentRole: "schedule",
          },
        ],
      });

      /* planId should NOT be a concrete number — it stays as a ref */
      const t2Args = plan.tasks[1].args as Record<string, unknown>;
      assert.equal(typeof t2Args.planId, "undefined");
    });
  });
});
