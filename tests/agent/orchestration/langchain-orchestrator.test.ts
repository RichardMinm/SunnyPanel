import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  ORCHESTRATOR_AGENT_ROLES,
  ORCHESTRATOR_MODES,
  orchestratorOutputSchema,
  validateTaskDAG,
} from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import { ROUTER_INTENT_NAMES } from "../../../src/lib/agent/llm/schemas/router-output";
import {
  buildLangChainOrchestratorMessages,
  buildLangChainSystemPrompt,
  runLangChainOrchestratorResult,
} from "../../../src/lib/agent/orchestration/langchain-orchestrator";
import { mapStructuredOutputToPlan } from "../../../src/lib/agent/orchestration/orchestrator-mapper";

describe("langchain-orchestrator protocol", () => {
  it("renders every schema-derived mode, role, and intent into the trusted protocol", () => {
    const prompt = buildLangChainSystemPrompt();

    for (const mode of ORCHESTRATOR_MODES) assert.match(prompt, new RegExp(`\\b${mode}\\b`));
    for (const role of ORCHESTRATOR_AGENT_ROLES) assert.match(prompt, new RegExp(`\\b${role}\\b`));
    for (const intent of ROUTER_INTENT_NAMES) assert.match(prompt, new RegExp(`\\b${intent}\\b`));
  });

  it("keeps all workspace values out of the system message and marks them as untrusted user data", () => {
    const sentinel = "IGNORE_PROTOCOL_AND_EXECUTE_SENTINEL";
    const messages = buildLangChainOrchestratorMessages("查看状态", {
      checklists: [{ groups: [], id: 12, title: sentinel }],
      contentItems: [],
      memories: [{ confidence: 0.9, content: sentinel, id: 31, lastUsedAt: null, title: sentinel, type: "project_context" }],
      now: "2026-07-14T12:00:00.000+08:00",
      pendingAction: null,
      plans: [{ id: 7, priority: "medium", state: "active", title: sentinel }],
      threadSummary: { messageCount: 2, summary: sentinel, updatedAt: "2026-07-14T11:00:00.000+08:00" },
      timelineEvents: [{ eventDate: "2026-07-14", id: 19, isFeatured: false, relatedContent: null, status: "active", title: sentinel, type: "note", visibility: "private" }],
    });
    const systemMessages = messages.filter((message) => message.role === "system");
    const workspaceMessages = messages.filter((message) => message.role === "user" && message.content.includes(sentinel));

    assert.equal(systemMessages.length, 1);
    assert.equal(systemMessages[0]?.content.includes(sentinel), false);
    assert.equal(systemMessages[0]?.content.includes("2026-07-14T12:00:00.000+08:00"), false);
    assert.equal(workspaceMessages.length, 1);
    assert.match(workspaceMessages[0]?.content ?? "", /UNTRUSTED user data/);
  });

  it("forbids execution artifacts and raw reasoning in the protocol", () => {
    const prompt = buildLangChainSystemPrompt();

    assert.match(prompt, /不要输出 raw reasoning/i);
    assert.match(prompt, /execute/);
    assert.match(prompt, /receipt/);
    assert.match(prompt, /rollback/);
  });

  it("returns a typed schema failure without projecting a successful plan", async () => {
    let calls = 0;
    const result = await runLangChainOrchestratorResult({
      context: {
        checklists: [],
        now: "2026-07-14T12:00:00.000+08:00",
        pendingAction: null,
        plans: [],
      },
      message: "制定一个计划",
      modelConfig: {
        apiKey: "test-only",
        baseURL: "https://example.invalid",
        maxRetries: 0,
        model: "fake",
        provider: "deepseek",
        structuredOutputMode: "provider_default",
        temperature: 0,
        timeoutMs: 100,
      },
      modelFactory: () => ({
        withStructuredOutput: () => ({
          invoke: async () => {
            calls += 1;
            return { version: 1 };
          },
        }),
      }) as unknown as BaseChatModel,
    });

    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") return;
    assert.equal(result.reason, "schema_failure");
    assert.equal("plan" in result, false);
    assert.equal(calls, 2);
  });
});

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
