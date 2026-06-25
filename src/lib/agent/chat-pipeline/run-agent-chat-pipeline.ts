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
import { toPromptThreadSummary } from "@/lib/agent/thread-summary";
import { runAgentLearningLoop } from "@/lib/agent/learning-loop";
import type { ContextPreferences } from "@/lib/agent/chat-pipeline/handle-agent-chat-post";
import type { UserPreferences } from "@/lib/agent/user-preferences";
import type { AgentTurnFinalizer } from "@/lib/agent/turn-finalizer";
import type { AgentPromptContext } from "@/lib/agent/prompts";
import {
  createAgentStreamController,
  type AgentStreamChangeEvent,
  type AgentStreamProgressEvent,
  type AgentStreamStageEvent,
} from "@/lib/agent/stream-events";

export type RunAgentChatPipelineDeps = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  contextPreferences?: ContextPreferences | null;
  finalizeTurn?: AgentTurnFinalizer;
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
  turnId?: string;
};

export const createRunAgentChatPipeline = (deps: RunAgentChatPipelineDeps) => {
  const {
    baseTokenUsage,
    contextPreferences,
    finalizeTurn,
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
  const threadSummary = toPromptThreadSummary(thread);
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
    emitStage: (event: AgentStreamStageEvent) => void = () => undefined,
    emitProgress: (event: AgentStreamProgressEvent) => void = () => undefined,
    emitChange: (event: AgentStreamChangeEvent) => void = () => undefined,
  ): Promise<AgentChatResponse> => {
    const trace: AgentTraceStep[] = [];
    const stream = createAgentStreamController({
      emitChange,
      emitProgress,
      emitStage,
    });
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
    let bufferedTurn: {
      assistantMessage: string;
      confidence?: number;
      engine: AgentEngine;
      intent: AgentIntent["intent"];
      nextPendingAction: null | PendingAction;
    } | null = null;
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
      if (finalizeTurn) {
        bufferedTurn = {
          assistantMessage,
          confidence,
          engine,
          intent,
          nextPendingAction,
        };

        return {
          ...thread,
          pendingAction: nextPendingAction,
        } as AgentThread;
      }

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
      await runAgentLearningLoop({
        assistantMessage,
        existingMemories: currentContextMemories,
        intent,
        message,
        pendingActionAfter: nextPendingAction,
        pendingActionBefore: currentPendingAction,
        pushTrace,
        sourceThread: updatedThread.id,
        tokenUsage,
        user,
      });

      return updatedThread;
    };

    const controller = createLoopController({ emitStatus, emitToken, emitTrace, emitUsage });
    let tokenUsage = baseTokenUsage;
    let currentContextMemories: AgentPromptContext["memories"] = [];
    let currentPendingAction = pendingAction;
    emitUsage(tokenUsage);

    // Emit placeholder immediately so the user sees content without waiting
    emitToken("正在分析你的请求...\n", 'thinking');

    // Build context once (refreshed per-loop iteration when needed)
    stream.start({
      id: "stage-context",
      phase: "context",
      title: "构建上下文",
    });
    stream.progress({
      detail: "读取计划、清单、记忆、时间线和最近 AgentRun。",
      message: "加载工作区数据",
      stageId: "stage-context",
    });
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
      stream,
      threadSummary,
      workbenchMode,
    });
    stream.progress({
      detail: [
        `${contextStep.context.plans.length} 个计划`,
        `${contextStep.context.checklists.length} 份清单`,
        `${contextStep.context.memories?.length ?? 0} 条记忆`,
      ].join(" · "),
      message: "上下文快照已生成",
      stageId: "stage-context",
    });
    stream.complete("stage-context", "上下文已就绪");
    const { context: initialContext, contextSummary } = contextStep;
    currentContextMemories = initialContext.memories ?? [];
    tokenUsage = contextStep.tokenUsage;
    controller.budget.consumeContext(contextStep.tokenUsage.contextTokens);

    let lastContextSummary = contextSummary;

    const confirmationSignals = resolveConfirmationSignals({
      confirmation: structuredConfirmation,
      message,
      pendingAction,
    });

    let lastResponse: AgentChatResponse | null = null;
    let currentContext = initialContext;

    // ── EOD Loop ──
    while (controller.shouldContinue()) {
      controller.advance("orchestrate");

      stream.start({
        id: "stage-orchestration",
        phase: "orchestration",
        title: "编排拆解",
      });
      stream.progress({
        detail: "判断是否需要拆成多个子任务，或保持单轮回答。",
        message: "检查复合意图",
        stageId: "stage-orchestration",
      });
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
        stream,
        tokenUsage,
        trace,
        user,
      });
      stream.complete(
        "stage-orchestration",
        orchestrationResult.outcome === "early_exit" ? "编排已生成结果" : "编排检查完成",
      );

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

      if (orchestrationResult.outcome === "compound") {
        throw new Error(
          "Legacy pipeline received a deferred compound plan unexpectedly.",
        );
      }

      stream.start({
        id: "stage-arbitration",
        phase: "arbitration",
        title: "意图仲裁",
      });
      stream.progress({
        detail: "综合用户输入、pending 状态、模式和编排候选。",
        message: "判断用户真实目标",
        stageId: "stage-arbitration",
      });
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
        stream,
        thread,
        tokenUsage,
        trace,
        user,
        workbenchMode,
      });
      stream.complete(
        "stage-arbitration",
        intentResult.outcome === "early_exit" ? "意图仲裁已完成" : "已决定下一步路线",
      );

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
        stream.start({
          id: "stage-execution",
          phase: "execution",
          title: "执行写入",
        });
        stream.progress({
          detail: `准备执行 ${batchExecuteIntents.length} 项已确认动作。`,
          message: "批量执行队列",
          stageId: "stage-execution",
        });
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
            stream,
            tokenUsage,
            trace,
            user,
          }),
        );
        stream.complete("stage-execution", "执行完成");
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = lastResponse.pendingAction ?? null;

        const nextPhase = controller.observe();
        if (nextPhase === "done") break;
        continue;
      }

      try {
        const isWriteLike = resolution.intent.intent !== "answer_question" && resolution.intent.intent !== "clarify";

        if (isWriteLike || confirmedActionId) {
          stream.start({
            id: "stage-dry-run",
            phase: "dry_run",
            title: "写入预检",
          });
          stream.progress({
            detail: "先生成变更预览和风险等级，确认后才会写入。",
            message: "运行 DryRun 安全门",
            stageId: "stage-dry-run",
          });
        }
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
          stream,
          tokenUsage,
          trace,
          user,
        });
        if (isWriteLike || confirmedActionId) {
          stream.complete(
            "stage-dry-run",
            dryResult.outcome === "early_exit" ? "预检已生成确认信息" : "预检通过",
          );
        }

        if (dryResult.outcome === "early_exit") {
          lastResponse = dryResult.response;
          controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
          break;
        }

        const { executionApproved, isDirectAnswer, tokenUsage: tokenAfterDry } = dryResult.data;
        tokenUsage = tokenAfterDry;

        if (!isDirectAnswer || confirmedActionId) {
          stream.start({
            id: isDirectAnswer ? "stage-response" : "stage-execution",
            phase: isDirectAnswer ? "response" : "execution",
            title: isDirectAnswer ? "组织回复" : "执行动作",
          });
          stream.progress({
            detail: isDirectAnswer ? "根据仲裁结果生成最终回答。" : "执行已确认或低风险动作。",
            message: isDirectAnswer ? "生成答案" : "写入或同步数据",
            stageId: isDirectAnswer ? "stage-response" : "stage-execution",
          });
        }
        const execResult = await runExecuteAndPersistStep({
          confirmedActionId,
          emitStatus,
          emitToken,
          executionApproved,
          isDirectAnswer,
          nextPendingAfterExecute,
          persistAgentTurn,
          pushTrace,
          resolution,
          stream,
          tokenUsage,
          trace,
          user,
        });
        if (!isDirectAnswer || confirmedActionId) {
          stream.complete(isDirectAnswer ? "stage-response" : "stage-execution", isDirectAnswer ? "回复已完成" : "执行完成");
        }

        lastResponse = attachMeta(execResult);
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = lastResponse.pendingAction ?? null;

        // Refresh context for next iteration if the loop continues
        if (lastResponse.pendingAction === null) {
          stream.start({
            id: "stage-context-refresh",
            phase: "context",
            title: "刷新上下文",
          });
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
            stream,
            streamStageId: "stage-context-refresh",
            threadSummary,
            workbenchMode,
          });
          currentContext = contextStep.context;
          currentContextMemories = currentContext.memories ?? [];
          tokenUsage = { ...tokenUsage, contextTokens: contextStep.tokenUsage.contextTokens };
          controller.budget.consumeContext(contextStep.tokenUsage.contextTokens);
          lastContextSummary = contextStep.contextSummary;
          stream.complete("stage-context-refresh", "上下文已刷新");
        }

        const nextPhase = controller.observe();
        if (nextPhase === "done") break;
      } catch (error) {
        logAgentEvent("error", "chat.pipeline_error", {
          error: error instanceof Error ? error.message : String(error),
          intent: resolution.intent.intent,
          threadId: thread.id,
        });
        await recordAgentFailure({
          error,
          intent: resolution.intent.intent,
          message,
          userId: user.id,
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

    if (lastContextSummary && !lastResponse.contextSummary) {
      lastResponse = { ...lastResponse, contextSummary: lastContextSummary };
    }

    if (finalizeTurn) {
      const turn = bufferedTurn as {
        assistantMessage: string;
        confidence?: number;
        engine: AgentEngine;
        intent: AgentIntent["intent"];
        nextPendingAction: null | PendingAction;
      } | null;
      const response = turn
        ? {
            ...lastResponse,
            assistantMessage: turn.assistantMessage,
            confidence: turn.confidence ?? lastResponse.confidence,
            engine: turn.engine,
            intent: turn.intent,
            pendingAction: turn.nextPendingAction,
          }
        : lastResponse;

      return finalizeTurn({
        existingMemories: currentContextMemories,
        pushTrace,
        response,
        tokenUsage: response.tokenUsage ?? tokenUsage,
      });
    }

    return lastResponse;
  };
};
