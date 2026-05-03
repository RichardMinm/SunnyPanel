import { NextResponse } from "next/server";

import { recordAgentFailure } from "@/lib/agent/audit";
import { executeAgentIntent } from "@/lib/agent/executor";
import { resolveAgentIntent, isNegativeReply } from "@/lib/agent/intent";
import { logAgentEvent } from "@/lib/agent/logger";
import { getPayloadClient } from "@/lib/payload/client";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { type AgentChatResponse, type AgentIntent, type AgentTraceStep, parsePendingAction, sanitizeChatMessages } from "@/lib/agent/schemas";
import {
  createTokenUsageSnapshot,
  estimateMessagesTokenCount,
  estimateTokenCount,
} from "@/lib/agent/token-usage";
import {
  appendAgentThreadTurn,
  getOrCreateAgentThread,
  getThreadMessages,
  getThreadPendingAction,
  removeCurrentMessageFromHistory,
} from "@/lib/agent/thread";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseThreadId = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const sleep = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

const chunkText = (value: string) => {
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += 12) {
    chunks.push(value.slice(index, index + 12));
  }

  return chunks.length > 0 ? chunks : [value];
};

const buildIntentTraceSummary = (intent: AgentIntent): { detail?: string; title: string } => {
  switch (intent.intent) {
    case "answer_question":
      return {
        detail: intent.args.suggestAction ?? "直接回答用户问题，不执行数据库写入。",
        title: "识别为直接回答",
      };
    case "create_plan":
      return {
        detail: intent.args.description ?? "将创建一条新的私有计划记录。",
        title: `识别为创建计划：${intent.args.title}`,
      };
    case "append_plan_item":
      return {
        detail: `${intent.args.checklistTitle}${intent.args.groupTitle ? ` / ${intent.args.groupTitle}` : ""}`,
        title: `识别为追加计划项：${intent.args.itemTitle}`,
      };
    case "complete_plan_item":
      return {
        detail: `${intent.args.checklistTitle}${intent.args.groupTitle ? ` / ${intent.args.groupTitle}` : ""}`,
        title: `识别为完成条目：${intent.args.itemTitle}`,
      };
    case "add_completion_note":
      return {
        detail: `${intent.args.checklistTitle}${intent.args.groupTitle ? ` / ${intent.args.groupTitle}` : ""}`,
        title: `识别为补完成备注：${intent.args.itemTitle}`,
      };
    case "query_progress":
      return {
        detail: intent.args.checklistTitle ? `目标清单：${intent.args.checklistTitle}` : "范围：整体进度",
        title: "识别为进度查询",
      };
    case "evaluate_plan":
      return {
        detail: intent.args.planTitle ? `目标计划：${intent.args.planTitle}` : "范围：全部计划",
        title: "识别为计划评估",
      };
    case "clarify":
    default:
      return {
        detail: intent.args.question,
        title: "需要进一步澄清输入",
      };
  }
};

