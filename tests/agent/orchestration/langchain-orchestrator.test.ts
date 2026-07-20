import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredProviderAttemptEvent } from "../../../src/lib/agent/llm/invoke-structured";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import {
  ORCHESTRATOR_AGENT_ROLES,
  ORCHESTRATOR_DECISION_CODES,
  ORCHESTRATOR_MODES,
  ORCHESTRATOR_TASK_ID_PATTERN,
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
import { getResourceProtocolProjection } from "../../../src/lib/agent/orchestration/resource-readiness-guard";
import {
  L3B_EVALUATION_CONFIG,
  L3B_EVALUATION_CONFIG_HASH,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-config";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";

const promptJsonModelFactory = (
  invoke: () => unknown | Promise<unknown>,
): ModelFactory => () => ({
  withConfig: () => ({
    invoke: async () => ({ content: JSON.stringify(await invoke()) }),
  }),
}) as unknown as BaseChatModel;

describe("langchain-orchestrator protocol", () => {
  it("renders every schema-derived decision, mode, role, and intent into the trusted protocol", () => {
    const prompt = buildLangChainSystemPrompt();

    for (const decisionCode of ORCHESTRATOR_DECISION_CODES) assert.match(prompt, new RegExp(`\\b${decisionCode}\\b`));
    for (const mode of ORCHESTRATOR_MODES) assert.match(prompt, new RegExp(`\\b${mode}\\b`));
    for (const role of ORCHESTRATOR_AGENT_ROLES) assert.match(prompt, new RegExp(`\\b${role}\\b`));
    for (const intent of ROUTER_INTENT_NAMES) assert.match(prompt, new RegExp(`\\b${intent}\\b`));
  });

  it("renders the shared task-id format and a schema-valid complete JSON example", () => {
    const prompt = buildLangChainSystemPrompt();
    const marker = "完整合成 JSON shape 示例：";
    const exampleLine = prompt
      .slice(prompt.indexOf(marker) + marker.length)
      .split("\n", 1)[0];

    assert.equal(prompt.includes(ORCHESTRATOR_TASK_ID_PATTERN.source), true);
    assert.notEqual(prompt.indexOf(marker), -1);
    assert.equal(orchestratorOutputSchema.safeParse(JSON.parse(exampleLine)).success, true);
    assert.equal(JSON.parse(exampleLine).tasks[0].id, "t1");
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

  it("projects schedule item IDs only into untrusted workspace data", () => {
    const messages = buildLangChainOrchestratorMessages("把数学复习改到明天", {
      checklists: [],
      now: "2026-07-20T12:00:00.000+08:00",
      pendingAction: null,
      plans: [],
      schedules: [{
        date: "2026-07-20",
        id: 77,
        status: "planned",
        title: "数学复习",
      }],
    });
    const system = messages.find((message) => message.role === "system")?.content ?? "";
    const workspace = messages.find(
      (message) => message.role === "user"
        && message.content.includes("UNTRUSTED user data"),
    )?.content ?? "";

    assert.doesNotMatch(system, /数学复习|id=77/);
    assert.match(workspace, /当前日程/);
    assert.match(workspace, /数学复习/);
    assert.match(workspace, /id=77/);
  });

  it("forbids execution artifacts and raw reasoning in the protocol", () => {
    const prompt = buildLangChainSystemPrompt();

    assert.match(prompt, /不要输出 raw reasoning/i);
    assert.match(prompt, /execute/);
    assert.match(prompt, /receipt/);
    assert.match(prompt, /rollback/);
  });

  it("renders the deterministic resource projection and ambiguity rules", () => {
    const prompt = buildLangChainSystemPrompt();

    for (const entry of getResourceProtocolProjection()) {
      assert.match(prompt, new RegExp(`\\b${entry.intent}\\b`));
      for (const field of entry.existingIdFields) {
        assert.match(prompt, new RegExp(`\\b${field}\\b`));
      }
      for (const field of entry.existingTitleFields) {
        assert.match(prompt, new RegExp(`\\b${field}\\b`));
      }
    }
    assert.match(prompt, /标题.*规范化后精确且唯一/);
    assert.match(prompt, /上下文.*ID.*原样复制/);
    assert.match(prompt, /缺少有效planId时，不得输出schedule_plan/);
    assert.doesNotMatch(
      prompt,
      /缺少有效planId时，不得输出schedule_plan、append_plan_item、complete_plan_item/,
    );
    assert.doesNotMatch(prompt, /taskOutput/i);
  });

  it("renders the fixed seven-step classifier with at most three contrastive groups", () => {
    const prompt = buildLangChainSystemPrompt();

    assert.match(prompt, /1\. 识别用户请求中所有明确目标/);
    assert.match(prompt, /2\. 将每个目标分类为只读或状态改变候选/);
    assert.match(prompt, /3\. 把可以独立表示、共同必需或相互依赖的目标拆成任务/);
    assert.match(prompt, /4\. 根据任务数量与依赖关系判断 single 或 compound/);
    assert.match(prompt, /5\. 对每个写入候选区分 existing-target mutation 与 new-resource task dependency/);
    assert.match(prompt, /6\. 检查是否缺少会阻止安全且明确草案的信息/);
    assert.match(prompt, /7\. 只有存在阻塞性缺失时才 clarify/);
    assert.equal((prompt.match(/对照组[一二三]/g) ?? []).length, 3);
    for (const code of [
      "explicit_write_missing_resource",
      "compound_missing_target",
      "unsupported_request",
    ]) {
      assert.match(prompt, new RegExp(`${code}[^\\n]*single[^\\n]*clarify[^\\n]*args\\.question`));
    }
  });

  it("freezes the resource-reference protocol metadata and deterministic secret-free hash", () => {
    assert.equal(L3B_EVALUATION_CONFIG.evaluationConfigVersion, "l3b-r2-provider-protocol-v1");
    assert.equal(
      L3B_EVALUATION_CONFIG.promptProtocolVersion,
      "l3b-resource-reference-contract-v1",
    );
    assert.equal(L3B_EVALUATION_CONFIG.resourceProtocolVersion, 3);
    assert.equal(
      L3B_EVALUATION_CONFIG_HASH,
      "aadf679dba45e95643d946f259d522fd7f66f36d632112a9d53060ebd5cbabec",
    );
  });

  it("returns a typed schema failure without projecting a successful plan", async () => {
    let calls = 0;
    const recorder = createModelCallBudgetRecorder();
    const result = await runLangChainOrchestratorResult({
      context: {
        checklists: [],
        now: "2026-07-14T12:00:00.000+08:00",
        pendingAction: null,
        plans: [],
      },
      message: "制定一个计划",
      modelCallRecorder: recorder,
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
      modelFactory: promptJsonModelFactory(() => {
        calls += 1;
        return { version: 1 };
      }),
    });

    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") return;
    assert.equal(result.reason, "schema_failure");
    assert.equal("plan" in result, false);
    assert.equal(calls, 2);
    assert.equal(recorder.snapshot().orchestratorLogicalCalls, 1);
    assert.equal(recorder.snapshot().orchestratorProviderAttempts, 2);
  });

  it("allows the explicit evaluation harness to disable all retries", async () => {
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
      modelFactory: promptJsonModelFactory(() => {
        calls += 1;
        return { version: 1 };
      }),
      structuredRetryBudget: {
        schema: 0,
        transport: 0,
      },
    });

    assert.equal(result.status, "unavailable");
    assert.equal(calls, 1);
  });

  it("forwards the sanitized Provider attempt observer", async () => {
    const events: StructuredProviderAttemptEvent[] = [];
    const result = await runLangChainOrchestratorResult({
      context: {
        checklists: [],
        now: "2026-07-14T12:00:00.000+08:00",
        pendingAction: null,
        plans: [],
      },
      message: "解释零信任",
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
      modelFactory: promptJsonModelFactory(() => ({
            decisionCode: "pure_consultation",
            mode: "single",
            routingSummary: "回答问题",
            tasks: [{
              agentRole: "query",
              args: { question: "解释零信任" },
              dependsOn: [],
              id: "t1",
              intent: "answer_question",
              label: "回答问题",
            }],
            version: 2,
          })),
      providerAttemptObserver: (event) => events.push(event),
      structuredRetryBudget: { schema: 0, transport: 0 },
    });

    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.deepEqual(result.schemaValidDecision, {
      decisionCode: "pure_consultation",
      intents: ["answer_question"],
      mode: "single",
      taskCount: 1,
    });
    assert.deepEqual(events.map(({ attempt, phase }) => ({ attempt, phase })), [
      { attempt: 1, phase: "providerRequestStarted" },
      { attempt: 1, phase: "providerResponseReceived" },
      { attempt: 1, phase: "contentExtracted" },
      { attempt: 1, phase: "jsonParsed" },
      { attempt: 1, phase: "baseSchemaValidated" },
      { attempt: 1, phase: "strictSchemaValidated" },
      { attempt: 1, phase: "semanticValidationCompleted" },
    ]);
    const semanticEvent = events.at(-1);
    assert.equal(semanticEvent?.phase, "semanticValidationCompleted");
    if (semanticEvent?.phase === "semanticValidationCompleted") {
      assert.equal(semanticEvent.passed, true);
      assert.equal(semanticEvent.safeProtocol.semanticValidationReached, true);
      assert.equal(semanticEvent.safeProtocol.parserSubstage, "completed");
    }
  });

  it("returns sanitized resource issue codes for evaluation without retaining model output", async () => {
    const result = await runLangChainOrchestratorResult({
      context: {
        checklists: [],
        now: "2026-07-14T12:00:00.000+08:00",
        pendingAction: null,
        plans: [{ id: 101, priority: "medium", state: "active", title: "考研数学" }],
      },
      message: "安排计划",
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
      modelFactory: promptJsonModelFactory(() => ({
            decisionCode: "explicit_write_ready",
            mode: "single",
            routingSummary: "安排计划",
            tasks: [{
              agentRole: "schedule",
              args: { planId: 999 },
              dependsOn: [],
              id: "t1",
              intent: "schedule_plan",
              label: "安排计划",
            }],
            version: 2,
          })),
      structuredRetryBudget: { schema: 0, transport: 0 },
    });

    assert.deepEqual(result, {
      reason: "invalid_resource_reference",
      resourceIssueCodes: ["RESOURCE_ID_NOT_IN_CONTEXT"],
      safeMessage: "schedule_plan 引用的资源 ID 不在当前上下文中。",
      schemaValidDecision: {
        decisionCode: "explicit_write_ready",
        intents: ["schedule_plan"],
        mode: "single",
        taskCount: 1,
      },
      status: "unavailable",
    });
    assert.doesNotMatch(JSON.stringify(result), /planId|999|安排计划/);
  });

  it("rejects a Provider-selected context plan before the compatibility mapper", async () => {
    const result = await runLangChainOrchestratorResult({
      context: {
        checklists: [],
        now: "2026-07-16T12:00:00.000+08:00",
        pendingAction: null,
        plans: [{ id: 101, priority: "medium", state: "active", title: "考研数学复习计划" }],
      },
      message: "看看我的工作计划进度",
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
      modelFactory: promptJsonModelFactory(() => ({
        decisionCode: "pure_read_query",
        mode: "single",
        routingSummary: "读取具体计划进度",
        tasks: [{
          agentRole: "query",
          args: { planId: 101 },
          dependsOn: [],
          id: "t1",
          intent: "query_plan_progress",
          label: "读取进度",
        }],
        version: 2,
      })),
      structuredRetryBudget: { schema: 0, transport: 0 },
    });

    assert.deepEqual(result, {
      queryScopeErrorCode: "provider_selected_workspace_resource",
      reason: "invalid_query_scope",
      safeMessage: "用户没有明确选择具体计划，不能从工作区上下文隐式缩窄查询范围。",
      schemaValidDecision: {
        decisionCode: "pure_read_query",
        intents: ["query_plan_progress"],
        mode: "single",
        taskCount: 1,
      },
      status: "unavailable",
    });
  });

  it("normalizes an explicit exact title to a trusted planId before mapping", async () => {
    const result = await runLangChainOrchestratorResult({
      context: {
        checklists: [],
        now: "2026-07-16T12:00:00.000+08:00",
        pendingAction: null,
        plans: [{ id: 101, priority: "medium", state: "active", title: "考研数学复习计划" }],
      },
      message: "检查考研数学复习计划的完成情况",
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
      modelFactory: promptJsonModelFactory(() => ({
        decisionCode: "pure_read_query",
        mode: "single",
        routingSummary: "读取具体计划进度",
        tasks: [{
          agentRole: "query",
          args: { planId: 101 },
          dependsOn: [],
          id: "t1",
          intent: "query_plan_progress",
          label: "读取进度",
        }],
        version: 2,
      })),
      structuredRetryBudget: { schema: 0, transport: 0 },
    });

    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.equal(result.plan.tasks[0].intent, "query_plan_progress");
    assert.deepEqual(result.plan.tasks[0].args, { planId: 101 });
  });

  it("rejects an inconsistent schema-valid decision before DAG, resources, mapping, retry, or fallback", async () => {
    let calls = 0;
    const result = await runLangChainOrchestratorResult({
      context: {
        checklists: [],
        now: "2026-07-14T12:00:00.000+08:00",
        pendingAction: null,
        plans: [],
      },
      message: "查看计划",
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
      modelFactory: promptJsonModelFactory(() => {
            calls += 1;
            return {
              decisionCode: "pure_read_query",
              mode: "single",
              routingSummary: "错误地生成写入任务",
              tasks: [{
                agentRole: "plan",
                args: { secret: "task-args-sentinel", title: "private-title" },
                dependsOn: [],
                id: "t1",
                intent: "compose_plan",
                label: "private-label",
              }],
              version: 2,
            };
          }),
      structuredRetryBudget: { schema: 0, transport: 0 },
    });

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      decisionConsistencyError: "read_intent_not_allowed",
      reason: "invalid_decision_consistency",
      safeMessage: "模型返回的语义决策与任务形状不一致，暂时无法安全重规划。",
      schemaValidDecision: {
        decisionCode: "pure_read_query",
        intents: ["compose_plan"],
        mode: "single",
        taskCount: 1,
      },
      status: "unavailable",
    });
    assert.equal("plan" in result, false);
    assert.equal("resourceIssueCodes" in result, false);
    assert.doesNotMatch(
      JSON.stringify(result),
      /task-args-sentinel|private-title|private-label|错误地生成写入任务|t1/,
    );
  });

  it("returns only the semantic projection from a schema-valid invalid DAG", async () => {
    const result = await runLangChainOrchestratorResult({
      context: {
        checklists: [],
        now: "2026-07-14T12:00:00.000+08:00",
        pendingAction: null,
        plans: [],
      },
      message: "回答两个问题",
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
      modelFactory: promptJsonModelFactory(() => ({
            decisionCode: "compound_ready",
            mode: "compound",
            routingSummary: "invalid dag sentinel",
            tasks: [
              {
                agentRole: "query",
                args: { secret: "first-secret" },
                dependsOn: [],
                id: "t1",
                intent: "compose_plan",
                label: "first-label",
              },
              {
                agentRole: "query",
                args: { secret: "second-secret" },
                dependsOn: ["t3"],
                id: "t2",
                intent: "query_plan",
                label: "second-label",
              },
            ],
            version: 2,
          })),
      structuredRetryBudget: { schema: 0, transport: 0 },
    });

    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") return;
    assert.equal(result.reason, "invalid_dag");
    assert.deepEqual(result.schemaValidDecision, {
      decisionCode: "compound_ready",
      intents: ["compose_plan", "query_plan"],
      mode: "compound",
      taskCount: 2,
    });
    assert.doesNotMatch(
      JSON.stringify(result),
      /first-secret|second-secret|first-label|second-label|invalid dag sentinel|t1|t2/,
    );
  });
});

