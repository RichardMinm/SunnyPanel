import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import {
  createRunFullLangGraphAgentChatPipeline,
  type FullLangGraphAdapterSteps,
} from "../../src/lib/agent/langgraph/full-adapter";
import type { AgentActionReceiptStore } from "../../src/lib/agent/action-receipts";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type {
  AgentChatResponse,
  PendingAction,
} from "../../src/lib/agent/schemas";
import type { ProposedAgentAction } from "../../src/lib/agent/schemas";
import type { AgentThread } from "../../src/payload-types";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 4,
  inputTokens: 2,
  outputTokens: 0,
  source: "estimate",
  totalTokens: 6,
};

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-06-22T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

// Mutation caught: routing a cancelled orchestration response through normal
// graph finalization would persist a turn after the caller disconnected.
test("full adapter terminates cancelled orchestration before resolution or persistence", async () => {
  const caller = new AbortController();
  let appendCount = 0;
  let finalizerCount = 0;
  let learningCount = 0;
  let payloadAccesses = 0;
  const thread = {
    id: 41,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  let propagatedSignal: AbortSignal | undefined;
  let propagatedHistory: unknown;
  let propagatedConversationState: unknown;
  const recentHistory = [{
    content: "上一轮目标",
    role: "user" as const,
  }];
  const conversationState = {
    lastAnswerDepth: "brief" as const,
    lastAssistantAnswerSummary: "上一轮摘要",
    lastMentionedEntities: ["FastJSON"],
    lastTopic: "FastJSON",
    lastUserIntent: "answer_question" as const,
    updatedAt: "2026-07-29T10:00:00.000+08:00",
  };
  const payload = new Proxy({} as never, {
    get() {
      payloadAccesses += 1;
      throw new Error("Payload access is forbidden after caller cancellation.");
    },
  });
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async () => {
      appendCount += 1;
      throw new Error("Cancellation must not append a thread turn.");
    },
    runAgentLearningLoop: async () => {
      learningCount += 1;
      throw new Error("Cancellation must not run the learning loop.");
    },
    runBuildContextStep: async () => ({
      context,
      contextSummary: "上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: [],
        recentActions: [],
        sessionId: "signal-propagation",
      },
    }),
    runDryRunAndProposeStep: async () => {
      throw new Error("Cancellation clarification must skip dry-run.");
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("Cancellation clarification must skip execution.");
    },
    runOrchestrationStep: async (params) => {
      propagatedSignal = params.signal;
      propagatedHistory = params.resolvedHistory;
      propagatedConversationState = params.conversationState;
      caller.abort(new DOMException("Client disconnected", "AbortError"));
      return {
        outcome: "cancelled",
        data: {
          safeMessage: "请求已被取消。",
          tokenUsage: params.tokenUsage,
        },
      };
    },
    runResolveIntentStep: async () => {
      throw new Error("Cancellation clarification must skip intent resolution.");
    },
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      conversationState,
      contextPreferences: null,
      finalizeTurn: async ({ response }) => {
        finalizerCount += 1;
        return response;
      },
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "安排计划",
      payload,
      pendingAction: null,
      resolvedHistory: recentHistory,
      signal: caller.signal,
      structuredConfirmation: null,
      thread,
      user: { id: 7 },
      userPreferences: null,
      workbenchMode: "plan",
    },
    steps,
    { checkpointer: new MemorySaver() },
  );

  const response = await run();

  assert.equal(propagatedSignal, caller.signal);
  assert.deepEqual(propagatedHistory, recentHistory);
  assert.deepEqual(propagatedConversationState, conversationState);
  assert.equal(caller.signal.aborted, true);
  assert.equal(response.assistantMessage, "请求已被取消。");
  assert.equal(response.intent, "clarify");
  assert.equal(response.pendingAction, null);
  assert.equal(response.threadId, thread.id);
  assert.equal(appendCount, 0);
  assert.equal(finalizerCount, 0);
  assert.equal(learningCount, 0);
  assert.equal(payloadAccesses, 0);
});

