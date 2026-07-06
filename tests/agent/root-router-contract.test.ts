import assert from "node:assert/strict";
import { test } from "node:test";

import { getAllowedCapabilities } from "../../src/lib/agent/capabilities/tool-gate";
import { buildPreRouterGateInput } from "../../src/lib/agent/capabilities/pre-router";
import { buildToolPlan } from "../../src/lib/agent/plan/tool-plan";
import { routeCapabilityRouter } from "../../src/lib/agent/router/capability-router";
import { routeFollowUpRouter } from "../../src/lib/agent/router/follow-up-router-output";
import {
  createClarifyRouterOutput,
  parseLLMRouterOutput,
} from "../../src/lib/agent/router/llm-router-schema";
import { mapLLMRouterToIntent } from "../../src/lib/agent/router/map-llm-router-to-intent";
import { resolveRouterChain } from "../../src/lib/agent/router/resolve-router-chain";
import { normalizeRouterOutput } from "../../src/lib/agent/router/normalize-router-output";
import {
  classifyScheduleIntentBoundary,
  type ScheduleIntentBoundaryLlmClassifier,
} from "../../src/lib/agent/schedule/intent-boundary";
import {
  assertPlannedVsActual,
  createEmptyTurnTrace,
  recordActualTool,
  recordRouterTrace,
  recordToolPlanTrace,
} from "../../src/lib/agent/trace/agent-turn-trace";
import { dispatchWorkflow } from "../../src/lib/agent/workflow/router";
import type { LLMRouterOutput } from "../../src/lib/agent/router/llm-router-schema";

const routerOutput = (overrides: Partial<LLMRouterOutput>): LLMRouterOutput => {
  const { slots, ...rest } = overrides;

  return {
    action: "query",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: false,
    riskLevel: "none",
    target: "plan",
    userVisibleReason: "router contract",
    writeRequired: false,
    ...rest,
    slots: {
      sourceText: "test",
      ...(slots ?? {}),
    },
  };
};

const gateForRouter = (router: LLMRouterOutput) => {
  const intent = mapLLMRouterToIntent(router, router.slots.sourceText ?? "");
  const agentRouter = normalizeRouterOutput({ intent });

  return getAllowedCapabilities({
    intent,
    router: agentRouter,
    userContext: { userId: 1 },
  });
};

const planForRouter = (router: LLMRouterOutput) => {
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  return { gate, plan };
};

test("root router contract keeps schedule queries read-only", () => {
  const router = routerOutput({
    action: "query",
    slots: { sourceText: "今天有什么安排？" },
    target: "schedule",
    userVisibleReason: "查询今日日程",
    writeRequired: false,
  });
  const { plan } = planForRouter(router);
  const dispatch = dispatchWorkflow({ confirmed: false, router, toolPlan: plan });

  assert.equal(plan.workflow, "query");
  assert.deepEqual(plan.plannedCapabilities, ["search_schedules"]);
  assert.ok(!plan.plannedCapabilities.some((name) => name.startsWith("preview_")));
  assert.ok(!plan.plannedCapabilities.some((name) => name.startsWith("execute_")));
  assert.equal(dispatch.phase, "search");
  assert.equal(dispatch.allowDryRun, false);
  assert.equal(dispatch.allowExecute, false);
});

test("root router contract gates explicit schedule creation behind preview and confirmation", () => {
  const router = routerOutput({
    action: "create",
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { date: "2026-06-26", sourceText: "明天下午安排会议", title: "会议" },
    target: "schedule",
    userVisibleReason: "创建日程提案",
    writeRequired: true,
  });
  const { gate, plan } = planForRouter(router);
  const dispatch = dispatchWorkflow({ confirmed: false, router, toolPlan: plan });

  assert.ok(plan.plannedCapabilities.includes("preview_create_schedule"));
  assert.ok(!gate.allowed.includes("execute_create_schedule"));
  assert.equal(dispatch.phase, "confirm");
  assert.equal(dispatch.allowExecute, false);
});

