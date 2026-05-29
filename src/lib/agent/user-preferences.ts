import { getPayloadClient } from "@/lib/payload/client";
import { logAgentEvent } from "./logger";

export type UserPreferences = {
  autoApproveIntents: Set<string>;
  deniedIntents: Set<string>;
  autoApproveLowRisk: boolean;
  maxConsecutiveAutoApprovals: number;
};

const defaults: UserPreferences = {
  autoApproveIntents: new Set(["save_memory", "query_plan_progress"]),
  deniedIntents: new Set(),
  autoApproveLowRisk: true,
  maxConsecutiveAutoApprovals: 8,
};

let cached: UserPreferences | null = null;
let cacheUserId: number | null = null;

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
      cached = { ...defaults, autoApproveIntents: new Set(defaults.autoApproveIntents), deniedIntents: new Set() };
      cacheUserId = userId;

      return cached;
    }

    const autoApproveIntents = new Set(defaults.autoApproveIntents);
    const deniedIntents = new Set<string>();
    let autoApproveLowRisk = defaults.autoApproveLowRisk;
    let maxConsecutiveAutoApprovals = defaults.maxConsecutiveAutoApprovals;

    for (const doc of docs) {
      const content = (doc as { content?: string }).content ?? "";
      const title = (doc as { title?: string }).title ?? "";

      if (title.includes("auto_approve_intent") && content) {
        for (const intent of content.split(",").map((s) => s.trim()).filter(Boolean)) {
          autoApproveIntents.add(intent);
        }
      }

      if (title.includes("deny_intent") && content) {
        for (const intent of content.split(",").map((s) => s.trim()).filter(Boolean)) {
          deniedIntents.add(intent);
        }
      }

      if (title.includes("auto_approve_low_risk") && content.toLowerCase().includes("false")) {
        autoApproveLowRisk = false;
      }

      if (title.includes("max_auto_approvals")) {
        const num = Number.parseInt(content, 10);
        if (Number.isFinite(num) && num >= 0) {
          maxConsecutiveAutoApprovals = num;
        }
      }
    }

    cached = { autoApproveIntents, deniedIntents, autoApproveLowRisk, maxConsecutiveAutoApprovals };
    cacheUserId = userId;
  } catch (error) {
    logAgentEvent("warn", "preferences.load_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    cached = { ...defaults, autoApproveIntents: new Set(defaults.autoApproveIntents), deniedIntents: new Set() };
    cacheUserId = userId;
  }

  return cached;
};

export const clearPreferencesCache = () => {
  cached = null;
  cacheUserId = null;
};
