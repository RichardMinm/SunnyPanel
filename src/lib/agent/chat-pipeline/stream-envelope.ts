import { appendFileSync } from "node:fs";

import { getAgentDebugLogPath } from "@/lib/agent/debug-log";
import { NextResponse } from "next/server";

import { type AgentChatResponse, type AgentTraceStep } from "@/lib/agent/schemas";
import { createTokenUsageSnapshot, splitIntoWordTokens } from "@/lib/agent/token-usage";
import type { StreamTokenCallback } from "@/lib/agent/client";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type {
  AgentStreamChangeEvent,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";

const intentToSuggestedMode: Partial<Record<AgentChatResponse["intent"], AgentWorkbenchMode>> = {
  answer_question: "ask",
  clarify: "ask",
  compose_plan: "plan",
  create_plan: "plan",
  evaluate_plan: "review",
  weekly_review: "review",
  compose_schedule_item: "timeline",
  compose_timeline_event: "timeline",
  reschedule_item: "timeline",
  cancel_schedule_item: "timeline",
  schedule_plan: "timeline",
  query_progress: "today",
  query_plan_progress: "today",
  append_plan_item: "plan",
  complete_plan_item: "execute",
  add_completion_note: "execute",
  save_memory: "ask",
};

/**
 * SSE 契约（与 `use-agent-chat-messaging` 中 `readStreamResponse` / `parseStreamBlock` 对齐）
 *
 * 每条消息：`event: <name>\ndata: <JSON>\n\n`
 *
 * | event    | data 形状（摘要） |
 * |----------|---------------------|
 * | status   | `{ status: string }` 流水线状态文案 |
 * | stage    | `AgentStreamStageEvent` 当前阶段状态 |
 * | progress | `AgentStreamProgressEvent` 阶段内紧凑进度 |
 * | change   | `AgentStreamChangeEvent` DryRun/执行预览摘要 |
 * | usage    | `AgentTokenUsage` 用量快照 |
 * | trace    | `AgentTraceStep` 单步追踪 |
 * | meta     | `{ confidence?, engine, intent, pendingAction?, threadId?, tokenUsage }` 终态元数据 |
 * | token    | `{ content: string, block?: 'thinking' | 'response', tokenUsage? }` 流式正文 token（block 区分思考/回复） |
 * | done     | 完整 `AgentChatResponse`（含 `assistantMessage`、`pendingAction`、`trace` 等） |
 * | error    | `{ assistantMessage, message }` 执行失败 |
 *
 * `createAgentChatResponse`：非流式直接 JSON；流式时对最终 payload 做 meta/token/done 逐词渐进。
 * `createAgentChatStream`：将 runner 的 emitToken 实时路由到 SSE token 事件。
 */

/** 逐词渐进式发送文本，用于短期路径的 fallback 流式输出 */
const emitProgressiveTokens = async (
  text: string,
  enqueue: (event: string, data: unknown) => void,
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>,
  block?: 'thinking' | 'response',
) => {
  let streamedOutput = 0;
  const baseInput = baseTokenUsage.contextTokens + baseTokenUsage.inputTokens;
  const tokens = splitIntoWordTokens(text);

  for (const token of tokens) {
    streamedOutput += 1; // rough: 1 word ≈ 1 token for Chinese
    enqueue("token", {
      content: token,
      tokenUsage: {
        ...baseTokenUsage,
        outputTokens: streamedOutput,
        totalTokens: baseInput + streamedOutput,
      },
      ...(block ? { block } : {}),
    });
    // small delay for natural feel, but much faster than the old 12ms-per-12-char
    await new Promise((r) => setTimeout(r, 8));
  }
};

export const createAgentChatResponse = (payload: AgentChatResponse, stream: boolean) => {
  if (!stream) {
    return NextResponse.json(payload);
  }

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const streamedUsage = payload.tokenUsage
        ? {
            ...payload.tokenUsage,
            outputTokens: 0,
            totalTokens: payload.tokenUsage.contextTokens + payload.tokenUsage.inputTokens,
          }
        : createTokenUsageSnapshot();

      enqueue("meta", {
        confidence: payload.confidence,
        contextSummary: payload.contextSummary,
        engine: payload.engine,
        intent: payload.intent,
        pendingAction: payload.pendingAction,
        suggestedMode: intentToSuggestedMode[payload.intent],
        threadId: payload.threadId,
        tokenUsage: streamedUsage,
        turnId: payload.turnId,
      });

      await emitProgressiveTokens(payload.assistantMessage, enqueue, streamedUsage, 'response');

      enqueue("done", {
        ...payload,
        tokenUsage: streamedUsage,
      });
      controller.close();
    },
  });

  return new Response(responseStream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
};

