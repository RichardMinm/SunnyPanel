import { appendFileSync } from "node:fs";

import { getAgentDebugLogPath } from "./debug-log";
import { parseDefinitionQuestionIntent } from "./intent/heuristics/knowledge";
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
import type { CapabilityGateInput } from "./capabilities/types";
import { getDefaultExposableCapabilities } from "./capabilities/tool-gate";
import {
  buildCapabilityFunctionTools,
  intentFromCapabilityCall,
} from "./capabilities/function-tools";
import {
  getCapability,
  isDraftCapabilityName,
  isReadCapabilityName,
  isSideEffectPreviewCapability,
} from "./capabilities/registry";
import { mapLLMRouterToIntent } from "./router/map-llm-router-to-intent";
import { isLLMRouterV2Enabled } from "./router/llm-router-schema";

const defaultModelBaseUrl =
  process.env.DEEPSEEK_BASE_URL?.trim() ||
  process.env.ZAI_BASE_URL ||
  "https://api.openai.com/v1";
const defaultModelName =
  process.env.DEEPSEEK_MODEL?.trim() ||
  process.env.ZAI_MODEL ||
  "gpt-4o";

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

      if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
        lastError = new Error(`HTTP ${response.status}`);
        const retryAfterRaw = response.headers.get("retry-after");
        const retryAfterMs =
          retryAfterRaw && Number.isFinite(Number(retryAfterRaw))
            ? Math.max(Number(retryAfterRaw) * 1000, 1000)
            : Math.min(1500 * 2 ** attempt, 12_000);
        await sleep(retryAfterMs);
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
  const envApiKey =
    process.env.DEEPSEEK_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.ZAI_API_KEY?.trim();

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

  const defaultBaseUrl =
    provider === "openai"
      ? "https://api.openai.com/v1"
      : provider === "deepseek"
        ? "https://api.deepseek.com/v1"
        : defaultModelBaseUrl;
  const defaultModel =
    provider === "openai"
      ? "gpt-4.1-mini"
      : provider === "deepseek"
        ? "deepseek-chat"
        : defaultModelName;

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(
      storedBaseUrl ||
        process.env.DEEPSEEK_BASE_URL?.trim() ||
        process.env.OPENAI_BASE_URL?.trim() ||
        process.env.ZAI_BASE_URL?.trim() ||
        defaultBaseUrl,
    ),
    model:
      storedModel ||
      process.env.DEEPSEEK_MODEL?.trim() ||
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

  if (cfg.provider === "openai-compatible" || cfg.provider === "deepseek") {
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

/** 执行只读/草案 capability 并返回可读观察文本，供 ReAct 循环回灌 LLM。 */
export const executeReadToolObservation = async (call: {
  args: Record<string, unknown>;
  name: string;
}): Promise<string> => {
  if (isReadCapabilityName(call.name) || isDraftCapabilityName(call.name)) {
    const cap = getCapability(call.name);

    if (cap) {
      const result = await cap.execute(call.args, {});

      return result.summary;
    }
  }

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
  capabilityGate?: CapabilityGateInput;
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
  llmRouterOutput?: import("./router/llm-router-schema").LLMRouterOutput;
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
    buildAgentReadTools,
    intentFromFunctionCall,
    isFunctionCallingEnabled,
    isReadToolName,
    parseModelTurn,
  } = await import("./function-tools");
  const { runReactToolLoop } = await import("./react-loop");
  const { parseLLMRouterOutput } = await import("./router/llm-router-schema");
  const useFunctionCalling = await isFunctionCallingEnabled();
  const useReactLoop = useFunctionCalling && (await isReactLoopEnabled());
  const exposableCapabilities = deps.capabilityGate
    ? (await import("./capabilities/tool-gate")).getAllowedCapabilities(deps.capabilityGate).exposableToLLM
    : getDefaultExposableCapabilities();
  const capabilityTools = buildCapabilityFunctionTools(exposableCapabilities);
  const isWriteCapability = (name: string) =>
    isSideEffectPreviewCapability(name) || name.startsWith("execute_");
  const isAllowedCapability = (name: string) =>
    exposableCapabilities.includes(name) || isReadToolName(name);

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
        ? [...buildAgentReadTools(), ...capabilityTools]
        : capabilityTools;
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

  const intentFromCall = (toolCall: { args: Record<string, unknown>; name: string }) => {
    if (isSideEffectPreviewCapability(toolCall.name)) {
      return intentFromCapabilityCall(toolCall.name, toolCall.args);
    }

    const legacy = intentFromFunctionCall(toolCall.name, JSON.stringify(toolCall.args));

    if (legacy) {
      return legacy;
    }

    if (isReadCapabilityName(toolCall.name) || isDraftCapabilityName(toolCall.name)) {
      return null;
    }

    return null;
  };

  const parseFinalContent = (content: string) => {
    const jsonString = extractJSONObject(content);

    if (!jsonString) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonString) as unknown;

      if (isLLMRouterV2Enabled()) {
        const routerOutput = parseLLMRouterOutput(parsed);

        if (routerOutput) {
          const intent = mapLLMRouterToIntent(routerOutput, message);

          return { arbitration: undefined, intent, llmRouterOutput: routerOutput };
        }
      }

      const parsedArbitration = parseAgentArbitrationResult(parsed);
      const intent = parsedArbitration?.intent ?? parseAgentIntentResult(parsed);

      if (!intent) {
        return null;
      }

      return { arbitration: parsedArbitration ?? undefined, intent, llmRouterOutput: parseLLMRouterOutput(parsed) ?? undefined };
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
      isWriteTool: isWriteCapability,
      isAllowedTool: isAllowedCapability,
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
          ...(parsed.llmRouterOutput ? { llmRouterOutput: parsed.llmRouterOutput } : {}),
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
    const writeCall =
      result.turn.toolCalls.find((call) => isWriteCapability(call.name)) ?? result.turn.toolCalls[0];
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
    ...(parsed.llmRouterOutput ? { llmRouterOutput: parsed.llmRouterOutput } : {}),
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
}): Promise<{ httpStatus: number; usage: { promptTokens: number; completionTokens: number } | null }> => {
  const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({ messages, model, stream: true, temperature }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  }, { maxRetries: 3 });

  if (!response.ok || !response.body) {
    // #region agent log
    if (process.env.AGENT_DEBUG_LOG) {
      try {
        appendFileSync(
          getAgentDebugLogPath(),
          `${JSON.stringify({
            sessionId: "961715",
            location: "client.ts:streamChatCompletion",
            message: "stream chat completion unavailable",
            data: {
              httpStatus: response.status,
              hasBody: Boolean(response.body),
            },
            timestamp: Date.now(),
            hypothesisId: "H19",
            runId: "post-fix-8",
          })}\n`,
        );
      } catch {
        // ignore debug log failures
      }
    }
    // #endregion
    return { httpStatus: response.status, usage: null };
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

  return { httpStatus: response.status, usage };
};