test("full adapter rejects an already-aborted request before context or checkpoint work", async () => {
  const caller = new AbortController();
  caller.abort(new DOMException("Client disconnected", "AbortError"));
  let buildCount = 0;
  let orchestrationCount = 0;
  let finalizerCount = 0;
  let appendCount = 0;
  let learningCount = 0;
  let payloadAccesses = 0;
  const thread = {
    id: 141,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  const payload = new Proxy({} as never, {
    get() {
      payloadAccesses += 1;
      throw new Error("An already-cancelled request must not access Payload.");
    },
  });
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async () => {
      appendCount += 1;
      throw new Error("An already-cancelled request must not append a turn.");
    },
    runAgentLearningLoop: async () => {
      learningCount += 1;
      throw new Error("An already-cancelled request must not learn.");
    },
    runBuildContextStep: async () => {
      buildCount += 1;
      throw new Error("An already-cancelled request must not build context.");
    },
    runDryRunAndProposeStep: async () => {
      throw new Error("An already-cancelled request must not dry-run.");
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("An already-cancelled request must not execute.");
    },
    runOrchestrationStep: async () => {
      orchestrationCount += 1;
      throw new Error("An already-cancelled request must not orchestrate.");
    },
    runResolveIntentStep: async () => {
      throw new Error("An already-cancelled request must not resolve.");
    },
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      finalizeTurn: async ({ response }) => {
        finalizerCount += 1;
        return response;
      },
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "安排计划",
      payload,
      pendingAction: null,
      resolvedHistory: [],
      signal: caller.signal,
      structuredConfirmation: null,
      thread,
      turnId: "already-cancelled-turn",
      user: { id: 7 },
      userPreferences: null,
      workbenchMode: "plan",
    },
    steps,
  );

  const response = await run();

  assert.equal(response.assistantMessage, "请求已被取消。");
  assert.equal(response.turnId, "already-cancelled-turn");
  assert.equal(buildCount, 0);
  assert.equal(orchestrationCount, 0);
  assert.equal(finalizerCount, 0);
  assert.equal(appendCount, 0);
  assert.equal(learningCount, 0);
  assert.equal(payloadAccesses, 0);
});

test("full adapter does not replay a cancelled checkpoint into the next healthy turn", async () => {
  const checkpointer = new MemorySaver();
  const pendingAction: PendingAction = {
    action: {
      args: { title: "待确认计划" },
      changes: [{
        collection: "plans",
        operation: "create",
        preview: "创建待确认计划",
      }],
      id: "pending-plan-action",
      intent: "create_plan",
      requiresConfirmation: true,
      riskLevel: "medium",
      summary: "创建待确认计划",
    },
    type: "await_confirmation" as const,
  };
  const thread = {
    id: 142,
    messages: [],
    pendingAction,
  } as unknown as AgentThread;
  let orchestrationCount = 0;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async () => {
      throw new Error("This checkpoint regression test must not persist.");
    },
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async ({ pendingAction: currentPending }) => ({
      context: { ...context, pendingAction: currentPending },
      contextSummary: "取消重放测试上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: currentPending ? [currentPending] : [],
        recentActions: [],
        sessionId: "cancelled-checkpoint-replay",
      },
    }),
    runDryRunAndProposeStep: async () => {
      throw new Error("This checkpoint regression test must not dry-run.");
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("This checkpoint regression test must not execute.");
    },
    runOrchestrationStep: async ({ tokenUsage: usage }) => {
      orchestrationCount += 1;
      if (orchestrationCount === 1) {
        return {
          outcome: "cancelled",
          data: {
            safeMessage: "请求已被取消。",
            tokenUsage: usage,
          },
        };
      }
      return {
        outcome: "early_exit",
        response: {
          assistantMessage: "第二轮已重新编排。",
          confidence: 1,
          engine: "workflow",
          intent: "answer_question",
          pendingAction,
          threadId: thread.id,
          tokenUsage: usage,
          trace: [],
          turnId: "healthy-turn",
        },
      };
    },
    runResolveIntentStep: async () => {
      throw new Error("This checkpoint regression test must not resolve.");
    },
  };
  const createRun = (turnId: string) =>
    createRunFullLangGraphAgentChatPipeline(
      {
        baseTokenUsage: tokenUsage,
        contextPreferences: null,
        finalizeTurn: async ({ response }) => response,
        generateIntentWithAgentModel: async () => null,
        intentModelEngine: "heuristic",
        message: turnId === "cancelled-turn" ? "取消" : "重新开始",
        payload: {} as never,
        pendingAction,
        resolvedHistory: [],
        structuredConfirmation: null,
        thread,
        turnId,
        user: { id: 7 },
        userPreferences: null,
        workbenchMode: "plan",
      },
      steps,
      { checkpointer },
    );

  const cancelled = await createRun("cancelled-turn")();
  const healthy = await createRun("healthy-turn")();

  assert.equal(cancelled.assistantMessage, "请求已被取消。");
  assert.equal(cancelled.turnId, "cancelled-turn");
  assert.equal(healthy.assistantMessage, "第二轮已重新编排。");
  assert.equal(healthy.turnId, "healthy-turn");
  assert.equal(orchestrationCount, 2);
});

