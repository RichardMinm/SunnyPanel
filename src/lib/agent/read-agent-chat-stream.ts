import { getTokenUsageFromData, parseStreamBlock } from "@/lib/agent/chat-stream";
import type { AgentTokenUsage, AgentTraceStep } from "@/lib/agent/schemas";
import {
  parsePublicAgentChatResponse,
  type PublicAgentChatResponse,
} from "@/lib/agent/public-chat-response";
import {
  sanitizeAgentTraceEvent,
  type AgentTraceEventPayload,
} from "@/lib/agent/trace";
import {
  isAgentStreamChangeEvent,
  isAgentStreamProgressEvent,
  isAgentStreamStageEvent,
  isAgentStreamTerminalEvent,
  type AgentStreamChangeEvent,
  type AgentStreamPerfEvent,
  type AgentStreamProgressEvent,
  type AgentStreamStageEvent,
  type AgentStreamTerminalEvent,
} from "@/lib/agent/stream-events";

export type AgentChatStreamDone = Partial<PublicAgentChatResponse> & {
  assistantMessage?: string;
};

export type AgentChatStreamHandlers = {
  appendAssistantToken: (content: string) => void;
  onChange?: (event: AgentStreamChangeEvent) => void;
  onDone: (data: AgentChatStreamDone) => void;
  onErrorMessage: (assistantMessage: string) => void;
  onMeta: (data: unknown) => void;
  onProgress?: (event: AgentStreamProgressEvent) => void;
  onPerf?: (event: AgentStreamPerfEvent) => void;
  onStage?: (event: AgentStreamStageEvent) => void;
  onTerminal?: (event: AgentStreamTerminalEvent) => void;
  onStatus: (status: string) => void;
  onStreamStart: () => void;
  onThinkingToken: (content: string) => void;
  onTokenUsage: (usage: AgentTokenUsage) => void;
  onTraceStep: (step: AgentTraceStep) => void;
  onBackendTraceEvent?: (event: AgentTraceEventPayload) => void;
  replaceAssistantContent: (content: string) => void;
  setStreamingState: (state: "idle" | "responding" | "thinking") => void;
};

const isBackendTraceStreamEvent = (data: unknown): data is AgentTraceEventPayload =>
  typeof data === "object" &&
  data !== null &&
  "phase" in data &&
  "status" in data &&
  "threadId" in data &&
  "title" in data;