const fetchChatCompletionText = async ({
  apiKey,
  baseUrl,
  messages,
  model,
  temperature = 0.6,
}: {
  apiKey: string;
  baseUrl: string;
  messages: Array<{ content: string; role: string }>;
  model: string;
  temperature?: number;
}): Promise<{ httpStatus: number; text: string | null; usage?: OpenAICompatibleResponse["usage"] }> => {
  const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({ messages, model, stream: false, temperature }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  }, { maxRetries: 3 });

  if (!response.ok) {
    // #region agent log
    if (process.env.AGENT_DEBUG_LOG) {
      try {
        appendFileSync(
          getAgentDebugLogPath(),
          `${JSON.stringify({
            sessionId: "961715",
            location: "client.ts:fetchChatCompletionText",
            message: "non-stream chat completion failed",
            data: { httpStatus: response.status },
            timestamp: Date.now(),
            hypothesisId: "H19",
            runId: "post-fix-8",
          })}\n`,
        );
      } catch {
        // ignore debug log failures
      }
    }
    // #endregion
    return { httpStatus: response.status, text: null };
  }

  const data = (await response.json()) as OpenAICompatibleResponse;
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";

  if (!text) {
    return { httpStatus: response.status, text: null, usage: data.usage };
  }

  return { httpStatus: response.status, text, usage: data.usage };
};

