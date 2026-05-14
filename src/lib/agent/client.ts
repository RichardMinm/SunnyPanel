import { buildAgentSystemPrompt, type AgentPromptContext } from "./prompts";
import {
  extractJSONObject,
  parseAgentIntentResult,
  type AgentChatMessage,
  type AgentEngine,
  type AgentIntent,
} from "./schemas";
import { createTokenUsageSnapshot, estimateTokenCount, mergeProviderTokenUsage } from "./token-usage";
import { getPayloadClient } from "@/lib/payload/client";

const defaultModelBaseUrl = "https://open.bigmodel.cn/api/paas/v4";
const defaultModelName = "glm-5.1";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  { maxRetries = 2, timeoutMs = 15_000 }: { maxRetries?: number; timeoutMs?: number } = {},
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });

      clearTimeout(timer);

      if (response.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`Server error ${response.status}`);
        await sleep(Math.min(1000 * 2 ** attempt, 4000));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;

      if (attempt < maxRetries) {
        await sleep(Math.min(1000 * 2 ** attempt, 4000));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

type AgentSettingsDocument = {
  apiKey?: null | string;
  baseUrl?: null | string;
  enabled?: null | boolean;
  model?: null | string;
  provider?: null | "openai" | "openai-compatible" | "zai";
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const getAgentModelConfig = async () => {
  const payload = await getPayloadClient();
  const settings = (await payload.findGlobal({
    depth: 0,
    overrideAccess: true,
    slug: "agent-settings",
  }).catch(() => null)) as AgentSettingsDocument | null;
  const useStoredSettings = settings?.enabled !== false;
  const provider = useStoredSettings ? settings?.provider : null;
  const storedApiKey = useStoredSettings ? settings?.apiKey?.trim() : "";
  const envApiKey = process.env.OPENAI_API_KEY?.trim() || process.env.ZAI_API_KEY?.trim();
  const apiKey = storedApiKey || envApiKey;

  if (!apiKey) {
    return null;
  }

  const defaultBaseUrl = provider === "openai" ? "https://api.openai.com/v1" : defaultModelBaseUrl;
  const defaultModel = provider === "openai" ? "gpt-4.1-mini" : defaultModelName;

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(
      (useStoredSettings ? settings?.baseUrl?.trim() : "") ||
        process.env.OPENAI_BASE_URL?.trim() ||
        process.env.ZAI_BASE_URL?.trim() ||
        defaultBaseUrl,
    ),
    model:
      (useStoredSettings ? settings?.model?.trim() : "") ||
      process.env.OPENAI_MODEL?.trim() ||
      process.env.ZAI_MODEL?.trim() ||
      defaultModel,
    provider: provider ?? null,
  };
};

/** 与 AgentSettings.provider 对齐，用于 resolveAgentIntent 的 engine 标记。 */
export const getAgentIntentModelEngine = async (): Promise<AgentEngine> => {
  const cfg = await getAgentModelConfig();

  if (!cfg) {
    return "heuristic";
  }

  if (cfg.provider === "openai") {
    return "openai";
  }

  if (cfg.provider === "openai-compatible") {
    return "openai-compatible";
  }

  if (cfg.provider === "zai") {
    return "zai";
  }

  return "glm";
};

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

export const isAgentModelConfigured = async () => Boolean(await getAgentModelConfig());

export const generateIntentWithAgentModel = async ({
  context,
  history,
  message,
}: {
  context: AgentPromptContext;
  history: AgentChatMessage[];
  message: string;
}): Promise<null | {
  intent: AgentIntent;
  tokenUsage: ReturnType<typeof createTokenUsageSnapshot>;
}> => {
  const config = getAgentModelConfig();
  const resolvedConfig = await config;

  if (!resolvedConfig) {
    return null;
  }

  const messages = [
    {
      content: buildAgentSystemPrompt(context),
      role: "system",
    },
    ...history.map((item) => ({
      content: item.content,
      role: item.role,
    })),
    {
      content: message,
      role: "user",
    },
  ];
  const estimatedUsage = createTokenUsageSnapshot({
    contextTokens: estimateTokenCount(messages.slice(0, -1)),
    inputTokens: estimateTokenCount(message),
  });
  const response = await fetchWithRetry(`${resolvedConfig.baseUrl}/chat/completions`, {
    body: JSON.stringify({
      messages,
      model: resolvedConfig.model,
      temperature: 0.1,
    }),
    headers: {
      Authorization: `Bearer ${resolvedConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Agent model request failed with status ${response.status}`);
  }

  const data = (await response.json()) as OpenAICompatibleResponse;
  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    return null;
  }

  const jsonString = extractJSONObject(content);

  if (!jsonString) {
    return null;
  }

  try {
    const intent = parseAgentIntentResult(JSON.parse(jsonString));

    if (!intent) {
      return null;
    }

    return {
      intent,
      tokenUsage: mergeProviderTokenUsage(
        {
          ...estimatedUsage,
          outputTokens: estimateTokenCount(content),
          totalTokens: estimatedUsage.contextTokens + estimatedUsage.inputTokens + estimateTokenCount(content),
        },
        data.usage,
      ),
    };
  } catch {
    return null;
  }
};
