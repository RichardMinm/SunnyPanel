import type { Plan } from "@/payload-types";

export type AgentChatMessage = {
  content: string;
  role: "assistant" | "user";
};

export type PendingAction = {
  checklistTitle: string;
  groupTitle?: null | string;
  itemTitle: string;
  type: "await_completion_note";
} | {
  args: Partial<AppendPlanItemArgs | CompletePlanItemArgs | CreatePlanArgs>;
  intent: Extract<AgentIntent["intent"], "append_plan_item" | "complete_plan_item" | "create_plan">;
  missingFields: string[];
  question: string;
  type: "await_clarification";
};

export type CreatePlanArgs = {
  agentBrief?: null | string;
  description?: null | string;
  dueDate?: null | string;
  executionMode?: NonNullable<Plan["executionMode"]>;
  priority?: NonNullable<Plan["priority"]>;
  state?: NonNullable<Plan["state"]>;
  title: string;
};

export type AppendPlanItemArgs = {
  checklistTitle: string;
  description?: null | string;
  groupTitle?: null | string;
  itemTitle: string;
};

export type CompletePlanItemArgs = {
  checklistTitle: string;
  completedAt?: null | string;
  completionNote?: null | string;
  groupTitle?: null | string;
  itemTitle: string;
};

export type AddCompletionNoteArgs = {
  checklistTitle: string;
  completionNote: string;
  groupTitle?: null | string;
  itemTitle: string;
};

export type ClarifyArgs = {
  missingFields?: string[];
  question: string;
};

export type QueryProgressArgs = {
  checklistTitle?: null | string;
  scope?: "all" | "checklists" | "plans";
};

export type EvaluatePlanArgs = {
  planId?: null | number;
  planTitle?: null | string;
};

export type AnswerQuestionArgs = {
  answer: string;
  suggestAction?: null | string;
};

export type AgentIntent =
  | {
      args: AnswerQuestionArgs;
      confidence?: number;
      intent: "answer_question";
      reply?: string;
    }
  | {
      args: AddCompletionNoteArgs;
      confidence?: number;
      intent: "add_completion_note";
      reply?: string;
    }
  | {
      args: AppendPlanItemArgs;
      confidence?: number;
      intent: "append_plan_item";
      reply?: string;
    }
  | {
      args: ClarifyArgs;
      confidence?: number;
      intent: "clarify";
      reply?: string;
    }
  | {
      args: CompletePlanItemArgs;
      confidence?: number;
      intent: "complete_plan_item";
      reply?: string;
    }
  | {
      args: CreatePlanArgs;
      confidence?: number;
      intent: "create_plan";
      reply?: string;
    }
  | {
      args: EvaluatePlanArgs;
      confidence?: number;
      intent: "evaluate_plan";
      reply?: string;
    }
  | {
      args: QueryProgressArgs;
      confidence?: number;
      intent: "query_progress";
      reply?: string;
    };

export type AgentEngine = "glm" | "heuristic" | "workflow";

export type AgentTokenUsage = {
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  providerInputTokens?: number;
  providerOutputTokens?: number;
  providerTotalTokens?: number;
  source: "estimate" | "provider";
  totalTokens: number;
};

export type AgentChatResponse = {
  assistantMessage: string;
  confidence?: number;
  engine: AgentEngine;
  intent: AgentIntent["intent"];
  pendingAction: null | PendingAction;
  trace?: AgentTraceStep[];
  threadId?: number;
  tokenUsage?: AgentTokenUsage;
};

export type AgentTraceStep = {
  detail?: string;
  id: string;
  kind: "action" | "analysis" | "complete" | "context" | "error" | "write";
  status: "done" | "error" | "running";
  title: string;
};

const planPriorityValues = ["high", "low", "medium"] as const;
const planStateValues = ["active", "backlog", "done", "paused"] as const;
const executionModeValues = ["agent", "hybrid", "manual"] as const;
const progressScopeValues = ["all", "checklists", "plans"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getOptionalEnum = <TOption extends readonly string[]>(
  value: unknown,
  options: TOption,
): TOption[number] | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  return options.includes(value) ? (value as TOption[number]) : undefined;
};

const getOptionalString = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
};

const getRequiredString = (value: unknown) => {
  const normalized = getOptionalString(value);

  return normalized && normalized.length > 0 ? normalized : null;
};

const getOptionalDateString = (value: unknown) => {
  const normalized = getOptionalString(value);

  if (!normalized) {
    return undefined;
  }

  return Number.isNaN(Date.parse(normalized)) ? undefined : normalized;
};

const getOptionalNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const getConfidence = (value: unknown) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
};

export const sanitizeChatMessages = (value: unknown): AgentChatMessage[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const content = getRequiredString(item.content);
      const role = item.role === "assistant" || item.role === "user" ? item.role : null;

      if (!content || !role) {
        return null;
      }

      return {
        content,
        role,
      } satisfies AgentChatMessage;
    })
    .filter((item): item is AgentChatMessage => Boolean(item))
    .slice(-12);
};

