import { getPayloadClient } from "@/lib/payload/client";

import { cosineSimilarity, embedText } from "./memory-embeddings";
import type { AgentMemoryDocument } from "./memory-schema";
import { scoreAgentMemoryRelevance } from "./memory-schema";

type MemoryWithEmbedding = AgentMemoryDocument & {
  embedding?: number[] | null;
};

const MIN_VECTOR_SCORE = 0.35;

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
    limit: 40,
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

  const ranked = (memories.docs as MemoryWithEmbedding[])
    .map((memory) => {
      const embedding = parseEmbedding(memory.embedding);

      if (!embedding) {
        return {
          memory,
          score: scoreAgentMemoryRelevance(memory, query, intentHint) * 0.5,
        };
      }

      const vectorScore = cosineSimilarity(queryEmbedding, embedding);
      const keywordScore = scoreAgentMemoryRelevance(memory, query, intentHint) / 100;

      return {
        memory,
        score: vectorScore * 0.75 + keywordScore * 0.25,
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
