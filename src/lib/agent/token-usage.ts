import type { AgentChatMessage, AgentTokenUsage } from "./schemas";

export const estimateTokenCount = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const symbols = text.replace(/[\u3400-\u9fffA-Za-z0-9_\s]/g, "").length;

  return Math.max(0, Math.ceil(cjkChars + words * 1.25 + symbols * 0.5));
};

export const estimateMessagesTokenCount = (messages: AgentChatMessage[]) =>
  messages.reduce((total, message) => total + estimateTokenCount(`${message.role}: ${message.content}`), 0);

export const createTokenUsageSnapshot = ({
  contextTokens = 0,
  inputTokens = 0,
  outputTokens = 0,
  source = "estimate",
}: Partial<AgentTokenUsage> = {}): AgentTokenUsage => ({
  contextTokens,
  inputTokens,
  outputTokens,
  source,
  totalTokens: contextTokens + inputTokens + outputTokens,
});

export const mergeProviderTokenUsage = (
  usage: AgentTokenUsage,
  providerUsage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  },
) => {
  if (!providerUsage) {
    return usage;
  }

  const providerInputTokens = providerUsage.prompt_tokens;
  const providerOutputTokens = providerUsage.completion_tokens;
  const providerTotalTokens = providerUsage.total_tokens;

  return {
    ...usage,
    contextTokens:
      typeof providerInputTokens === "number"
        ? Math.max(0, providerInputTokens - usage.inputTokens)
        : usage.contextTokens,
    outputTokens: typeof providerOutputTokens === "number" ? providerOutputTokens : usage.outputTokens,
    providerInputTokens,
    providerOutputTokens,
    providerTotalTokens,
    source: "provider" as const,
    totalTokens:
      typeof providerTotalTokens === "number"
        ? providerTotalTokens
        : (providerInputTokens ?? usage.contextTokens + usage.inputTokens) + (providerOutputTokens ?? usage.outputTokens),
  };
};