export async function readAgentChatStream(
  response: Response,
  handlers: AgentChatStreamHandlers,
): Promise<AgentChatStreamDone | null> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Agent 没有返回可读取的流。");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let doneData: AgentChatStreamDone | null = null;
  let errorAssistantMessage: string | null = null;
  let streamedResponseText = "";
  let terminalEvent: AgentStreamTerminalEvent | null = null;

  handlers.onStreamStart();
  handlers.setStreamingState("thinking");

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const parsedBlock = parseStreamBlock(block);

      if (!parsedBlock) {
        continue;
      }

      if (
        parsedBlock.event === "stage" &&
        isAgentStreamStageEvent(parsedBlock.data)
      ) {
        handlers.onStage?.(parsedBlock.data);
      }

      if (
        parsedBlock.event === "progress" &&
        isAgentStreamProgressEvent(parsedBlock.data)
      ) {
        handlers.onProgress?.(parsedBlock.data);
      }

      if (
        parsedBlock.event === "change" &&
        isAgentStreamChangeEvent(parsedBlock.data)
      ) {
        handlers.onChange?.(parsedBlock.data);
      }

      if (
        parsedBlock.event === "status" &&
        typeof parsedBlock.data === "object" &&
        parsedBlock.data &&
        "status" in parsedBlock.data
      ) {
        const status = parsedBlock.data.status;

        if (typeof status === "string") {
          handlers.onStatus(status);
        }
      }

      if (parsedBlock.event === "usage") {
        const nextTokenUsage = parsedBlock.data as AgentTokenUsage;

        if (typeof nextTokenUsage?.totalTokens === "number") {
          handlers.onTokenUsage(nextTokenUsage);
        }
      }

      if (parsedBlock.event === "meta") {
        handlers.onMeta(parsedBlock.data);

        const nextTokenUsage = getTokenUsageFromData(parsedBlock.data);

        if (nextTokenUsage) {
          handlers.onTokenUsage(nextTokenUsage);
        }
      }

      if (
        parsedBlock.event === "trace" &&
        typeof parsedBlock.data === "object" &&
        parsedBlock.data &&
        "id" in parsedBlock.data
      ) {
        handlers.onTraceStep(parsedBlock.data as AgentTraceStep);
      }

      if (parsedBlock.event === "activity" && isBackendTraceStreamEvent(parsedBlock.data)) {
        handlers.onBackendTraceEvent?.(sanitizeAgentTraceEvent(parsedBlock.data));
      }

      if (
        parsedBlock.event === "token" &&
        typeof parsedBlock.data === "object" &&
        parsedBlock.data &&
        "content" in parsedBlock.data
      ) {
        const content = parsedBlock.data.content;
        const block = (parsedBlock.data as Record<string, unknown>).block;
        const nextTokenUsage = getTokenUsageFromData(parsedBlock.data);

        if (typeof content === "string") {
          if (block === "thinking") {
            handlers.onThinkingToken(content);
          } else {
            streamedResponseText += content;
            handlers.setStreamingState("responding");
            handlers.appendAssistantToken(content);
          }
        }

        if (nextTokenUsage) {
          handlers.onTokenUsage(nextTokenUsage);
        }
      }

      if (parsedBlock.event === "done" && typeof parsedBlock.data === "object" && parsedBlock.data) {
        doneData = parsePublicAgentChatResponse(parsedBlock.data) as AgentChatStreamDone | null;

        const nextTokenUsage = getTokenUsageFromData(parsedBlock.data);

        if (nextTokenUsage) {
          handlers.onTokenUsage(nextTokenUsage);
        }
      }

      if (
        parsedBlock.event === "terminal"
        && isAgentStreamTerminalEvent(parsedBlock.data)
      ) {
        terminalEvent = parsedBlock.data;
      }

      if (
        parsedBlock.event === "perf" &&
        typeof parsedBlock.data === "object" &&
        parsedBlock.data &&
        "event" in parsedBlock.data
      ) {
        handlers.onPerf?.(parsedBlock.data as AgentStreamPerfEvent);
      }

      if (
        parsedBlock.event === "error" &&
        typeof parsedBlock.data === "object" &&
        parsedBlock.data &&
        "assistantMessage" in parsedBlock.data
      ) {
        const assistantMessage = parsedBlock.data.assistantMessage;

        if (typeof assistantMessage === "string") {
          errorAssistantMessage = assistantMessage;
        }
      }
    }
  }

  if (buffer.trim()) {
    const parsedBlock = parseStreamBlock(buffer.trim());

    if (parsedBlock?.event === "done" && typeof parsedBlock.data === "object" && parsedBlock.data) {
      doneData = parsePublicAgentChatResponse(parsedBlock.data) as AgentChatStreamDone | null;
    }
    if (
      parsedBlock?.event === "terminal"
      && isAgentStreamTerminalEvent(parsedBlock.data)
    ) {
      terminalEvent = parsedBlock.data;
    }
  }

  const fallbackTerminal: AgentStreamTerminalEvent = doneData
    ? {
        partialOutputEmitted: false,
        persist: true,
        retryable: false,
        status: "complete",
      }
    : streamedResponseText.trim()
      ? {
          partialOutputEmitted: true,
          persist: false,
          retryable: true,
          status: "partial",
        }
      : {
          partialOutputEmitted: false,
          persist: false,
          retryable: true,
          status: "unavailable",
        };
  const observedPartialOutput = Boolean(streamedResponseText.trim());
  const resolvedTerminal: AgentStreamTerminalEvent = terminalEvent?.status === "complete" && !doneData
    ? fallbackTerminal
    : terminalEvent?.status === "partial" && !observedPartialOutput
      ? {
          partialOutputEmitted: false,
          persist: false,
          retryable: true,
          status: "unavailable" as const,
        }
      : terminalEvent?.status === "unavailable" && observedPartialOutput
        ? {
            partialOutputEmitted: true,
            persist: false,
            retryable: true,
            status: "partial" as const,
          }
        : terminalEvent ?? fallbackTerminal;

  if (errorAssistantMessage && resolvedTerminal.status !== "complete") {
    handlers.onErrorMessage(errorAssistantMessage);
  }
  handlers.onTerminal?.(resolvedTerminal);

  if (resolvedTerminal.status !== "complete") {
    doneData = null;
  } else if (doneData) {
    handlers.onDone(doneData);
  }

  if (doneData && !doneData.assistantMessage?.trim() && streamedResponseText.trim()) {
    doneData = {
      ...doneData,
      assistantMessage: streamedResponseText.trim(),
    };
  }

  if (typeof doneData?.assistantMessage === "string") {
    handlers.replaceAssistantContent(doneData.assistantMessage);
  }

  return doneData;
}
