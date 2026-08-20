import { getPayloadClient } from "@/lib/payload/client";
import type { ModelApiProtocol } from "./llm/model-config";

const defaultModelBaseUrl =
  process.env.DEEPSEEK_BASE_URL?.trim()
  || process.env.ZAI_BASE_URL
  || "https://api.openai.com/v1";
const defaultModelName =
  process.env.DEEPSEEK_MODEL?.trim()
  || process.env.ZAI_MODEL
  || "gpt-4o";

export type StreamTokenCallback = (
  token: string,
  block?: "thinking" | "response",
) => void;

type AgentSettingsDocument = {
  apiKey?: null | string;
  baseUrl?: null | string;
  enabled?: null | boolean;
  model?: null | string;
  provider?: null | "deepseek" | "openai" | "openai-compatible" | "zai";
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const resolveConfiguredApiProtocol = (): ModelApiProtocol | undefined => {
  const value = process.env.DEEPSEEK_API_PROTOCOL?.trim().toLowerCase();
  return value === "responses" || value === "chat_completions"
    ? value
    : undefined;
};

/** Resolve the shared provider configuration used by active LangChain seams. */
export const getAgentModelConfig = async () => {
  const envApiKey =
    process.env.DEEPSEEK_API_KEY?.trim()
    || process.env.OPENAI_API_KEY?.trim()
    || process.env.ZAI_API_KEY?.trim();

  let storedApiKey = "";
  let storedBaseUrl = "";
  let storedModel = "";
  let provider: AgentSettingsDocument["provider"] = null;

  try {
    const payload = await getPayloadClient();
    const settings = (await payload.findGlobal({
      depth: 0,
      overrideAccess: true,
      slug: "agent-settings",
    }).catch(() => null)) as AgentSettingsDocument | null;
    const useStoredSettings = settings?.enabled !== false;
    provider = useStoredSettings ? settings?.provider : null;
    storedApiKey = useStoredSettings ? settings?.apiKey?.trim() || "" : "";
    storedBaseUrl = useStoredSettings ? settings?.baseUrl?.trim() || "" : "";
    storedModel = useStoredSettings ? settings?.model?.trim() || "" : "";
  } catch {
    // Payload is optional for deterministic tests and environment-only setups.
  }

  const apiKey = storedApiKey || envApiKey;
  if (!apiKey) return null;

  const defaultBaseUrl =
    provider === "openai"
      ? "https://api.openai.com/v1"
      : provider === "deepseek"
        ? "https://api.deepseek.com"
        : defaultModelBaseUrl;
  const defaultModel =
    provider === "openai"
      ? "gpt-4.1-mini"
      : provider === "deepseek"
        ? "deepseek-v4-flash"
        : defaultModelName;

  return {
    apiKey,
    apiProtocol: resolveConfiguredApiProtocol(),
    baseUrl: normalizeBaseUrl(
      storedBaseUrl
        || process.env.DEEPSEEK_BASE_URL?.trim()
        || process.env.OPENAI_BASE_URL?.trim()
        || process.env.ZAI_BASE_URL?.trim()
        || defaultBaseUrl,
    ),
    model:
      storedModel
      || process.env.DEEPSEEK_MODEL?.trim()
      || process.env.OPENAI_MODEL?.trim()
      || process.env.ZAI_MODEL?.trim()
      || defaultModel,
    provider: provider ?? null,
  };
};
