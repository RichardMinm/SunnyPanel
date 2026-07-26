/**
 * [R6-C1-B LEGACY RETIRED] Legacy Heuristic Intent Resolution.
 *
 * R6-C1-B: resolveAgentIntent and heuristic intent aggregator have been retired.
 * This module now returns a controlled "legacy retired" response for new user goals.
 * Writing mode assist and pre-resolved orchestration intents are still handled.
 *
 * This path is retained ONLY for AGENT_REQUIRE_LLM=0 legacy hybrid mode.
 * It is NOT part of the AGENT_REQUIRE_LLM=1 protected baseline.
 * In AGENT_REQUIRE_LLM=1, new user goals are gated by R5-A and never reach here.
 *
 * Does NOT contain:
 *  - pendingAction confirmation/cancel (handled by confirmation-resolution-step)
 *  - Policy Guard / execute / receipt / rollback
 */

import {
  type StreamTokenCallback,
} from "@/lib/agent/client";
import type { ConfirmationSignals } from "@/lib/agent/chat-pipeline/confirmation-step";
import type { AgentModelIntentResolver } from "@/lib/agent/intent-resolution";
import {
  shouldTrustOrchestratorPreResolve,
  type OrchestratorPlanSource,
} from "@/lib/agent/orchestration/plan-source";
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
import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import { isAgentLLMDisabled } from "@/lib/agent/llm-required";
import {
  runWritingAssist,
  type WritingAssistRequest,
} from "@/lib/agent/writing-assist-core";
import type {
  WritingAssistAction,
  WritingAssistResult,
} from "@/lib/agent/prompts/writing-assist";
import type { IntentResolution } from "./resolve-intent-step";
import { dispatchPreResolvedQuery } from "@/lib/agent/query/dispatcher";
import { resolveQueryAdoption, resolveQueryRuntime } from "@/lib/agent/query/runtime-config";
import { ConversationalAnswerStreamFailure } from "@/lib/agent/answer/errors";
import { runConversationalAnswer } from "@/lib/agent/answer/runtime";
import type { ModelCallBudgetRecorder } from "@/lib/agent/orchestration/model-call-budget";
import type { OrchestratorRuntimeMode } from "@/lib/agent/orchestration/runtime-config";

/* ──── Types ──── */

export type LegacyResolutionParams = {
  confirmationSignals: ConfirmationSignals;
  context: BuildContextStepResult["context"];
  conversationState?: import("@/lib/agent/conversation/types").AgentConversationState | null;
  conversationalAnswerRunner?: typeof runConversationalAnswer;
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
  intentModelEngine: AgentEngine;
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  modelResolver: AgentModelIntentResolver;
  orchestratorPlanSource?: null | OrchestratorPlanSource;
  orchestratorRuntime?: null | OrchestratorRuntimeMode;
  pendingAction: null | PendingAction;
  preResolvedIntent?: AgentIntent | null;
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
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { collection?: "users"; id: number };
  userPreferences?: import("@/lib/agent/user-preferences").UserPreferences | null;
  workbenchMode?: AgentWorkbenchMode | null;
  writingAssistRunner?: (request: WritingAssistRequest) => Promise<WritingAssistResult>;
};

/* ──── Writing assist helpers ──── */

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
  if (colonMatch?.[1]?.trim()) return colonMatch[1].trim();
  const quotedMatch = trimmed.match(/[「"]([^」"]{2,})[」"]/);
  if (quotedMatch?.[1]?.trim()) return quotedMatch[1].trim();
  return trimmed;
};

const formatWritingAssistResult = (result: WritingAssistResult) => {
  if (typeof result.result === "string" && result.result.trim()) return result.result.trim();
  if (Array.isArray(result.tags) && result.tags.length > 0) return `标签：${result.tags.join("、")}`;
  if (Array.isArray(result.outline) && result.outline.length > 0) {
    return result.outline
      .map((item) => `${"#".repeat(Math.max(1, Math.min(3, item.level)))} ${item.text}`)
      .join("\n");
  }
  return "";
};

/* ──── Main ──── */