test("full adapter uses the parent checkpoint namespace for the mounted native subgraph", () => {
  const source = readFileSync(
    "src/lib/agent/langgraph/full-adapter.ts",
    "utf8",
  );

  assert.match(
    source,
    /compileMountedOrchestrationSubgraph/,
  );
  assert.doesNotMatch(source, /:compound:/);
  assert.doesNotMatch(source, /executeCompound/);
  assert.doesNotMatch(source, /runOrchestrationSubgraph/);
  assert.match(source, /repair:\s*async/);
  assert.match(source, /replan:\s*async/);
});

test("full adapter reuses production steps and delegates persistence to the shared finalizer", async () => {
  const order: string[] = [];
  let appendCount = 0;
  let finalizerCount = 0;
  let learningCount = 0;
  const thread = {
    id: 42,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async () => {
      appendCount += 1;
      order.push("append");
      return { ...thread, id: 42 } as AgentThread;
    },
    runAgentLearningLoop: async () => {
      learningCount += 1;
      order.push("learning");
      return {
        candidates: [],
        decisions: [],
        savedMemories: [],
        source: "fallback",
        suggestedMemories: [],
      };
    },
    runBuildContextStep: async () => {
      order.push("build");
      return {
        context,
        contextSummary: "上下文",
        tokenUsage,
        workingMemory: {
          pendingConfirmations: [],
          recentActions: [],
          sessionId: "test",
        },
      };
    },
    runDryRunAndProposeStep: async ({ tokenUsage: usage }) => {
      order.push("dry_run");
      return {
        data: {
          executionApproved: true,
          isDirectAnswer: false,
          tokenUsage: usage,
        },
        outcome: "execute",
      };
    },
    runExecuteAndPersistStep: async ({
      persistAgentTurn,
      resolution,
      tokenUsage: usage,
    }) => {
      order.push("execute");
      const updated = await persistAgentTurn({
        assistantMessage: "进度正常",
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        nextPendingAction: null,
      });

      return {
        assistantMessage: "进度正常",
        confidence: 0.9,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: null,
        threadId: updated.id,
        tokenUsage: usage,
      };
    },
    runOrchestrationStep: async ({ tokenUsage: usage }) => {
      order.push("orchestrate");
      return {
        data: {
          preResolvedIntent: null,
          tokenUsage: usage,
        },
        outcome: "continue",
      };
    },
    runResolveIntentStep: async ({ tokenUsage: usage }) => {
      order.push("resolve");
      return {
        data: {
          confirmedActionId: null,
          resolution: {
            engine: "heuristic",
            intent: {
              args: { scope: "all" },
              confidence: 0.9,
              intent: "query_progress",
            },
          },
          tokenUsage: usage,
        },
        outcome: "continue",
      };
    },
  };
  const deps = {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      finalizeTurn: async ({
        response,
      }: {
        response: AgentChatResponse;
      }) => {
        finalizerCount += 1;
        order.push("finalize");

        return {
          ...response,
          threadId: 42,
          turnId: "turn-shared-finalizer",
        };
      },
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic" as const,
      message: "总结进度",
      payload: {} as never,
      pendingAction: null,
      resolvedHistory: [],
      structuredConfirmation: null,
      thread,
      user: { id: 7 },
      userPreferences: null,
      workbenchMode: "review" as const,
    };
  const run = createRunFullLangGraphAgentChatPipeline(
    deps,
    steps,
    { checkpointer: new MemorySaver() },
  );

  const response = await run();

  assert.deepEqual(order, [
    "build",
    "orchestrate",
    "resolve",
    "dry_run",
    "execute",
    "finalize",
  ]);
  assert.equal(appendCount, 0);
  assert.equal(learningCount, 0);
  assert.equal(finalizerCount, 1);
  assert.equal(response.assistantMessage, "进度正常");
  assert.equal(response.workbenchMode, "review");
  assert.equal(response.turnId, "turn-shared-finalizer");
});

