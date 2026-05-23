import type { Payload } from "payload";

import { recordAgentFailure } from "@/lib/agent/audit";
import type { generateIntentWithAgentModel, StreamTokenCallback } from "@/lib/agent/client";
import { runBuildContextStep } from "@/lib/agent/chat-pipeline/build-context-step";
import { runDryRunAndProposeStep } from "@/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { runExecuteAndPersistStep } from "@/lib/agent/chat-pipeline/execute-and-persist-step";
import { runOrchestrationStep } from "@/lib/agent/chat-pipeline/orchestration-step";
import {
  resolveConfirmationSignals,
  type StructuredConfirmation,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import { runResolveIntentStep } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import { createLoopController } from "@/lib/agent/chat-pipeline/loop-controller";
import { logAgentEvent } from "@/lib/agent/logger";
import type { AgentThread } from "@/payload-types";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import {
  type AgentChatMessage,
  type AgentChatResponse,
  type AgentEngine,
  type AgentIntent,
  type AgentTraceStep,
  type PendingAction,
} from "@/lib/agent/schemas";
import { appendAgentThreadTurn } from "@/lib/agent/thread";
import type { ContextPreferences } from "@/lib/agent/chat-pipeline/handle-agent-chat-post";
import type { UserPreferences } from "@/lib/agent/user-preferences";

export type RunAgentChatPipelineDeps = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  contextPreferences?: ContextPreferences | null;
  generateIntentWithAgentModel: typeof generateIntentWithAgentModel;
  intentModelEngine: AgentEngine;
  message: string;
  payload: Payload;
  pendingAction: null | PendingAction;
  resolvedHistory: AgentChatMessage[];
  structuredConfirmation: null | StructuredConfirmation;
  thread: AgentThread;
  user: { id: number };
  userPreferences?: UserPreferences | null;
  workbenchMode?: AgentWorkbenchMode | null;
};

