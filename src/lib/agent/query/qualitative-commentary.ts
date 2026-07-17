import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIMessageChunk } from "@langchain/core/messages";
import { getAgentModelConfig, type StreamTokenCallback } from "../client";
import { createChatModel, type ModelFactory } from "../llm/model-factory";
import { createModelConfig, type ModelConfig } from "../llm/model-config";
import { classifyQueryChunk } from "./chunks";
import { buildQueryMessages } from "./prompt";
import {
  auditQualitativeProviderInput,
  projectQualitativeQueryFacts,
  validateQualitativeCommentary,
  type CommentaryOmissionReason,
} from "./qualitative-projection";
import { resolveQueryTimeouts } from "./runtime-config";
import type { QueryFacts } from "./types";
import type { ModelCallBudgetRecorder } from "../orchestration/model-call-budget";

export type QualitativeCommentaryResult =
  | { latencyMs: number; modelCalls: 1; status: "accepted"; text: string; ttftMs: number }
  | { latencyMs: number; modelCalls: 0 | 1; reason: CommentaryOmissionReason; status: "omitted"; ttftMs: null | number };

export type RunQualitativeQueryCommentaryInput = {
  buildMessages?: typeof buildQueryMessages;
  callScopeId?: string;
  emitToken?: StreamTokenCallback;
  facts: QueryFacts;
  model?: BaseChatModel;
  modelFactory?: ModelFactory;
  modelConfig?: ModelConfig;
  modelCallRecorder?: ModelCallBudgetRecorder;
  now?: () => number;
  timeouts?: { firstTokenMs: number; totalMs: number };
};

const timeout = <T>(promise: Promise<T>, ms: number, reason: CommentaryOmissionReason, controller: AbortController) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error(reason), { commentaryReason: reason }));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });

const resolveModel = async (input: RunQualitativeQueryCommentaryInput): Promise<BaseChatModel | null> => {
  if (input.model) return input.model;
  let config = input.modelConfig;
  if (!config) {
    const current = await getAgentModelConfig();
    if (!current) return null;
    const created = createModelConfig({
      apiKey: current.apiKey,
      baseURL: current.baseUrl,
      maxRetries: 0,
      model: current.model,
      provider: current.provider ?? "openai-compatible",
    });
    if (!("apiKey" in created)) return null;
    config = created;
  }
  return (input.modelFactory ?? createChatModel)(config);
};

export const runQualitativeQueryCommentary = async (
  input: RunQualitativeQueryCommentaryInput,
): Promise<QualitativeCommentaryResult> => {
  const projection = projectQualitativeQueryFacts(input.facts);
  const messages = (input.buildMessages ?? buildQueryMessages)({ projection });
  const audit = auditQualitativeProviderInput(messages, projection);
  if (!audit.ok) return { latencyMs: 0, modelCalls: 0, reason: audit.reason, status: "omitted", ttftMs: null };

  const now = input.now ?? Date.now;
  const startedAt = now();
  const controller = new AbortController();
  const timeouts = input.timeouts ?? resolveQueryTimeouts();
  const firstTokenDeadline = startedAt + timeouts.firstTokenMs;
  const totalDeadline = startedAt + timeouts.totalMs;
  let firstTextAt: number | null = null;
  let modelCalls: 0 | 1 = 0;
  let text = "";
  const omitted = (reason: CommentaryOmissionReason): QualitativeCommentaryResult => ({
    latencyMs: Math.max(0, now() - startedAt),
    modelCalls,
    reason,
    status: "omitted",
    ttftMs: firstTextAt === null ? null : Math.max(0, firstTextAt - startedAt),
  });

  try {
    const model = await resolveModel(input);
    if (!model) return omitted("provider_error");
    input.modelCallRecorder?.record(
      "query_commentary",
      input.callScopeId ?? "query-commentary",
    );
    input.modelCallRecorder?.recordProviderAttempt("query_commentary");
    modelCalls = 1;
    const stream = await timeout(
      Promise.resolve(model.stream(messages, { signal: controller.signal })),
      Math.max(1, Math.min(firstTokenDeadline - now(), totalDeadline - now())),
      "first_token_timeout",
      controller,
    );
    const iterator = stream[Symbol.asyncIterator]();
    while (true) {
      const current = now();
      const remaining = Math.max(1, totalDeadline - current);
      const next = await timeout(
        iterator.next(),
        firstTextAt === null ? Math.max(1, Math.min(firstTokenDeadline - current, remaining)) : remaining,
        firstTextAt === null ? "first_token_timeout" : "total_timeout",
        controller,
      );
      if (next.done) break;
      const classified = classifyQueryChunk(next.value as AIMessageChunk);
      if (classified.kind === "violation") return omitted(classified.code === "tool_call" ? "tool_call" : "numeric_content");
      if (classified.kind === "text") {
        firstTextAt ??= now();
        text += classified.text;
        if (Array.from(text).length > 80) return omitted("too_long");
      }
    }
    const validation = validateQualitativeCommentary(text);
    if (!validation.ok) return omitted(validation.reason);
    return {
      latencyMs: Math.max(0, now() - startedAt),
      modelCalls: 1,
      status: "accepted",
      text: validation.text,
      ttftMs: Math.max(0, (firstTextAt ?? startedAt) - startedAt),
    };
  } catch (error) {
    const reason = error && typeof error === "object" && "commentaryReason" in error
      ? error.commentaryReason as CommentaryOmissionReason
      : "provider_error";
    return omitted(reason);
  } finally {
    controller.abort();
  }
};
