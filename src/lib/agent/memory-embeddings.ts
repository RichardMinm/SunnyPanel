export const EMBEDDING_DIMENSION = 256;

const DEFAULT_EMBEDDING_TIMEOUT_MS = 10_000;

export type AgentEmbeddingConfig = Readonly<{
  apiKey: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
}>;

type EmbeddingEnvironment = Readonly<Record<string, string | undefined>>;

export type EmbedTextDependencies = Readonly<{
  fetchFn?: typeof fetch;
  resolveConfig?: () => AgentEmbeddingConfig | null | Promise<AgentEmbeddingConfig | null>;
}>;

const normalizeVector = (values: number[]): number[] => {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

  if (!Number.isFinite(magnitude) || magnitude === 0) return values;
  return values.map((value) => value / magnitude);
};

const parseTimeout = (raw: string | undefined): number => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 60_000
    ? parsed
    : DEFAULT_EMBEDDING_TIMEOUT_MS;
};

/**
 * Embeddings are an independent, explicitly enabled capability. They never
 * inherit the chat model endpoint, key, or model because many chat Providers
 * do not expose embeddings.
 */
export const resolveAgentEmbeddingConfig = (
  environment: EmbeddingEnvironment = process.env,
): AgentEmbeddingConfig | null => {
  const enabled = environment.AGENT_EMBEDDING_ENABLED?.trim().toLowerCase();
  if (enabled !== "1" && enabled !== "true") return null;

  const apiKey = environment.AGENT_EMBEDDING_API_KEY?.trim();
  const baseURL = environment.AGENT_EMBEDDING_BASE_URL?.trim().replace(/\/+$/, "");
  const model = environment.AGENT_EMBEDDING_MODEL?.trim();
  if (!apiKey || !baseURL || !model) return null;

  try {
    const url = new URL(baseURL);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }

  return Object.freeze({
    apiKey,
    baseURL,
    model,
    timeoutMs: parseTimeout(environment.AGENT_EMBEDDING_TIMEOUT_MS),
  });
};

export const embedText = async (
  text: string,
  dependencies: EmbedTextDependencies = {},
): Promise<number[] | null> => {
  const normalized = text.trim();
  if (!normalized) return null;

  const config = await (dependencies.resolveConfig ?? resolveAgentEmbeddingConfig)();
  if (!config) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await (dependencies.fetchFn ?? fetch)(`${config.baseURL}/embeddings`, {
      body: JSON.stringify({ input: normalized, model: config.model }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = data.data?.[0]?.embedding;
    if (
      !Array.isArray(embedding)
      || embedding.length === 0
      || embedding.some((value) => !Number.isFinite(value))
    ) return null;

    return normalizeVector(embedding.slice(0, EMBEDDING_DIMENSION));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const cosineSimilarity = (left: number[], right: number[]): number => {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;

  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index]! * right[index]!;
  }
  return dot;
};
