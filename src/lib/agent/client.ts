import { buildAgentSystemPrompt, type AgentPromptContext } from "./prompts";
import { extractJSONObject, parseAgentIntentResult, type AgentChatMessage, type AgentIntent } from "./schemas";
import { createTokenUsageSnapshot, estimateTokenCount, mergeProviderTokenUsage } from "./token-usage";
import { getPayloadClient } from "@/lib/payload/client";

const defaultModelBaseUrl = "https://open.bigmodel.cn/api/paas/v4";
const defaultModelName = "glm-5.1";

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
  };
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
  const response = await fetch(`${resolvedConfig.baseUrl}/chat/completions`, {
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