export const parsePendingAction = (value: unknown): null | PendingAction => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "await_completion_note") {
    const checklistTitle = getRequiredString(value.checklistTitle);
    const itemTitle = getRequiredString(value.itemTitle);

    if (!checklistTitle || !itemTitle) {
      return null;
    }

    return {
      checklistTitle,
      groupTitle: getOptionalString(value.groupTitle) ?? null,
      itemTitle,
      type: "await_completion_note",
    };
  }

  if (value.type !== "await_clarification" || !isRecord(value.args)) {
    return null;
  }

  const question = getRequiredString(value.question);
  const intent =
    value.intent === "append_plan_item" || value.intent === "complete_plan_item" || value.intent === "create_plan"
      ? value.intent
      : null;

  if (!question || !intent) {
    return null;
  }

  return {
    args: value.args as Partial<AppendPlanItemArgs | CompletePlanItemArgs | CreatePlanArgs>,
    intent,
    missingFields: Array.isArray(value.missingFields)
      ? value.missingFields.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [],
    question,
    type: "await_clarification",
  };
};

export const createClarifyIntent = (question: string, missingFields: string[] = []): AgentIntent => ({
  args: {
    missingFields,
    question,
  },
  intent: "clarify",
});

export const parseAgentIntentResult = (value: unknown): AgentIntent | null => {
  if (!isRecord(value) || typeof value.intent !== "string" || !isRecord(value.args)) {
    return null;
  }

  const confidence = getConfidence(value.confidence);
  const reply = getOptionalString(value.reply);

  switch (value.intent) {
    case "answer_question": {
      const answer = getRequiredString(value.args.answer) ?? reply;

      if (!answer) {
        return null;
      }

      return {
        args: {
          answer,
          suggestAction: getOptionalString(value.args.suggestAction) ?? null,
        },
        confidence,
        intent: "answer_question",
        reply,
      };
    }
    case "create_plan": {
      const title = getRequiredString(value.args.title);

      if (!title) {
        return null;
      }

      return {
        args: {
          agentBrief: getOptionalString(value.args.agentBrief) ?? null,
          description: getOptionalString(value.args.description) ?? null,
          dueDate: getOptionalDateString(value.args.dueDate) ?? null,
          executionMode: getOptionalEnum(value.args.executionMode, executionModeValues),
          priority: getOptionalEnum(value.args.priority, planPriorityValues),
          state: getOptionalEnum(value.args.state, planStateValues),
          title,
        },
        confidence,
        intent: "create_plan",
        reply,
      };
    }
    case "append_plan_item": {
      const checklistTitle = getRequiredString(value.args.checklistTitle);
      const itemTitle = getRequiredString(value.args.itemTitle);

      if (!checklistTitle || !itemTitle) {
        return null;
      }

      return {
        args: {
          checklistTitle,
          description: getOptionalString(value.args.description) ?? null,
          groupTitle: getOptionalString(value.args.groupTitle) ?? null,
          itemTitle,
        },
        confidence,
        intent: "append_plan_item",
        reply,
      };
    }
    case "complete_plan_item": {
      const checklistTitle = getRequiredString(value.args.checklistTitle);
      const itemTitle = getRequiredString(value.args.itemTitle);

      if (!checklistTitle || !itemTitle) {
        return null;
      }

      return {
        args: {
          checklistTitle,
          completedAt: getOptionalDateString(value.args.completedAt) ?? null,
          completionNote: getOptionalString(value.args.completionNote) ?? null,
          groupTitle: getOptionalString(value.args.groupTitle) ?? null,
          itemTitle,
        },
        confidence,
        intent: "complete_plan_item",
        reply,
      };
    }
    case "add_completion_note": {
      const checklistTitle = getRequiredString(value.args.checklistTitle);
      const itemTitle = getRequiredString(value.args.itemTitle);
      const completionNote = getRequiredString(value.args.completionNote);

      if (!checklistTitle || !itemTitle || !completionNote) {
        return null;
      }

      return {
        args: {
          checklistTitle,
          completionNote,
          groupTitle: getOptionalString(value.args.groupTitle) ?? null,
          itemTitle,
        },
        confidence,
        intent: "add_completion_note",
        reply,
      };
    }
    case "query_progress":
      return {
        args: {
          checklistTitle: getOptionalString(value.args.checklistTitle) ?? null,
          scope: getOptionalEnum(value.args.scope, progressScopeValues) ?? "all",
        },
        confidence,
        intent: "query_progress",
        reply,
      };
    case "evaluate_plan":
      return {
        args: {
          planId: getOptionalNumber(value.args.planId) ?? null,
          planTitle: getOptionalString(value.args.planTitle) ?? null,
        },
        confidence,
        intent: "evaluate_plan",
        reply,
      };
    case "clarify": {
      const question = getRequiredString(value.args.question) ?? reply;

      if (!question) {
        return null;
      }

      return {
        args: {
          missingFields: Array.isArray(value.args.missingFields)
            ? value.args.missingFields.filter((item): item is string => typeof item === "string" && item.length > 0)
            : [],
          question,
        },
        confidence,
        intent: "clarify",
        reply,
      };
    }
    default:
      return null;
  }
};

export const extractJSONObject = (value: string) => {
  const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fencedMatch?.[1] ?? value;
  const startIndex = source.indexOf("{");
  const endIndex = source.lastIndexOf("}");

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return null;
  }

  return source.slice(startIndex, endIndex + 1);
};
