import type { AgentTokenUsage } from "@/lib/agent/schemas";

export const getTokenUsageFromData = (data: unknown): AgentTokenUsage | null => {
  if (!data || typeof data !== "object" || !("tokenUsage" in data)) {
    return null;
  }

  const tokenUsage = data.tokenUsage;

  if (!tokenUsage || typeof tokenUsage !== "object" || !("totalTokens" in tokenUsage)) {
    return null;
  }

  return tokenUsage as AgentTokenUsage;
};

export const parseStreamBlock = (block: string) => {
  const lines = block.split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.replace("event:", "").trim();
  const dataText = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace("data:", "").trim())
    .join("\n");

  if (!event || !dataText) {
    return null;
  }

  try {
    return {
      data: JSON.parse(dataText) as unknown,
      event,
    };
  } catch {
    return null;
  }
};