test("full adapter finalizes an ordinary graph failure exactly once", async () => {
  const rawError = "postgres://agent:private-password@10.0.1.5:5432/sunny | sk-d6c-private-provider-token | /Users/private/runtime.ts:19";
  let appendCount = 0;
  let learningCount = 0;
  const pendingAction = {
    args: {},
    intent: "create_plan" as const,
    missingFields: ["title"],
    question: "请补充计划名称",
    type: "await_clarification" as const,
  };
  const thread = {
    id: 43,
    messages: [],
    pendingAction,
  } as unknown as AgentThread;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction: nextPendingAction }) => {
      appendCount += 1;
      return {
        ...thread,
        pendingAction: nextPendingAction,
      } as AgentThread;
    },
    runAgentLearningLoop: async () => {
      learningCount += 1;
      return {
        candidates: [],
        decisions: [],
        savedMemories: [],
        source: "fallback",
        suggestedMemories: [],
      };
    },
    runBuildContextStep: async () => {
      throw new Error(rawError);
    },
    runDryRunAndProposeStep: async () => {
      throw new Error("dry_run should not run");
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("execute should not run");
    },
    runOrchestrationStep: async () => {
      throw new Error("orchestrate should not run");
    },
    runResolveIntentStep: async () => {
      throw new Error("resolve should not run");
    },
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "继续",
      payload: {} as never,
      pendingAction,
      resolvedHistory: [],
      structuredConfirmation: null,
      thread,
      user: { id: 7 },
      userPreferences: null,
      workbenchMode: "ask",
    },
    steps,
    { checkpointer: new MemorySaver() },
  );

  const response = await run();

  assert.equal(appendCount, 1);
  assert.equal(learningCount, 1);
  assert.equal(response.intent, "clarify");
  assert.equal(response.pendingAction?.type, "await_clarification");
  assert.match(response.assistantMessage, /处理请求时遇到问题/);
  assert.match(response.trace?.[0]?.detail ?? "", /runtime_failed/);
  assert.equal(JSON.stringify(response).includes(rawError), false);
  assert.doesNotMatch(JSON.stringify(response), /private-password|sk-d6c|\/Users\/private/u);
});

