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
  assertPlannedVsActual,
  createEmptyTurnTrace,
  recordActualTool,
  recordRouterTrace,
  recordToolPlanTrace,
} from "../../src/lib/agent/trace/agent-turn-trace";
import { dispatchWorkflow } from "../../src/lib/agent/workflow/router";
import type { LLMRouterOutput } from "../../src/lib/agent/router/llm-router-schema";

const gateForRouter = (router: LLMRouterOutput) => {
  const intent = mapLLMRouterToIntent(router, router.slots.sourceText ?? "");
  const agentRouter = normalizeRouterOutput({ intent });

  return getAllowedCapabilities({
    intent,
    router: agentRouter,
    userContext: { userId: 1 },
  });
};

test("1 query schedule: ToolPlan only search_schedules", () => {
  const router: LLMRouterOutput = {
    action: "query",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: false,
    riskLevel: "none",
    slots: { sourceText: "今天有什么安排？" },
    target: "schedule",
    userVisibleReason: "查询今日日程",
    writeRequired: false,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.equal(plan.workflow, "query");
  assert.deepEqual(plan.plannedCapabilities, ["search_schedules"]);
  assert.ok(!plan.plannedCapabilities.some((name) => name.startsWith("preview_")));
  assert.ok(!plan.plannedCapabilities.some((name) => name.startsWith("execute_")));
});

test("2 create schedule: preview_create_schedule requires confirmation", () => {
  const router: LLMRouterOutput = {
    action: "create",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { date: "2026-06-26", sourceText: "明天下午安排会议", title: "会议" },
    target: "schedule",
    userVisibleReason: "创建日程提案",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });
  const dispatch = dispatchWorkflow({ confirmed: false, router, toolPlan: plan });

  assert.ok(plan.plannedCapabilities.includes("preview_create_schedule"));
  assert.ok(!gate.allowed.includes("execute_create_schedule"));
  assert.equal(dispatch.phase, "confirm");
  assert.equal(dispatch.allowExecute, false);
});

test("3 capability question: no preview tools", () => {
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

test("4 delete plan: preview_delete_plan with high risk confirmation", () => {
  const input = buildPreRouterGateInput({ message: "删除旧计划", userContext: { userId: 1 } });
  const gate = getAllowedCapabilities(input);
  const router: LLMRouterOutput = {
    action: "delete",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "high",
    slots: { entityName: "旧计划", sourceText: "删除旧计划" },
    target: "plan",
    userVisibleReason: "删除计划预览",
    writeRequired: true,
  };
  const deletePlan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.ok(deletePlan.plannedCapabilities.includes("preview_delete_plan"));
  assert.ok(!gate.allowed.includes("execute_delete_plan"));
});

test("5 update plan: resolve then preview_update", () => {
  const router: LLMRouterOutput = {
    action: "update",
    confidence: 0.88,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { changeDescription: "改为暂停", entityName: "高数计划", sourceText: "把高数计划改为暂停" },
    target: "plan",
    userVisibleReason: "更新计划状态",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.ok(plan.plannedCapabilities.includes("search_plans"));
  assert.ok(plan.plannedCapabilities.includes("preview_update_plan"));
});

test("6 expand_answer follow-up uses last_topic without clarify", () => {
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

test("7 not_found target blocks preview", () => {
  const router: LLMRouterOutput = {
    action: "delete",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "high",
    slots: { entityName: "不存在", sourceText: "删除不存在" },
    target: "plan",
    userVisibleReason: "删除计划",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({
    allowedCapabilities: gate.allowed,
    resolverResult: { question: "未找到计划", resolved: null, status: "not_found" },
    router,
  });

  assert.deepEqual(plan.plannedCapabilities, []);
  assert.ok(plan.blockedReason);
});

test("8 multiple targets blocks preview", () => {
  const router: LLMRouterOutput = {
    action: "delete",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "high",
    slots: { entityName: "计划", sourceText: "删除计划" },
    target: "plan",
    userVisibleReason: "删除计划",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({
    allowedCapabilities: gate.allowed,
    resolverResult: { question: "找到多个计划", resolved: null, status: "multiple" },
    router,
  });

  assert.deepEqual(plan.plannedCapabilities, []);
  assert.equal(plan.resolverStatus, "multiple");
});

test("9 query workflow dispatch has no write phase", () => {
  const router: LLMRouterOutput = {
    action: "query",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: false,
    riskLevel: "none",
    slots: { sourceText: "进度怎么样" },
    target: "plan",
    userVisibleReason: "查询进度",
    writeRequired: false,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });
  const dispatch = dispatchWorkflow({ confirmed: false, router, toolPlan: plan });

  assert.equal(dispatch.allowDryRun, false);
  assert.equal(dispatch.allowExecute, false);
  assert.equal(dispatch.phase, "search");
});

test("10 plannedTools matches actualTools through preview execute pair", () => {
  const router: LLMRouterOutput = {
    action: "create",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { sourceText: "新建计划", title: "学习计划" },
    target: "plan",
    userVisibleReason: "创建计划",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });
  const agentRouter = normalizeRouterOutput({ intent: mapLLMRouterToIntent(router, "新建计划") });

  let trace = createEmptyTurnTrace("wf-10");
  trace = recordRouterTrace(trace, agentRouter, { llmRouterOutput: router, toolPlan: plan });
  trace = recordToolPlanTrace(trace, plan);
  trace = recordActualTool(trace, plan.executeCapability ?? "execute_create_plan");

  const consistency = assertPlannedVsActual(trace);

  assert.equal(consistency.ok, true);
});

test("parseLLMRouterOutput validates router JSON", () => {
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
});

test("create schedule: previewForTarget returns schedule caps not plan caps", () => {
  const router: LLMRouterOutput = {
    action: "create",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { sourceText: "明天下午3点开会", title: "会议" },
    target: "schedule",
    userVisibleReason: "创建日程",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.equal(plan.workflow, "create");
  assert.ok(plan.plannedCapabilities.includes("search_schedules"));
  assert.ok(plan.plannedCapabilities.includes("preview_create_schedule"));
  assert.ok(!plan.plannedCapabilities.includes("preview_create_plan"));
  assert.ok(!plan.plannedCapabilities.includes("draft_plan"));
});

test("create timeline: previewForTarget returns timeline caps", () => {
  const router: LLMRouterOutput = {
    action: "create",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { sourceText: "添加一个事件", title: "事件" },
    target: "timeline",
    userVisibleReason: "创建事件",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.equal(plan.workflow, "create");
  assert.ok(plan.plannedCapabilities.includes("search_timeline"));
  assert.ok(plan.plannedCapabilities.includes("preview_create_timeline"));
  assert.ok(!plan.plannedCapabilities.includes("preview_create_plan"));
});

test("create checklist: previewForTarget returns checklist caps", () => {
  const router: LLMRouterOutput = {
    action: "create",
    confidence: 0.9,
    needsClarification: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    slots: { sourceText: "创建一个清单", title: "清单" },
    target: "checklist",
    userVisibleReason: "创建清单",
    writeRequired: true,
  };
  const gate = gateForRouter(router);
  const plan = buildToolPlan({ allowedCapabilities: gate.allowed, router });

  assert.equal(plan.workflow, "create");
  assert.ok(plan.plannedCapabilities.includes("search_checklists"));
  assert.ok(plan.plannedCapabilities.includes("draft_checklist"));
});

test("invalid router JSON falls back to clarify output", () => {
  const clarify = createClarifyRouterOutput("请补充信息");

  assert.equal(clarify.action, "clarify");
  assert.equal(clarify.needsClarification, true);
});
