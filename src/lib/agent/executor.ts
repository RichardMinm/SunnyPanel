import { evaluatePlanFromIntent } from "./evaluation";
import { groupTasksIntoParallelLayers } from "./orchestration/parallel-layers";
import type { TaskNode } from "./orchestration/types";
import { queryProgressFromIntent } from "./progress";
import { parseAgentIntentResult, type AgentIntent, type AgentTraceStep } from "./schemas";
import { executeAgentTool } from "./tool-registry";
import { executeWeeklyReviewFromIntent } from "./workflows/weekly-review-server";
import {
  addCompletionNoteFromIntent,
  appendPlanItemFromIntent,
  cancelScheduleItemFromIntent,
  composePlanFromIntent,
  composeScheduleItemFromIntent,
  composeTimelineEventFromIntent,
  completePlanItemFromIntent,
  createPlanFromIntent,
  queryPlanProgressFromIntent,
  rescheduleItemFromIntent,
  saveMemoryFromIntent,
  schedulePlanFromIntent,
} from "./tools";

type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;

export type AgentIntentExecutionResult = {
  assistantMessage: string;
  pendingAction: null | import("./schemas").PendingAction;
  rollbackPayload?: unknown;
};

const toolExecutors = {
  addCompletionNote: addCompletionNoteFromIntent,
  appendPlanItem: appendPlanItemFromIntent,
  cancelScheduleItem: cancelScheduleItemFromIntent,
  composePlan: composePlanFromIntent,
  composeScheduleItem: composeScheduleItemFromIntent,
  composeTimelineEvent: composeTimelineEventFromIntent,
  completePlanItem: completePlanItemFromIntent,
  createPlan: createPlanFromIntent,
  queryPlanProgress: queryPlanProgressFromIntent,
  rescheduleItem: rescheduleItemFromIntent,
  saveMemory: saveMemoryFromIntent,
  schedulePlan: schedulePlanFromIntent,
  weeklyReview: executeWeeklyReviewFromIntent,
};

const checklistMutationIntents = new Set<AgentIntent["intent"]>([
  "add_completion_note",
  "append_plan_item",
  "complete_plan_item",
]);

const getChecklistKey = (intent: AgentIntent): null | string => {
  if (!checklistMutationIntents.has(intent.intent)) {
    return null;
  }

  const args = intent.args as { checklistTitle?: string };

  return typeof args.checklistTitle === "string" && args.checklistTitle.trim().length > 0
    ? args.checklistTitle.trim().toLowerCase()
    : null;
};

const groupIntentsForParallelExecution = (intents: AgentIntent[]) => {
  const groups: Array<{ checklistKey: null | string; intents: AgentIntent[] }> = [];
  const groupIndex = new Map<null | string, number>();

  for (const intent of intents) {
    const checklistKey = getChecklistKey(intent);
    const existingIndex = groupIndex.get(checklistKey);

    if (existingIndex === undefined) {
      groupIndex.set(checklistKey, groups.length);
      groups.push({ checklistKey, intents: [intent] });
    } else {
      groups[existingIndex]!.intents.push(intent);
    }
  }

  return groups;
};

export const executeAgentIntentsParallel = async (
  intents: AgentIntent[],
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentIntentExecutionResult> => {
  if (intents.length <= 1) {
    const single = intents[0];

    return single ? executeAgentIntent(single, onTrace) : { assistantMessage: "", pendingAction: null };
  }

  const groups = groupIntentsForParallelExecution(intents);
  const messages: string[] = [];
  let pendingAction: AgentIntentExecutionResult["pendingAction"] = null;
  let rollbackPayload: unknown;

  for (const group of groups) {
    if (group.checklistKey) {
      for (const [index, intent] of group.intents.entries()) {
        const result = await executeAgentIntent(intent, (step) =>
          onTrace?.({
            ...step,
            id: `${step.id}-serial-${index}`,
          }),
        );
        messages.push(result.assistantMessage);

        if (result.pendingAction) {
          pendingAction = result.pendingAction;
        }

        if ("rollbackPayload" in result && result.rollbackPayload) {
          rollbackPayload = result.rollbackPayload;
        }
      }

      continue;
    }

    const results = await Promise.all(
      group.intents.map((intent, index) =>
        executeAgentIntent(intent, (step) =>
          onTrace?.({
            ...step,
            id: `${step.id}-parallel-${index}`,
          }),
        ),
      ),
    );

    for (const result of results) {
      messages.push(result.assistantMessage);

      if (result.pendingAction) {
        pendingAction = result.pendingAction;
      }

      if ("rollbackPayload" in result && result.rollbackPayload) {
        rollbackPayload = result.rollbackPayload;
      }
    }
  }

  return {
    assistantMessage: messages.filter(Boolean).join("\n\n"),
    pendingAction,
    rollbackPayload,
  };
};

export const executeOrchestrationTaskGraph = async (
  tasks: TaskNode[],
  executeIntent: (intent: AgentIntent) => Promise<AgentIntentExecutionResult>,
) => {
  const { layers } = groupTasksIntoParallelLayers(tasks);
  const messages: string[] = [];
  let pendingAction: AgentIntentExecutionResult["pendingAction"] = null;

  for (const layer of layers) {
    const layerIntents = layer
      .map((task) =>
        parseAgentIntentResult({
          args: task.args,
          confidence: 0.9,
          intent: task.intent,
        }),
      )
      .filter((intent): intent is AgentIntent => intent !== null);

    const layerResults = await Promise.all(layerIntents.map((intent) => executeIntent(intent)));

    for (const result of layerResults) {
      messages.push(result.assistantMessage);

      if (result.pendingAction) {
        pendingAction = result.pendingAction;
      }
    }
  }

  return {
    assistantMessage: messages.filter(Boolean).join("\n\n"),
    pendingAction,
  };
};

export const executeAgentIntent = async (
  intent: AgentIntent,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentIntentExecutionResult> => {
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
    case "cancel_schedule_item":
    case "compose_schedule_item":
    case "compose_timeline_event":
    case "add_completion_note":
    case "query_plan_progress":
    case "reschedule_item":
    case "save_memory":
    case "schedule_plan":
    case "weekly_review":
      return executeAgentTool(intent, toolExecutors, onTrace);
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
