import type { AgentSuggestion } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import {
  generateSuggestionsFromWorkspaceSnapshot,
  shouldResurfaceDismissedSuggestion,
  type AgentSuggestionDraft,
} from "./suggestions-core";
import type { WorkspaceSnapshot } from "@/lib/payload/workspace";

export {
  dismissedSuggestionCooldownMs,
  generateSuggestionsFromWorkspaceSnapshot,
  shouldResurfaceDismissedSuggestion,
  type AgentSuggestionCreatedBy,
  type AgentSuggestionDraft,
  type AgentSuggestionRelatedContent,
  type AgentSuggestionRiskLevel,
  type AgentSuggestionSnapshot,
  type AgentSuggestionSource,
  type AgentSuggestionStatus,
} from "./suggestions-core";

export type AgentInboxSuggestion = Pick<
  AgentSuggestion,
  "id" | "reason" | "riskLevel" | "source" | "status" | "suggestedPrompt" | "title" | "uniqueKey"
>;

const toSuggestionData = (suggestion: AgentSuggestionDraft) => ({
  createdBy: suggestion.createdBy,
  reason: suggestion.reason,
  relatedContent: suggestion.relatedContent,
  relatedPlan: suggestion.relatedPlan,
  riskLevel: suggestion.riskLevel,
  source: suggestion.source,
  status: suggestion.status,
  suggestedPrompt: suggestion.suggestedPrompt,
  title: suggestion.title,
  uniqueKey: suggestion.uniqueKey,
});

export const upsertSuggestion = async (uniqueKey: string, suggestion?: AgentSuggestionDraft) => {
  const payload = await getPayloadClient();
  const existing = await payload.find({
    collection: "agent-suggestions",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      uniqueKey: {
        equals: uniqueKey,
      },
    },
  });
  const existingSuggestion = existing.docs[0] as AgentSuggestion | undefined;

  if (!suggestion) {
    return existingSuggestion ?? null;
  }

  if (existingSuggestion?.status === "dismissed" && !shouldResurfaceDismissedSuggestion({ dismissedAt: existingSuggestion.dismissedAt })) {
    return existingSuggestion;
  }

  if (existingSuggestion?.status === "done" || existingSuggestion?.status === "accepted") {
    return existingSuggestion;
  }

  const data = {
    ...toSuggestionData(suggestion),
    acceptedAt: null,
    completedAt: null,
    dismissedAt: null,
    status: "pending" as const,
  };

  if (existingSuggestion) {
    return payload.update({
      collection: "agent-suggestions",
      data,
      id: existingSuggestion.id,
      overrideAccess: true,
    });
  }

  return payload.create({
    collection: "agent-suggestions",
    data: data as never,
    overrideAccess: true,
  });
};

export const dismissSuggestion = async (id: number) => {
  const payload = await getPayloadClient();

  return payload.update({
    collection: "agent-suggestions",
    data: {
      dismissedAt: new Date().toISOString(),
      status: "dismissed",
    },
    id,
    overrideAccess: true,
  });
};

export const acceptSuggestion = async (id: number) => {
  const payload = await getPayloadClient();

  return payload.update({
    collection: "agent-suggestions",
    data: {
      acceptedAt: new Date().toISOString(),
      status: "accepted",
    },
    id,
    overrideAccess: true,
  });
};

export const markSuggestionDone = async (id: number) => {
  const payload = await getPayloadClient();

  return payload.update({
    collection: "agent-suggestions",
    data: {
      completedAt: new Date().toISOString(),
      status: "done",
    },
    id,
    overrideAccess: true,
  });
};

export const syncAgentSuggestionsFromWorkspaceSnapshot = async (snapshot: WorkspaceSnapshot) => {
  const generated = generateSuggestionsFromWorkspaceSnapshot(snapshot);

  await Promise.all(generated.map((suggestion) => upsertSuggestion(suggestion.uniqueKey, suggestion)));
};

export const getPendingAgentSuggestions = async (limit = 3): Promise<AgentInboxSuggestion[]> => {
  const payload = await getPayloadClient();
  const suggestions = await payload.find({
    collection: "agent-suggestions",
    depth: 0,
    limit,
    overrideAccess: true,
    pagination: false,
    sort: "-updatedAt",
    where: {
      status: {
        equals: "pending",
      },
    },
  });

  return suggestions.docs.map((suggestion) => ({
    id: suggestion.id,
    reason: suggestion.reason,
    riskLevel: suggestion.riskLevel,
    source: suggestion.source,
    status: suggestion.status,
    suggestedPrompt: suggestion.suggestedPrompt,
    title: suggestion.title,
    uniqueKey: suggestion.uniqueKey,
  }));
};
