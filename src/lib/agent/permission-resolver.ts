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

export const shouldAutoApprove = (
  action: ProposedAgentAction,
  context: PermissionContext,
): AutoApprovalDecision => {
  // Read-only intents always auto-approve
  if (READ_ONLY_INTENTS.has(action.intent)) {
    return { approved: true, reason: "只读操作无需确认" };
  }

  // High risk never auto-approves
  if (action.riskLevel === "high") {
    return { approved: false, reason: "高风险操作必须手动确认" };
  }

  // First action in thread always requires confirmation (safety baseline)
  if (context.isFirstActionInThread) {
    return { approved: false, reason: "会话首次写操作需手动确认" };
  }

  // User has explicitly denied this intent
  if (context.userPreferences.deniedIntents.has(action.intent)) {
    return { approved: false, reason: `用户已禁止自动批准 ${action.intent}` };
  }

  // Medium risk: only auto-approve if user previously confirmed same intent (or intent+collection)
  if (action.riskLevel === "medium") {
    const collectionKey = action.changes.map((c) => c.collection).join(",");
    const comboKey = `${action.intent}:${collectionKey}`;

    if (context.previouslyConfirmedIntents.has(comboKey) || context.previouslyConfirmedIntents.has(action.intent)) {
      return { approved: true, reason: `已确认过相同操作 ${action.intent}` };
    }

    if (context.userPreferences.autoApproveIntents.has(action.intent)) {
      return { approved: true, reason: `用户在偏好中允许 ${action.intent}` };
    }

    return { approved: false, reason: "中风险操作未经历史确认" };
  }

  // Low risk: auto-approve if under consecutive limit and allowed by preferences
  if (action.riskLevel === "low") {
    if (!context.userPreferences.autoApproveLowRisk) {
      return { approved: false, reason: "用户禁用了低风险自动批准" };
    }

    if (context.consecutiveAutoCount >= context.userPreferences.maxConsecutiveAutoApprovals) {
      return { approved: false, reason: `连续自动批准已达上限 ${context.userPreferences.maxConsecutiveAutoApprovals}` };
    }

    return { approved: true, reason: "低风险操作在自动批准范围内" };
  }

  return { approved: false, reason: "未匹配任何自动批准规则" };
};

let consecutiveAutoCount = 0;
let lastThreadId: number | null = null;

export const getConsecutiveAutoCount = () => consecutiveAutoCount;

export const incrementAutoCount = (threadId: number) => {
  if (lastThreadId !== threadId) {
    consecutiveAutoCount = 1;
    lastThreadId = threadId;
  } else {
    consecutiveAutoCount += 1;
  }

  logAgentEvent("info", "permission.auto_approved", {
    consecutiveCount: consecutiveAutoCount,
    threadId,
  });
};

export const resetAutoCount = (threadId?: number) => {
  if (threadId !== undefined && threadId !== lastThreadId) {
    return;
  }

  consecutiveAutoCount = 0;
  lastThreadId = null;
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
