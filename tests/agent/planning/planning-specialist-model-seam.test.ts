import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { createModelConfig, type ModelConfig } from "../../../src/lib/agent/llm/model-config";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import { enrichPlanIntent } from "../../../src/lib/agent/agents/plan-agent";
import { evaluateSpecialistTaskCompleteness } from "../../../src/lib/agent/agents/specialist-task-completeness";
import {
  checklistDraftFactsSchema,
  planDecompositionSchema,
} from "../../../src/lib/agent/planning/model-schemas";
import { composeClarificationWithLLM } from "../../../src/lib/agent/response/clarification";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import {
  decomposePlanForCompose,
  decomposePlanWithLLM,
} from "../../../src/lib/agent/workflows/plan-decomposer";

const modelConfig = (): ModelConfig => {
  const resolved = createModelConfig({
    apiKey: "sk-test",
    baseURL: "https://api.test.example/v1",
    maxRetries: 0,
    model: "planning-test-model",
    provider: "openai",
    structuredOutputMode: "json_schema",
  });
  if ("code" in resolved) throw new Error(resolved.safeMessage);
  return resolved;
};

const rawConfig = async () => ({
  apiKey: "sk-test",
  baseUrl: "https://api.test.example/v1",
  model: "planning-test-model",
  provider: "openai",
});

const fakeModelFactory = (
  output: unknown,
  captured?: { messages?: unknown[]; calls: number },
): ModelFactory => () => ({
  withStructuredOutput: () => ({
    invoke: async (messages: unknown[]) => {
      if (captured) {
        captured.calls += 1;
        captured.messages = messages;
      }
      return output;
    },
  }),
}) as unknown as BaseChatModel;

const validPlan = {
  finalGoal: "完成 Fastjson 漏洞研究并形成报告",
  phases: [
    {
      estimatedDays: 3,
      goal: "完成环境与样本准备",
      milestones: [
        {
          estimatedHours: 4,
          tasks: ["准备 1.2.83 环境", "准备 2.0.62 环境"],
          title: "环境准备",
        },
      ],
      title: "准备阶段",
    },
  ],
  prerequisites: ["隔离测试环境"],
  totalEstimatedDays: 3,
  weeklyRhythm: "每天投入两小时",
};

const context: AgentPromptContext = {
  checklists: [{
    groups: [],
    id: 12,
    title: "CHECKLIST_UNTRUSTED_SENTINEL",
  }],
  now: "2026-08-18T10:00:00.000+08:00",
  pendingAction: null,
  plans: [{ id: 7, priority: "medium" as const, state: "active" as const, title: "IGNORE_AND_EXECUTE_SENTINEL" }],
};