const createAgentChatResponse = (payload: AgentChatResponse, stream: boolean) => {
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

const createAgentChatStream = (
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

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        assistantMessage: "当前会话没有登录，暂时不能执行 Agent 操作。",
      },
      { status: 401 },
    );
  }

  const user = authResult.user;
  const payload = await getPayloadClient();
  const body = await request.json().catch(() => null);

  if (!isRecord(body)) {
    return NextResponse.json(
      {
        assistantMessage: "请求体格式不正确。",
      },
      { status: 400 },
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const shouldStream = body.stream === true;

  if (!message) {
    return NextResponse.json(
      {
        assistantMessage: "请输入一条要交给 Agent 处理的话。",
      },
      { status: 400 },
    );
  }

  const history = sanitizeChatMessages(body.messages);
  logAgentEvent("info", "chat.request", {
    historyLength: history.length,
    messageLength: message.length,
    stream: shouldStream,
    userId: user.id,
  });
  const thread = await getOrCreateAgentThread({
    firstMessage: message,
    threadId: parseThreadId(body.threadId),
    userId: user.id,
  });
  const storedHistory = getThreadMessages(thread);
  const clientHistory = removeCurrentMessageFromHistory(history, message);
  const resolvedHistory = (storedHistory.length > 0 ? storedHistory : clientHistory).slice(-12);
  const pendingAction = getThreadPendingAction(thread) ?? parsePendingAction(body.pendingAction);
  const baseTokenUsage = createTokenUsageSnapshot({
    contextTokens: estimateMessagesTokenCount(resolvedHistory) + estimateTokenCount(pendingAction),
    inputTokens: estimateTokenCount(message),
  });

  if (pendingAction && isNegativeReply(message)) {
    const assistantMessage = "好的，这次先不补备注。你接下来也可以直接继续给我新的计划或完成记录。";
    const tokenUsage = {
      ...baseTokenUsage,
      outputTokens: estimateTokenCount(assistantMessage),
      totalTokens:
        baseTokenUsage.contextTokens + baseTokenUsage.inputTokens + estimateTokenCount(assistantMessage),
    };

    await appendAgentThreadTurn({
      assistantMessage,
      confidence: 1,
      engine: "workflow",
      intent: "clarify",
      pendingAction: null,
      thread,
      userMessage: message,
    });
    logAgentEvent("info", "chat.pending_action_skipped", {
      threadId: thread.id,
      userId: user.id,
    });

    return createAgentChatResponse(
      {
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: "clarify",
        pendingAction: null,
        threadId: thread.id,
        tokenUsage,
      },
      shouldStream,
    );
  }

  const runPipeline = async (
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

    let tokenUsage = baseTokenUsage;
    emitUsage(tokenUsage);
    emitStatus("正在读取计划和清单上下文...");
    pushTrace({
      detail: "准备读取最近的计划、清单和待处理动作，为这轮对话建立上下文。",
      id: "context-bootstrap",
      kind: "context",
      status: "running",
      title: "正在建立上下文",
    });
    const [plans, checklists] = await Promise.all([
      payload.find({
        collection: "plans",
        depth: 0,
        limit: 12,
        overrideAccess: true,
        sort: "-updatedAt",
      }),
      payload.find({
        collection: "checklists",
        depth: 0,
        limit: 12,
        overrideAccess: true,
        sort: "-updatedAt",
      }),
    ]);
    const context = {
      checklists: checklists.docs.map((checklist) => ({
        groups: (checklist.groups ?? []).slice(0, 4).map((group) => ({
          items: (group.items ?? []).slice(0, 6).map((item) => item.title),
          title: group.title,
        })),
        title: checklist.title,
      })),
      now: new Date().toISOString(),
      pendingAction,
      plans: plans.docs.map((plan) => ({
        priority: plan.priority,
        state: plan.state,
        title: plan.title,
      })),
    };
    tokenUsage = createTokenUsageSnapshot({
      contextTokens: baseTokenUsage.contextTokens + estimateTokenCount(context),
      inputTokens: baseTokenUsage.inputTokens,
    });
    emitUsage(tokenUsage);
    pushTrace({
      detail: `已读取 ${plans.docs.length} 条计划、${checklists.docs.length} 份清单。`,
      id: "context-bootstrap",
      kind: "context",
      status: "done",
      title: "上下文已就绪",
    });

    emitStatus("正在解析事务意图...");
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
      message,
      pendingAction,
    });
    if ("tokenUsage" in resolution && resolution.tokenUsage) {
      tokenUsage = resolution.tokenUsage;
      emitUsage(tokenUsage);
    }
    const intentSummary = buildIntentTraceSummary(resolution.intent);
    pushTrace({
      detail: intentSummary.detail,
      id: "analysis-intent",
      kind: "analysis",
      status: "done",
      title: intentSummary.title,
    });

    logAgentEvent("info", "chat.intent_resolved", {
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: resolution.intent.intent,
      threadId: thread.id,
      userId: user.id,
    });

    try {
      const isDirectAnswer = resolution.intent.intent === "answer_question";

      emitStatus(isDirectAnswer ? "正在组织直接回答..." : "正在执行工具并写入数据库...");
      pushTrace({
        detail: isDirectAnswer
          ? "这轮只生成回答，不会写入计划、清单或时间线。"
          : "接下来会根据识别出的意图执行查询、更新或同步动作。",
        id: "action-execute",
        kind: "action",
        status: "running",
        title: isDirectAnswer ? "准备生成回答" : "准备执行对应动作",
      });
      const execution = await executeAgentIntent(resolution.intent, pushTrace);
      const outputTokens = estimateTokenCount(execution.assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      pushTrace({
        detail: execution.pendingAction
          ? "当前动作已执行，但还需要你补充下一步信息。"
          : isDirectAnswer
            ? "回答已生成，正在把对话写回会话线程。"
            : "当前动作已执行完成，正在把结果写回会话线程。",
        id: "action-execute",
        kind: "action",
        status: "done",
        title: execution.pendingAction ? "动作已执行，进入待补信息状态" : isDirectAnswer ? "回答生成完成" : "动作执行完成",
      });

      emitStatus("正在保存会话上下文...");
      pushTrace({
        detail: "会把这轮用户输入、Agent 回复和待处理动作一起写回 AgentThread。",
        id: "thread-writeback",
        kind: "write",
        status: "running",
        title: "正在保存会话上下文",
      });
      const updatedThread = await appendAgentThreadTurn({
        assistantMessage: execution.assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: execution.pendingAction,
        thread,
        userMessage: message,
      });

      logAgentEvent("info", "chat.intent_executed", {
        intent: resolution.intent.intent,
        pendingAction: execution.pendingAction?.type ?? null,
        threadId: updatedThread.id,
        userId: user.id,
      });
      pushTrace({
        detail: `Thread #${updatedThread.id} 已更新，可继续承接这轮上下文。`,
        id: "thread-writeback",
        kind: "complete",
        status: "done",
        title: "会话上下文已保存",
      });

      return {
        assistantMessage: execution.assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: execution.pendingAction,
        trace,
        threadId: updatedThread.id,
        tokenUsage,
      };
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

  if (shouldStream) {
    return createAgentChatStream(runPipeline);
  }

  return NextResponse.json(await runPipeline());
}
