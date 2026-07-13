import type { StreamTokenCallback } from "../client";
import { formatProgressAssistantMessage } from "../progress";
import type { AgentIntent } from "../schemas";
import type { AgentChatResponse } from "../schemas";
import type { AgentStreamController } from "../stream-events";
import { formatPlanProgressAssistantMessage, projectQueryFactsForModel } from "./facts";
import { loadAggregateProgressFacts, loadPlanProgressFacts } from "./facts-repository";
import { classifyQueryEligibility } from "./intent-scope";
import { runLangChainQueryAgent } from "./langchain-query-agent";
import type { QueryFacts, QueryRuntime, QueryStreamTerminalState } from "./types";

type LegacyResult = { assistantMessage: string; pendingAction: null };
type ToResponse = (threadId: number, tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>) => AgentChatResponse;
export type QueryDispatchResult =
  | { outcome: "legacy"; modelCalls: 0; repositoryCalls: 0 }
  | { outcome: "clarify" | "legacy_facts"; assistantMessage: string; modelCalls: 0; repositoryCalls: 1; toResponse: ToResponse }
  | { outcome: "complete"; assistantMessage: string; terminal: Extract<QueryStreamTerminalState, { status: "complete" }>; modelCalls: 1; repositoryCalls: 1; toResponse: ToResponse }
  | { outcome: "unavailable" | "partial"; terminal: Exclude<QueryStreamTerminalState, { status: "complete" }>; modelCalls: 0 | 1; repositoryCalls: 1 };

export type DispatchPreResolvedQueryInput = {
  emitToken?: StreamTokenCallback;
  intent: AgentIntent;
  loadFacts?: (intent: AgentIntent) => Promise<QueryFacts | null>;
  maxProjectionChars?: number;
  message?: string;
  runLegacy?: (facts?: QueryFacts | null) => Promise<LegacyResult>;
  runModel?: (facts: QueryFacts) => Promise<QueryStreamTerminalState>;
  runtime?: QueryRuntime;
  stream?: AgentStreamController;
};

const loadDefaultFacts = async (intent: AgentIntent) => intent.intent === "query_progress"
  ? loadAggregateProgressFacts(intent.args as never)
  : loadPlanProgressFacts(intent.args as never);

const formatLoadedFacts = (facts: QueryFacts): LegacyResult => ({
  assistantMessage: facts.kind === "aggregate_progress"
    ? formatProgressAssistantMessage(facts.snapshot, facts.args)
    : formatPlanProgressAssistantMessage(facts),
  pendingAction: null,
});

const responseFactory = (input: DispatchPreResolvedQueryInput, assistantMessage: string, intent: AgentIntent["intent"]): ToResponse =>
  (threadId, tokenUsage) => ({
    assistantMessage,
    confidence: input.intent.confidence,
    engine: "workflow",
    intent,
    pendingAction: null,
    threadId,
    tokenUsage,
  });

export const dispatchPreResolvedQuery = async (input: DispatchPreResolvedQueryInput): Promise<QueryDispatchResult> => {
  const eligibility = classifyQueryEligibility(input.intent, input.runtime);
  if (!eligibility.eligible) {
    if (input.runLegacy) await input.runLegacy();
    return { outcome: "legacy", modelCalls: 0, repositoryCalls: 0 };
  }
  input.stream?.start({ id: "stage-query", phase: "response", title: "读取进展事实" });
  const facts = await (input.loadFacts ?? loadDefaultFacts)(input.intent);
  if (!facts) {
    const assistantMessage = "找不到对应的计划。请告诉我计划的 ID。";
    input.stream?.complete("stage-query", "需要补充计划 ID");
    return { outcome: "clarify", assistantMessage, modelCalls: 0, repositoryCalls: 1, toResponse: responseFactory(input, assistantMessage, "clarify") };
  }
  const projectionChars = JSON.stringify(projectQueryFactsForModel(facts)).length;
  if (projectionChars > (input.maxProjectionChars ?? 12_000)) {
    const legacy = input.runLegacy ? await input.runLegacy(facts) : formatLoadedFacts(facts);
    input.emitToken?.(legacy.assistantMessage, "response");
    input.stream?.complete("stage-query", "事实结果已生成");
    return { outcome: "legacy_facts", assistantMessage: legacy.assistantMessage, modelCalls: 0, repositoryCalls: 1, toResponse: responseFactory(input, legacy.assistantMessage, input.intent.intent) };
  }
  const terminal = await (input.runModel ?? ((loaded) => runLangChainQueryAgent({ emitToken: input.emitToken, facts: loaded, userMessage: input.message ?? "查询当前进展" })))(facts);
  if (terminal.status === "complete") {
    input.stream?.complete("stage-query", "事实结果已生成");
    return { outcome: "complete", assistantMessage: terminal.answer, terminal, modelCalls: 1, repositoryCalls: 1, toResponse: responseFactory(input, terminal.answer, input.intent.intent) };
  }
  input.stream?.error("stage-query", "只读查询暂时不可用");
  return { outcome: terminal.status, terminal, modelCalls: terminal.modelCalls, repositoryCalls: 1 };
};
