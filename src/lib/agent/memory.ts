import { getPayloadClient } from "../payload/client";
import {
  inferAgentMemoryType,
  scoreAgentMemoryRelevance,
  validateAgentMemoryData,
  type AgentMemoryDocument,
  type AgentMemoryInput,
} from "./memory-schema";

export {
  inferAgentMemoryType,
  parseAgentMemoryInput,
  scoreAgentMemoryRelevance,
  validateAgentMemoryData,
  type AgentMemoryDocument,
  type AgentMemoryDraft,
  type AgentMemoryInput,
  type AgentMemoryStatus,
  type AgentMemoryType,
  type AgentMemoryWriteData,
} from "./memory-schema";

type AgentThreadDocument = {
  id: number;
  messages?:
    | {
        content: string;
        role: "assistant" | "user";
      }[]
    | null;
  title: string;
};

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const deriveMemoryTitle = (content: string) => {
  const normalized = normalizeWhitespace(content);

  return normalized.length <= 36 ? normalized : `${normalized.slice(0, 36).trimEnd()}...`;
};

const extractMemoryContentFromThread = (thread: AgentThreadDocument) => {
  const messages = [...(thread.messages ?? [])].reverse();
  const userMessage = messages.find((message) => message.role === "user" && message.content.trim().length > 0);
  const content = userMessage?.content ?? thread.title;

  return normalizeWhitespace(content.replace(/^(请|帮我)?(记住|记一下|以后记得)[:：，,\s]*/, ""));
};

export const getRelevantMemories = async (query: string, limit = 6) => {
  const payload = await getPayloadClient();
  const memories = await payload.find({
    collection: "agent-memories",
    depth: 0,
    limit: Math.max(20, limit * 4),
    overrideAccess: true,
    pagination: false,
    sort: "-lastUsedAt",
    where: {
      and: [
        {
          status: {
            equals: "active",
          },
        },
        {
          visibility: {
            equals: "private",
          },
        },
      ],
    },
  });
  const now = new Date().toISOString();
  const selected = (memories.docs as AgentMemoryDocument[])
    .map((memory) => ({
      memory,
      score: scoreAgentMemoryRelevance(memory, query),
    }))
    .filter((item) => !query.trim() || item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || Date.parse(right.memory.updatedAt) - Date.parse(left.memory.updatedAt),
    )
    .slice(0, limit)
    .map((item) => item.memory);

  await Promise.all(
    selected.map((memory) =>
      payload.update({
        collection: "agent-memories",
        data: {
          lastUsedAt: now,
        },
        id: memory.id,
        overrideAccess: true,
      }),
    ),
  );

  return selected;
};

export const upsertMemory = async (memory: AgentMemoryInput) => {
  const payload = await getPayloadClient();
  const data = validateAgentMemoryData({
    ...memory,
    lastUsedAt: memory.lastUsedAt ?? new Date().toISOString(),
    status: memory.status ?? "active",
  });

  if (memory.id) {
    return payload.update({
      collection: "agent-memories",
      data,
      id: memory.id,
      overrideAccess: true,
    }) as Promise<AgentMemoryDocument>;
  }

  const existing = await payload.find({
    collection: "agent-memories",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        {
          title: {
            equals: data.title,
          },
        },
        {
          type: {
            equals: data.type,
          },
        },
      ],
    },
  });
  const existingMemory = existing.docs[0] as AgentMemoryDocument | undefined;

  if (existingMemory) {
    return payload.update({
      collection: "agent-memories",
      data,
      id: existingMemory.id,
      overrideAccess: true,
    }) as Promise<AgentMemoryDocument>;
  }

  return payload.create({
    collection: "agent-memories",
    data: data as never,
    overrideAccess: true,
  }) as Promise<AgentMemoryDocument>;
};

export const archiveMemory = async (id: number) => {
  const payload = await getPayloadClient();

  return payload.update({
    collection: "agent-memories",
    data: {
      status: "archived",
    },
    id,
    overrideAccess: true,
  }) as Promise<AgentMemoryDocument>;
};

export const createAgentMemoryFromThread = async (threadId: number) => {
  const payload = await getPayloadClient();
  const thread = (await payload.findByID({
    collection: "agent-threads",
    depth: 0,
    id: threadId,
    overrideAccess: true,
  })) as AgentThreadDocument;
  const content = extractMemoryContentFromThread(thread);

  return upsertMemory({
    confidence: 0.65,
    content,
    sourceThread: thread.id,
    title: deriveMemoryTitle(content),
    type: inferAgentMemoryType(content),
  });
};
