import { getAgentModelConfig } from "./client";

export const EMBEDDING_DIMENSION = 256;

const normalizeVector = (values: number[]): number[] => {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return values;
  }

  return values.map((value) => value / magnitude);
};

export const embedText = async (text: string): Promise<number[] | null> => {
  const normalized = text.trim();

  if (!normalized) {
    return null;
  }

  const config = await getAgentModelConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    body: JSON.stringify({
      input: normalized,
      model: process.env.AGENT_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = data.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    return null;
  }

  return normalizeVector(embedding.slice(0, EMBEDDING_DIMENSION));
};

export const cosineSimilarity = (left: number[], right: number[]): number => {
  const length = Math.min(left.length, right.length);

  if (length === 0) {
    return 0;
  }

  let dot = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index]! * right[index]!;
  }

  return dot;
};
