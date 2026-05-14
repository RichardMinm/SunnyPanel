import { evaluatePlanFromIntent } from "./evaluation";
import { queryProgressFromIntent } from "./progress";
import { type AgentIntent, type AgentTraceStep } from "./schemas";
import { executeAgentTool } from "./tool-registry";
import { executeWeeklyReviewFromIntent } from "./workflows/weekly-review-server";
import {
  addCompletionNoteFromIntent,
  appendPlanItemFromIntent,
  composePlanFromIntent,
  composeScheduleItemFromIntent,
  composeTimelineEventFromIntent,
  completePlanItemFromIntent,
  createPlanFromIntent,
  saveMemoryFromIntent,
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
    case "append_plan_item":
    case "complete_plan_item":
    case "compose_plan":
    case "compose_schedule_item":
    case "compose_timeline_event":
    case "add_completion_note":
    case "save_memory":
    case "weekly_review":
      return executeAgentTool(
        intent,
        {
          addCompletionNote: addCompletionNoteFromIntent,
          appendPlanItem: appendPlanItemFromIntent,
          composePlan: composePlanFromIntent,
          composeScheduleItem: composeScheduleItemFromIntent,
          composeTimelineEvent: composeTimelineEventFromIntent,
          completePlanItem: completePlanItemFromIntent,
          createPlan: createPlanFromIntent,
          saveMemory: saveMemoryFromIntent,
          weeklyReview: executeWeeklyReviewFromIntent,
        },
        onTrace,
      );
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
