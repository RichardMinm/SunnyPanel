import { parseAgentIntentResult, type AgentIntent, type ProposedAgentAction } from "./schemas";

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

const createProposedActionId = () =>
  globalThis.crypto?.randomUUID?.() ?? `agent-action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getTargetLabel = (checklistTitle: string, groupTitle: null | string | undefined, itemTitle?: string) =>
  [checklistTitle, groupTitle, itemTitle].filter((value): value is string => Boolean(value)).join(" / ");

export const getAgentIntentRiskLevel = (intent: AgentIntent["intent"]): ProposedAgentAction["riskLevel"] => {
  switch (intent) {
    case "create_plan":
    case "append_plan_item":
      return "medium";
    case "add_completion_note":
    case "complete_plan_item":
      return "high";
    case "answer_question":
    case "clarify":
    case "evaluate_plan":
    case "query_progress":
    default:
      return "low";
  }
};

export const createProposedAgentAction = (intent: AgentIntent): null | ProposedAgentAction => {
  const riskLevel = getAgentIntentRiskLevel(intent.intent);

  if (riskLevel === "low") {
    return null;
  }

  switch (intent.intent) {
    case "create_plan":
      return {
        args: intent.args,
        changes: [
          {
            collection: "plans",
            operation: "create",
            preview: `创建私有草稿计划「${intent.args.title}」，状态 ${intent.args.state ?? "backlog"}，优先级 ${intent.args.priority ?? "medium"}，执行模式 ${intent.args.executionMode ?? "manual"}。`,
          },
        ],
        id: createProposedActionId(),
        intent: intent.intent,
        riskLevel,
        summary: `创建计划「${intent.args.title}」`,
      };
    case "append_plan_item": {
      const target = getTargetLabel(intent.args.checklistTitle, intent.args.groupTitle);

      return {
        args: intent.args,
        changes: [
          {
            collection: "checklists",
            operation: "update",
            preview: `向「${target}」追加未完成条目「${intent.args.itemTitle}」${intent.args.description ? `，说明：${intent.args.description}` : ""}。`,
          },
        ],
        id: createProposedActionId(),
        intent: intent.intent,
        riskLevel,
        summary: `向清单追加计划项「${intent.args.itemTitle}」`,
      };
    }
    case "complete_plan_item": {
      const target = getTargetLabel(intent.args.checklistTitle, intent.args.groupTitle, intent.args.itemTitle);

      return {
        args: intent.args,
        changes: [
          {
            collection: "checklists",
            operation: "update",
            preview: `将「${target}」标记为完成${intent.args.completionNote ? `，并写入备注：${intent.args.completionNote}` : ""}。`,
          },
          {
            collection: "timeline-events",
            operation: "update",
            preview: "同步创建或更新对应 Timeline 完成节点，可能影响公开时间线内容。",
          },
        ],
        id: createProposedActionId(),
        intent: intent.intent,
        riskLevel,
        summary: `标记清单条目完成「${target}」`,
      };
    }
    case "add_completion_note": {
      const target = getTargetLabel(intent.args.checklistTitle, intent.args.groupTitle, intent.args.itemTitle);

      return {
        args: intent.args,
        changes: [
          {
            collection: "checklists",
            operation: "update",
            preview: `为「${target}」写入完成备注：${intent.args.completionNote}。`,
          },
          {
            collection: "timeline-events",
            operation: "update",
            preview: "同步更新对应 Timeline 节点说明，可能影响公开时间线内容。",
          },
        ],
        id: createProposedActionId(),
        intent: intent.intent,
        riskLevel,
        summary: `补充完成备注「${target}」`,
      };
    }
    default:
      return null;
  }
};

export const createIntentFromProposedAction = (action: ProposedAgentAction): AgentIntent | null =>
  parseAgentIntentResult({
    args: action.args,
    confidence: 1,
    intent: action.intent,
  });

export const buildProposedActionMessage = (action: ProposedAgentAction) => {
  const changes = action.changes
    .map((change) => {
      const target = change.documentId ? `${change.collection} #${change.documentId}` : change.collection;

      return `- ${operationLabelMap[change.operation]} ${target}：${change.preview}`;
    })
    .join("\n");

  return `我已经整理好一个待确认动作。风险等级：${riskLabelMap[action.riskLevel]}。\n\n将要做：${action.summary}\n\n影响范围：\n${changes}\n\n回复「确认」或「执行」后我再真正写入；回复「取消」会放弃这次动作。`;
};
