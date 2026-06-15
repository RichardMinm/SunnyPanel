import { getPayloadClient } from "@/lib/payload/client";

import { cosineSimilarity, embedText } from "./memory-embeddings";
import { computeMemoryRankScore } from "./memory-ranking";
import type { AgentMemoryDocument } from "./memory-schema";
import { scoreAgentMemoryRelevance } from "./memory-schema";

type MemoryWithEmbedding = AgentMemoryDocument & {
  embedding?: number[] | null;
};

const MIN_VECTOR_SCORE = 0.35;

/**
 * pgvector 评估结论：
 * 当前为单用户工作台，活跃记忆量级通常在数十到数百条，O(n) 线性扫描 + 内存内 cosine
 * 足够，且零额外运维成本。pgvector 的收益（ANN 索引）要到上千条以上才显著。
 * 因此本阶段保留线性扫描，但把候选上限提为可配置（AGENT_VECTOR_MEMORY_CANDIDATES），
 * 为后续平滑切换到 pgvector（仅需替换 find + 排序为 `<=>` 距离查询）预留空间。
 */
const getCandidateLimit = () => {
  const raw = Number(process.env.AGENT_VECTOR_MEMORY_CANDIDATES);

  return Number.isFinite(raw) && raw > 0 ? Math.min(500, Math.floor(raw)) : 40;
};

const parseEmbedding = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const numbers = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));

  return numbers.length === value.length ? numbers : null;
};

export const isVectorMemoryEnabled = () =>
  process.env.AGENT_VECTOR_MEMORY !== "false" && process.env.AGENT_VECTOR_MEMORY !== "0";

export const syncMemoryEmbedding = async (memoryId: number, text: string) => {
  if (!isVectorMemoryEnabled()) {
    return null;
  }

  const embedding = await embedText(text);

  if (!embedding) {
    return null;
  }

  const payload = await getPayloadClient();

  await payload.update({
    collection: "agent-memories",
    data: {
      embedding,
    },
    id: memoryId,
    overrideAccess: true,
  });

  return embedding;
};

export const searchMemoriesByVector = async (query: string, limit = 6, intentHint?: string) => {
  const queryEmbedding = await embedText(query);

  if (!queryEmbedding) {
    return null;
  }

  const payload = await getPayloadClient();
  const memories = await payload.find({
    collection: "agent-memories",
    depth: 0,
    limit: getCandidateLimit(),
    overrideAccess: true,
    pagination: false,
    sort: "-lastUsedAt",
    where: {
      and: [
        { status: { equals: "active" } },
        { visibility: { equals: "private" } },
      ],
    },
  });

  const rankNow = Date.now();
  const ranked = (memories.docs as MemoryWithEmbedding[])
    .map((memory) => {
      const embedding = parseEmbedding(memory.embedding);

      if (!embedding) {
        const baseScore = scoreAgentMemoryRelevance(memory, query, intentHint) * 0.5;

        return {
          memory,
          // 缺向量的记忆只靠关键词，且综合置信度与 recency 衰减后参与排序。
          score: computeMemoryRankScore({
            baseScore,
            confidence: memory.confidence,
            lastUsedAt: memory.lastUsedAt,
            now: rankNow,
          }),
        };
      }

      const vectorScore = cosineSimilarity(queryEmbedding, embedding);
      const keywordScore = scoreAgentMemoryRelevance(memory, query, intentHint) / 100;
      const baseScore = vectorScore * 0.75 + keywordScore * 0.25;

      return {
        memory,
        score: computeMemoryRankScore({
          baseScore,
          confidence: memory.confidence,
          lastUsedAt: memory.lastUsedAt,
          now: rankNow,
        }),
      };
    })
    .filter((item) => item.score > 0.05)
    .sort(
      (left, right) =>
        right.score - left.score || Date.parse(right.memory.updatedAt) - Date.parse(left.memory.updatedAt),
    )
    .slice(0, limit)
    .map((item) => item.memory);

  const strong = ranked.filter((memory) => {
    const embedding = parseEmbedding(memory.embedding);

    if (!embedding) {
      return true;
    }

    const vectorScore = cosineSimilarity(queryEmbedding, embedding);

    return vectorScore >= MIN_VECTOR_SCORE;
  });

  return strong.length > 0 ? strong : null;
};
