import type { AppendPlanItemArgs } from "../schemas";
import type { SafeExecutionFailureCode } from "./safe-execution-failure";
import type { OrchestratorPlan, TaskNode } from "./types";

export type ToolFailureRepairKind = "missing_checklist_item";

export type ToolFailureRepairInput = {
  failureCode?: SafeExecutionFailureCode;
  failedTask: TaskNode;
  failureReason: string;
  message?: string;
};

export type ToolFailureRepairPlan = {
  failureKind: ToolFailureRepairKind;
  plan: OrchestratorPlan;
  reason: string;
  summary: string;
};

const textArg = (args: Record<string, unknown>, key: string): null | string => {
  const value = args[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const buildMissingChecklistItemRepair = ({
  failureCode,
  failedTask,
  failureReason,
}: ToolFailureRepairInput): ToolFailureRepairPlan | null => {
  if (
    failedTask.intent !== "complete_plan_item" ||
    failureCode !== "checklist_item_not_found"
  ) {
    return null;
  }

  const checklistTitle = textArg(failedTask.args, "checklistTitle");
  const groupTitle = textArg(failedTask.args, "groupTitle");
  const itemTitle = textArg(failedTask.args, "itemTitle");

  if (!checklistTitle || !itemTitle) {
    return null;
  }

  const explainTaskId = `${failedTask.id}-semantic-repair-explain`;
  const appendTaskId = `${failedTask.id}-semantic-repair-append`;
  const appendArgs: AppendPlanItemArgs = {
    checklistTitle,
    createGroupIfMissing: true,
    description: `语义修复：原本要标记「${itemTitle}」完成，但当前清单里还没有这条条目；先补建为未完成条目，确认后可继续标记完成。`,
    groupTitle,
    itemTitle,
  };
  const summary = `没找到要完成的清单项「${itemTitle}」，改为先补建这条计划项。`;

  return {
    failureKind: "missing_checklist_item",
    plan: {
      mode: "compound",
      reasoning: `语义修复：${summary}`,
      tasks: [
        {
          agentRole: "query",
          args: {
            answer: `语义修复：${summary}我会先提出追加条目的确认动作，避免直接重复失败的完成操作。`,
          },
          dependsOn: [],
          id: explainTaskId,
          intent: "answer_question",
          label: "说明清单项缺失修复",
        },
        {
          agentRole: "plan",
          args: appendArgs,
          dependsOn: [explainTaskId],
          id: appendTaskId,
          intent: "append_plan_item",
          label: `补建清单项「${itemTitle}」`,
        },
      ],
    },
    reason: failureReason,
    summary,
  };
};

export const buildToolFailureRepairPlan = (input: ToolFailureRepairInput): ToolFailureRepairPlan | null =>
  buildMissingChecklistItemRepair(input);
