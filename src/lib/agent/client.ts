import { buildAgentSystemPrompt, type AgentPromptContext } from "./prompts";
import { parseAgentArbitrationResult, type AgentArbitrationDecision } from "./intent/arbitration";
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

export type StreamTokenCallback = (token: string, block?: 'thinking' | 'response') => void;

export const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  { maxRetries = 2, timeoutMs = 60_000 }: { maxRetries?: number; timeoutMs?: number } = {},
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

export const getAgentModelConfig = async () => {
  // Check env vars first — allows LLM use without Payload DB access (e.g. tests)
  const envApiKey = process.env.OPENAI_API_KEY?.trim() || process.env.ZAI_API_KEY?.trim();

  let storedApiKey = "";
  let storedBaseUrl = "";
  let storedModel = "";
  let provider: string | null | undefined = null;

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
    // Payload not available (e.g. test environment) — use env vars only
  }

  const apiKey = storedApiKey || envApiKey;

  if (!apiKey) {
    return null;
  }

  const defaultBaseUrl = provider === "openai" ? "https://api.openai.com/v1" : defaultModelBaseUrl;
  const defaultModel = provider === "openai" ? "gpt-4.1-mini" : defaultModelName;

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(
      storedBaseUrl ||
        process.env.OPENAI_BASE_URL?.trim() ||
        process.env.ZAI_BASE_URL?.trim() ||
        defaultBaseUrl,
    ),
    model:
      storedModel ||
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
      content?: null | string;
      tool_calls?: Array<{
        function?: {
          arguments?: string;
          name?: string;
        };
        id?: string;
        type?: string;
      }>;
    };
  }>;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

/** ReAct 多轮循环是否启用：默认跟随 function calling，可用 AGENT_REACT_LOOP 显式开关。 */
export const isReactLoopEnabled = async (): Promise<boolean> => {
  if (process.env.AGENT_REACT_LOOP === "false" || process.env.AGENT_REACT_LOOP === "0") {
    return false;
  }

  if (process.env.AGENT_REACT_LOOP === "true" || process.env.AGENT_REACT_LOOP === "1") {
    return true;
  }

  const { isFunctionCallingEnabled } = await import("./function-tools");

  return isFunctionCallingEnabled();
};

/** 执行只读工具并返回可读观察文本，供 ReAct 循环回灌 LLM。 */
export const executeReadToolObservation = async (call: {
  args: Record<string, unknown>;
  name: string;
}): Promise<string> => {
  const { executeAgentIntent } = await import("./executor");
  const intent = parseAgentIntentResult({
    args: call.args,
    confidence: 0.9,
    intent: call.name,
  });

  if (!intent) {
    return `工具 ${call.name} 参数无法解析，已跳过。`;
  }

  const result = await executeAgentIntent(intent);

  return result.assistantMessage || `工具 ${call.name} 没有返回可用观察。`;
};

export type GenerateIntentDeps = {
  callModelTurn?: (messages: Array<{ content: string; role: string }>) => Promise<null | {
    turn: import("./react-loop").ReactModelTurn | null;
    usage?: OpenAICompatibleResponse["usage"];
  }>;
  executeReadTool?: (call: { args: Record<string, unknown>; name: string }) => Promise<string>;
};

