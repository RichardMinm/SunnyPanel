import type { AgentPromptContext } from "./prompts";
import {
  cleanupText,
  inferMemoryType,
  isBatchConfirmationReply,
  isCancellationReply,
  isConfirmationReply,
  isNegativeReply,
  isNewCommand,
  parseKnowledgeAnswerIntent,
  shouldSkipPendingAction,
} from "./heuristic-intent-resolver";
import {
  createClarifyIntent,
  type AgentChatMessage,
  type AgentEngine,
  type AgentIntent,
  type AgentTokenUsage,
  type PendingAction,
} from "./schemas";

export type AgentModelIntentResolver = (input: {
  context: AgentPromptContext;
  history: AgentChatMessage[];
  message: string;
}) => Promise<null | {
  intent: AgentIntent;
  tokenUsage?: AgentTokenUsage;
}>;

export {
  isBatchConfirmationReply,
  isCancellationReply,
  isConfirmationReply,
  isNegativeReply,
  shouldSkipPendingAction,
};

const resolveClarificationIntent = (pendingAction: PendingAction, message: string): AgentIntent | null => {
  if (pendingAction.type !== "await_clarification" || isNegativeReply(message) || isNewCommand(message)) {
    return null;
  }

  const answer = cleanupText(message);

  if (!answer) {
    return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
  }

  const nextArgs: Record<string, unknown> = {
    ...pendingAction.args,
  };

  for (const field of pendingAction.missingFields) {
    if (!(field in nextArgs)) {
      nextArgs[field as keyof typeof nextArgs] = answer as never;
      break;
    }
  }

  if (pendingAction.intent === "compose_plan") {
    return {
      args: {
        agentBrief: typeof nextArgs.agentBrief === "string" ? nextArgs.agentBrief : null,
        goal: typeof nextArgs.goal === "string" ? nextArgs.goal : answer,
        motivation: typeof nextArgs.motivation === "string" ? nextArgs.motivation : null,
        outOfScope: typeof nextArgs.outOfScope === "string" ? nextArgs.outOfScope : null,
        scope: typeof nextArgs.scope === "string" ? nextArgs.scope : null,
        sourceText: pendingAction.originalMessage
          ? `${pendingAction.originalMessage}；${answer}`
          : typeof nextArgs.sourceText === "string"
            ? `${nextArgs.sourceText}；${answer}`
            : answer,
        suggestedDueDate: typeof nextArgs.suggestedDueDate === "string" ? nextArgs.suggestedDueDate : null,
        suggestedPriority:
          nextArgs.suggestedPriority === "high" || nextArgs.suggestedPriority === "medium" || nextArgs.suggestedPriority === "low"
            ? nextArgs.suggestedPriority
            : undefined,
        title: typeof nextArgs.title === "string" ? nextArgs.title : null,
      },
      confidence: 1,
      intent: "compose_plan",
    };
  }

  if (pendingAction.intent === "compose_schedule_item") {
    return {
      args: {
        date: typeof nextArgs.date === "string" ? nextArgs.date : null,
        description: typeof nextArgs.description === "string" ? nextArgs.description : null,
        endTime: typeof nextArgs.endTime === "string" ? nextArgs.endTime : null,
        isAllDay: typeof nextArgs.isAllDay === "boolean" ? nextArgs.isAllDay : undefined,
        priority: nextArgs.priority === "high" || nextArgs.priority === "medium" || nextArgs.priority === "low" ? nextArgs.priority : undefined,
        reason: typeof nextArgs.reason === "string" ? nextArgs.reason : null,
        relatedChecklistId: typeof nextArgs.relatedChecklistId === "number" ? nextArgs.relatedChecklistId : null,
        relatedChecklistItemKey: typeof nextArgs.relatedChecklistItemKey === "string" ? nextArgs.relatedChecklistItemKey : null,
        relatedPlanId: typeof nextArgs.relatedPlanId === "number" ? nextArgs.relatedPlanId : null,
        sourceText: typeof nextArgs.sourceText === "string" ? `${nextArgs.sourceText}；${answer}` : answer,
        sourceType:
          nextArgs.sourceType === "agent" ||
          nextArgs.sourceType === "checklist" ||
          nextArgs.sourceType === "manual" ||
          nextArgs.sourceType === "plan"
            ? nextArgs.sourceType
            : null,
        startTime: typeof nextArgs.startTime === "string" ? nextArgs.startTime : null,
        title: typeof nextArgs.title === "string" ? nextArgs.title : null,
      },
      confidence: 1,
      intent: "compose_schedule_item",
    };
  }

  if (pendingAction.intent === "append_plan_item") {
    const checklistTitle = typeof nextArgs.checklistTitle === "string" ? nextArgs.checklistTitle : null;
    const itemTitle = typeof nextArgs.itemTitle === "string" ? nextArgs.itemTitle : null;

    if (!checklistTitle || !itemTitle) {
      return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
    }

    return {
      args: {
        checklistTitle,
        description: typeof nextArgs.description === "string" ? nextArgs.description : null,
        groupTitle: typeof nextArgs.groupTitle === "string" ? nextArgs.groupTitle : null,
        itemTitle,
      },
      confidence: 1,
      intent: "append_plan_item",
    };
  }

  if (pendingAction.intent === "complete_plan_item") {
    const checklistTitle = typeof nextArgs.checklistTitle === "string" ? nextArgs.checklistTitle : null;
    const itemTitle = typeof nextArgs.itemTitle === "string" ? nextArgs.itemTitle : null;

    if (!checklistTitle || !itemTitle) {
      return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
    }

    return {
      args: {
        checklistTitle,
        completedAt: typeof nextArgs.completedAt === "string" ? nextArgs.completedAt : null,
        completionNote: typeof nextArgs.completionNote === "string" ? nextArgs.completionNote : null,
        groupTitle: typeof nextArgs.groupTitle === "string" ? nextArgs.groupTitle : null,
        itemTitle,
      },
      confidence: 1,
      intent: "complete_plan_item",
    };
  }

  if (pendingAction.intent === "add_completion_note") {
    const checklistTitle = typeof nextArgs.checklistTitle === "string" ? nextArgs.checklistTitle : null;
    const itemTitle = typeof nextArgs.itemTitle === "string" ? nextArgs.itemTitle : null;
    const completionNote = typeof nextArgs.completionNote === "string" ? nextArgs.completionNote : null;

    if (!checklistTitle || !itemTitle || !completionNote) {
      return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
    }

    return {
      args: {
        checklistTitle,
        completionNote,
        groupTitle: typeof nextArgs.groupTitle === "string" ? nextArgs.groupTitle : null,
        itemTitle,
      },
      confidence: 1,
      intent: "add_completion_note",
    };
  }

  if (pendingAction.intent === "save_memory") {
    const content = typeof nextArgs.content === "string" ? nextArgs.content : answer;

    if (!content) {
      return createClarifyIntent(pendingAction.question, pendingAction.missingFields);
    }

    return {
      args: {
        confidence: typeof nextArgs.confidence === "number" ? nextArgs.confidence : 0.7,
        content,
        title: typeof nextArgs.title === "string" ? nextArgs.title : null,
        type:
          nextArgs.type === "preference" ||
          nextArgs.type === "project_context" ||
          nextArgs.type === "writing_style" ||
          nextArgs.type === "workflow_rule" ||
          nextArgs.type === "fact"
            ? nextArgs.type
            : inferMemoryType(content),
      },
      confidence: 1,
      intent: "save_memory",
    };
  }

  const title = typeof nextArgs.title === "string" ? nextArgs.title : answer;

  return {
    args: {
      agentBrief: typeof nextArgs.agentBrief === "string" ? nextArgs.agentBrief : null,
      description: typeof nextArgs.description === "string" ? nextArgs.description : null,
      dueDate: typeof nextArgs.dueDate === "string" ? nextArgs.dueDate : null,
      executionMode:
        nextArgs.executionMode === "agent" || nextArgs.executionMode === "hybrid" || nextArgs.executionMode === "manual"
          ? nextArgs.executionMode
          : undefined,
      priority: nextArgs.priority === "high" || nextArgs.priority === "medium" || nextArgs.priority === "low" ? nextArgs.priority : undefined,
      state:
        nextArgs.state === "active" || nextArgs.state === "backlog" || nextArgs.state === "done" || nextArgs.state === "paused"
          ? nextArgs.state
          : undefined,
      title,
    },
    confidence: 1,
    intent: "create_plan",
  };
};

