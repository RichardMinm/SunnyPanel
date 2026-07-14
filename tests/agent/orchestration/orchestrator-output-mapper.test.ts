import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapStructuredOutputToPlan } from "../../../src/lib/agent/orchestration/orchestrator-mapper";
import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";

describe("orchestrator-output-mapper", () => {
  const validSingle: OrchestratorOutput = {
    version: 2,
    decisionCode: "explicit_write_ready",
    mode: "single",
    routingSummary: "创建学习计划",
    tasks: [
      {
        id: "t1",
        label: "制定计划",
        intent: "compose_plan",
        args: { title: "考研数学" },
        dependsOn: [],
        agentRole: "plan",
      },
    ],
  };

  const validCompound: OrchestratorOutput = {
    version: 2,
    decisionCode: "compound_ready",
    mode: "compound",
    routingSummary: "创建计划并排入日程",
    tasks: [
      {
        id: "t1",
        label: "制定计划",
        intent: "compose_plan",
        args: { title: "考研数学" },
        dependsOn: [],
        agentRole: "plan",
      },
      {
        id: "t2",
        label: "排入日程",
        intent: "schedule_plan",
        args: { planId: 42 },
        dependsOn: ["t1"],
        agentRole: "schedule",
      },
    ],
  };

  describe("mapStructuredOutputToPlan", () => {
    it("maps single plan correctly", () => {
      const plan = mapStructuredOutputToPlan(validSingle);

      assert.equal(plan.mode, "single");
      assert.equal(plan.reasoning, "创建学习计划");
      assert.equal(plan.source, "llm");
      assert.equal(plan.tasks.length, 1);
      assert.equal(plan.tasks[0].id, "t1");
      assert.equal(plan.tasks[0].intent, "compose_plan");
    });

    it("maps compound plan with dependencies", () => {
      const plan = mapStructuredOutputToPlan(validCompound);

      assert.equal(plan.mode, "compound");
      assert.equal(plan.tasks.length, 2);
      assert.deepEqual(plan.tasks[1].dependsOn, ["t1"]);
    });

    it("routingSummary → reasoning (compatibility alias)", () => {
      const plan = mapStructuredOutputToPlan(validSingle);

      assert.equal(plan.reasoning, validSingle.routingSummary);
      /* reasoning = routingSummary, NOT hidden Chain-of-Thought */
      assert.ok(plan.reasoning.length <= 80);
    });

    it("preserves task args without leaking semantic metadata into the plan", () => {
      const plan = mapStructuredOutputToPlan(validCompound);
      const task2Args = plan.tasks[1].args as Record<string, unknown>;

      assert.equal(task2Args.planId, 42);
      assert.equal("decisionCode" in plan, false);
      assert.deepEqual(Object.keys(plan).sort(), ["mode", "reasoning", "source", "tasks"]);
    });

    it("does not modify intent", () => {
      const plan = mapStructuredOutputToPlan(validSingle);

      assert.equal(plan.tasks[0].intent, "compose_plan");
      /* No intent added, removed, or changed */
    });

    it("does not add execute intent", () => {
      const plan = mapStructuredOutputToPlan(validSingle);

      for (const task of plan.tasks) {
        assert.ok(!task.intent.startsWith("execute"));
      }
    });

    it("does not fix invalid DAG — passes through as-is", () => {
      const badOutput: OrchestratorOutput = {
        version: 2,
        decisionCode: "compound_ready",
        mode: "compound",
        routingSummary: "bad dag",
        tasks: [
          { id: "t1", label: "a", intent: "answer_question", args: {}, dependsOn: ["t3"], agentRole: "query" },
          { id: "t2", label: "b", intent: "answer_question", args: {}, dependsOn: [], agentRole: "query" },
        ],
      };
      /* Mapper does NOT validate — it maps as-is. DAG validation is
       *   upstream (Zod schema + validateTaskDAG). */
      const plan = mapStructuredOutputToPlan(badOutput);

      assert.equal(plan.tasks[0].dependsOn[0], "t3");
    });

    it("existing resource IDs are preserved unchanged", () => {
      const output: OrchestratorOutput = {
        version: 2,
        decisionCode: "explicit_write_ready",
        mode: "single",
        routingSummary: "append to existing plan",
        tasks: [
          {
            id: "t1",
            label: "追加",
            intent: "append_plan_item",
            args: { planId: 42, item: "new task" },
            dependsOn: [],
            agentRole: "plan",
          },
        ],
      };
      const plan = mapStructuredOutputToPlan(output);

      assert.equal(
        (plan.tasks[0].args as Record<string, unknown>).planId,
        42,
      );
    });

    it("mapper is pure — same input produces same output", () => {
      const a = mapStructuredOutputToPlan(validSingle);
      const b = mapStructuredOutputToPlan(validSingle);

      assert.deepEqual(a, b);
    });
  });

});