test("full adapter resumes a checkpointed confirmation without duplicate writes", async () => {
  const checkpointer = new MemorySaver();
  let appendCount = 0;
  let dryRunCount = 0;
  let receiptClaims = 0;
  let receiptCompletions = 0;
  let currentThread = {
    id: 77,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  const action: ProposedAgentAction = {
    args: { title: "恢复计划" },
    changes: [
      {
        collection: "plans",
        operation: "create",
        preview: "创建恢复计划",
      },
    ],
    id: "resume-action",
    intent: "create_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    summary: "创建恢复计划",
  };
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction: nextPendingAction }) => {
      appendCount += 1;
      currentThread = {
        ...currentThread,
        pendingAction: nextPendingAction,
      } as AgentThread;
      return currentThread;
    },
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async ({ pendingAction }) => ({
      context: { ...context, pendingAction },
      contextSummary: "上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: pendingAction ? [pendingAction] : [],
        recentActions: [],
        sessionId: "resume-test",
      },
    }),
    runDryRunAndProposeStep: async ({
      persistAgentTurn,
      resolution,
      tokenUsage: usage,
    }) => {
      dryRunCount += 1;

      if (dryRunCount === 1) {
        const pendingAction = {
          action,
          type: "await_confirmation" as const,
        };
        const assistantMessage = "请确认创建恢复计划";
        const updated = await persistAgentTurn({
          assistantMessage,
          confidence: 1,
          engine: resolution.engine,
          intent: resolution.intent.intent,
          nextPendingAction: pendingAction,
        });

        return {
          outcome: "early_exit",
          response: {
            assistantMessage,
            confidence: 1,
            engine: resolution.engine,
            intent: resolution.intent.intent,
            pendingAction,
            threadId: updated.id,
            tokenUsage: usage,
          },
        };
      }

      return {
        data: {
          executionApproved: true,
          isDirectAnswer: false,
          tokenUsage: usage,
        },
        outcome: "execute",
      };
    },
    runExecuteAndPersistStep: async ({
      persistAgentTurn,
      resolution,
      tokenUsage: usage,
    }) => {
      const updated = await persistAgentTurn({
        assistantMessage: "恢复计划已创建",
        confidence: 1,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        nextPendingAction: null,
      });

      return {
        assistantMessage: "恢复计划已创建",
        confidence: 1,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: null,
        threadId: updated.id,
        tokenUsage: usage,
      };
    },
    runOrchestrationStep: async ({ tokenUsage: usage }) => ({
      data: {
        preResolvedIntent: null,
        tokenUsage: usage,
      },
      outcome: "continue",
    }),
    runResolveIntentStep: async ({
      confirmationSignals,
      pendingAction,
      tokenUsage: usage,
    }) => {
      if (pendingAction?.type === "await_confirmation") {
        assert.equal(confirmationSignals.confirm, true);
      }

      return {
        data: {
          confirmedActionId:
            pendingAction?.type === "await_confirmation"
              ? pendingAction.action.id
              : null,
          resolution: {
            engine: "workflow",
            intent: {
              args: { title: "恢复计划" },
              confidence: 1,
              intent: "create_plan",
            },
          },
          tokenUsage: usage,
        },
        outcome: "continue",
      };
    },
  };
  const receiptStore: AgentActionReceiptStore = {
    claim: async () => {
      receiptClaims += 1;
      return {
        receiptId: 1,
        status: "claimed",
      };
    },
    complete: async () => {
      receiptCompletions += 1;
    },
    markIndeterminate: async () => undefined,
  };
  const createRun = (
    message: string,
    structuredConfirmation: null | {
      actionId: string;
      type: "confirm";
    },
  ) =>
    createRunFullLangGraphAgentChatPipeline(
      {
        baseTokenUsage: tokenUsage,
        contextPreferences: null,
        generateIntentWithAgentModel: async () => null,
        intentModelEngine: "heuristic",
        message,
        payload: {} as never,
        pendingAction:
          currentThread.pendingAction as AgentThread["pendingAction"] as never,
        resolvedHistory: [],
        structuredConfirmation,
        thread: currentThread,
        user: { id: 9 },
        userPreferences: null,
        workbenchMode: "plan",
      },
      steps,
      { checkpointer, receiptStore },
    );

  const interrupted = await createRun("创建恢复计划", null)();

  assert.equal(interrupted.pendingAction?.type, "await_confirmation");
  assert.equal(appendCount, 1);

  // Simulate a stale/missing AgentThread pending projection after the graph
  // checkpoint has already persisted the interrupt.
  currentThread = {
    ...currentThread,
    pendingAction: null,
  } as AgentThread;

  const resumed = await createRun("确认", {
    actionId: "resume-action",
    type: "confirm",
  })();

  assert.equal(dryRunCount, 2);
  assert.equal(resumed.assistantMessage, "恢复计划已创建");
  assert.equal(resumed.pendingAction, null);
  assert.equal(appendCount, 2);
  assert.equal(receiptClaims, 1);
  assert.equal(receiptCompletions, 1);
});

