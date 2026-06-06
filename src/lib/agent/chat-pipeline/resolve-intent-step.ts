import { recordAgentConfirmationDecision, recordBatchConfirmationDecision } from "@/lib/agent/audit";
import {
  generateStreamingReply,
  type GenerateStreamingReplyArgs,
  type StreamTokenCallback,
} from "@/lib/agent/client";
import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import {
  resolveAwaitConfirmationBranch,
  restoreConfirmedBatchIntents,
  restoreConfirmedIntent,
  type ConfirmationSignals,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import { buildIntentTraceSummary } from "@/lib/agent/chat-pipeline/intent-trace";
import { resolveAgentIntent, type AgentModelIntentResolver } from "@/lib/agent/intent-resolution";
import { logAgentEvent } from "@/lib/agent/logger";
import type { AgentArbitrationDecision } from "@/lib/agent/intent/arbitration";
import {
  buildCognitiveAdvisoryAnswerWithModel,
  shouldUseCognitiveAdvisory,
} from "@/lib/agent/cognitive-advisory";
import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentEngine,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import { estimateTokenCount, splitIntoWordTokens } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";
import type { AgentStreamController } from "@/lib/agent/stream-events";

export type IntentResolution = {
  arbitration?: AgentArbitrationDecision;
  engine: AgentEngine;
  intent: AgentIntent;
  tokenUsage?: AgentChatResponse["tokenUsage"];
};

export type ResolveIntentStepParams = {
  confirmationSignals: ConfirmationSignals;
  context: BuildContextStepResult["context"];
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
  generateStreamingReplyFn?: (args: GenerateStreamingReplyArgs) => Promise<{
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
    text: string;
  } | null>;
  intentModelEngine: AgentEngine;
  message: string;
  modelResolver: AgentModelIntentResolver;
  pendingAction: null | PendingAction;
  preResolvedIntent?: AgentIntent | null;
  recordAgentConfirmationDecisionFn?: typeof recordAgentConfirmationDecision;
  recordBatchConfirmationDecisionFn?: typeof recordBatchConfirmationDecision;
  persistAgentTurn: (args: {
    assistantMessage: string;
    confidence?: number;
    engine: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) => Promise<AgentThread>;
  pushTrace: (step: AgentTraceStep) => void;
  resolvedHistory: AgentChatMessage[];
  stream?: AgentStreamController;
  thread: AgentThread;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { id: number };
};

export type ResolveIntentStepNext = {
  batchExecuteIntents?: AgentIntent[];
  confirmedActionId: null | string;
  nextPendingAfterExecute?: null | PendingAction;
  resolution: IntentResolution;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
};

export type ResolveIntentStepResult =
  | { outcome: "early_exit"; response: AgentChatResponse }
  | { outcome: "continue"; data: ResolveIntentStepNext };

export const runResolveIntentStep = async (params: ResolveIntentStepParams): Promise<ResolveIntentStepResult> => {
  const {
    confirmationSignals,
    context,
    emitStatus,
    emitToken,
    emitUsage,
    generateStreamingReplyFn = generateStreamingReply,
    intentModelEngine,
    message,
    modelResolver,
    pendingAction,
    preResolvedIntent,
    recordAgentConfirmationDecisionFn = recordAgentConfirmationDecision,
    recordBatchConfirmationDecisionFn = recordBatchConfirmationDecision,
    persistAgentTurn,
    pushTrace,
    resolvedHistory,
    stream,
    thread,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  let tokenUsage = tokenUsageIn;

  const resolveCognitiveGroundedAnswer = async ({
    arbitration,
    fallbackText,
    intent,
  }: {
    arbitration?: AgentArbitrationDecision;
    fallbackText?: string;
    intent: AgentIntent;
  }): Promise<undefined | string> => {
    if (!shouldUseCognitiveAdvisory({ intent, message, pendingAction })) {
      return fallbackText;
    }

    stream?.progress({
      detail: "提取目标、问题类型、写入边界和上下文证据。",
      message: "构建认知框架",
      stageId: "stage-response",
    });
    const advisory = await buildCognitiveAdvisoryAnswerWithModel({
      arbitration,
      context,
      history: resolvedHistory,
      message,
      pendingAction,
    });
    const evidenceTitles = advisory.frame.evidence.map((item) => item.title).join("、") || "未命中强相关证据";

    pushTrace({
      detail: advisory.source === "llm"
        ? "模型返回了结构化回答计划，并通过质量门。"
        : advisory.diagnostics?.rejectedReason ?? "使用 deterministic fallback 生成回答计划。",
      id: "cognitive-planner",
      kind: advisory.source === "llm" ? "complete" : "analysis",
      status: "done",
      title: `回答规划：${advisory.source}`,
    });
    pushTrace({
      detail: `kind=${advisory.frame.questionKind} goal=${advisory.frame.goal} writeAllowed=${advisory.frame.writeAllowed} risk=${advisory.frame.riskBoundary}`,
      id: "cognitive-frame",
      kind: "analysis",
      status: "done",
      title: "认知框架已生成",
    });
    stream?.progress({
      detail: evidenceTitles,
      message: "选择上下文证据",
      stageId: "stage-response",
    });
    pushTrace({
      detail: advisory.frame.evidence.length > 0
        ? advisory.frame.evidence.map((item) => `${item.source}:${item.title}(${item.score})`).join("；")
        : "没有强相关上下文证据，本轮使用通用咨询框架。",
      id: "cognitive-evidence",
      kind: "context",
      status: "done",
      title: "证据选择完成",
    });
    stream?.progress({
      detail: advisory.quality.issues.length > 0 ? advisory.quality.issues.join("；") : "回答计划通过质量门。",
      message: `回答自检 ${(advisory.quality.score * 100).toFixed(0)}%`,
      stageId: "stage-response",
    });
    pushTrace({
      detail: advisory.quality.issues.length > 0
        ? advisory.quality.issues.join("；")
        : "已检查直接回答、上下文使用、写入边界和反问控制。",
      id: "cognitive-quality",
      kind: advisory.quality.score >= 0.75 ? "complete" : "analysis",
      status: "done",
      title: "回答自检完成",
    });

    if (fallbackText && !advisory.answer.includes(fallbackText)) {
      return `${advisory.answer}\n\n已有上下文判断：${fallbackText}`;
    }

    return advisory.answer;
  };

  if (pendingAction?.type === "await_batch_confirmation") {
    if (confirmationSignals.cancel) {
      await recordBatchConfirmationDecisionFn({
        actions: pendingAction.actions,
        decision: "canceled",
        message,
        orchestrationId: pendingAction.orchestrationId,
        userId: user.id,
      });
      const assistantMessage = `已取消批量确认（共 ${pendingAction.actions.length} 项），未写入任何数据。`;
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: pendingAction.actions[0]?.intent ?? "clarify",
        nextPendingAction: null,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: pendingAction.actions[0]?.intent ?? "clarify",
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }

    if (!confirmationSignals.confirm) {
      const assistantMessage = `仍在等待批量确认（${pendingAction.actions.length} 项）。回复「确认」执行全部，或「取消」放弃。`;
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: "clarify",
        nextPendingAction: pendingAction,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: "clarify",
          pendingAction,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }

    const batchIntents = restoreConfirmedBatchIntents(pendingAction);
    const primary = batchIntents[0];

    await recordBatchConfirmationDecisionFn({
      actions: pendingAction.actions,
      decision: "confirmed",
      message,
      orchestrationId: pendingAction.orchestrationId,
      userId: user.id,
    });

    pushTrace({
      detail: `批量确认 ${batchIntents.length} 项操作`,
      id: "confirmation-batch-received",
      kind: "action",
      status: "done",
      title: "已收到批量确认",
    });

    return {
      outcome: "continue",
      data: {
        batchExecuteIntents: batchIntents,
        confirmedActionId: pendingAction.orchestrationId ?? "batch",
        nextPendingAfterExecute: pendingAction.resumeQueue ?? null,
        resolution: {
          engine: "workflow",
          intent: primary,
        },
        tokenUsage,
      },
    };
  }

  if (pendingAction?.type === "await_confirmation") {
    const branch = resolveAwaitConfirmationBranch(pendingAction, confirmationSignals);

    if (branch === "cancel") {
      emitStatus("正在取消待确认动作...");
      pushTrace({
        detail: `${pendingAction.action.summary} · risk=${pendingAction.action.riskLevel}`,
        id: "confirmation-cancel",
        kind: "action",
        status: "running",
        title: "正在取消待确认动作",
      });
      await recordAgentConfirmationDecisionFn({
        action: pendingAction.action,
        decision: "canceled",
        message,
        userId: user.id,
      });
      const assistantMessage = `已取消「${pendingAction.action.summary}」。这次没有写入计划、清单或 Timeline。`;
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      pushTrace({
        detail: "取消决定已经写入 AgentRun 审计记录。",
        id: "confirmation-cancel",
        kind: "complete",
        status: "done",
        title: "待确认动作已取消",
      });
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: pendingAction.action.intent,
        nextPendingAction: null,
      });
      logAgentEvent("info", "chat.confirmation_canceled", {
        actionId: pendingAction.action.id,
        intent: pendingAction.action.intent,
        threadId: updatedThread.id,
        userId: user.id,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: pendingAction.action.intent,
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }

    if (branch === "still_waiting") {
      const assistantMessage = `这一步还在等待确认：${pendingAction.action.summary}。\n\n回复「确认」或「执行」继续，回复「取消」放弃。`;
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      pushTrace({
        detail: `待确认动作：${pendingAction.action.summary}`,
        id: "confirmation-wait",
        kind: "analysis",
        status: "done",
        title: "仍在等待明确确认",
      });
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: "clarify",
        nextPendingAction: pendingAction,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: "clarify",
          pendingAction,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }

    const confirmedIntent = restoreConfirmedIntent(pendingAction.action);
    const confirmedActionId = pendingAction.action.id;
    const nextPendingAfterExecute =
      pendingAction.deferredActions && pendingAction.deferredActions.length > 0
        ? {
            actions: pendingAction.deferredActions,
            orchestrationId: pendingAction.orchestrationId,
            resumeQueue: pendingAction.resumeQueue,
            type: "await_batch_confirmation" as const,
          }
        : (pendingAction.resumeQueue ?? null);
    emitStatus("正在执行已确认动作...");
    pushTrace({
      detail: `${pendingAction.action.summary} · risk=${pendingAction.action.riskLevel}`,
      id: "confirmation-received",
      kind: "action",
      status: "running",
      title: "已收到确认",
    });
    await recordAgentConfirmationDecisionFn({
      action: pendingAction.action,
      decision: "confirmed",
      message,
      userId: user.id,
    });
    pushTrace({
      detail: "确认决定已经写入 AgentRun 审计记录。",
      id: "confirmation-received",
      kind: "action",
      status: "done",
      title: "确认已记录",
    });
    const resolution: IntentResolution = {
      engine: "workflow",
      intent: confirmedIntent,
    };
    pushTrace({
      detail: "使用待确认动作中保存的参数继续执行，不重新解释为新指令。",
      id: "analysis-intent",
      kind: "analysis",
      status: "done",
      title: `确认执行：${pendingAction.action.summary}`,
    });

    return {
      outcome: "continue",
      data: {
        confirmedActionId,
        nextPendingAfterExecute,
        resolution,
        tokenUsage,
      },
    };
  }

  if (preResolvedIntent) {
    stream?.progress({
      detail: `编排器已给出 ${preResolvedIntent.intent}，跳过重复 LLM 仲裁。`,
      message: "使用编排预解析意图",
      stageId: "stage-arbitration",
    });
    pushTrace({
      detail: `编排器已解析为 ${preResolvedIntent.intent}`,
      id: "analysis-intent",
      kind: "analysis",
      status: "done",
      title: `编排意图：${preResolvedIntent.intent}`,
    });

    const isConversational = preResolvedIntent.intent === "answer_question" || preResolvedIntent.intent === "clarify";
    if (isConversational) {
      const preResolvedText =
        (preResolvedIntent.intent === "answer_question"
          ? (preResolvedIntent.args as { answer?: string }).answer
          : undefined)
        ?? (preResolvedIntent.intent === "clarify"
          ? (preResolvedIntent.args as { question?: string }).question
          : undefined)
        ?? ('reply' in preResolvedIntent ? (preResolvedIntent as { reply?: string }).reply : undefined);
      emitStatus("正在生成回复...");
      stream?.start({
        id: "stage-response",
        phase: "response",
        title: "组织回复",
      });
      stream?.progress({
        detail: "基于已解析的咨询意图生成最终文本。",
        message: "生成回答",
        stageId: "stage-response",
      });
      const groundedAnswer = await resolveCognitiveGroundedAnswer({
        fallbackText: preResolvedText,
        intent: preResolvedIntent,
      });
      const replyResult = await generateStreamingReplyFn({
        context,
        groundedAnswer,
        history: resolvedHistory,
        message,
        onToken: (token) => emitToken(token, 'response'),
      });
      if (replyResult && replyResult.text.trim().length > 0) {
        preResolvedIntent.reply = replyResult.text;
        tokenUsage = {
          ...tokenUsage,
          outputTokens: replyResult.tokenUsage.outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + replyResult.tokenUsage.outputTokens,
          providerInputTokens: replyResult.tokenUsage.providerInputTokens,
          providerOutputTokens: replyResult.tokenUsage.providerOutputTokens,
          source: replyResult.tokenUsage.source,
        };
      } else {
        // Fallback: stream pre-resolved text word by word when LLM is unavailable
        if (typeof groundedAnswer === "string" && groundedAnswer.length > 0) {
          for (const token of splitIntoWordTokens(groundedAnswer)) {
            emitToken(token, 'response');
            await new Promise((r) => setTimeout(r, 6));
          }
        }
      }
      stream?.complete("stage-response", "回复已生成");
    }

    return {
      outcome: "continue",
      data: {
        confirmedActionId: null,
        resolution: {
          engine: "workflow",
          intent: preResolvedIntent,
        },
        tokenUsage,
      },
    };
  }

  emitStatus("正在分析用户意图...");
  pushTrace({
    detail: "会结合当前输入、最近对话和待处理动作来判断下一步。",
    id: "analysis-intent",
    kind: "analysis",
    status: "running",
    title: "正在判断你的真实意图",
  });
  const resolution = await resolveAgentIntent({
    context,
    history: resolvedHistory,
    intentModelEngine,
    message,
    modelResolver,
    pendingAction,
  });
  if (resolution.tokenUsage) {
    tokenUsage = resolution.tokenUsage;
    emitUsage(tokenUsage);
  }
  if (resolution.arbitration) {
    const routeLabel: Record<AgentArbitrationDecision["route"], string> = {
      answer: "直接回答",
      cancel_pending: "取消待处理",
      clarify: "继续澄清",
      confirm_pending: "确认待处理",
      orchestrate: "进入编排",
      resume_pending: "续接待处理",
      write: "进入写入预检",
    };

    pushTrace({
      detail: `${resolution.arbitration.reason} route=${resolution.arbitration.route} pendingPolicy=${resolution.arbitration.pendingPolicy} requiresWrite=${resolution.arbitration.requiresWrite}`,
      id: "analysis-arbitration",
      kind: "analysis",
      status: "done",
      title: `意图仲裁：${routeLabel[resolution.arbitration.route]}`,
    });
    stream?.progress({
      detail: `route=${resolution.arbitration.route} · pending=${resolution.arbitration.pendingPolicy}`,
      message: `仲裁结果：${routeLabel[resolution.arbitration.route]}`,
      stageId: "stage-arbitration",
    });
  }
  const intentSummary = buildIntentTraceSummary(resolution.intent);
  emitStatus(`已识别意图：${intentSummary.title.replace(/^识别为/, "")}`);
  pushTrace({
    detail: intentSummary.detail,
    id: "analysis-intent",
    kind: "analysis",
    status: "done",
    title: intentSummary.title,
  });

  logAgentEvent("info", "chat.intent_resolved", {
    arbitrationRoute: resolution.arbitration?.route,
    pendingPolicy: resolution.arbitration?.pendingPolicy,
    confidence: resolution.intent.confidence,
    engine: resolution.engine,
    intent: resolution.intent.intent,
    threadId: thread.id,
    userId: user.id,
  });

  // Stream conversational replies with true LLM token streaming
  const conversationalIntent = resolution.intent.intent === "answer_question" || resolution.intent.intent === "clarify";
  if (conversationalIntent) {
    const intent = resolution.intent;
    const preResolvedText =
      (intent.intent === "answer_question" ? intent.args.answer : null)
      ?? (intent.intent === "clarify" ? intent.args.question : null)
      ?? ('reply' in intent ? (intent as { reply?: string }).reply : undefined);

    emitStatus("正在生成回复...");
    stream?.start({
      id: "stage-response",
      phase: "response",
      title: "组织回复",
    });
    stream?.progress({
      detail: "只生成回答，不写入计划、清单、时间线或记忆。",
      message: "生成最终答案",
      stageId: "stage-response",
    });
    const groundedAnswer = await resolveCognitiveGroundedAnswer({
      arbitration: resolution.arbitration,
      fallbackText: typeof preResolvedText === "string" ? preResolvedText : undefined,
      intent,
    });
    const replyResult = await generateStreamingReplyFn({
      context,
      groundedAnswer,
      history: resolvedHistory,
      message,
      onToken: (token) => emitToken(token, 'response'),
    });

    if (replyResult && replyResult.text.trim().length > 0) {
      resolution.intent.reply = replyResult.text;
      tokenUsage = {
        ...tokenUsage,
        outputTokens: replyResult.tokenUsage.outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + replyResult.tokenUsage.outputTokens,
        providerInputTokens: replyResult.tokenUsage.providerInputTokens,
        providerOutputTokens: replyResult.tokenUsage.providerOutputTokens,
        source: replyResult.tokenUsage.source,
      };
    } else if (typeof groundedAnswer === "string" && groundedAnswer.length > 0) {
      // Fallback: progressive word-by-word streaming of pre-resolved text
      for (const token of splitIntoWordTokens(groundedAnswer)) {
        emitToken(token, 'response');
        await new Promise((r) => setTimeout(r, 6));
      }
    }
    stream?.complete("stage-response", "回复已生成");
  } else {
    // Emit intent analysis token so the user sees what was identified during the wait
    emitToken(`• 识别意图：${intentSummary.title.replace(/^识别为/, "")}\n`, 'thinking');
    stream?.progress({
      detail: intentSummary.detail,
      message: "交给写入预检或执行链路",
      stageId: "stage-arbitration",
    });
  }

  return {
    outcome: "continue",
    data: {
      confirmedActionId: null,
      resolution,
      tokenUsage,
    },
  };
};
