import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT,
  buildOrchestratorTaskArgsRepairInstruction,
  orchestratorOutputWithTaskArgsSchema,
  renderOrchestratorTaskArgsProtocol,
  validateOrchestratorTaskArgs,
} from "../../../src/lib/agent/orchestration/orchestrator-task-args-contract";

const output = (
  intent: OrchestratorOutput["tasks"][number]["intent"],
  args: Record<string, unknown>,
): OrchestratorOutput => ({
  decisionCode: "explicit_write_ready",
  mode: "single",
  routingSummary: "保存长期记忆",
  tasks: [{
    agentRole: "memory",
    args,
    dependsOn: [],
    id: "t1",
    intent,
    label: "保存长期记忆",
  }],
  version: 2,
});

describe("orchestrator task args contract", () => {
  it("freezes the single required save_memory content field", () => {
    assert.deepEqual(
      SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.requiredNonEmptyStringFields,
      ["content"],
    );
    assert.equal(Object.isFrozen(SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT), true);
    assert.equal(
      Object.isFrozen(
        SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.requiredNonEmptyStringFields,
      ),
      true,
    );
  });

  it("accepts non-empty save_memory content", () => {
    assert.equal(
      validateOrchestratorTaskArgs(
        output("save_memory", { content: "每周五复盘" }),
      ).valid,
      true,
    );
  });

  for (const [label, value] of [
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace string", "   "],
    ["null", null],
    ["number", 42],
  ] as const) {
    it(`reports required non-empty content for ${label}`, () => {
      const result = validateOrchestratorTaskArgs(
        output("save_memory", { content: value }),
      );

      assert.equal(result.valid, false);
      assert.deepEqual(result.issues, [{
        code: "required_non_empty_string",
        field: "content",
        intent: "save_memory",
        taskIndex: 0,
      }]);
    });

    it(`rejects ${label} at the save_memory content path`, () => {
      const result = orchestratorOutputWithTaskArgsSchema.safeParse(
        output("save_memory", { content: value }),
      );

      assert.equal(result.success, false);
      if (result.success) return;
      assert.deepEqual(result.error.issues[0]?.path, ["tasks", 0, "args", "content"]);
    });
  }

  it("leaves query_progress args unchanged", () => {
    assert.equal(
      orchestratorOutputWithTaskArgsSchema.safeParse(
        output("query_progress", {}),
      ).success,
      true,
    );
  });

  it("renders only the shared save_memory field contract", () => {
    const protocol = renderOrchestratorTaskArgsProtocol();

    assert.match(protocol, /save_memory/u);
    assert.match(protocol, /args\.content/u);
    assert.match(protocol, /required/u);
    assert.match(protocol, /non-empty string/u);
    assert.doesNotMatch(protocol, /每周五复盘|title|question/u);
    assert.equal((protocol.match(/args\.content/gu) ?? []).length, 1);
  });

  it("builds a bounded path-only repair instruction for save_memory content", () => {
    const instruction = buildOrchestratorTaskArgsRepairInstruction([{
      code: "custom",
      missing: true,
      path: ["tasks", 0, "args", "content"],
    }]);

    assert.equal(
      instruction,
      [
        "[orchestrator-task-args-repair:v1]",
        "Required non-empty string fields: tasks.0.args.content.",
        "Return the complete Orchestrator JSON object again.",
      ].join("\n"),
    );
    assert.doesNotMatch(
      instruction,
      /RAW_SENTINEL|workspace|reasoning|execute|receipt|rollback/u,
    );
  });

  it("uses generic value-free repair guidance for empty or outside paths", () => {
    const expected = [
      "[orchestrator-task-args-repair:v1]",
      "The previous object violated the Structured Output schema.",
      "Return the complete Orchestrator JSON object again.",
    ].join("\n");

    assert.equal(buildOrchestratorTaskArgsRepairInstruction([]), expected);
    assert.equal(buildOrchestratorTaskArgsRepairInstruction([{
      code: "custom",
      missing: false,
      path: ["tasks", 0, "args", "title"],
    }]), expected);
  });
});