/**
 * [R6-C1-B] Legacy heuristic resolution — aggregator RETIRED.
 *
 * Handles:
 *  - Pre-resolved intents from the orchestrator (unchanged)
 *  - Writing mode assist (unchanged)
 *  - All other new user goals → controlled "legacy retired" response
 *
 * resolveAgentIntent / parseHeuristicIntent / heuristic aggregator are NO LONGER called.
 */
export const resolveLegacyHeuristicStep = async (
  params: LegacyResolutionParams,
): Promise<
  | { outcome: "early_exit"; response: AgentChatResponse }
  | { outcome: "continue"; data: { confirmedActionId: null; resolution: IntentResolution; tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> } }
> => {
  const {
    confirmationSignals: _confirmationSignals,
    context,
    conversationalAnswerRunner = runConversationalAnswer,
    conversationState: _conversationState,
    emitStatus,
    emitToken,
    emitUsage: _emitUsage,
    intentModelEngine: _intentModelEngine,
    message,
    modelCallRecorder,
    modelResolver: _modelResolver,
    orchestratorPlanSource,
    orchestratorRuntime,
    pendingAction: _pendingAction,
    preResolvedIntent,
    persistAgentTurn,
    pushTrace,
    resolvedHistory,
    stream,
    tokenUsage: tokenUsageIn,
    trace: _trace,
    user,
    userPreferences: _userPreferences,
    workbenchMode,
    writingAssistRunner,
  } = params;

  let tokenUsage = tokenUsageIn;

  /* ── Pre-resolved intent from orchestrator ── */
  if (
    preResolvedIntent &&
    shouldTrustOrchestratorPreResolve(preResolvedIntent, orchestratorPlanSource)
  ) {
    const queryDispatch = await dispatchPreResolvedQuery({
      actor: { isAdmin: user.collection === "users" },
      adoption: resolveQueryAdoption(),
      emitToken,
      intent: preResolvedIntent,
      message,
      modelCallRecorder,
      runtime: resolveQueryRuntime(),
      stream,
    });

    if (queryDispatch.outcome === "complete" || queryDispatch.outcome === "clarify" || queryDispatch.outcome === "legacy_facts") {
      if (queryDispatch.outcome === "clarify") emitToken(queryDispatch.assistantMessage, "response");
      const updatedThread = await persistAgentTurn({
        assistantMessage: queryDispatch.assistantMessage,
        confidence: preResolvedIntent.confidence,
        engine: "workflow",
        intent: queryDispatch.outcome === "clarify" ? "clarify" : preResolvedIntent.intent,
        nextPendingAction: null,
      });
      return {
        outcome: "early_exit",
        response: queryDispatch.toResponse(updatedThread.id, tokenUsage),
      };
    }

    stream?.progress({
      detail: `编排器已给出 ${preResolvedIntent.intent}（source=${orchestratorPlanSource ?? "llm"}），跳过重复 LLM 仲裁。`,
      message: "使用编排预解析意图",
      stageId: "stage-arbitration",
    });
    pushTrace({ detail: `编排器已解析为 ${preResolvedIntent.intent}`, id: "analysis-intent", kind: "analysis", status: "done", title: `编排意图：${preResolvedIntent.intent}` });

    let resolvedPreIntent = preResolvedIntent;
    if (preResolvedIntent.intent === "answer_question") {
      emitStatus("正在生成回复...");
      stream?.start({ id: "stage-response", phase: "response", title: "组织回复" });
      if (orchestratorRuntime === "legacy") {
        const existingAnswer = (
          preResolvedIntent.reply
          ?? preResolvedIntent.args.answer
          ?? ""
        ).trim();
        if (existingAnswer) emitToken(existingAnswer, "response");
      } else {
        const terminal = await conversationalAnswerRunner({
          history: resolvedHistory,
          intent: preResolvedIntent,
          message,
          modelCallRecorder,
          callScopeId: "turn-answer",
          workspaceContext: JSON.stringify(context),
          emitToken,
        });
        if (terminal.status !== "complete") {
          throw new ConversationalAnswerStreamFailure(terminal);
        }
        resolvedPreIntent = {
          ...preResolvedIntent,
          args: { ...preResolvedIntent.args, answer: terminal.answer },
          reply: terminal.answer,
        };
      }
      stream?.complete("stage-response", "回复已生成");
    } else if (preResolvedIntent.intent === "clarify") {
      emitStatus("正在生成回复...");
      stream?.start({ id: "stage-response", phase: "response", title: "组织回复" });
      for (const token of splitIntoWordTokens(preResolvedIntent.args.question)) {
        emitToken(token, "response");
      }
      stream?.complete("stage-response", "回复已生成");
    }

    return { outcome: "continue", data: { confirmedActionId: null, resolution: { engine: "workflow", intent: resolvedPreIntent }, tokenUsage } };
  }

  /* ── Writing mode ── */
  if (workbenchMode === "writing") {
    const action = inferWritingAssistAction(message);
    const text = extractWritingAssistText(message);
    emitStatus("正在运行写作辅助...");
    stream?.start({ id: "stage-response", phase: "response", title: "运行写作辅助" });
    pushTrace({ detail: `action=${action}`, id: "writing-assist-chat", kind: "analysis", status: "running", title: "写作辅助正在处理" });

    /* LLM disabled → controlled clarify (matches writing-assist API route behavior).
     * Only gate the default runner — a custom writingAssistRunner (e.g. test mock)
     * bypasses this check so tests can verify the trace path independently. */
    if (!writingAssistRunner && isAgentLLMDisabled()) {
      pushTrace({ detail: "LLM disabled", id: "writing-assist-chat", kind: "analysis", status: "error", title: "写作辅助不可用" });
      const question = "AI 功能已禁用，无法提供写作辅助。";
      for (const token of splitIntoWordTokens(question)) { emitToken(token, "response"); }
      stream?.complete("stage-response", "写作辅助不可用");
      const outputTokens = estimateTokenCount(question);
      tokenUsage = { ...tokenUsage, outputTokens, totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens };
      return { outcome: "continue", data: { confirmedActionId: null, resolution: { engine: "workflow", intent: { args: { missingFields: ["writing_assist"], question }, confidence: 1, intent: "clarify" } }, tokenUsage } };
    }

    const runner = writingAssistRunner ?? runWritingAssist;

    try {
      const writingResult = await runner({ action, text, title: undefined, summary: undefined, collection: undefined });
      const assistantMessage = formatWritingAssistResult(writingResult);
      if (!assistantMessage) throw new Error("写作辅助没有返回可展示结果。");
      for (const token of splitIntoWordTokens(assistantMessage)) { emitToken(token, "response"); await new Promise((r) => setTimeout(r, 6)); }
      stream?.complete("stage-response", "写作辅助已生成结果");
      pushTrace({ detail: `action=${action}`, id: "writing-assist-chat", kind: "analysis", status: "done", title: "写作辅助完成" });
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = { ...tokenUsage, outputTokens, totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens };
      return { outcome: "continue", data: { confirmedActionId: null, resolution: { engine: "workflow", intent: { args: { answer: assistantMessage }, confidence: 0.9, intent: "answer_question", reply: assistantMessage } }, tokenUsage } };
    } catch (error) {
      pushTrace({ detail: error instanceof Error ? error.message : "AI request failed", id: "writing-assist-chat", kind: "analysis", status: "error", title: "写作辅助失败" });
      const question = `写作辅助暂时不可用：${error instanceof Error ? error.message : "AI 请求失败"}。`;
      const outputTokens = estimateTokenCount(question);
      tokenUsage = { ...tokenUsage, outputTokens, totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens };
      stream?.complete("stage-response", "写作辅助失败");
      return { outcome: "continue", data: { confirmedActionId: null, resolution: { engine: "workflow", intent: { args: { missingFields: ["writing_assist"], question }, confidence: 1, intent: "clarify" } }, tokenUsage } };
    }
  }

  /* ── R6-C1-B: Legacy heuristic intent aggregator retired ── */
  pushTrace({ detail: "Legacy heuristic intent resolution path has been retired.", id: "analysis-intent", kind: "analysis", status: "done", title: "旧规则路径已停用" });
  emitToken("当前 Agent 已切换到 LLM 工具规划模式，旧的规则式意图解析路径已停用。\n", 'thinking');

  return { outcome: "continue" as const, data: { confirmedActionId: null as null, resolution: { engine: "workflow" as const, intent: { args: { question: "Legacy heuristic retired" }, confidence: 1, intent: "clarify" as const } } as IntentResolution, tokenUsage } };
};