export const createRunAgentChatPipeline = (deps: RunAgentChatPipelineDeps) => {
  const {
    baseTokenUsage,
    contextPreferences,
    generateIntentWithAgentModel: modelResolver,
    intentModelEngine,
    message,
    payload,
    pendingAction,
    resolvedHistory,
    structuredConfirmation,
    thread,
    user,
    userPreferences,
    workbenchMode,
  } = deps;

  const messages = (thread.messages as Array<{ role: string }> | null) ?? [];
  const hasMessageHistory = messages.length > 0;
  const hasPendingAction = thread.pendingAction != null;
  const isFirstActionInThread = !hasMessageHistory && !hasPendingAction;

  const autoApproval = {
    isFirstActionInThread,
    // Only treat lastIntent as confirmed when pendingAction is null —
    // a non-null pendingAction means the last turn proposed (not executed) an action.
    lastIntent: hasPendingAction ? null : thread.lastIntent,
    pendingActionHistory: (hasPendingAction ? [thread.pendingAction as PendingAction] : []) as PendingAction[],
    threadId: thread.id,
    userPreferences,
  };

  const attachMeta = (response: AgentChatResponse): AgentChatResponse => ({
    ...response,
    workbenchMode: workbenchMode ?? undefined,
  });

  return async (
    emitStatus: (status: string) => void = () => undefined,
    emitTrace: (step: AgentTraceStep) => void = () => undefined,
    emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void = () => undefined,
    emitToken: StreamTokenCallback = () => undefined,
  ): Promise<AgentChatResponse> => {
    const trace: AgentTraceStep[] = [];
    const pushTrace = (step: AgentTraceStep) => {
      const index = trace.findIndex((item) => item.id === step.id);

      if (index === -1) {
        trace.push(step);
      } else {
        trace[index] = {
          ...trace[index],
          ...step,
        };
      }

      emitTrace(step);
    };
    const persistAgentTurn = async ({
      assistantMessage,
      confidence,
      engine,
      intent,
      nextPendingAction,
    }: {
      assistantMessage: string;
      confidence?: number;
      engine: AgentEngine;
      intent: AgentIntent["intent"];
      nextPendingAction: null | PendingAction;
    }) => {
      emitStatus("正在保存会话上下文...");
      pushTrace({
        detail: "会把这轮用户输入、Agent 回复和待处理动作一起写回 AgentThread。",
        id: "thread-writeback",
        kind: "write",
        status: "running",
        title: "正在保存会话上下文",
      });
      const updatedThread = await appendAgentThreadTurn({
        assistantMessage,
        confidence,
        engine,
        intent,
        pendingAction: nextPendingAction,
        thread,
        userMessage: message,
      });
      pushTrace({
        detail: `Thread #${updatedThread.id} 已更新，可继续承接这轮上下文。`,
        id: "thread-writeback",
        kind: "complete",
        status: "done",
        title: "会话上下文已保存",
      });

      return updatedThread;
    };

    const controller = createLoopController({ emitStatus, emitToken, emitTrace, emitUsage });
    let tokenUsage = baseTokenUsage;
    emitUsage(tokenUsage);

    // Emit placeholder immediately so the user sees content without waiting
    emitToken("正在分析你的请求...\n", 'thinking');

    // Build context once (refreshed per-loop iteration when needed)
    let contextStep = await runBuildContextStep({
      baseTokenUsage,
      contextPreferences: contextPreferences ?? undefined,
      emitStatus,
      emitToken,
      emitUsage,
      message,
      payload,
      pendingAction,
      pushTrace,
      workbenchMode,
    });
    const { context: initialContext } = contextStep;
    tokenUsage = contextStep.tokenUsage;
    controller.budget.consumeContext(contextStep.tokenUsage.contextTokens);

    const confirmationSignals = resolveConfirmationSignals({
      confirmation: structuredConfirmation,
      message,
      pendingAction,
    });

    let lastResponse: AgentChatResponse | null = null;
    let currentContext = initialContext;
    let currentPendingAction = pendingAction;

    // ── EOD Loop ──
    while (controller.shouldContinue()) {
      controller.advance("orchestrate");

      const orchestrationResult = await runOrchestrationStep({
        autoApproval,
        context: currentContext,
        emitStatus,
        emitToken,
        message,
        payload,
        pendingAction: currentPendingAction,
        persistAgentTurn,
        pushTrace,
        tokenUsage,
        trace,
        user,
      });

      if (orchestrationResult.outcome === "early_exit") {
        lastResponse = orchestrationResult.response;
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        // Track remaining proposal count so the controller has visibility into pending work
        if (lastResponse.pendingAction?.type === "await_batch_confirmation") {
          controller.setRemainingTasks(lastResponse.pendingAction.actions.length);
        }

        const nextPhase = controller.observe();
        if (nextPhase === "done") break;

        tokenUsage = lastResponse.tokenUsage ?? tokenUsage;
        currentPendingAction = lastResponse.pendingAction ?? null;
        continue;
      }

      tokenUsage = orchestrationResult.data.tokenUsage;

      const intentResult = await runResolveIntentStep({
        confirmationSignals,
        context: currentContext,
        emitStatus,
        emitToken,
        emitUsage,
        intentModelEngine,
        message,
        modelResolver,
        pendingAction: currentPendingAction,
        preResolvedIntent: orchestrationResult.data.preResolvedIntent,
        persistAgentTurn,
        pushTrace,
        resolvedHistory,
        thread,
        tokenUsage,
        trace,
        user,
      });

      if (intentResult.outcome === "early_exit") {
        lastResponse = intentResult.response;
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        break;
      }

      const {
        batchExecuteIntents,
        confirmedActionId,
        nextPendingAfterExecute,
        resolution,
        tokenUsage: tokenAfterIntent,
      } = intentResult.data;
      tokenUsage = tokenAfterIntent;

      if (batchExecuteIntents && batchExecuteIntents.length > 0) {
        lastResponse = attachMeta(
          await runExecuteAndPersistStep({
            batchExecuteIntents,
            confirmedActionId,
            emitStatus,
            emitToken,
            isDirectAnswer: false,
            persistAgentTurn,
            pushTrace,
            resolution,
            tokenUsage,
            trace,
            user,
          }),
        );
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = lastResponse.pendingAction ?? null;

        const nextPhase = controller.observe();
        if (nextPhase === "done") break;
        continue;
      }

      try {
        const dryResult = await runDryRunAndProposeStep({
          autoApproval,
          confirmedActionId,
          context: currentContext,
          emitStatus,
          emitToken,
          payload,
          persistAgentTurn,
          pushTrace,
          resolution,
          tokenUsage,
          trace,
          user,
        });

        if (dryResult.outcome === "early_exit") {
          lastResponse = dryResult.response;
          controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
          break;
        }

        const { isDirectAnswer, tokenUsage: tokenAfterDry } = dryResult.data;
        tokenUsage = tokenAfterDry;

        const execResult = await runExecuteAndPersistStep({
          confirmedActionId,
          emitStatus,
          emitToken,
          isDirectAnswer,
          nextPendingAfterExecute,
          persistAgentTurn,
          pushTrace,
          resolution,
          tokenUsage,
          trace,
          user,
        });

        lastResponse = attachMeta(execResult);
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = lastResponse.pendingAction ?? null;

        // Refresh context for next iteration if the loop continues
        if (lastResponse.pendingAction === null) {
          contextStep = await runBuildContextStep({
            baseTokenUsage,
            contextPreferences: contextPreferences ?? undefined,
            emitStatus,
            emitToken,
            emitUsage,
            message,
            payload,
            pendingAction: currentPendingAction,
            pushTrace,
            workbenchMode,
          });
          currentContext = contextStep.context;
          tokenUsage = { ...tokenUsage, contextTokens: contextStep.tokenUsage.contextTokens };
          controller.budget.consumeContext(contextStep.tokenUsage.contextTokens);
        }

        const nextPhase = controller.observe();
        if (nextPhase === "done") break;
      } catch (error) {
        await recordAgentFailure({
          error,
          intent: resolution.intent.intent,
          message,
        });
        logAgentEvent("error", "chat.intent_failed", {
          error: error instanceof Error ? error.message : "Unknown Agent failure",
          intent: resolution.intent.intent,
          threadId: thread.id,
          userId: user.id,
        });
        pushTrace({
          detail: error instanceof Error ? error.message : "Unknown Agent failure",
          id: "action-error",
          kind: "error",
          status: "error",
          title: "动作执行失败",
        });
        throw error;
      }
    }

    // Fallback: if no response was generated, produce one
    if (!lastResponse) {
      const progressSummary = controller.buildProgressSummary();
      lastResponse = {
        assistantMessage: `Agent 执行已完成（${progressSummary}）。`,
        confidence: 0.5,
        engine: "workflow",
        intent: "answer_question",
        pendingAction: null,
        threadId: thread.id,
        tokenUsage,
      };
    }

    return lastResponse;
  };
};
