import {
  dryRunAgentTool,
  getAgentToolDefinition,
  type AgentToolDryRunContext,
} from "./tool-registry";
import {
  parseAgentIntentResult,
  type AgentDryRunResult,
  type AgentIntent,
  type AgentWriteIntentName,
  type PendingAction,
  type ProposedAgentAction,
} from "./schemas";
import type { UserPreferences } from "./user-preferences";
import { isRecord } from "@/lib/shared/is-record";

const riskLabelMap: Record<ProposedAgentAction["riskLevel"], string> = {
  high: "高风险",
  low: "低风险",
  medium: "中风险",
};

const operationLabelMap: Record<ProposedAgentAction["changes"][number]["operation"], string> = {
  create: "创建",
  delete: "删除",
  update: "更新",
};

const writeIntentValues = new Set<AgentWriteIntentName>([
  "add_completion_note",
  "append_plan_item",
  "cancel_schedule_item",
  "complete_plan_item",
  "compose_plan",
  "compose_schedule_item",
  "compose_timeline_event",
  "create_plan",
  "delete_record",
  "modify_record",
  "query_plan_progress",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
  "weekly_review",
]);

const isWritableIntent = (intent: AgentIntent): intent is Extract<AgentIntent, { intent: AgentWriteIntentName }> =>
  writeIntentValues.has(intent.intent as AgentWriteIntentName);

export const getAgentIntentRiskLevel = (intent: AgentIntent["intent"]): ProposedAgentAction["riskLevel"] =>
  getAgentToolDefinition(intent)?.riskLevel ??
  (writeIntentValues.has(intent as AgentWriteIntentName) ? "medium" : "low");

export type AutoApprovalContext = {
  isFirstActionInThread: boolean;
  lastIntent?: string | null;
  pendingActionHistory: PendingAction[];
  threadId: number;
  userPreferences?: UserPreferences | null;
};

export const dryRunAgentIntent = async (
  intent: AgentIntent,
  context: AgentToolDryRunContext = {},
): Promise<AgentDryRunResult> => {
  if (!isWritableIntent(intent)) {
    return { type: "bypass" };
  }

  const result = await dryRunAgentTool(intent, context);

  if (result.type === "proposed_action" && !result.action.requiresConfirmation) {
    return { type: "bypass" };
  }

  return result;
};

export const createProposedAgentAction = async (
  intent: AgentIntent,
  context: AgentToolDryRunContext = {},
): Promise<null | ProposedAgentAction> => {
  const result = await dryRunAgentIntent(intent, context);

  return result.type === "proposed_action" ? result.action : null;
};

export const createIntentFromProposedAction = (action: ProposedAgentAction): AgentIntent | null => {
  const baseArgs = isRecord(action.args) ? action.args : {};
  const snapshot = action.afterSnapshot;
  const args =
    (action.intent === "compose_plan" || action.intent === "compose_schedule_item") && snapshot
      ? {
          ...baseArgs,
          proposal:
            action.intent === "compose_plan" && isRecord(snapshot) && "proposal" in snapshot
              ? snapshot.proposal
              : snapshot,
        }
      : action.args;

  return parseAgentIntentResult({
    args,
    confidence: 1,
    intent: action.intent,
  });
};

export const buildProposedActionMessage = (action: ProposedAgentAction) => {
  const changes = action.changes
    .map((change) => {
      const target = change.documentId ? `${change.collection} #${change.documentId}` : change.collection;
      const beforeAfter =
        change.beforePreview || change.afterPreview
          ? `\n  Before：${change.beforePreview ?? "未记录"}\n  After：${change.afterPreview ?? change.preview}`
          : "";
      const metadata = [
        change.visibility ? `visibility=${change.visibility}` : null,
        change.timelineAffected ? "Timeline affected" : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `- ${operationLabelMap[change.operation]} ${target}：${change.preview}${metadata ? `（${metadata}）` : ""}${beforeAfter}`;
    })
    .join("\n");
  const rollback = action.rollbackPayload
    ? `\n\n回滚准备：${action.rollbackAvailable ? "已准备结构化 rollbackPayload" : "已有占位 payload，需执行后补齐目标 ID"}。`
    : "";

  return `我已经 dry-run 了这个工具动作。风险等级：${riskLabelMap[action.riskLevel]}。\n\n将要做：${action.summary}\n\n影响范围：\n${changes}${rollback}\n\n回复「确认」或「执行」后我再真正写入；回复「取消」会放弃这次动作。`;
};