test("root router contract keeps low-confidence schedule writes in safe fallback", () => {
  const classifier: ScheduleIntentBoundaryLlmClassifier = () => ({
    confidence: 0.7,
    intent: "create_schedule",
    readOrWrite: "write",
    reason: "模型不确定地猜测为创建日程",
  });
  const boundary = classifyScheduleIntentBoundary({
    llmEnabled: true,
    llmClassifier: classifier,
    userMessage: "帮我处理一下日程",
  });

  assert.equal(boundary.intent, "ambiguous");
  assert.equal(boundary.readOrWrite, "unclear");

  const clarifyRouter = createClarifyRouterOutput("请确认你是想查看日程，还是安排新的日程。");
  const intent = mapLLMRouterToIntent(clarifyRouter, "帮我处理一下日程");
  const agentRouter = normalizeRouterOutput({ intent });

  assert.equal(intent.intent, "clarify");
  assert.equal(agentRouter.action, "clarify");
});

test("root router contract keeps capability questions out of preview tools", () => {
  const router = routeCapabilityRouter("支持删除计划吗");

  assert.ok(router);
  assert.equal(router?.action, "capability");
  const chain = resolveRouterChain({ history: [], message: "支持删除计划吗" });

  assert.equal(chain?.source, "capability");
  const gate = gateForRouter(chain!.llmRouterOutput);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router: chain!.llmRouterOutput });

  assert.deepEqual(plan.plannedCapabilities, []);
  assert.equal(plan.workflow, "capability");
});

test("root router contract keeps destructive plan deletes preview-only before confirmation", () => {
  const input = buildPreRouterGateInput({ message: "删除旧计划", userContext: { userId: 1 } });
  const gate = getAllowedCapabilities(input);
  const router = routerOutput({
    action: "delete",
    requiresConfirmation: true,
    riskLevel: "high",
    slots: { entityName: "旧计划", sourceText: "删除旧计划" },
    target: "plan",
    userVisibleReason: "删除计划预览",
    writeRequired: true,
  });
  const deletePlan = buildToolPlan({ allowedCapabilities: gate.allowed, router });
  const dispatch = dispatchWorkflow({ confirmed: false, router, toolPlan: deletePlan });

  assert.ok(deletePlan.plannedCapabilities.includes("preview_delete_plan"));
  assert.ok(!gate.allowed.includes("execute_delete_plan"));
  assert.equal(dispatch.phase, "confirm");
  assert.equal(dispatch.allowExecute, false);
});

test("root router contract resolves plan updates before previewing writes", () => {
  const router = routerOutput({
    action: "update",
    confidence: 0.88,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { changeDescription: "改为暂停", entityName: "高数计划", sourceText: "把高数计划改为暂停" },
    target: "plan",
    userVisibleReason: "更新计划状态",
    writeRequired: true,
  });
  const { plan } = planForRouter(router);

  assert.ok(plan.plannedCapabilities.includes("search_plans"));
  assert.ok(plan.plannedCapabilities.includes("preview_update_plan"));
});

test("root router contract keeps follow-up expansion on the last topic", () => {
  const router = routeFollowUpRouter({
    conversationState: {
      lastAnswerDepth: "brief",
      lastAssistantAnswerSummary: "CTF 是夺旗赛",
      lastMentionedEntities: ["CTF"],
      lastTopic: "CTF",
      lastUserIntent: "explain_concept",
      updatedAt: new Date().toISOString(),
    },
    history: [
      { content: "什么是 CTF？", role: "user" },
      { content: "CTF 是夺旗赛...", role: "assistant" },
    ],
    message: "我需要更加详细的信息",
  });

  assert.ok(router);
  assert.equal(router?.action, "expand_answer");
  assert.equal(router?.target, "last_topic");
  assert.equal(router?.needsClarification, false);
});

