/**
 * Phase R6-C1-B: Legacy Heuristic Aggregator Retired Tests.
 *
 * Verifies:
 *  1. resolveAgentIntent / parseHeuristicIntent are NOT called in legacy step
 *  2. Controlled response has no pendingAction, no execute, no DB write
 *  3. Confirmation path still works
 *  4. Existing pendingAction confirm/cancel preserved
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  confirmationMatchesPending,
  resolveConfirmationSignals,
  restoreConfirmedIntent,
} from "../../../src/lib/agent/chat-pipeline/confirmation-step";
import {
  parseProposedAgentAction,
  type PendingAction,
} from "../../../src/lib/agent/schemas";
import { buildLegacyHeuristicRetiredResponse } from "../../../src/lib/agent/tool-planner/unavailable-response";
import { ConversationalAnswerStreamFailure } from "../../../src/lib/agent/answer/errors";
import { resolveLegacyHeuristicStep } from "../../../src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step";

const legacyResolutionSource = readFileSync(
  "src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step.ts",
  "utf8",
);

test("pre-resolved conversational answers delegate to the bounded LangChain answer runtime", () => {
  assert.match(legacyResolutionSource, /runConversationalAnswer/);
  assert.doesNotMatch(
    legacyResolutionSource,
    /for \(const token of splitIntoWordTokens\(preResolvedText\)\)/,
  );
});

const answerStepInput = () => ({
  confirmationSignals: { cancel: false, confirm: false },
  context: {
    checklists: [],
    now: "2026-07-14T00:00:00.000Z",
    pendingAction: null,
    plans: [],
  },
  emitStatus: () => undefined,
  emitToken: () => undefined,
  emitUsage: () => undefined,
  intentModelEngine: "workflow" as const,
  message: "解释零信任",
  modelResolver: async () => null,
  orchestratorPlanSource: "llm" as const,
  pendingAction: null,
  persistAgentTurn: async () => {
    throw new Error("answer step must not persist directly");
  },
  preResolvedIntent: {
    args: { answer: "" },
    confidence: 0.9,
    intent: "answer_question" as const,
  },
  pushTrace: () => undefined,
  resolvedHistory: [],
  tokenUsage: {
    contextTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
  trace: [],
  user: { id: 1 },
});

test("complete answer terminal continues with a persistable final intent", async () => {
  const result = await resolveLegacyHeuristicStep({
    ...answerStepInput(),
    conversationalAnswerRunner: async () => ({
      answer: "零信任要求持续验证。",
      persist: true,
      status: "complete" as const,
    }),
  } as never);

  assert.equal(result.outcome, "continue");
  if (result.outcome === "continue") {
    assert.equal(result.data.resolution.intent.intent, "answer_question");
    assert.equal(
      result.data.resolution.intent.intent === "answer_question"
        ? result.data.resolution.intent.args.answer
        : null,
      "零信任要求持续验证。",
    );
  }
});

test("trusted Legacy answer reuses its existing text with zero Answer Renderer calls", async () => {
  let answerRendererCalls = 0;
  const emitted: string[] = [];
  const preResolvedIntent = {
    args: { answer: "旧路径已经给出的答案。" },
    confidence: 0.9,
    intent: "answer_question" as const,
    reply: "旧路径已经给出的答案。",
  };
  const result = await resolveLegacyHeuristicStep({
    ...answerStepInput(),
    conversationalAnswerRunner: async () => {
      answerRendererCalls += 1;
      return {
        answer: "不应生成的新答案",
        persist: true,
        status: "complete" as const,
      };
    },
    emitToken: (token: string) => emitted.push(token),
    orchestratorRuntime: "legacy",
    preResolvedIntent,
  } as never);

  assert.equal(answerRendererCalls, 0);
  assert.equal(emitted.join(""), preResolvedIntent.args.answer);
  assert.equal(result.outcome, "continue");
  if (result.outcome === "continue") {
    assert.deepEqual(result.data.resolution.intent, preResolvedIntent);
  }
});

test("explicit LangChain answer still uses the bounded Answer Renderer", async () => {
  let answerRendererCalls = 0;
  const result = await resolveLegacyHeuristicStep({
    ...answerStepInput(),
    conversationalAnswerRunner: async () => {
      answerRendererCalls += 1;
      return {
        answer: "LangChain 渲染后的答案。",
        persist: true,
        status: "complete" as const,
      };
    },
    orchestratorRuntime: "langchain",
  } as never);

  assert.equal(answerRendererCalls, 1);
  assert.equal(result.outcome, "continue");
  if (result.outcome === "continue") {
    assert.equal(
      result.data.resolution.intent.intent === "answer_question"
        ? result.data.resolution.intent.args.answer
        : null,
      "LangChain 渲染后的答案。",
    );
  }
});

test("unavailable and incomplete answer terminals never reach persistence", async () => {
  for (const terminal of [
    { errorCode: "provider_error" as const, persist: false as const, status: "unavailable" as const },
    { errorCode: "tool_call" as const, partialOutputEmitted: true as const, persist: false as const, status: "incomplete" as const },
  ]) {
    await assert.rejects(
      resolveLegacyHeuristicStep({
        ...answerStepInput(),
        conversationalAnswerRunner: async () => terminal,
      } as never),
      ConversationalAnswerStreamFailure,
    );
  }
});

/* ═══════════════════════════════════════════════════════════════
   1. Legacy retired response is importable
   ═══════════════════════════════════════════════════════════════ */

