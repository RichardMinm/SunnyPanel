import assert from "node:assert/strict";
import { test } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Payload } from "payload";

import {
  runOrchestrationStep,
} from "../../../src/lib/agent/chat-pipeline/orchestration-step";
import type {
  StructuredProviderAttemptEvent,
} from "../../../src/lib/agent/llm/invoke-structured";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import {
  projectOrchestratorFailureToSafePlan,
  runLangChainOrchestratorResult,
  type OrchestratorInvocationResult,
} from "../../../src/lib/agent/orchestration/langchain-orchestrator";
import type { OrchestratorPlan } from "../../../src/lib/agent/orchestration/types";
import type { AgentChatResponse } from "../../../src/lib/agent/schemas";
import type { AgentThread } from "../../../src/payload-types";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 1,
  inputTokens: 1,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 2,
};

const context = {
  checklists: [],
  now: "2026-07-26T12:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

// Mutation caught: dropping the request signal before the dispatcher would
// leave the structured Full Orchestrator running and eligible for recovery.
test("caller cancellation reaches the production orchestration seam exactly once", async () => {
  const caller = new AbortController();
  const providerEvents: StructuredProviderAttemptEvent[] = [];
  let providerAttempts = 0;
  let payloadAccesses = 0;
  let proposalOrPersistenceCalls = 0;
  let taskExecutionCalls = 0;
  let propagatedSignal: AbortSignal | undefined;
  let structuredResult: OrchestratorInvocationResult | undefined;
  const payload = new Proxy({} as Payload, {
    get() {
      payloadAccesses += 1;
      throw new Error("Payload access is forbidden after caller cancellation.");
    },
  });
  const modelFactory: ModelFactory = () => ({
    withConfig: () => ({
      invoke: async (
        _messages: unknown[],
        options: { signal?: AbortSignal } = {},
      ) => {
        providerAttempts += 1;
        caller.abort(new DOMException("Client disconnected", "AbortError"));
        assert.equal(options.signal?.aborted, true);
        throw new DOMException("Client disconnected", "AbortError");
      },
    }),
  }) as unknown as BaseChatModel;

  const result = await runOrchestrationStep({
    context,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    executeAction: async () => {
      taskExecutionCalls += 1;
      throw new Error("Task execution is forbidden after cancellation.");
    },
    hybridBoundaryMode: "disabled",
    message: "帮我制定发布计划",
    payload,
    pendingAction: null,
    persistAgentTurn: async () => {
      proposalOrPersistenceCalls += 1;
      throw new Error("Proposal persistence is forbidden after cancellation.");
    },
    pushTrace: () => undefined,
    runOrchestratorFn: async (message, promptContext, signal) => {
      propagatedSignal = signal;
      assert.equal(signal, caller.signal);
      structuredResult = await runLangChainOrchestratorResult({
        context: promptContext,
        message,
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
        modelFactory,
        providerAttemptObserver: (event) => providerEvents.push(event),
        signal,
        structuredRetryBudget: {
          schema: 1,
          timeout: {
            retries: 1,
            retryTimeoutMs: 50,
          },
          transport: 1,
        },
      });
      return structuredResult.status === "success"
        ? structuredResult.plan
        : projectOrchestratorFailureToSafePlan();
    },
    tokenUsage,
    trace: [],
    user: { collection: "users", id: 1 },
    signal: caller.signal,
  });

  assert.equal(propagatedSignal, caller.signal);
  assert.equal(providerAttempts, 1);
  assert.equal(structuredResult?.status, "unavailable");
  if (structuredResult?.status === "unavailable") {
    assert.equal(structuredResult.reason, "timeout");
    assert.equal(structuredResult.safeMessage, "请求已被取消。");
  }
  assert.deepEqual(
    providerEvents
      .filter((event) => event.phase === "failed")
      .map((event) => ({
        attempt: event.attempt,
        reason: event.reason,
        retryScheduled: event.retryScheduled,
      })),
    [{ attempt: 1, reason: "cancelled", retryScheduled: false }],
  );
  assert.equal(
    providerEvents.some(
      (event) =>
        event.phase === "failed"
        && event.reason === "timeout"
        && event.retryScheduled,
    ),
    false,
  );
  assert.equal(result.outcome, "continue");
  if (result.outcome === "continue") {
    assert.equal(result.data.preResolvedIntent?.intent, "clarify");
  }
  assert.equal(proposalOrPersistenceCalls, 0);
  assert.equal(taskExecutionCalls, 0);
  assert.equal(payloadAccesses, 0);
});

// Mutation caught: changing the injected service contract to require a signal
// parameter would break historical two-argument orchestration fakes.
test("historical two-argument orchestration fakes remain compatible", async () => {
  const caller = new AbortController();
  let calls = 0;
  const safePlan: OrchestratorPlan = {
    mode: "single",
    reasoning: "Historical fake result.",
    source: "llm",
    tasks: [{
      agentRole: "query",
      args: { question: "请确认请求。" },
      dependsOn: [],
      id: "t1",
      intent: "clarify",
      label: "确认请求",
    }],
  };

  const result = await runOrchestrationStep({
    context,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    hybridBoundaryMode: "disabled",
    message: "需要帮助",
    payload: {} as Payload,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
    pushTrace: () => undefined,
    runOrchestratorFn: async (message, promptContext) => {
      calls += 1;
      assert.equal(message, "需要帮助");
      assert.equal(promptContext, context);
      return safePlan;
    },
    tokenUsage,
    trace: [],
    user: { collection: "users", id: 1 },
    signal: caller.signal,
  });

  assert.equal(calls, 1);
  assert.equal(result.outcome, "continue");
  if (result.outcome === "continue") {
    assert.equal(result.data.preResolvedIntent?.intent, "clarify");
  }
});