test("root router contract blocks write previews when target resolution is unusable", () => {
  const cases = [
    { entityName: "不存在", expectedStatus: undefined, question: "未找到计划", status: "not_found" },
    { entityName: "计划", expectedStatus: "multiple", question: "找到多个计划", status: "multiple" },
  ] as const;

  for (const item of cases) {
    const router = routerOutput({
      action: "delete",
      requiresConfirmation: true,
      riskLevel: "high",
      slots: { entityName: item.entityName, sourceText: `删除${item.entityName}` },
      target: "plan",
      userVisibleReason: "删除计划",
      writeRequired: true,
    });
    const { gate } = planForRouter(router);
    const plan = buildToolPlan({
      allowedCapabilities: gate.allowed,
      resolverResult: { question: item.question, resolved: null, status: item.status },
      router,
    });

    assert.deepEqual(plan.plannedCapabilities, [], item.status);
    assert.ok(plan.blockedReason, item.status);
    if (item.expectedStatus) {
      assert.equal(plan.resolverStatus, item.expectedStatus);
    }
  }
});

test("root router contract records planned-vs-actual preview execute pairing", () => {
  const router = routerOutput({
    action: "create",
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { sourceText: "新建计划", title: "学习计划" },
    target: "plan",
    userVisibleReason: "创建计划",
    writeRequired: true,
  });
  const { plan } = planForRouter(router);
  const agentRouter = normalizeRouterOutput({ intent: mapLLMRouterToIntent(router, "新建计划") });

  let trace = createEmptyTurnTrace("wf-10");
  trace = recordRouterTrace(trace, agentRouter, { llmRouterOutput: router, toolPlan: plan });
  trace = recordToolPlanTrace(trace, plan);
  trace = recordActualTool(trace, plan.executeCapability ?? "execute_create_plan");

  const consistency = assertPlannedVsActual(trace);

  assert.equal(consistency.ok, true);
});

test("router schema contract parses valid JSON and has a clarification fallback", () => {
  const parsed = parseLLMRouterOutput({
    router: {
      action: "query",
      confidence: 0.8,
      needsClarification: false,
      requiresConfirmation: false,
      riskLevel: "none",
      slots: { sourceText: "test" },
      target: "schedule",
      userVisibleReason: "查询日程",
      writeRequired: false,
    },
  });

  assert.ok(parsed);
  assert.equal(parsed?.action, "query");

  const clarify = createClarifyRouterOutput("请补充信息");

  assert.equal(clarify.action, "clarify");
  assert.equal(clarify.needsClarification, true);
});

test("root router contract routes create previews to target-specific capabilities", () => {
  const cases = [
    {
      blocked: ["preview_create_plan", "draft_plan"],
      expected: ["search_schedules", "preview_create_schedule"],
      sourceText: "明天下午3点开会",
      target: "schedule",
      title: "会议",
    },
    {
      blocked: ["preview_create_plan"],
      expected: ["search_timeline", "preview_create_timeline"],
      sourceText: "添加一个事件",
      target: "timeline",
      title: "事件",
    },
    {
      blocked: [],
      expected: ["search_checklists", "draft_checklist"],
      sourceText: "创建一个清单",
      target: "checklist",
      title: "清单",
    },
    {
      blocked: ["preview_create_plan", "draft_plan"],
      expected: ["draft_writing_outline"],
      sourceText: "写一篇文章",
      target: "writing",
      title: "新文章",
    },
    {
      blocked: ["preview_create_plan", "draft_plan"],
      expected: ["search_memory"],
      sourceText: "记住我喜欢蓝色",
      target: "memory",
      title: undefined,
    },
  ] as const;

  for (const item of cases) {
    const router = routerOutput({
      action: "create",
      requiresConfirmation: true,
      riskLevel: "medium",
      slots: { sourceText: item.sourceText, title: item.title },
      target: item.target,
      userVisibleReason: "创建目标",
      writeRequired: true,
    });
    const { plan } = planForRouter(router);

    assert.equal(plan.workflow, "create", item.target);
    for (const capability of item.expected) {
      assert.ok(plan.plannedCapabilities.includes(capability), `${item.target} should include ${capability}`);
    }
    for (const capability of item.blocked) {
      assert.ok(!plan.plannedCapabilities.includes(capability), `${item.target} should not include ${capability}`);
    }
  }
});
