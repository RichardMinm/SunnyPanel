import type { AgentSuggestion } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import { getRelevantMemories } from "./memory";
import { computeCategoryDismissWeights, rankPendingSuggestionsByFeedback } from "./suggestion-feedback";
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

type SuggestionSyncPayload = Pick<
  Awaited<ReturnType<typeof getPayloadClient>>,
  "create" | "find" | "update"
>;

export type SyncAgentSuggestionsDeps = Readonly<{
  getPayloadClient?: () => Promise<SuggestionSyncPayload>;
}>;

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

export type AcceptSuggestionDeps = {
  reinforceRelatedMemories?: (text: string) => Promise<unknown>;
};

/**
 * 采纳建议时，把建议文本作为查询去检索关联记忆——getRelevantMemories 命中即强化
 * （刷新 lastUsedAt + 小步上调 confidence），让"被采纳的那类语境"在后续排序中更靠前。
 * 复用既有记忆强化逻辑，失败静默降级，不阻塞建议状态更新。
 */
const reinforceMemoriesForAcceptedSuggestion = async (text: string) => {
  if (!text.trim()) {
    return;
  }

  await getRelevantMemories(text, 2);
};

export const acceptSuggestion = async (id: number, deps: AcceptSuggestionDeps = {}) => {
  const payload = await getPayloadClient();

  const updated = (await payload.update({
    collection: "agent-suggestions",
    data: {
      acceptedAt: new Date().toISOString(),
      status: "accepted",
    },
    id,
    overrideAccess: true,
  })) as AgentSuggestion;

  const reinforce = deps.reinforceRelatedMemories ?? reinforceMemoriesForAcceptedSuggestion;

  try {
    await reinforce(`${updated.title} ${updated.reason}`);
  } catch {
    // 反馈回流是增强能力，失败时不影响建议被标记为已采纳。
  }

  return updated;
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

export const syncAgentSuggestionsFromWorkspaceSnapshot = async (
  snapshot: WorkspaceSnapshot,
  deps: SyncAgentSuggestionsDeps = {},
) => {
  const generated = generateSuggestionsFromWorkspaceSnapshot(snapshot);

  if (generated.length === 0) {
    return;
  }

  const payload = await (deps.getPayloadClient ?? getPayloadClient)();
  const uniqueKeys = generated.map((suggestion) => suggestion.uniqueKey);
  const existing = await payload.find({
    collection: "agent-suggestions",
    depth: 0,
    limit: uniqueKeys.length,
    overrideAccess: true,
    pagination: false,
    where: {
      uniqueKey: {
        in: uniqueKeys,
      },
    },
  });
  const existingByKey = new Map(
    (existing.docs as AgentSuggestion[]).map((suggestion) => [suggestion.uniqueKey, suggestion]),
  );

  await Promise.all(
    generated.map(async (suggestion) => {
      const existingSuggestion = existingByKey.get(suggestion.uniqueKey);

      if (
        existingSuggestion?.status === "dismissed" &&
        !shouldResurfaceDismissedSuggestion({ dismissedAt: existingSuggestion.dismissedAt })
      ) {
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
    }),
  );
};

export const getPendingAgentSuggestions = async (limit = 3): Promise<AgentInboxSuggestion[]> => {
  const payload = await getPayloadClient();
  // 多取一些待处理候选，再按反馈权重重排后截断，让被反复忽略的类别整体下沉。
  const [pending, dismissed] = await Promise.all([
    payload.find({
      collection: "agent-suggestions",
      depth: 0,
      limit: Math.max(limit * 4, 12),
      overrideAccess: true,
      pagination: false,
      sort: "-updatedAt",
      where: {
        status: {
          equals: "pending",
        },
      },
    }),
    payload.find({
      collection: "agent-suggestions",
      depth: 0,
      limit: 60,
      overrideAccess: true,
      pagination: false,
      sort: "-dismissedAt",
      where: {
        status: {
          equals: "dismissed",
        },
      },
    }),
  ]);

  const feedbackWeights = computeCategoryDismissWeights(
    (dismissed.docs as AgentSuggestion[]).map((suggestion) => suggestion.uniqueKey),
  );

  const ranked = rankPendingSuggestionsByFeedback(
    (pending.docs as AgentSuggestion[]).map((suggestion) => ({
      id: suggestion.id,
      reason: suggestion.reason,
      riskLevel: suggestion.riskLevel,
      source: suggestion.source,
      status: suggestion.status,
      suggestedPrompt: suggestion.suggestedPrompt,
      title: suggestion.title,
      uniqueKey: suggestion.uniqueKey,
    })),
    feedbackWeights,
  );

  return ranked.slice(0, limit);
};