test("full adapter claims an action receipt before orchestration auto-executes a write", async () => {
  let receiptClaims = 0;
  let receiptCompletions = 0;
  let executions = 0;
  const thread = {
    id: 88,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  const action: ProposedAgentAction = {
    args: { title: "自动计划" },
    changes: [
      {
        collection: "plans",
        operation: "create",
        preview: "创建自动计划",
      },
    ],
    id: "orchestration-auto-action",
    intent: "create_plan",
    requiresConfirmation: false,
    riskLevel: "low",
    summary: "自动创建计划",
  };
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction }) =>
      ({ ...thread, pendingAction } as AgentThread),
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async () => ({
      context,
      contextSummary: "上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: [],
        recentActions: [],
        sessionId: "orchestration-receipt",
      },
    }),
    runDryRunAndProposeStep: async () => {
      throw new Error("orchestration early exit should skip ordinary dry-run");
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("orchestration early exit should skip ordinary execute");
    },
    runOrchestrationStep: async ({
      executeAction,
      persistAgentTurn,
      tokenUsage: usage,
    }) => {
      assert.ok(executeAction);
      const executed = await executeAction(
        {
          args: { title: "自动计划" },
          intent: "create_plan",
        },
        action,
      );
      const updated = await persistAgentTurn({
        assistantMessage: executed.assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: "create_plan",
        nextPendingAction: null,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage: executed.assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: "create_plan",
          pendingAction: null,
          threadId: updated.id,
          tokenUsage: usage,
        },
      };
    },
    runResolveIntentStep: async () => {
      throw new Error("orchestration early exit should skip intent resolution");
    },
  };
  const receiptStore: AgentActionReceiptStore = {
    claim: async ({ actionId }) => {
      assert.equal(actionId, action.id);
      receiptClaims += 1;
      return { receiptId: 22, status: "claimed" };
    },
    complete: async (_receiptId, response) => {
      assert.equal(
        (response as { assistantMessage?: string }).assistantMessage,
        "自动计划已创建",
      );
      receiptCompletions += 1;
    },
    markIndeterminate: async () => undefined,
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "自动创建计划",
      payload: {} as never,
      pendingAction: null,
      resolvedHistory: [],
      structuredConfirmation: null,
      thread,
      user: { id: 12 },
      userPreferences: null,
      workbenchMode: "plan",
    },
    steps,
    {
      checkpointer: new MemorySaver(),
      executeIntent: async () => {
        executions += 1;
        return {
          assistantMessage: "自动计划已创建",
          pendingAction: null,
          rollbackPayload: {
            strategy: "delete_created_document",
            target: { collection: "plans", documentId: 99 },
          },
        };
      },
      receiptStore,
    },
  );

  const response = await run();

  assert.equal(response.assistantMessage, "自动计划已创建");
  assert.equal(executions, 1);
  assert.equal(receiptClaims, 1);
  assert.equal(receiptCompletions, 1);
});