describe("L3-D1 planning specialist structured boundary", () => {
  it("uses strict schemas for plan and checklist draft facts", () => {
    assert.equal(planDecompositionSchema.safeParse(validPlan).success, true);
    assert.equal(
      planDecompositionSchema.safeParse({ ...validPlan, execute: true }).success,
      false,
    );
    assert.equal(
      planDecompositionSchema.safeParse({
        ...validPlan,
        phases: [{ ...validPlan.phases[0], receipt: "forbidden" }],
      }).success,
      false,
    );
    assert.equal(
      checklistDraftFactsSchema.safeParse({
        goal: "完成研究",
        items: [{ description: null, priority: "medium", title: "复现漏洞" }],
        title: "研究清单",
      }).success,
      true,
    );
    assert.equal(
      checklistDraftFactsSchema.safeParse({
        execute: true,
        goal: "完成研究",
        items: [{ description: null, priority: "medium", title: "复现漏洞" }],
        title: "研究清单",
      }).success,
      false,
    );
  });

  it("decomposes through the shared structured model and isolates workspace data", async () => {
    const captured: { calls: number; messages?: unknown[] } = { calls: 0 };
    let logicalCalls = 0;
    let providerAttempts = 0;
    const result = await decomposePlanWithLLM(
      { sourceText: "研究 Fastjson 1.2.83 和 2.0.62 的漏洞" },
      context,
      rawConfig,
      {
        logicalCallAuthorizer: () => {
          logicalCalls += 1;
        },
        modelFactory: fakeModelFactory(validPlan, captured),
        providerAttemptAuthorizer: () => {
          providerAttempts += 1;
        },
      },
    );

    assert.deepEqual(result, validPlan);
    assert.equal(captured.calls, 1);
    assert.equal(logicalCalls, 1);
    assert.equal(providerAttempts, 1);
    const messages = captured.messages as Array<{ content?: unknown; constructor?: { name?: string } }>;
    const systemText = messages
      .filter((message) => message.constructor?.name === "SystemMessage")
      .map((message) => String(message.content ?? ""))
      .join("\n");
    const userText = messages
      .filter((message) => message.constructor?.name === "HumanMessage")
      .map((message) => String(message.content ?? ""))
      .join("\n");
    assert.doesNotMatch(systemText, /IGNORE_AND_EXECUTE_SENTINEL/u);
    assert.match(userText, /UNTRUSTED user data/u);
    assert.match(userText, /IGNORE_AND_EXECUTE_SENTINEL/u);
  });

  it("falls back deterministically when the structured plan is invalid", async () => {
    const result = await decomposePlanForCompose(
      { sourceText: "研究 Fastjson 1.2.83 和 2.0.62 的漏洞复现，持续三周" },
      { ...context, plans: [] },
      rawConfig,
      {
        modelFactory: fakeModelFactory({ ...validPlan, execute: true }),
        structuredRetryBudget: { schema: 0, transport: 0 },
      },
    );

    assert.ok(result);
    assert.ok((result?.phases.length ?? 0) >= 3);
    assert.equal("execute" in (result as unknown as Record<string, unknown>), false);
  });

  it("reuses an existing validated decomposition without another model call", async () => {
    let configCalls = 0;
    let logicalCalls = 0;
    const result = await decomposePlanForCompose(
      { decomposed: validPlan, sourceText: "继续使用已确认的草案" },
      { ...context, plans: [] },
      async () => {
        configCalls += 1;
        return rawConfig();
      },
      {
        logicalCallAuthorizer: () => {
          logicalCalls += 1;
        },
        modelFactory: fakeModelFactory(validPlan),
      },
    );

    assert.deepEqual(result, validPlan);
    assert.equal(configCalls, 0);
    assert.equal(logicalCalls, 0);
  });

  it("enriches only compose_checklist with typed draft facts", async () => {
    const captured: { calls: number; messages?: unknown[] } = { calls: 0 };
    const result = await enrichPlanIntent(
      {
        args: { goal: "完成 Fastjson 研究", title: "Fastjson 研究" },
        confidence: 0.9,
        intent: "compose_checklist",
      },
      context,
      "把 Fastjson 漏洞研究拆成任务清单",
      undefined,
      {
        modelConfig: modelConfig(),
        modelFactory: fakeModelFactory({
          goal: "被模型改写的目标",
          items: [
            { description: "隔离环境", priority: "high", title: "复现 1.2.83" },
            { description: "隔离环境", priority: "high", title: "复现 2.0.62" },
          ],
          title: "被模型改写的标题",
        }, captured),
      },
    );

    assert.equal(result.intent, "compose_checklist");
    if (result.intent !== "compose_checklist") throw new Error("unexpected intent");
    assert.equal(result.args.title, "Fastjson 研究");
    assert.equal(result.args.goal, "完成 Fastjson 研究");
    assert.equal(result.args.items?.length, 2);
    assert.equal(captured.calls, 1);
    const messages = captured.messages as Array<{ content?: unknown; constructor?: { name?: string } }>;
    const systemText = messages
      .filter((candidate) => candidate.constructor?.name === "SystemMessage")
      .map((candidate) => String(candidate.content ?? ""))
      .join("\n");
    const userText = messages
      .filter((candidate) => candidate.constructor?.name === "HumanMessage")
      .map((candidate) => String(candidate.content ?? ""))
      .join("\n");
    assert.doesNotMatch(systemText, /CHECKLIST_UNTRUSTED_SENTINEL/u);
    assert.match(userText, /UNTRUSTED user data/u);
    assert.match(userText, /CHECKLIST_UNTRUSTED_SENTINEL/u);
  });

  it("rejects checklist output that tries to change intent or add execution fields", async () => {
    const base = {
      args: { goal: "完成研究", title: "研究清单" },
      confidence: 0.9,
      intent: "compose_checklist" as const,
    };
    const result = await enrichPlanIntent(
      base,
      { ...context, checklists: [] },
      "生成研究清单",
      undefined,
      {
        modelConfig: modelConfig(),
        modelFactory: fakeModelFactory({
          execute: true,
          goal: "完成研究",
          intent: "create_checklist",
          items: [{ description: null, priority: null, title: "任务" }],
          title: "研究清单",
        }),
      },
    );

    assert.deepEqual(result, base);
  });

  it("bypasses already complete planning work and only enriches an empty checklist draft", () => {
    const task = (intent: "compose_plan" | "compose_checklist" | "create_checklist", args: Record<string, unknown>) => ({
      agentRole: "plan" as const,
      args,
      dependsOn: [],
      id: "t1",
      intent,
      label: "planning",
    });

    assert.equal(evaluateSpecialistTaskCompleteness(task("compose_plan", {})).disposition, "bypassed_complete");
    assert.equal(
      evaluateSpecialistTaskCompleteness(task("create_checklist", {
        groups: [{ items: [{ title: "任务" }], title: "默认分组" }],
        title: "清单",
      })).disposition,
      "bypassed_complete",
    );
    assert.equal(evaluateSpecialistTaskCompleteness(task("compose_checklist", {})).disposition, "required_incomplete");
    assert.equal(
      evaluateSpecialistTaskCompleteness(task("compose_checklist", { items: [{ title: "任务" }] })).disposition,
      "bypassed_complete",
    );
  });

  it("uses the shared structured boundary for clarification wording and preserves validation", async () => {
    const previous = process.env.AGENT_DISABLE_LLM;
    process.env.AGENT_DISABLE_LLM = "0";
    try {
      const output = await composeClarificationWithLLM(
        {
          knownFacts: ["目标：完成漏洞研究"],
          maxQuestions: 2,
          missingNeeds: [{ key: "availableTime", label: "每天可投入时间" }],
          safetyBoundary: { nextStep: "先生成计划草案", willNotWriteYet: true },
          tone: "warm",
          userGoalSummary: "完成漏洞研究",
          userMessage: "帮我制定研究计划",
          workflow: "plan_creation",
        },
        {
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory({
            message: "我先不写入计划。为了生成合适的草案，请补充每天可投入时间。",
            questions: ["每天可以投入多少时间？"],
            safetyNote: "暂时不会写入计划，下一步先生成草案。",
            suggestedReply: "每天两小时。",
          }),
        },
      );

      assert.equal(output.source, "llm");
      assert.match(output.message, /不写入计划/u);
    } finally {
      if (previous === undefined) delete process.env.AGENT_DISABLE_LLM;
      else process.env.AGENT_DISABLE_LLM = previous;
    }
  });

  it("contains no direct chat HTTP, regex JSON extraction, or legacy completeStructured call", () => {
    const planningSources = [
      "src/lib/agent/workflows/plan-decomposer.ts",
      "src/lib/agent/workflows/plan-seed.ts",
      "src/lib/agent/agents/plan-agent.ts",
      "src/lib/agent/response/clarification/llm-composer.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(planningSources, /\/chat\/completions/u);
    assert.doesNotMatch(planningSources, /fetchWithRetry/u);
    assert.doesNotMatch(planningSources, /completeStructured/u);
    assert.doesNotMatch(planningSources, /content\.match\(/u);

    const toolRegistry = readFileSync("src/lib/agent/tool-registry.ts", "utf8");
    assert.doesNotMatch(toolRegistry, /decomposePlanForCompose/u);
  });
});