export const createAgentChatStream = (
  runner: (
    emitStatus: (status: string) => void,
    emitTrace: (step: AgentTraceStep) => void,
    emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void,
    emitToken: StreamTokenCallback,
    emitStage: (event: AgentStreamStageEvent) => void,
    emitProgress: (event: AgentStreamProgressEvent) => void,
    emitChange: (event: AgentStreamChangeEvent) => void,
  ) => Promise<AgentChatResponse>,
) => {
  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let streamedOutputTokens = 0;
        let contextPlusInput = 0;
        let tokensWereStreamed = false;
        let streamedResponseText = "";
        let firstResponseTokenSent = false;
        const streamStartMs = performance.now();

        const payload = await runner(
          (status) => enqueue("status", { status }),
          (step) => enqueue("trace", step),
          (tokenUsage) => {
            if (tokenUsage) {
              contextPlusInput = tokenUsage.contextTokens + tokenUsage.inputTokens;
              enqueue("usage", tokenUsage);
            }
          },
          (token, block) => {
            tokensWereStreamed = true;
            const isResponse = block === "response" || block === undefined;
            if (isResponse) {
              streamedResponseText += token;
              if (!firstResponseTokenSent) {
                firstResponseTokenSent = true;
                const serverFirstTokenMs = performance.now() - streamStartMs;
                enqueue("perf", {
                  event: "server_first_token",
                  ms: serverFirstTokenMs,
                });
              }
            }
            streamedOutputTokens += 1;
            enqueue("token", {
              content: token,
              tokenUsage: {
                source: "estimate",
                contextTokens: 0,
                inputTokens: 0,
                outputTokens: streamedOutputTokens,
                totalTokens: contextPlusInput + streamedOutputTokens,
              },
              ...(block ? { block } : {}),
            });
          },
          (event) => enqueue("stage", event),
          (event) => enqueue("progress", event),
          (event) => enqueue("change", event),
        );

        const resolvedAssistantMessage =
          typeof payload.assistantMessage === "string" && payload.assistantMessage.trim().length > 0
            ? payload.assistantMessage
            : streamedResponseText.trim() || payload.assistantMessage;
        const finalPayload = {
          ...payload,
          assistantMessage: resolvedAssistantMessage,
        };

        // If the pipeline didn't stream any tokens (e.g. write intents with deterministic text),
        // fall back to progressive word-by-word streaming of the assistantMessage.
        if (!tokensWereStreamed && finalPayload.assistantMessage) {
          const baseUsage = payload.tokenUsage
            ? { ...payload.tokenUsage, outputTokens: 0, totalTokens: (payload.tokenUsage.contextTokens + payload.tokenUsage.inputTokens) }
            : createTokenUsageSnapshot();
          enqueue("meta", {
            confidence: payload.confidence,
            engine: payload.engine,
            intent: payload.intent,
            pendingAction: payload.pendingAction,
            suggestedMode: intentToSuggestedMode[payload.intent],
            threadId: payload.threadId,
            tokenUsage: baseUsage,
            turnId: payload.turnId,
          });
          await emitProgressiveTokens(finalPayload.assistantMessage, enqueue, baseUsage, 'response');
        }

        enqueue("meta", {
          confidence: finalPayload.confidence,
          contextSummary: finalPayload.contextSummary,
          engine: finalPayload.engine,
          intent: finalPayload.intent,
          pendingAction: finalPayload.pendingAction,
          suggestedMode: intentToSuggestedMode[finalPayload.intent],
          threadId: finalPayload.threadId,
          tokenUsage: finalPayload.tokenUsage,
          turnId: finalPayload.turnId,
        });

        enqueue("done", finalPayload);
        // #region agent log
        if (process.env.AGENT_DEBUG_LOG) {
          try {
            appendFileSync(
              getAgentDebugLogPath(),
              `${JSON.stringify({
                sessionId: "961715",
                location: "stream-envelope.ts:done",
                message: "sse done payload",
                data: {
                  payloadAssistantLen: payload.assistantMessage?.length ?? 0,
                  streamedResponseLen: streamedResponseText.length,
                  finalAssistantLen:
                    typeof finalPayload.assistantMessage === "string"
                      ? finalPayload.assistantMessage.length
                      : null,
                },
                timestamp: Date.now(),
                hypothesisId: "H15",
                runId: "post-fix-3",
              })}\n`,
            );
          } catch {
            // ignore debug log failures
          }
        }
        // #endregion
      } catch (error) {
        enqueue("error", {
          assistantMessage: "Agent 执行失败，我已经把失败记录写入审计日志。",
          message: error instanceof Error ? error.message : "Unknown Agent failure",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
};