test("buildLegacyHeuristicRetiredResponse is importable", () => {
  assert.ok(typeof buildLegacyHeuristicRetiredResponse === "function");
});

/* ═══════════════════════════════════════════════════════════════
   2. Controlled response shape
   ═══════════════════════════════════════════════════════════════ */

test("retired response has no pendingAction", () => {
  const response = buildLegacyHeuristicRetiredResponse({ threadId: 1 });
  assert.equal(response.pendingAction, null);
});

test("retired response has clarify intent", () => {
  const response = buildLegacyHeuristicRetiredResponse({ threadId: 1 });
  assert.equal(response.intent, "clarify");
});

test("retired response has natural Chinese message", () => {
  const response = buildLegacyHeuristicRetiredResponse({ threadId: 1 });
  assert.ok(response.assistantMessage.includes("LLM"));
  assert.ok(response.assistantMessage.includes("停用") || response.assistantMessage.includes("规则"));
  assert.ok(!response.assistantMessage.includes("parseHeuristicIntent"));
  assert.ok(!response.assistantMessage.includes("legacy_heuristic"));
});

/* ═══════════════════════════════════════════════════════════════
   3. No execute / no DB write
   ═══════════════════════════════════════════════════════════════ */

test("retired response has no execute markers", () => {
  const response = buildLegacyHeuristicRetiredResponse({ threadId: 1 });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("executeAgentIntent"));
  assert.ok(!s.includes("\"execute\""));
  assert.ok(!s.includes("payload.create"));
});

/* ═══════════════════════════════════════════════════════════════
   4. No secrets
   ═══════════════════════════════════════════════════════════════ */

test("retired response has no secrets", () => {
  const response = buildLegacyHeuristicRetiredResponse({ threadId: 1 });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
});

/* ═══════════════════════════════════════════════════════════════
   5. Trace has correct phase
   ═══════════════════════════════════════════════════════════════ */

test("retired response has backend trace event", () => {
  const response = buildLegacyHeuristicRetiredResponse({ threadId: 1 });
  assert.ok(response.backendTraceEvents);
  assert.ok(response.backendTraceEvents!.length >= 1);
  const event = response.backendTraceEvents![0];
  assert.equal(event.phase, "tool_planner_unavailable");
  assert.equal(event.status, "warning");
});

/* ═══════════════════════════════════════════════════════════════
   6. Confirmation safety preserved
   ═══════════════════════════════════════════════════════════════ */

test("existing pendingAction + confirm → confirm signal true", () => {
  const action = parseProposedAgentAction({
    id: "r6c1b-test-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "创建计划",
    changes: [{ collection: "plans", operation: "create", preview: "测试" }],
    args: { title: "R6-C1-B" },
  })!;
  const pa: PendingAction = { action, type: "await_confirmation" };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "r6c1b-test-001", type: "confirm" },
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, true);
});

test("existing pendingAction + cancel → cancel signal true", () => {
  const action = parseProposedAgentAction({
    id: "r6c1b-test-002",
    intent: "create_schedule_items",
    riskLevel: "medium",
    summary: "创建日程",
    changes: [{ collection: "schedule-items", operation: "create", preview: "测试" }],
    args: { items: [{ title: "R6-C1-B", date: "2026-07-10" }] },
  })!;
  const pa: PendingAction = { action, type: "await_confirmation" };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "r6c1b-test-002", type: "cancel" },
    message: "取消",
    pendingAction: pa,
  });
  assert.equal(signals.cancel, true);
});

test("confirmationMatchesPending still matches", () => {
  const action = parseProposedAgentAction({
    id: "r6c1b-match-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "匹配测试",
    changes: [{ collection: "plans", operation: "create", preview: "测试" }],
    args: { title: "测试" },
  })!;
  const pa = { action, type: "await_confirmation" } as Extract<PendingAction, { type: "await_confirmation" }>;
  assert.equal(confirmationMatchesPending(pa, { actionId: "r6c1b-match-001", type: "confirm" }), true);
});

test("restoreConfirmedIntent still works", () => {
  const action = parseProposedAgentAction({
    id: "r6c1b-restore-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "恢复测试",
    changes: [{ collection: "plans", operation: "create", preview: "测试" }],
    args: { title: "恢复测试" },
  })!;
  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_plan");
});

/* ═══════════════════════════════════════════════════════════════
   7. Legacy step module still importable (not deleted)
   ═══════════════════════════════════════════════════════════════ */

test("legacy-heuristic-resolution-step is still importable", async () => {
  const mod = await import("../../../src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step");
  assert.ok(typeof mod.resolveLegacyHeuristicStep === "function");
});

test("confirmation-resolution-step is still importable", async () => {
  const mod = await import("../../../src/lib/agent/chat-pipeline/confirmation-resolution-step");
  assert.ok(typeof mod.resolveConfirmationStep === "function");
});

test("resolve-intent-step facade is still importable", async () => {
  const mod = await import("../../../src/lib/agent/chat-pipeline/resolve-intent-step");
  assert.ok(typeof mod.runResolveIntentStep === "function");
});