describe("langchain-orchestrator (schema + mapper contracts)", () => {
  describe("orchestrator output schema", () => {
    it("valid single plan parses correctly", () => {
      const output = {
        version: 2,
        decisionCode: "explicit_write_ready",
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
        version: 2,
        decisionCode: "compound_ready",
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

    it("rejects task IDs outside the shared t-number format", () => {
      const result = orchestratorOutputSchema.safeParse({
        version: 2,
        decisionCode: "pure_read_query",
        mode: "single",
        routingSummary: "查询进度",
        tasks: [{
          id: "task-1",
          label: "查询",
          intent: "query_progress",
          args: {},
          dependsOn: [],
          agentRole: "query",
        }],
      });

      assert.equal(result.success, false);
    });

    it("rejects unknown intent", () => {
      const output = {
        version: 2,
        decisionCode: "pure_read_query",
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
        version: 2,
        decisionCode: "pure_consultation",
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
        version: 2,
        decisionCode: "pure_consultation",
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
        version: 2,
        decisionCode: "pure_consultation",
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
        version: 2,
        decisionCode: "pure_consultation",
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
        version: 2,
        decisionCode: "compound_ready",
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
        version: 2,
        decisionCode: "compound_ready",
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
        version: 2,
        decisionCode: "explicit_write_ready",
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
        version: 2,
        decisionCode: "pure_consultation",
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
        version: 2,
        decisionCode: "pure_read_query",
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
        version: 2,
        decisionCode: "explicit_write_ready",
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
        version: 2,
        decisionCode: "explicit_write_missing_resource",
        mode: "single",
        routingSummary: "需要更多信息",
        tasks: [
          { id: "t1", label: "追问", intent: "clarify", args: { question: "请补充标题" }, dependsOn: [], agentRole: "query" },
        ],
      });
      assert.equal(plan.tasks[0].intent, "clarify");
    });
  });

  describe("mapper: existing resources", () => {
    it("existing plan ID is preserved", () => {
      const plan = mapStructuredOutputToPlan({
        version: 2,
        decisionCode: "explicit_write_ready",
        mode: "single",
        routingSummary: "使用已有计划",
        tasks: [
          { id: "t1", label: "追加", intent: "append_plan_item", args: { planId: 42, item: "new" }, dependsOn: [], agentRole: "plan" },
        ],
      });
      assert.equal((plan.tasks[0].args as Record<string, unknown>).planId, 42);
    });

  });
});
