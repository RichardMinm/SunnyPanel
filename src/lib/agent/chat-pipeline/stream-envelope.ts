import { NextResponse } from "next/server";

import { type AgentChatResponse, type AgentTraceStep } from "@/lib/agent/schemas";
import { createTokenUsageSnapshot, estimateTokenCount } from "@/lib/agent/token-usage";

/**
 * SSE 契约（与 `AgentChatPanel` 中 `readStreamResponse` / `parseStreamBlock` 对齐）
 *
 * 每条消息：`event: <name>\ndata: <JSON>\n\n`
 *
 * | event    | data 形状（摘要） |
 * |----------|---------------------|
 * | status   | `{ status: string }` 流水线状态文案 |
 * | usage    | `AgentTokenUsage` 估算用量快照 |
 * | trace    | `AgentTraceStep` 单步追踪 |
 * | meta     | `{ confidence?, engine, intent, pendingAction?, threadId?, tokenUsage }` 终态元数据（流末尾前再发一次） |
 * | token    | `{ content: string, tokenUsage? }` 模拟分块正文（当前为打字机式切分，非模型真流） |
 * | done     | 完整 `AgentChatResponse`（含 `assistantMessage`、`pendingAction`、`trace` 等） |
 * | error    | `{ assistantMessage, message }` 执行失败 |
 *
 * `createAgentChatResponse`：非流式直接 JSON；流式时仅对最终 payload 做 meta/token/done 序列（无 status/trace）。
 * `createAgentChatStream`：先跑 `runner` 收集 status/trace/usage，再发 meta/token/done。
 */
const sleep = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

const chunkText = (value: string) => {
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += 12) {
    chunks.push(value.slice(index, index + 12));
  }

  return chunks.length > 0 ? chunks : [value];
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

      let streamedUsage = payload.tokenUsage
        ? {
            ...payload.tokenUsage,
            outputTokens: 0,
            totalTokens: payload.tokenUsage.contextTokens + payload.tokenUsage.inputTokens,
          }
        : createTokenUsageSnapshot();

      enqueue("meta", {
        confidence: payload.confidence,
        engine: payload.engine,
        intent: payload.intent,
        pendingAction: payload.pendingAction,
        threadId: payload.threadId,
        tokenUsage: streamedUsage,
      });

      for (const chunk of chunkText(payload.assistantMessage)) {
        const outputTokens = streamedUsage.outputTokens + estimateTokenCount(chunk);
        streamedUsage = {
          ...streamedUsage,
          outputTokens,
          totalTokens: streamedUsage.contextTokens + streamedUsage.inputTokens + outputTokens,
        };
        enqueue("token", {
          content: chunk,
          tokenUsage: streamedUsage,
        });
        await sleep(12);
      }

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
  ) => Promise<AgentChatResponse>,
) => {
  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const payload = await runner(
          (status) => {
            enqueue("status", {
              status,
            });
          },
          (step) => {
            enqueue("trace", step);
          },
          (tokenUsage) => {
            if (tokenUsage) {
              enqueue("usage", tokenUsage);
            }
          },
        );

        let streamedUsage = payload.tokenUsage
          ? {
              ...payload.tokenUsage,
              outputTokens: 0,
              totalTokens: payload.tokenUsage.contextTokens + payload.tokenUsage.inputTokens,
            }
          : createTokenUsageSnapshot();

        enqueue("meta", {
          confidence: payload.confidence,
          engine: payload.engine,
          intent: payload.intent,
          pendingAction: payload.pendingAction,
          threadId: payload.threadId,
          tokenUsage: streamedUsage,
        });

        for (const chunk of chunkText(payload.assistantMessage)) {
          const outputTokens = streamedUsage.outputTokens + estimateTokenCount(chunk);
          streamedUsage = {
            ...streamedUsage,
            outputTokens,
            totalTokens: streamedUsage.contextTokens + streamedUsage.inputTokens + outputTokens,
          };
          enqueue("token", {
            content: chunk,
            tokenUsage: streamedUsage,
          });
          await sleep(12);
        }

        enqueue("done", {
          ...payload,
          tokenUsage: streamedUsage,
        });
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
