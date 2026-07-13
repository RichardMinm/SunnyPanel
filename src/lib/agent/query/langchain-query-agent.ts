import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIMessageChunk } from "@langchain/core/messages";
import { getAgentModelConfig, type StreamTokenCallback } from "../client";
import { createChatModel, type ModelFactory } from "../llm/model-factory";
import { createModelConfig, type ModelConfig } from "../llm/model-config";
import { classifyQueryChunk } from "./chunks";
import { toProgressPercent } from "./facts";
import { buildQueryMessages } from "./prompt";
import { resolveQueryTimeouts } from "./runtime-config";
import type { QueryFacts, QueryStreamTerminalState, SafeQueryErrorCode } from "./types";

export type RunLangChainQueryInput = {
  emitToken?: StreamTokenCallback;
  facts: QueryFacts;
  model?: BaseChatModel;
  modelFactory?: ModelFactory;
  modelConfig?: ModelConfig;
  timeouts?: { firstTokenMs: number; totalMs: number };
  userMessage: string;
};

export const renderCanonicalFactBlock = (facts: QueryFacts) => {
  if (facts.kind === "aggregate_progress") {
    const s = facts.snapshot.summary;
    const planFacts = `当前 ${s.planCount} 项计划，进行中 ${s.activePlans}，已完成 ${s.completedPlans}`;
    const checklistFacts = `清单条目完成 ${s.completedChecklistItems}/${s.totalChecklistItems}（${toProgressPercent(s.completedChecklistItems, s.totalChecklistItems)}%）`;
    if (facts.args.scope === "plans") return `\n\n事实：${planFacts}。`;
    if (facts.args.scope === "checklists") return `\n\n事实：${checklistFacts}。`;
    return `\n\n事实：${planFacts}；${checklistFacts}。`;
  }
  const phaseTasks = facts.phases.reduce((sum, phase) => sum + phase.taskCount, 0);
  const storedProgress = facts.storedProgressPercent === null ? "未记录" : `${facts.storedProgressPercent}%`;
  return `\n\n事实：计划「${facts.title}」状态为 ${facts.state}，存储进度${storedProgress === "未记录" ? "" : " "}${storedProgress}，共 ${facts.phases.length} 个阶段、${phaseTasks} 个任务。`;
};

const failure = (code: SafeQueryErrorCode, emitted: boolean, modelCalls: 0 | 1): QueryStreamTerminalState => emitted
  ? { status: "partial", persist: false, partialOutputEmitted: true, errorCode: code, modelCalls: 1 }
  : { status: "unavailable", persist: false, errorCode: code, modelCalls };

const timeout = <T>(promise: Promise<T>, ms: number, code: SafeQueryErrorCode, controller: AbortController) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error(code), { queryCode: code })); }, ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });

const resolveModel = async (input: RunLangChainQueryInput): Promise<BaseChatModel | null> => {
  if (input.model) return input.model;
  let config = input.modelConfig;
  if (!config) {
    const current = await getAgentModelConfig();
    if (!current) return null;
    const created = createModelConfig({ apiKey: current.apiKey, baseURL: current.baseUrl, model: current.model, provider: current.provider ?? "openai-compatible", maxRetries: 0 });
    if (!("apiKey" in created)) return null;
    config = created;
  }
  return (input.modelFactory ?? createChatModel)(config);
};

export const runLangChainQueryAgent = async (input: RunLangChainQueryInput): Promise<QueryStreamTerminalState> => {
  const controller = new AbortController();
  const timeouts = input.timeouts ?? resolveQueryTimeouts();
  let emitted = false;
  let commentary = "";
  let modelCalls: 0 | 1 = 0;
  const firstTokenDeadline = Date.now() + timeouts.firstTokenMs;
  const totalDeadline = Date.now() + timeouts.totalMs;
  try {
    const model = await resolveModel(input);
    if (!model) return failure("provider_error", false, 0);
    modelCalls = 1;
    const stream = await timeout(
      Promise.resolve(model.stream(buildQueryMessages(input), { signal: controller.signal })),
      Math.max(1, Math.min(firstTokenDeadline - Date.now(), totalDeadline - Date.now())),
      "first_token_timeout",
      controller,
    );
    const iterator = stream[Symbol.asyncIterator]();
    let firstText = true;
    while (true) {
      const remaining = Math.max(1, totalDeadline - Date.now());
      const next = await timeout(
        iterator.next(),
        firstText ? Math.max(1, Math.min(firstTokenDeadline - Date.now(), remaining)) : remaining,
        firstText ? "first_token_timeout" : "total_timeout",
        controller,
      );
      if (next.done) break;
      const classified = classifyQueryChunk(next.value as AIMessageChunk);
      if (classified.kind === "violation") return failure(classified.code, emitted, modelCalls);
      if (classified.kind === "text") {
        firstText = false; emitted = true; commentary += classified.text; input.emitToken?.(classified.text, "response");
      }
    }
    if (!emitted) return failure("empty_stream", false, modelCalls);
    const canonical = renderCanonicalFactBlock(input.facts);
    input.emitToken?.(canonical, "response");
    return { status: "complete", persist: true, answer: commentary + canonical, modelCalls: 1 };
  } catch (error) {
    const code = error && typeof error === "object" && "queryCode" in error ? (error.queryCode as SafeQueryErrorCode) : "provider_error";
    return failure(code, emitted, modelCalls);
  } finally {
    controller.abort();
  }
};
