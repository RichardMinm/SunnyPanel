import type { AgentThread } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import {
  parsePendingAction,
  sanitizeChatMessages,
  type AgentChatMessage,
  type AgentEngine,
  type AgentIntent,
  type PendingAction,
} from "./schemas";
import { validateAgentThreadData } from "./write-schemas";

const maxThreadMessages = 40;

const resolveRelationId = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (value && typeof value === "object" && "id" in value && typeof value.id === "number") {
    return value.id;
  }

  return null;
};

const buildThreadTitle = (message: string) => {
  const normalized = message.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "Agent Thread";
  }

  return normalized.length > 32 ? `${normalized.slice(0, 32).trimEnd()}...` : normalized;
};

const isOwnedThread = (thread: AgentThread, userId: number) => {
  const threadUserId = resolveRelationId(thread.user);

  return threadUserId === userId;
};

export const getThreadMessages = (thread: AgentThread): AgentChatMessage[] =>
  sanitizeChatMessages(thread.messages ?? []);

export const getThreadPendingAction = (thread: AgentThread) => parsePendingAction(thread.pendingAction);

export const removeCurrentMessageFromHistory = (history: AgentChatMessage[], message: string) => {
  const lastMessage = history[history.length - 1];

  if (lastMessage?.role === "user" && lastMessage.content.trim() === message.trim()) {
    return history.slice(0, -1);
  }

  return history;
};

export const getOrCreateAgentThread = async ({
  firstMessage,
  threadId,
  userId,
}: {
  firstMessage: string;
  threadId?: null | number;
  userId: number;
}) => {
  const payload = await getPayloadClient();

  if (threadId) {
    const existingThread = (await payload
      .findByID({
        collection: "agent-threads",
        depth: 0,
        id: threadId,
        overrideAccess: true,
      })
      .catch(() => null)) as AgentThread | null;

    if (existingThread && isOwnedThread(existingThread, userId)) {
      return existingThread;
    }
  }

  const data = validateAgentThreadData({
    lastInteractionAt: new Date().toISOString(),
    messages: [],
    pendingAction: null,
    status: "active",
    title: buildThreadTitle(firstMessage),
    user: userId,
  });

  return (await payload.create({
    collection: "agent-threads",
    data: {
      ...data,
      title: data.title ?? buildThreadTitle(firstMessage),
      user: data.user ?? userId,
    },
    overrideAccess: true,
  })) as AgentThread;
};

export const appendAgentThreadTurn = async ({
  assistantMessage,
  confidence,
  engine,
  intent,
  pendingAction,
  thread,
  userMessage,
}: {
  assistantMessage: string;
  confidence?: number;
  engine: AgentEngine;
  intent: AgentIntent["intent"];
  pendingAction: null | PendingAction;
  thread: AgentThread;
  userMessage: string;
}) => {
  const payload = await getPayloadClient();
  const recordedAt = new Date().toISOString();
  const messages = [
    ...(thread.messages ?? []).map((message) => ({
      content: message.content,
      recordedAt: message.recordedAt ?? undefined,
      role: message.role,
    })),
    {
      content: userMessage,
      recordedAt,
      role: "user" as const,
    },
    {
      content: assistantMessage,
      recordedAt,
      role: "assistant" as const,
    },
  ].slice(-maxThreadMessages);

  const data = validateAgentThreadData({
    lastConfidence: confidence ?? null,
    lastEngine: engine,
    lastIntent: intent,
    lastInteractionAt: recordedAt,
    messages,
    pendingAction,
    status: "active",
  });

  return (await payload.update({
    collection: "agent-threads",
    data,
    id: thread.id,
    overrideAccess: true,
  })) as AgentThread;
};