export const buildAnswerModelUnavailableMessage = (
  openTopic: string | null,
  failureHttpStatus?: number | null,
) => {
  if (failureHttpStatus === 429) {
    return openTopic
      ? `关于「${openTopic}」：回答模型当前请求过于频繁（429），请稍等片刻后再试。`
      : "回答模型当前请求过于频繁（429），请稍等片刻后再试。";
  }

  if (failureHttpStatus === 401 || failureHttpStatus === 403) {
    return openTopic
      ? `关于「${openTopic}」：回答模型鉴权失败（${failureHttpStatus}），请检查 Agent 设置中的 API Key。`
      : `回答模型鉴权失败（${failureHttpStatus}），请检查 Agent 设置中的 API Key。`;
  }

  return openTopic
    ? `关于「${openTopic}」：我暂时无法连接回答模型，请检查 Agent 设置中的 API Key 与模型配置后重试。`
    : "我暂时无法生成回答，请检查 Agent 设置中的 API Key 与模型配置后重试。";
};

const REPLY_SYSTEM_PROMPT =
  "你是 SunnyPanel 的 AI Agent，一个个人长期工作台的智能助手。请用自然、友好的中文直接回答用户的问题。不要输出 JSON 格式，直接输出对话回复。回答要简洁、有帮助。";

const OPEN_DOMAIN_REPLY_PROMPT =
  "你是 SunnyPanel 的 AI Agent。用户是在问一个开放域百科/常识类问题。请直接用中文给出准确、简洁的事实性介绍，不要套用学习路径、学科框架、计划草稿或「这门学科」之类模板，也不要反问用户是否要制定计划。";

const buildReplySystemPrompt = (groundedAnswer?: string, message?: string) => {
  const definitionIntent = message ? parseDefinitionQuestionIntent(message) : null;
  const openDomainTopic =
    definitionIntent?.intent === "answer_question"
      ? definitionIntent.args.openDomainTopic
      : null;

  if (openDomainTopic) {
    return OPEN_DOMAIN_REPLY_PROMPT;
  }

  return groundedAnswer && groundedAnswer.trim().length > 0
    ? `${REPLY_SYSTEM_PROMPT}\n\n当前工作流已经基于 SunnyPanel 工作台上下文生成了一份答案。你可以润色和组织语言，但必须保留其中的事实、对象名称、行动建议和约束，不要改写成泛泛建议：\n${groundedAnswer}`
    : REPLY_SYSTEM_PROMPT;
};

export type GenerateStreamingReplyArgs = {
  context?: AgentPromptContext;
  groundedAnswer?: string;
  history: AgentChatMessage[];
  message: string;
  onToken: StreamTokenCallback;
  signal?: AbortSignal;
};

export type GenerateStreamingReplyResult = {
  failureHttpStatus?: number;
  tokenUsage: ReturnType<typeof createTokenUsageSnapshot>;
  text: string;
};