export const resolveAgentIntent = async ({
  context,
  history,
  intentModelEngine,
  message,
  modelResolver,
  pendingAction,
}: {
  context: AgentPromptContext;
  history: AgentChatMessage[];
  intentModelEngine?: AgentEngine;
  message: string;
  modelResolver?: AgentModelIntentResolver;
  pendingAction: null | PendingAction;
}) => {
  if (pendingAction?.type === "await_clarification") {
    const clarificationIntent = resolveClarificationIntent(pendingAction, message);

    if (clarificationIntent) {
      return {
        engine: "workflow" as const,
        intent: clarificationIntent,
      };
    }
  }

  if (pendingAction?.type === "await_completion_note" && !isNegativeReply(message) && !isNewCommand(message)) {
    return {
      engine: "workflow" as const,
      intent: {
        args: {
          checklistTitle: pendingAction.checklistTitle,
          completionNote: cleanupText(message),
          groupTitle: pendingAction.groupTitle ?? null,
          itemTitle: pendingAction.itemTitle,
        },
        confidence: 1,
        intent: "add_completion_note" as const,
      },
    };
  }

  const deterministicKnowledgeIntent = parseKnowledgeAnswerIntent(message);

  if (deterministicKnowledgeIntent) {
    return {
      engine: "heuristic" as const,
      intent: deterministicKnowledgeIntent,
    };
  }

  const { resolveUnifiedIntent } = await import("./intent/llm-unified");

  return resolveUnifiedIntent({
    context,
    history,
    intentModelEngine,
    message,
    modelResolver,
  });
};
