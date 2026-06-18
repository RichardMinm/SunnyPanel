import type { ProposedAgentAction, PendingAction } from "./schemas";
import type { UserPreferences } from "./user-preferences";
import { logAgentEvent } from "./logger";

type AutoApprovalDecision = {
  approved: boolean;
  reason: string;
};

type PermissionContext = {
  consecutiveAutoCount: number;
  isFirstActionInThread: boolean;
  previouslyConfirmedIntents: Set<string>;
  userPreferences: UserPreferences;
};

const READ_ONLY_INTENTS = new Set(["query_plan_progress", "query_progress"]);

const hasReachedAutoApprovalLimit = (context: PermissionContext) =>
  context.consecutiveAutoCount >= context.userPreferences.maxConsecutiveAutoApprovals;

export const shouldAutoApprove = (
  action: ProposedAgentAction,
  context: PermissionContext,
): AutoApprovalDecision => {
  // Read-only intents always auto-approve
  if (READ_ONLY_INTENTS.has(action.intent)) {
    return { approved: true, reason: "只读操作无需确认" };
  }

  const autonomyLevel = context.userPreferences.autonomyLevel ?? 2;

  // User has explicitly denied this intent
  if (context.userPreferences.deniedIntents.has(action.intent)) {
    return { approved: false, reason: `用户已禁止自动批准 ${action.intent}` };
  }

  if (autonomyLevel === 0) {
    return { approved: false, reason: "Level 0 完全确认模式：写操作必须手动确认" };
  }

  // First action remains a trust-building confirmation except in fully autonomous mode.
  if (context.isFirstActionInThread && autonomyLevel < 3) {
    return { approved: false, reason: "会话首次写操作需手动确认" };
  }

  if (hasReachedAutoApprovalLimit(context)) {
    return { approved: false, reason: `连续自动批准已达上限 ${context.userPreferences.maxConsecutiveAutoApprovals}` };
  }

  if (action.riskLevel === "high") {
    if (autonomyLevel >= 3) {
      return { approved: true, reason: "Level 3 全部自动模式允许高风险操作自动执行" };
    }

    return { approved: false, reason: "高风险操作必须手动确认" };
  }

  // Medium risk: only auto-approve if user previously confirmed same intent (or intent+collection)
  if (action.riskLevel === "medium") {
    if (autonomyLevel >= 3) {
      return { approved: true, reason: "Level 3 全部自动模式允许中风险操作自动执行" };
    }

    if (autonomyLevel < 2 && !context.userPreferences.autoApproveIntents.has(action.intent)) {
      return { approved: false, reason: "Level 1 仅自动执行低风险操作" };
    }

    const collectionKey = action.changes.map((c) => c.collection).join(",");
    const comboKey = `${action.intent}:${collectionKey}`;

    if (context.userPreferences.autoApproveIntents.has(action.intent)) {
      return { approved: true, reason: `用户在偏好中允许 ${action.intent}` };
    }

    if (autonomyLevel >= 2 && (context.previouslyConfirmedIntents.has(comboKey) || context.previouslyConfirmedIntents.has(action.intent))) {
      return { approved: true, reason: `Level 2 已确认过同领域相同操作 ${action.intent}` };
    }

    return { approved: false, reason: "中风险操作未经历史确认" };
  }

  // Low risk: auto-approve if under consecutive limit and allowed by preferences
  if (action.riskLevel === "low") {
    if (!context.userPreferences.autoApproveLowRisk) {
      return { approved: false, reason: "用户禁用了低风险自动批准" };
    }

    return { approved: true, reason: "低风险操作在自动批准范围内" };
  }

  return { approved: false, reason: "未匹配任何自动批准规则" };
};

/* Per-thread auto-approval counters. Using a Map keyed by threadId avoids
 * cross-request race conditions inherent in module-level mutable state. */
const autoCountByThread = new Map<number, number>();

export const getConsecutiveAutoCount = (threadId?: number) => {
  if (threadId == null) return 0;
  return autoCountByThread.get(threadId) ?? 0;
};

export const incrementAutoCount = (threadId: number) => {
  const current = autoCountByThread.get(threadId) ?? 0;
  const next = current + 1;
  autoCountByThread.set(threadId, next);

  logAgentEvent("info", "permission.auto_approved", {
    consecutiveCount: next,
    threadId,
  });
};

export const buildConfirmedIntentSet = (pendingActions: PendingAction[], lastIntent?: string | null): Set<string> => {
  const confirmed = new Set<string>();

  for (const pa of pendingActions) {
    if (pa.type === "await_confirmation" || pa.type === "await_batch_confirmation") {
      const actions = pa.type === "await_batch_confirmation" ? pa.actions : [pa.action];

      for (const action of actions) {
        const collectionKey = action.changes.map((c) => c.collection).join(",");
        confirmed.add(`${action.intent}:${collectionKey}`);
      }
    }
  }

  // Thread lastIntent captures the most recently executed intent — use as a signal
  // that the user has already confirmed this type of action in the thread.
  if (lastIntent) {
    confirmed.add(lastIntent);
  }

  return confirmed;
};
