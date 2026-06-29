import { appendFileSync } from "node:fs";

import { getAgentDebugLogPath } from "@/lib/agent/debug-log";
import { recordAgentConfirmationDecision, recordBatchConfirmationDecision } from "@/lib/agent/audit";
import { parseDefinitionQuestionIntent } from "@/lib/agent/intent/heuristics/knowledge";
import {
  buildAnswerModelUnavailableMessage,
  generateStreamingReply,
  type GenerateStreamingReplyArgs,
  type GenerateStreamingReplyResult,
  type StreamTokenCallback,
} from "@/lib/agent/client";
import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import {
  resolveAwaitConfirmationBranch,
  getBatchReceiptActionId,
  restoreConfirmedBatchIntents,
  restoreConfirmedIntent,
  type ConfirmationSignals,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import { buildIntentTraceSummary } from "@/lib/agent/chat-pipeline/intent-trace";
import { resolveAgentIntent, type AgentModelIntentResolver } from "@/lib/agent/intent-resolution";
import { isConversationalIntent } from "@/lib/agent/schemas";
import {
  shouldTrustOrchestratorPreResolve,
  type OrchestratorPlanSource,
} from "@/lib/agent/orchestration/plan-source";
import { logAgentEvent } from "@/lib/agent/logger";
import type { AgentArbitrationDecision } from "@/lib/agent/intent/arbitration";
import type { LLMRouterOutput } from "../router/llm-router-schema";
import type { ToolPlan } from "../plan/tool-plan";
import { normalizeRouterOutput } from "@/lib/agent/router/normalize-router-output";
import { agentRouterToLLMRouter } from "@/lib/agent/router/llm-router-to-agent-router";
import type { AgentRouterOutput } from "@/lib/agent/router/types";
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
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import {
  runWritingAssist,
  type WritingAssistRequest,
} from "@/lib/agent/writing-assist-core";
import type {
  WritingAssistAction,
  WritingAssistResult,
} from "@/lib/agent/prompts/writing-assist";

export type IntentResolution = {
  arbitration?: AgentArbitrationDecision;
  engine: AgentEngine;
  intent: AgentIntent;
  llmRouterOutput?: LLMRouterOutput;
  routerOutput?: AgentRouterOutput;
  toolPlan?: ToolPlan;
  tokenUsage?: AgentChatResponse["tokenUsage"];
};

export type ResolveIntentStepParams = {
  confirmationSignals: ConfirmationSignals;
  context: BuildContextStepResult["context"];
  conversationState?: import("@/lib/agent/conversation/types").AgentConversationState | null;
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
  generateStreamingReplyFn?: (args: GenerateStreamingReplyArgs) => Promise<GenerateStreamingReplyResult | null>;
  intentModelEngine: AgentEngine;
  message: string;
  modelResolver: AgentModelIntentResolver;
  orchestratorPlanSource?: null | OrchestratorPlanSource;
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
  userPreferences?: import("@/lib/agent/user-preferences").UserPreferences | null;
  workbenchMode?: AgentWorkbenchMode | null;
  writingAssistRunner?: (request: WritingAssistRequest) => Promise<WritingAssistResult>;
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

const inferWritingAssistAction = (message: string): WritingAssistAction => {
  if (/标签|tag/i.test(message)) return "extract_tags";
  if (/大纲|提纲|outline/i.test(message)) return "generate_outline";
  if (/标题|title/i.test(message)) return "generate_title";
  if (/摘要|summary|生成摘要/i.test(message)) return "generate_summary";
  if (/总结|summarize/i.test(message)) return "summarize";
  if (/精简|压缩|condense/i.test(message)) return "condense";
  if (/扩写|expand/i.test(message)) return "expand";
  if (/续写|继续写|continue/i.test(message)) return "continue";
  if (/润色|polish/i.test(message)) return "polish";
  if (/改写|重写|rewrite/i.test(message)) return "rewrite";

  return "polish";
};

const extractWritingAssistText = (message: string) => {
  const trimmed = message.trim();
  const colonMatch = trimmed.match(/(?:：|:)\s*([\s\S]+)$/);
  if (colonMatch?.[1]?.trim()) {
    return colonMatch[1].trim();
  }

  const quotedMatch = trimmed.match(/[「“"]([^」”"]{2,})[」”"]/);
  if (quotedMatch?.[1]?.trim()) {
    return quotedMatch[1].trim();
  }

  return trimmed;
};

const formatWritingAssistResult = (result: WritingAssistResult) => {
  if (typeof result.result === "string" && result.result.trim()) {
    return result.result.trim();
  }

  if (Array.isArray(result.tags) && result.tags.length > 0) {
    return `标签：${result.tags.join("、")}`;
  }

  if (Array.isArray(result.outline) && result.outline.length > 0) {
    return result.outline
      .map((item) => `${"#".repeat(Math.max(1, Math.min(3, item.level)))} ${item.text}`)
      .join("\n");
  }

  return "";
};

export const runResolveIntentStep = async (params: ResolveIntentStepParams): Promise<ResolveIntentStepResult> => {
  const {
    confirmationSignals,
    context,
    conversationState = null,
    emitStatus,
    emitToken,
    emitUsage,
    generateStreamingReplyFn = generateStreamingReply,
    intentModelEngine,
    message,
    modelResolver,
    orchestratorPlanSource,
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
    userPreferences,
    workbenchMode,
    writingAssistRunner,
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
    if (
      intent.intent === "answer_question" &&
      intent.args.openDomainTopic
    ) {
      return undefined;
    }

    if (
      intent.intent === "answer_question" &&
      intent.args.answer.trim().length === 0 &&
      !intent.args.openDomainTopic
    ) {
      return undefined;
    }

    if (isConversationalIntent(intent.intent) && "answer" in intent.args && intent.args.answer.trim().length === 0) {
      return undefined;
    }

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
        confirmedActionId: getBatchReceiptActionId(pendingAction),
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

  if (
    preResolvedIntent &&
    shouldTrustOrchestratorPreResolve(preResolvedIntent, orchestratorPlanSource)
  ) {
    stream?.progress({
      detail: `编排器已给出 ${preResolvedIntent.intent}（source=${orchestratorPlanSource ?? "llm"}），跳过重复 LLM 仲裁。`,
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
      let preResolvedStreamedReply = "";
      const replyResult = await generateStreamingReplyFn({
        context,
        groundedAnswer,
        history: resolvedHistory,
        message,
        onToken: (token) => {
          preResolvedStreamedReply += token;
          emitToken(token, 'response');
        },
      });
      const preResolvedOpenTopic =
        preResolvedIntent.intent === "answer_question"
          ? preResolvedIntent.args.openDomainTopic ?? null
          : null;
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
      } else if (preResolvedStreamedReply.trim().length > 0) {
        preResolvedIntent.reply = preResolvedStreamedReply.trim();
      } else if (
        typeof groundedAnswer === "string" &&
        groundedAnswer.trim().length > 0 &&
        !preResolvedOpenTopic
      ) {
        preResolvedIntent.reply = groundedAnswer;
        for (const token of splitIntoWordTokens(groundedAnswer)) {
          emitToken(token, 'response');
          await new Promise((r) => setTimeout(r, 6));
        }
      } else if (!preResolvedIntent.reply?.trim() && preResolvedIntent.intent === "answer_question") {
        const parsedDefinition = parseDefinitionQuestionIntent(message);
        const openTopic =
          preResolvedIntent.args.openDomainTopic ??
          (parsedDefinition?.intent === "answer_question"
            ? parsedDefinition.args.openDomainTopic ?? null
            : null);
        const fallbackText = buildAnswerModelUnavailableMessage(
          openTopic,
          replyResult?.failureHttpStatus,
        );
        preResolvedIntent.reply = fallbackText;
        for (const token of splitIntoWordTokens(fallbackText)) {
          emitToken(token, 'response');
          await new Promise((r) => setTimeout(r, 6));
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

  if (workbenchMode === "writing") {
    const action = inferWritingAssistAction(message);
    const text = extractWritingAssistText(message);
    const contentItem = context.contentItems?.[0];
    const runner = writingAssistRunner ?? runWritingAssist;

    emitStatus("正在运行写作辅助...");
    stream?.start({
      id: "stage-response",
      phase: "response",
      title: "运行写作辅助",
    });
    stream?.progress({
      detail: `action=${action}`,
      message: "写作模式已接管这轮请求",
      stageId: "stage-response",
    });
    pushTrace({
      detail: `action=${action}`,
      id: "writing-assist-chat",
      kind: "analysis",
      status: "running",
      title: "写作辅助正在处理",
    });

    if (!writingAssistRunner && process.env.AGENT_DISABLE_LLM === "1") {
      const question = "AI 功能已禁用，暂时无法在 Agent Chat 中执行写作辅助。你仍可以编辑原文，或稍后开启模型后再试。";
      const outputTokens = estimateTokenCount(question);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      pushTrace({
        detail: "AGENT_DISABLE_LLM=1",
        id: "writing-assist-chat",
        kind: "error",
        status: "error",
        title: "写作辅助不可用",
      });
      stream?.complete("stage-response", "写作辅助不可用");

      return {
        outcome: "continue",
        data: {
          confirmedActionId: null,
          resolution: {
            engine: "workflow",
            intent: {
              args: {
                missingFields: ["model"],
                question,
              },
              confidence: 1,
              intent: "clarify",
            },
          },
          tokenUsage,
        },
      };
    }

    try {
      const writingResult = await runner({
        action,
        collection: contentItem?.kind,
        summary: contentItem?.summary ?? undefined,
        text,
        title: contentItem?.title,
      });
      const assistantMessage = formatWritingAssistResult(writingResult);

      if (!assistantMessage) {
        throw new Error("写作辅助没有返回可展示结果。");
      }

      for (const token of splitIntoWordTokens(assistantMessage)) {
        emitToken(token, "response");
        await new Promise((r) => setTimeout(r, 6));
      }
      stream?.complete("stage-response", "写作辅助已生成结果");
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      pushTrace({
        detail: `action=${action} outputTokens=${outputTokens}`,
        id: "writing-assist-chat",
        kind: "complete",
        status: "done",
        title: "写作辅助已完成",
      });

      return {
        outcome: "continue",
        data: {
          confirmedActionId: null,
          resolution: {
            engine: "workflow",
            intent: {
              args: {
                answer: assistantMessage,
                suggestAction: `writing_assist:${action} 已作为只读转换完成；采纳文风需在写作面板中显式确认。`,
              },
              confidence: 0.9,
              intent: "answer_question",
              reply: assistantMessage,
            },
          },
          tokenUsage,
        },
      };
    } catch (error) {
      const question = `写作辅助暂时不可用：${error instanceof Error ? error.message : "AI 请求失败"}。请稍后再试，或先手动编辑文本。`;
      const outputTokens = estimateTokenCount(question);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      pushTrace({
        detail: error instanceof Error ? error.message : String(error),
        id: "writing-assist-chat",
        kind: "error",
        status: "error",
        title: "写作辅助失败",
      });
      stream?.complete("stage-response", "写作辅助失败");

      return {
        outcome: "continue",
        data: {
          confirmedActionId: null,
          resolution: {
            engine: "workflow",
            intent: {
              args: {
                missingFields: ["writing_assist"],
                question,
              },
              confidence: 1,
              intent: "clarify",
            },
          },
          tokenUsage,
        },
      };
    }
  }

  emitStatus("正在分析用户意图...");
  pushTrace({
    detail: "会结合当前输入、最近对话和待处理动作来判断下一步。",
    id: "analysis-intent",
    kind: "analysis",
    status: "running",
    title: "正在判断你的真实意图",
  });
  const resolved = await resolveAgentIntent({
    context,
    conversationState,
    history: resolvedHistory,
    intentModelEngine,
    message,
    modelResolver,
    pendingAction,
    userContext: { preferences: userPreferences, userId: user.id },
  });
  const routerOutput =
    resolved.routerOutput ??
    normalizeRouterOutput({
      arbitration: resolved.arbitration,
      intent: resolved.intent,
    });
  const llmRouterOutput = resolved.llmRouterOutput ?? agentRouterToLLMRouter(routerOutput);
  const resolution: IntentResolution = {
    ...resolved,
    llmRouterOutput,
    routerOutput,
  };
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
  const conversationalIntent =
    resolution.intent.intent === "answer_question" ||
    resolution.intent.intent === "clarify" ||
    isConversationalIntent(resolution.intent.intent);
  if (conversationalIntent) {
    const intent = resolution.intent;
    const preResolvedText =
      intent.intent === "answer_question" && intent.args.openDomainTopic
        ? undefined
        : (intent.intent === "answer_question" ? intent.args.answer : null)
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
    let streamedReply = "";
    const replyResult = await generateStreamingReplyFn({
      context,
      groundedAnswer,
      history: resolvedHistory,
      message,
      onToken: (token) => {
        streamedReply += token;
        emitToken(token, 'response');
      },
    });
    const openDomainTopic =
      intent.intent === "answer_question" ? intent.args.openDomainTopic ?? null : null;

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
    } else if (streamedReply.trim().length > 0) {
      resolution.intent.reply = streamedReply.trim();
    } else if (
      typeof groundedAnswer === "string" &&
      groundedAnswer.trim().length > 0 &&
      !openDomainTopic
    ) {
      resolution.intent.reply = groundedAnswer;
      for (const token of splitIntoWordTokens(groundedAnswer)) {
        emitToken(token, 'response');
        await new Promise((r) => setTimeout(r, 6));
      }
    } else if (!resolution.intent.reply?.trim() && intent.intent === "answer_question") {
      const parsedDefinition = parseDefinitionQuestionIntent(message);
      const openTopic =
        intent.args.openDomainTopic ??
        (parsedDefinition?.intent === "answer_question"
          ? parsedDefinition.args.openDomainTopic ?? null
          : null);
      const fallbackText = buildAnswerModelUnavailableMessage(
        openTopic,
        replyResult?.failureHttpStatus,
      );
      resolution.intent.reply = fallbackText;
      for (const token of splitIntoWordTokens(fallbackText)) {
        emitToken(token, 'response');
        await new Promise((r) => setTimeout(r, 6));
      }
    }
    // #region agent log
    if (process.env.AGENT_DEBUG_LOG) {
      try {
        appendFileSync(
          getAgentDebugLogPath(),
          `${JSON.stringify({
            sessionId: "961715",
            location: "resolve-intent-step.ts:reply-final",
            message: "conversational reply finalized",
            data: {
              intent: intent.intent,
              openDomainTopic:
                intent.intent === "answer_question" ? intent.args.openDomainTopic ?? null : null,
              replyLen: resolution.intent.reply?.length ?? 0,
              replyResultLen: replyResult?.text?.length ?? null,
              failureHttpStatus: replyResult?.failureHttpStatus ?? null,
              streamedReplyLen: streamedReply.length,
              groundedAnswerLen: typeof groundedAnswer === "string" ? groundedAnswer.length : null,
            },
            timestamp: Date.now(),
            hypothesisId: "H6-H9",
            runId: "post-fix-2",
          })}\n`,
        );
      } catch {
        // ignore debug log failures
      }
    }
    // #endregion
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
