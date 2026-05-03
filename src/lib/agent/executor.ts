import { evaluatePlanFromIntent } from "./evaluation";
import { queryProgressFromIntent } from "./progress";
import type { AgentIntent, AgentTraceStep } from "./schemas";
import {
  addCompletionNoteFromIntent,
  appendPlanItemFromIntent,
  completePlanItemFromIntent,
  createPlanFromIntent,
} from "./tools";

type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;

export const executeAgentIntent = async (intent: AgentIntent, onTrace?: AgentExecutionTraceReporter) => {
  switch (intent.intent) {
    case "answer_question":
      onTrace?.({
        detail: intent.args.suggestAction ?? "这轮只生成回答，不写入计划、清单或审计数据。",
        id: "workflow-answer-question",
        kind: "analysis",
        status: "done",
        title: "已切换到直接回答流程",
      });

      return {
        assistantMessage: intent.reply ?? intent.args.answer,
        pendingAction: null,
      };
    case "create_plan":
      return createPlanFromIntent(intent.args, onTrace);
    case "append_plan_item":
      return appendPlanItemFromIntent(intent.args, onTrace);
    case "complete_plan_item":
      return completePlanItemFromIntent(intent.args, onTrace);
    case "add_completion_note":
      return addCompletionNoteFromIntent(intent.args, onTrace);
    case "query_progress":
      onTrace?.({
        detail: intent.args.checklistTitle ? `目标清单：${intent.args.checklistTitle}` : "范围：整体进度",
        id: "workflow-query-progress",
        kind: "analysis",
        status: "done",
        title: "已切换到进度查询流程",
      });
      return queryProgressFromIntent(intent.args);
    case "evaluate_plan":
      onTrace?.({
        detail: intent.args.planTitle ? `目标计划：${intent.args.planTitle}` : "范围：全部计划",
        id: "workflow-evaluate-plan",
        kind: "analysis",
        status: "done",
        title: "已切换到计划评估流程",
      });
      return evaluatePlanFromIntent(intent.args);
    case "clarify":
    default:
      return {
        assistantMessage: intent.reply ?? intent.args.question,
        pendingAction: null,
      };
  }
};