test("full adapter imports a legacy pending projection when no checkpoint exists", async () => {
  const action: ProposedAgentAction = {
    args: { title: "旧线程计划" },
    changes: [
      {
        collection: "plans",
        operation: "create",
        preview: "创建旧线程计划",
      },
    ],
    id: "legacy-pending-action",
    intent: "create_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    summary: "创建旧线程计划",
  };
  const pendingAction = {
    action,
    type: "await_confirmation" as const,
  };
  const thread = {
    id: 91,
    messages: [],
    pendingAction,
  } as unknown as AgentThread;
  let receiptClaims = 0;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction: nextPendingAction }) =>
      ({ ...thread, pendingAction: nextPendingAction } as AgentThread),
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async ({ pendingAction: currentPending }) => ({
      context: { ...context, pendingAction: currentPending },
      contextSummary: "旧线程上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: currentPending ? [currentPending] : [],
        recentActions: [],
        sessionId: "legacy-pending-import",
      },
    }),
    runDryRunAndProposeStep: async ({ tokenUsage: usage }) => ({
      data: {
        executionApproved: true,
        isDirectAnswer: false,
        tokenUsage: usage,
      },
      outcome: "execute",
    }),
    runExecuteAndPersistStep: async ({
      persistAgentTurn,
      resolution,
      tokenUsage: usage,
    }) => {
      const updated = await persistAgentTurn({
        assistantMessage: "旧线程计划已创建",
        confidence: 1,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        nextPendingAction: null,
      });

      return {
        assistantMessage: "旧线程计划已创建",
        confidence: 1,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: null,
        threadId: updated.id,
        tokenUsage: usage,
      };
    },
    runOrchestrationStep: async ({ tokenUsage: usage }) => ({
      data: { preResolvedIntent: null, tokenUsage: usage },
      outcome: "continue",
    }),
    runResolveIntentStep: async ({
      confirmationSignals,
      pendingAction: currentPending,
      tokenUsage: usage,
    }) => {
      assert.equal(currentPending?.type, "await_confirmation");
      assert.equal(confirmationSignals.confirm, true);

      return {
        data: {
          confirmedActionId: action.id,
          resolution: {
            engine: "workflow",
            intent: {
              args: { title: "旧线程计划" },
              intent: "create_plan",
            },
          },
          tokenUsage: usage,
        },
        outcome: "continue",
      };
    },
  };
  const receiptStore: AgentActionReceiptStore = {
    claim: async () => {
      receiptClaims += 1;
      return { receiptId: 31, status: "claimed" };
    },
    complete: async () => undefined,
    markIndeterminate: async () => undefined,
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "确认",
      payload: {} as never,
      pendingAction,
      resolvedHistory: [],
      structuredConfirmation: {
        actionId: action.id,
        type: "confirm",
      },
      thread,
      user: { id: 14 },
      userPreferences: null,
      workbenchMode: "plan",
    },
    steps,
    {
      checkpointer: new MemorySaver(),
      receiptStore,
    },
  );

  const response = await run();

  assert.equal(response.assistantMessage, "旧线程计划已创建");
  assert.equal(response.pendingAction, null);
  assert.equal(receiptClaims, 1);
});

test("full adapter resets completed graph state before a new ordinary turn", async () => {
  const checkpointer = new MemorySaver();
  let executeCount = 0;
  const thread = {
    id: 101,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction }) =>
      ({ ...thread, pendingAction } as AgentThread),
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async () => ({
      context,
      contextSummary: "连续回合上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: [],
        recentActions: [],
        sessionId: "sequential-turns",
      },
    }),
    runDryRunAndProposeStep: async ({ tokenUsage: usage }) => ({
      data: {
        executionApproved: true,
        isDirectAnswer: false,
        tokenUsage: usage,
      },
      outcome: "execute",
    }),
    runExecuteAndPersistStep: async ({
      persistAgentTurn,
      resolution,
      tokenUsage: usage,
    }) => {
      executeCount += 1;
      const assistantMessage = `第 ${executeCount} 次执行`;
      const updated = await persistAgentTurn({
        assistantMessage,
        confidence: 1,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        nextPendingAction: null,
      });

      return {
        assistantMessage,
        confidence: 1,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: null,
        threadId: updated.id,
        tokenUsage: usage,
      };
    },
    runOrchestrationStep: async ({ tokenUsage: usage }) => ({
      data: { preResolvedIntent: null, tokenUsage: usage },
      outcome: "continue",
    }),
    runResolveIntentStep: async ({ tokenUsage: usage }) => ({
      data: {
        confirmedActionId: null,
        resolution: {
          engine: "heuristic",
          intent: {
            args: { scope: "all" },
            intent: "query_progress",
          },
        },
        tokenUsage: usage,
      },
      outcome: "continue",
    }),
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "查询进度",
      payload: {} as never,
      pendingAction: null,
      resolvedHistory: [],
      structuredConfirmation: null,
      thread,
      user: { id: 15 },
      userPreferences: null,
      workbenchMode: "review",
    },
    steps,
    { checkpointer },
  );

  const first = await run();
  const second = await run();

  assert.equal(first.assistantMessage, "第 1 次执行");
  assert.equal(second.assistantMessage, "第 2 次执行");
  assert.equal(executeCount, 2);
});