export const generateIntentWithAgentModel = async ({
  context,
  deps = {},
  history,
  message,
}: {
  context: AgentPromptContext;
  deps?: GenerateIntentDeps;
  history: AgentChatMessage[];
  message: string;
}): Promise<null | {
  arbitration?: AgentArbitrationDecision;
  intent: AgentIntent;
  reactSteps?: import("./react-loop").ReactStepTrace[];
  tokenUsage: ReturnType<typeof createTokenUsageSnapshot>;
}> => {
  const resolvedConfig = await getAgentModelConfig();

  if (!resolvedConfig) {
    return null;
  }

  const baseMessages = [
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
    contextTokens: estimateTokenCount(baseMessages.slice(0, -1)),
    inputTokens: estimateTokenCount(message),
  });
  const {
    buildAgentFunctionTools,
    buildAgentReadTools,
    intentFromFunctionCall,
    isFunctionCallingEnabled,
    isWriteToolName,
    parseModelTurn,
  } = await import("./function-tools");
  const { runReactToolLoop } = await import("./react-loop");
  const useFunctionCalling = await isFunctionCallingEnabled();
  const useReactLoop = useFunctionCalling && (await isReactLoopEnabled());

  let accumulatedOutputTokens = 0;
  let providerUsage: OpenAICompatibleResponse["usage"] | undefined;

  const defaultCallModelTurn = async (messages: Array<{ content: string; role: string }>) => {
    const requestBody: Record<string, unknown> = {
      messages,
      model: resolvedConfig.model,
      temperature: 0.1,
    };

    if (useFunctionCalling) {
      requestBody.tools = useReactLoop
        ? [...buildAgentReadTools(), ...buildAgentFunctionTools()]
        : buildAgentFunctionTools();
      requestBody.tool_choice = "auto";
    }

    const response = await fetchWithRetry(`${resolvedConfig.baseUrl}/chat/completions`, {
      body: JSON.stringify(requestBody),
      headers: {
        Authorization: `Bearer ${resolvedConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OpenAICompatibleResponse;
    const assistantMessage = data.choices?.[0]?.message;

    if (!assistantMessage) {
      return null;
    }

    return { turn: parseModelTurn(assistantMessage), usage: data.usage };
  };

  const callModelTurn = deps.callModelTurn ?? defaultCallModelTurn;
  const executeReadTool = deps.executeReadTool ?? executeReadToolObservation;

  const finalizeUsage = (outputText: string) => {
    const outputTokens = accumulatedOutputTokens + estimateTokenCount(outputText);

    return mergeProviderTokenUsage(
      {
        ...estimatedUsage,
        outputTokens,
        totalTokens: estimatedUsage.contextTokens + estimatedUsage.inputTokens + outputTokens,
      },
      providerUsage,
    );
  };

  const intentFromCall = (toolCall: { args: Record<string, unknown>; name: string }) =>
    intentFromFunctionCall(toolCall.name, JSON.stringify(toolCall.args));

  const parseFinalContent = (content: string) => {
    const jsonString = extractJSONObject(content);

    if (!jsonString) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonString) as unknown;
      const arbitration = parseAgentArbitrationResult(parsed);
      const intent = arbitration?.intent ?? parseAgentIntentResult(parsed);

      if (!intent) {
        return null;
      }

      return { arbitration: arbitration ?? undefined, intent };
    } catch {
      return null;
    }
  };

  const callModel = async (messages: Array<{ content: string; name?: string; role: string; toolCallId?: string }>) => {
    const result = await callModelTurn(
      messages.map((item) => ({ content: item.content, role: item.role })),
    );

    if (!result) {
      return null;
    }

    if (result.usage) {
      providerUsage = result.usage;
    }

    if (result.turn?.type === "final") {
      accumulatedOutputTokens += estimateTokenCount(result.turn.content);
    }

    return result.turn;
  };

  if (useReactLoop) {
    const loopResult = await runReactToolLoop({
      callModel,
      executeReadTool,
      initialMessages: baseMessages.map((item) => ({
        content: item.content,
        role: item.role as "assistant" | "system" | "tool" | "user",
      })),
      isWriteTool: isWriteToolName,
      maxSteps: 5,
    });

    if (loopResult.kind === "write_proposal") {
      const intent = intentFromCall(loopResult.toolCall);

      if (intent) {
        return { intent, reactSteps: loopResult.steps, tokenUsage: finalizeUsage(JSON.stringify(intent)) };
      }
    }

    if (loopResult.kind === "final_answer") {
      const parsed = parseFinalContent(loopResult.content);

      if (parsed) {
        return {
          intent: parsed.intent,
          ...(parsed.arbitration ? { arbitration: parsed.arbitration } : {}),
          reactSteps: loopResult.steps,
          tokenUsage: finalizeUsage(loopResult.content),
        };
      }
    }

    return null;
  }

  // 非循环路径：单轮 function calling / content JSON。
  const result = await callModelTurn(baseMessages);

  if (!result?.turn) {
    return null;
  }

  if (result.usage) {
    providerUsage = result.usage;
  }

  if (result.turn.type === "tool_calls") {
    const writeCall = result.turn.toolCalls.find((call) => isWriteToolName(call.name)) ?? result.turn.toolCalls[0];
    const intent = writeCall ? intentFromCall(writeCall) : null;

    if (intent) {
      return { intent, tokenUsage: finalizeUsage(JSON.stringify(intent)) };
    }

    return null;
  }

  const parsed = parseFinalContent(result.turn.content);

  if (!parsed) {
    return null;
  }

  return {
    intent: parsed.intent,
    ...(parsed.arbitration ? { arbitration: parsed.arbitration } : {}),
    tokenUsage: finalizeUsage(result.turn.content),
  };
};

/** OpenAI-compatible streaming chat completion. Reads SSE chunks and calls `onToken` for each delta. */
export const streamChatCompletion = async ({
  apiKey,
  baseUrl,
  messages,
  model,
  onToken,
  signal,
  temperature = 0.6,
}: {
  apiKey: string;
  baseUrl: string;
  messages: Array<{ content: string; role: string }>;
  model: string;
  onToken: StreamTokenCallback;
  signal?: AbortSignal;
  temperature?: number;
}): Promise<{ promptTokens: number; completionTokens: number } | null> => {
  const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({ messages, model, stream: true, temperature }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok || !response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: { promptTokens: number; completionTokens: number } | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const dataText = trimmed.slice(6);
        if (dataText === "[DONE]") continue;

        try {
          const chunk = JSON.parse(dataText) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: null | string }>;
            usage?: { prompt_tokens: number; completion_tokens: number };
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            onToken(delta);
          }
          if (chunk.usage) {
            usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return usage;
};

const REPLY_SYSTEM_PROMPT =
  "你是 SunnyPanel 的 AI Agent，一个个人长期工作台的智能助手。请用自然、友好的中文直接回答用户的问题。不要输出 JSON 格式，直接输出对话回复。回答要简洁、有帮助。";

const buildReplySystemPrompt = (groundedAnswer?: string) =>
  groundedAnswer && groundedAnswer.trim().length > 0
    ? `${REPLY_SYSTEM_PROMPT}\n\n当前工作流已经基于 SunnyPanel 工作台上下文生成了一份答案。你可以润色和组织语言，但必须保留其中的事实、对象名称、行动建议和约束，不要改写成泛泛建议：\n${groundedAnswer}`
    : REPLY_SYSTEM_PROMPT;

export type GenerateStreamingReplyArgs = {
  context?: AgentPromptContext;
  groundedAnswer?: string;
  history: AgentChatMessage[];
  message: string;
  onToken: StreamTokenCallback;
  signal?: AbortSignal;
};

/** Generate a conversational reply with true LLM token streaming. Returns token usage + full text, or null if unavailable. */
export const generateStreamingReply = async ({
  groundedAnswer,
  history,
  message,
  onToken,
  signal,
}: GenerateStreamingReplyArgs): Promise<{ tokenUsage: ReturnType<typeof createTokenUsageSnapshot>; text: string } | null> => {
  const config = await getAgentModelConfig();
  if (!config) return null;

  const messages = [
    { content: buildReplySystemPrompt(groundedAnswer), role: "system" as const },
    ...history.slice(-8).map((item) => ({
      content: item.content,
      role: item.role,
    })),
    { content: message, role: "user" as const },
  ];

  const estimatedUsage = createTokenUsageSnapshot({
    contextTokens: estimateTokenCount(messages.slice(0, -1).map((m) => m.content).join("\n")),
    inputTokens: estimateTokenCount(message),
  });

  let streamedText = "";

  try {
    const providerUsage = await streamChatCompletion({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      messages,
      model: config.model,
      onToken: (token) => {
        streamedText += token;
        onToken(token);
      },
      signal,
      temperature: 0.6,
    });

    const tokenUsage = providerUsage
      ? mergeProviderTokenUsage(
          {
            ...estimatedUsage,
            outputTokens: providerUsage.completionTokens,
            totalTokens:
              estimatedUsage.contextTokens + estimatedUsage.inputTokens + providerUsage.completionTokens,
          },
          {
            completion_tokens: providerUsage.completionTokens,
            prompt_tokens: providerUsage.promptTokens,
            total_tokens: providerUsage.promptTokens + providerUsage.completionTokens,
          },
        )
      : estimatedUsage;

    return { tokenUsage, text: streamedText || "" };
  } catch {
    return null;
  }
};
