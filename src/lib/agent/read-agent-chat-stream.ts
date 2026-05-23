import { getTokenUsageFromData, parseStreamBlock } from "@/lib/agent/chat-stream";
import type { AgentChatResponse, AgentTokenUsage, AgentTraceStep } from "@/lib/agent/schemas";
import { isValidWorkbenchMode } from "@/lib/agent/workbench-mode";

export type AgentChatStreamDone = Partial<AgentChatResponse> & {
  assistantMessage?: string;
};

export type AgentChatStreamHandlers = {
  appendAssistantToken: (content: string) => void;
  onDone: (data: AgentChatStreamDone) => void;
  onErrorMessage: (assistantMessage: string) => void;
  onMeta: (data: unknown) => void;
  onStatus: (status: string) => void;
  onStreamStart: () => void;
  onThinkingToken: (content: string) => void;
  onTokenUsage: (usage: AgentTokenUsage) => void;
  onTraceStep: (step: AgentTraceStep) => void;
  replaceAssistantContent: (content: string) => void;
  setStreamingState: (state: "idle" | "responding" | "thinking") => void;
};

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
            handlers.setStreamingState("responding");
            handlers.appendAssistantToken(content);
          }
        }

        if (nextTokenUsage) {
          handlers.onTokenUsage(nextTokenUsage);
        }
      }

      if (parsedBlock.event === "done" && typeof parsedBlock.data === "object" && parsedBlock.data) {
        doneData = parsedBlock.data as AgentChatStreamDone;
        handlers.onDone(doneData);

        const nextTokenUsage = getTokenUsageFromData(parsedBlock.data);

        if (nextTokenUsage) {
          handlers.onTokenUsage(nextTokenUsage);
        }
      }

      if (
        parsedBlock.event === "error" &&
        typeof parsedBlock.data === "object" &&
        parsedBlock.data &&
        "assistantMessage" in parsedBlock.data
      ) {
        const assistantMessage = parsedBlock.data.assistantMessage;

        if (typeof assistantMessage === "string") {
          doneData = {
            assistantMessage,
            engine: "workflow",
            intent: "clarify",
            pendingAction: null,
          };
          handlers.onErrorMessage(assistantMessage);
        }
      }
    }
  }

  if (buffer.trim()) {
    const parsedBlock = parseStreamBlock(buffer.trim());

    if (parsedBlock?.event === "done" && typeof parsedBlock.data === "object" && parsedBlock.data) {
      doneData = parsedBlock.data as AgentChatStreamDone;
      handlers.onDone(doneData);
    }
  }

  if (typeof doneData?.assistantMessage === "string") {
    handlers.replaceAssistantContent(doneData.assistantMessage);
  }

  return doneData;
}
