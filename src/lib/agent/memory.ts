import { getPayloadClient } from "../payload/client";
import {
  scoreAgentMemoryRelevance,
  validateAgentMemoryData,
  type AgentMemoryDocument,
  type AgentMemoryInput,
} from "./memory-schema";
import { computeMemoryRankScore, reinforceMemoryConfidence } from "./memory-ranking";

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

export const getRelevantMemories = async (query: string, limit = 6, intentHint?: string) => {
  const { isVectorMemoryEnabled, searchMemoriesByVector } = await import("./memory-vector");

  if (isVectorMemoryEnabled() && query.trim()) {
    const vectorMatches = await searchMemoriesByVector(query, limit, intentHint);

    if (vectorMatches && vectorMatches.length > 0) {
      await reinforceRetrievedMemories(vectorMatches);

      return vectorMatches;
    }
  }

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
  const rankNow = Date.now();
  const selected = (memories.docs as AgentMemoryDocument[])
    .map((memory) => {
      const baseScore = scoreAgentMemoryRelevance(memory, query, intentHint);

      return {
        baseScore,
        memory,
        // 综合排序分：基础相关性 × 置信度 × recency 衰减，使常用记忆靠前、沉睡记忆下沉。
        score: computeMemoryRankScore({
          baseScore,
          confidence: memory.confidence,
          lastUsedAt: memory.lastUsedAt,
          now: rankNow,
        }),
      };
    })
    .filter((item) => !query.trim() || item.baseScore > 0)
    .sort(
      (left, right) =>
        right.score - left.score || Date.parse(right.memory.updatedAt) - Date.parse(left.memory.updatedAt),
    )
    .slice(0, limit)
    .map((item) => item.memory);

  await reinforceRetrievedMemories(selected);

  return selected;
};

/**
 * 命中反馈：被检索注入上下文的记忆刷新 lastUsedAt 并小步上调置信度（有上限），形成正反馈循环。
 * 写入失败不影响检索结果返回。
 */
const reinforceRetrievedMemories = async (memories: AgentMemoryDocument[]) => {
  if (memories.length === 0) {
    return;
  }

  const payload = await getPayloadClient();
  const now = new Date().toISOString();

  await Promise.all(
    memories.map((memory) =>
      payload
        .update({
          collection: "agent-memories",
          data: {
            confidence: reinforceMemoryConfidence(memory.confidence),
            lastUsedAt: now,
          },
          id: memory.id,
          overrideAccess: true,
        })
        .catch(() => undefined),
    ),
  );
};

export type PersistMemoryDeps = {
  syncEmbedding?: (memoryId: number, text: string) => Promise<unknown>;
  upsert?: (memory: AgentMemoryInput) => Promise<AgentMemoryDocument>;
};

/**
 * 统一记忆写入入口：upsert 后同步 embedding，确保学习循环 / 执行归档写入的记忆也具备向量。
 * embedding 同步失败（无 API、网络异常等）不阻塞记忆写入本身。
 * deps 仅用于测试注入；生产环境走默认 upsertMemory + syncMemoryEmbedding。
 */
export const persistMemoryWithEmbedding = async (
  memory: AgentMemoryInput,
  deps: PersistMemoryDeps = {},
): Promise<AgentMemoryDocument> => {
  const upsert = deps.upsert ?? upsertMemory;
  const saved = await upsert(memory);

  try {
    const syncEmbedding = deps.syncEmbedding ?? (await import("./memory-vector")).syncMemoryEmbedding;

    await syncEmbedding(saved.id, `${saved.title}\n${saved.content}`);
  } catch {
    // 向量化是增强能力，失败时静默降级到关键词检索。
  }

  return saved;
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
