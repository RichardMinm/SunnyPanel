import { getPayloadClient } from "@/lib/payload/client";
import { logAgentEvent } from "./logger";

export type AgentAutonomyLevel = 0 | 1 | 2 | 3;

export type UserPreferences = {
  autoApproveIntents: Set<string>;
  autoApproveLowRisk: boolean;
  autonomyLevel: AgentAutonomyLevel;
  deniedIntents: Set<string>;
  maxConsecutiveAutoApprovals: number;
};

const defaults: UserPreferences = {
  autoApproveIntents: new Set(["save_memory", "query_plan_progress"]),
  deniedIntents: new Set(),
  autoApproveLowRisk: true,
  autonomyLevel: 2,
  maxConsecutiveAutoApprovals: 8,
};

let cached: UserPreferences | null = null;
let cacheUserId: number | null = null;

type PreferenceMemoryDoc = {
  content?: null | string;
  title?: null | string;
};

const clonePreferences = (preferences: UserPreferences): UserPreferences => ({
  autoApproveIntents: new Set(preferences.autoApproveIntents),
  autoApproveLowRisk: preferences.autoApproveLowRisk,
  autonomyLevel: preferences.autonomyLevel,
  deniedIntents: new Set(preferences.deniedIntents),
  maxConsecutiveAutoApprovals: preferences.maxConsecutiveAutoApprovals,
});

const parseIntentList = (content: string) =>
  content
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const parseAutonomyLevel = (value: string, fallback: AgentAutonomyLevel): AgentAutonomyLevel => {
  const match = value.match(/(?:^|[^0-9])([0-3])(?:[^0-9]|$)/);
  if (!match) {
    return fallback;
  }

  const parsed = Number.parseInt(match[1] ?? "", 10);
  return parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3 ? parsed : fallback;
};

export const parseUserPreferencesFromMemoryDocs = (docs: PreferenceMemoryDoc[]): UserPreferences => {
  const preferences = clonePreferences(defaults);

  for (const doc of docs) {
    const content = doc.content ?? "";
    const title = doc.title ?? "";
    const normalizedTitle = title.toLowerCase();
    const normalizedContent = content.toLowerCase();

    if (normalizedTitle.includes("auto_approve_intent") && content) {
      for (const intent of parseIntentList(content)) {
        preferences.autoApproveIntents.add(intent);
      }
    }

    if (normalizedTitle.includes("deny_intent") && content) {
      for (const intent of parseIntentList(content)) {
        preferences.deniedIntents.add(intent);
      }
    }

    if (
      normalizedTitle.includes("agent_autonomy_level") ||
      normalizedTitle.includes("autonomy_level") ||
      normalizedTitle.includes("approval_level") ||
      title.includes("自主执行级别") ||
      title.includes("确认级别")
    ) {
      preferences.autonomyLevel = parseAutonomyLevel(content || title, preferences.autonomyLevel);
    }

    if (normalizedTitle.includes("auto_approve_low_risk") && normalizedContent.includes("false")) {
      preferences.autoApproveLowRisk = false;
    }

    if (normalizedTitle.includes("max_auto_approvals")) {
      const num = Number.parseInt(content, 10);
      if (Number.isFinite(num) && num >= 0) {
        preferences.maxConsecutiveAutoApprovals = num;
      }
    }
  }

  return preferences;
};

export const getUserPreferences = async (userId: number): Promise<UserPreferences> => {
  if (cached && cacheUserId === userId) {
    return cached;
  }

  try {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "agent-memories",
      depth: 0,
      limit: 50,
      where: {
        and: [
          { type: { equals: "preference" } },
          { status: { equals: "active" } },
        ],
      },
    });

    if (!docs.length) {
      cached = clonePreferences(defaults);
      cacheUserId = userId;

      return cached;
    }

    cached = parseUserPreferencesFromMemoryDocs(docs as PreferenceMemoryDoc[]);
    cacheUserId = userId;
  } catch (error) {
    logAgentEvent("warn", "preferences.load_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    cached = clonePreferences(defaults);
    cacheUserId = userId;
  }

  return cached;
};

export const clearPreferencesCache = () => {
  cached = null;
  cacheUserId = null;
};
