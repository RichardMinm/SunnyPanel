import type { StreamTokenCallback } from "../client";
import { formatProgressAssistantMessage } from "../progress";
import type { AgentIntent } from "../schemas";
import type { AgentChatResponse } from "../schemas";
import type { AgentStreamController } from "../stream-events";
import { formatPlanProgressAssistantMessage } from "./facts";
import { loadAggregateProgressFacts, loadPlanProgressFacts } from "./facts-repository";
import { classifyQueryEligibility } from "./intent-scope";
import { renderCanonicalFactBlock } from "./langchain-query-agent";
import { runQualitativeQueryCommentary, type QualitativeCommentaryResult } from "./qualitative-commentary";
import { composeQueryAnswer, projectQualitativeQueryFacts } from "./qualitative-projection";
import { QUERY_CONTENT_CHAR_CAP, type QueryFacts, type QueryRuntime } from "./types";

type LegacyResult = { assistantMessage: string; pendingAction: null };
type ToResponse = (threadId: number, tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>) => AgentChatResponse;
export type QueryDispatchResult =
  | { outcome: "legacy"; modelCalls: 0; repositoryCalls: 0 }
  | { outcome: "clarify" | "legacy_facts"; assistantMessage: string; modelCalls: 0; repositoryCalls: 1; toResponse: ToResponse }
  | { outcome: "complete"; assistantMessage: string; terminal: { status: "complete"; persist: true; answer: string; modelCalls: 0 | 1; commentary: QualitativeCommentaryResult }; modelCalls: 0 | 1; repositoryCalls: 1; toResponse: ToResponse };

export type DispatchPreResolvedQueryInput = {
  emitToken?: StreamTokenCallback;
  intent: AgentIntent;
  loadFacts?: (intent: AgentIntent) => Promise<QueryFacts | null>;
  maxProjectionChars?: number;
  message?: string;
  runLegacy?: (facts?: QueryFacts | null) => Promise<LegacyResult>;
  runCommentary?: (facts: QueryFacts) => Promise<QualitativeCommentaryResult>;
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
  const canonical = renderCanonicalFactBlock(facts);
  const projectionChars = JSON.stringify(projectQualitativeQueryFacts(facts)).length;
  if (projectionChars > (input.maxProjectionChars ?? QUERY_CONTENT_CHAR_CAP) || canonical.length > QUERY_CONTENT_CHAR_CAP) {
    const legacy = input.runLegacy ? await input.runLegacy(facts) : formatLoadedFacts(facts);
    input.emitToken?.(legacy.assistantMessage, "response");
    input.stream?.complete("stage-query", "事实结果已生成");
    return { outcome: "legacy_facts", assistantMessage: legacy.assistantMessage, modelCalls: 0, repositoryCalls: 1, toResponse: responseFactory(input, legacy.assistantMessage, input.intent.intent) };
  }
  const commentary = await (input.runCommentary ?? ((loaded) => runQualitativeQueryCommentary({ facts: loaded })))(facts);
  const assistantMessage = composeQueryAnswer(
    canonical,
    commentary.status === "accepted" ? commentary : { status: "omitted" },
  );
  input.emitToken?.(assistantMessage, "response");
  input.stream?.complete("stage-query", commentary.status === "accepted" ? "事实与定性说明已生成" : "事实结果已生成");
  const terminal = { answer: assistantMessage, commentary, modelCalls: commentary.modelCalls, persist: true as const, status: "complete" as const };
  return { outcome: "complete", assistantMessage, terminal, modelCalls: commentary.modelCalls, repositoryCalls: 1, toResponse: responseFactory(input, assistantMessage, input.intent.intent) };
};