/** Generate a conversational reply with true LLM token streaming. Returns token usage + full text, or null if unavailable. */
export const generateStreamingReply = async ({
  groundedAnswer,
  history,
  message,
  onToken,
  signal,
}: GenerateStreamingReplyArgs): Promise<GenerateStreamingReplyResult | null> => {
  const config = await getAgentModelConfig();
  if (!config) return null;

  const messages = [
    { content: buildReplySystemPrompt(groundedAnswer, message), role: "system" as const },
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
    const streamResult = await streamChatCompletion({
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
    const providerUsage = streamResult.usage;

    if (streamedText.trim().length > 0) {
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

      // #region agent log
      if (process.env.AGENT_DEBUG_LOG) {
        try {
          appendFileSync(
            getAgentDebugLogPath(),
            `${JSON.stringify({
              sessionId: "961715",
              location: "client.ts:generateStreamingReply",
              message: "streaming reply succeeded",
              data: {
                streamedTextLen: streamedText.length,
                usedNonStreamFallback: false,
              },
              timestamp: Date.now(),
              hypothesisId: "H20",
              runId: "post-fix-8",
            })}\n`,
          );
        } catch {
          // ignore debug log failures
        }
      }
      // #endregion

      return { tokenUsage, text: streamedText };
    }

    if (streamResult.httpStatus === 429) {
      // #region agent log
      if (process.env.AGENT_DEBUG_LOG) {
        try {
          appendFileSync(
            getAgentDebugLogPath(),
            `${JSON.stringify({
              sessionId: "961715",
              location: "client.ts:generateStreamingReply",
              message: "stream rate limited, skipping duplicate non-stream call",
              data: { httpStatus: 429 },
              timestamp: Date.now(),
              hypothesisId: "H19",
              runId: "post-fix-8",
            })}\n`,
          );
        } catch {
          // ignore debug log failures
        }
      }
      // #endregion
      return { failureHttpStatus: 429, text: "", tokenUsage: estimatedUsage };
    }

    const nonStream = await fetchChatCompletionText({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      messages,
      model: config.model,
      temperature: 0.6,
    });

    if (nonStream.text) {
      onToken(nonStream.text);
      const tokenUsage = mergeProviderTokenUsage(
        {
          ...estimatedUsage,
          outputTokens: estimateTokenCount(nonStream.text),
          totalTokens:
            estimatedUsage.contextTokens +
            estimatedUsage.inputTokens +
            estimateTokenCount(nonStream.text),
        },
        nonStream.usage,
      );

      // #region agent log
      if (process.env.AGENT_DEBUG_LOG) {
        try {
          appendFileSync(
            getAgentDebugLogPath(),
            `${JSON.stringify({
              sessionId: "961715",
              location: "client.ts:generateStreamingReply",
              message: "streaming empty, non-stream fallback succeeded",
              data: {
                streamedTextLen: streamedText.length,
                nonStreamTextLen: nonStream.text.length,
                httpStatus: nonStream.httpStatus,
                usedNonStreamFallback: true,
              },
              timestamp: Date.now(),
              hypothesisId: "H20",
              runId: "post-fix-8",
            })}\n`,
          );
        } catch {
          // ignore debug log failures
        }
      }
      // #endregion

      return { tokenUsage, text: nonStream.text };
    }

    const failureHttpStatus = nonStream.httpStatus !== 200 ? nonStream.httpStatus : streamResult.httpStatus;

    // #region agent log
    if (process.env.AGENT_DEBUG_LOG) {
      try {
        appendFileSync(
          getAgentDebugLogPath(),
          `${JSON.stringify({
            sessionId: "961715",
            location: "client.ts:generateStreamingReply",
            message: "streaming and non-stream both empty",
            data: {
              streamedTextLen: streamedText.length,
              failureHttpStatus,
              usedNonStreamFallback: true,
            },
            timestamp: Date.now(),
            hypothesisId: "H19-H20",
            runId: "post-fix-8",
          })}\n`,
        );
      } catch {
        // ignore debug log failures
      }
    }
    // #endregion

    return { failureHttpStatus, text: "", tokenUsage: estimatedUsage };
  } catch (error) {
    // #region agent log
    if (process.env.AGENT_DEBUG_LOG) {
      try {
        appendFileSync(
          getAgentDebugLogPath(),
          `${JSON.stringify({
            sessionId: "961715",
            location: "client.ts:generateStreamingReply",
            message: "streaming reply threw",
            data: {
              error: error instanceof Error ? error.message : String(error),
            },
            timestamp: Date.now(),
            hypothesisId: "H19",
            runId: "post-fix-7",
          })}\n`,
        );
      } catch {
        // ignore debug log failures
      }
    }
    // #endregion
    return null;
  }
};
