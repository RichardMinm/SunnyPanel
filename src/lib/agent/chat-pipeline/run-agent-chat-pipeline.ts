import type { Payload } from "payload";

import { recordAgentFailure } from "@/lib/agent/audit";
import type { generateIntentWithAgentModel } from "@/lib/agent/client";
import { runBuildContextStep } from "@/lib/agent/chat-pipeline/build-context-step";
import { runDryRunAndProposeStep } from "@/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { runExecuteAndPersistStep } from "@/lib/agent/chat-pipeline/execute-and-persist-step";
import {
  resolveConfirmationSignals,
  type StructuredConfirmation,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import { runResolveIntentStep } from "@/lib/agent/chat-pipeline/resolve-intent-step";
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
    workbenchMode,
  } = deps;

  const attachMeta = (response: AgentChatResponse): AgentChatResponse => ({
    ...response,
    workbenchMode: workbenchMode ?? undefined,
  });

  return async (
    emitStatus: (status: string) => void = () => undefined,
    emitTrace: (step: AgentTraceStep) => void = () => undefined,
    emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void = () => undefined,
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

    let tokenUsage = baseTokenUsage;
    emitUsage(tokenUsage);
    const contextStep = await runBuildContextStep({
      baseTokenUsage,
      contextPreferences: contextPreferences ?? undefined,
      emitStatus,
      emitUsage,
      message,
      payload,
      pendingAction,
      pushTrace,
      workbenchMode,
    });
    const { context } = contextStep;
    tokenUsage = contextStep.tokenUsage;

    const confirmationSignals = resolveConfirmationSignals({
      confirmation: structuredConfirmation,
      message,
      pendingAction,
    });

    const intentResult = await runResolveIntentStep({
      confirmationSignals,
      context,
      emitStatus,
      emitUsage,
      intentModelEngine,
      message,
      modelResolver,
      pendingAction,
      persistAgentTurn,
      pushTrace,
      resolvedHistory,
      thread,
      tokenUsage,
      trace,
      user,
    });

    if (intentResult.outcome === "early_exit") {
      return attachMeta(intentResult.response);
    }

    const { confirmedActionId, resolution, tokenUsage: tokenAfterIntent } = intentResult.data;
    tokenUsage = tokenAfterIntent;

    try {
      const dryResult = await runDryRunAndProposeStep({
        confirmedActionId,
        context,
        emitStatus,
        payload,
        persistAgentTurn,
        pushTrace,
        resolution,
        tokenUsage,
        trace,
        user,
      });

      if (dryResult.outcome === "early_exit") {
        return attachMeta(dryResult.response);
      }

      const { isDirectAnswer, tokenUsage: tokenAfterDry } = dryResult.data;
      tokenUsage = tokenAfterDry;

      return attachMeta(await runExecuteAndPersistStep({
        confirmedActionId,
        emitStatus,
        isDirectAnswer,
        persistAgentTurn,
        pushTrace,
        resolution,
        tokenUsage,
        trace,
        user,
      }));
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
  };
};
