import type { AgentRun, AgentThread, Checklist, Plan, PlanReview, TimelineEvent } from "@/payload-types";

type AgentRunRelatedContent = NonNullable<AgentRun["relatedContent"]>;

const planPriorityValues = ["high", "low", "medium"] as const;
const planStateValues = ["active", "backlog", "done", "paused"] as const;
const planStatusValues = ["draft", "published"] as const;
const planExecutionModeValues = ["agent", "hybrid", "manual"] as const;
const planAgentStateValues = ["blocked", "idle", "ready", "review", "running"] as const;
const visibilityValues = ["private", "public"] as const;
const timelineTypeValues = ["life", "milestone", "project"] as const;
const agentRunStatusValues = ["canceled", "failed", "queued", "running", "succeeded"] as const;
const agentRunWorkflowValues = [
  "automation",
  "content-draft",
  "planning",
  "publishing-review",
  "readiness-audit",
  "sync",
] as const;
const planReviewScopeValues = ["overall", "plan"] as const;
const planReviewHealthValues = ["attention", "healthy", "risk"] as const;
const planReviewSourceValues = ["agent", "manual"] as const;
const agentThreadStatusValues = ["active", "closed"] as const;
const agentIntentValues = [
  "add_completion_note",
  "append_plan_item",
  "clarify",
  "complete_plan_item",
  "create_plan",
  "evaluate_plan",
  "query_progress",
] as const;
const agentEngineValues = ["glm", "heuristic", "workflow"] as const;
const relatedContentRelationValues = [
  "checklists",
  "notes",
  "pages",
  "plan-reviews",
  "posts",
  "timeline-events",
  "updates",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Agent write validation failed: ${fieldName} is required.`);
  }

  return value.trim();
};

const getOptionalString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
};

const getNumber = (value: unknown, fieldName: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Agent write validation failed: ${fieldName} must be a number.`);
  }

  return value;
};

const getOptionalNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

const getBoolean = (value: unknown, fieldName: string) => {
  if (typeof value !== "boolean") {
    throw new Error(`Agent write validation failed: ${fieldName} must be a boolean.`);
  }

  return value;
};

const getDateString = (value: unknown, fieldName: string) => {
  const normalized = getString(value, fieldName);

  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`Agent write validation failed: ${fieldName} must be a valid date.`);
  }

  return normalized;
};

const getOptionalDateString = (value: unknown) => {
  const normalized = getOptionalString(value);

  if (!normalized) {
    return null;
  }

  return Number.isNaN(Date.parse(normalized)) ? null : normalized;
};

const getEnum = <TValue extends readonly string[]>(value: unknown, options: TValue, fieldName: string): TValue[number] => {
  if (typeof value !== "string" || !options.includes(value)) {
    throw new Error(`Agent write validation failed: ${fieldName} is invalid.`);
  }

  return value as TValue[number];
};

const getOptionalEnum = <TValue extends readonly string[]>(value: unknown, options: TValue): TValue[number] | undefined => {
  if (typeof value !== "string" || !options.includes(value)) {
    return undefined;
  }

  return value as TValue[number];
};

export const validatePlanCreateData = (value: unknown) => {
  if (!isRecord(value)) {
    throw new Error("Agent write validation failed: plan data must be an object.");
  }

  return {
    agentBrief: getOptionalString(value.agentBrief),
    agentState: getEnum(value.agentState, planAgentStateValues, "agentState"),
    description: getOptionalString(value.description),
    dueDate: getOptionalDateString(value.dueDate),
    executionMode: getEnum(value.executionMode, planExecutionModeValues, "executionMode"),
    priority: getEnum(value.priority, planPriorityValues, "priority"),
    state: getEnum(value.state, planStateValues, "state"),
    status: getEnum(value.status, planStatusValues, "status"),
    title: getString(value.title, "title"),
    visibility: getEnum(value.visibility, visibilityValues, "visibility"),
  } satisfies Partial<Plan>;
};

export const validateChecklistGroupsData = (value: unknown): NonNullable<Checklist["groups"]> => {
  if (!Array.isArray(value)) {
    throw new Error("Agent write validation failed: checklist groups must be an array.");
  }

  return value.map((group, groupIndex) => {
    if (!isRecord(group)) {
      throw new Error(`Agent write validation failed: groups.${groupIndex} must be an object.`);
    }

    const items = Array.isArray(group.items) ? group.items : [];

    return {
      ...(getOptionalString(group.id) ? { id: getOptionalString(group.id) ?? undefined } : {}),
      items: items.map((item, itemIndex) => {
        if (!isRecord(item)) {
          throw new Error(`Agent write validation failed: groups.${groupIndex}.items.${itemIndex} must be an object.`);
        }

        return {
          ...(getOptionalString(item.id) ? { id: getOptionalString(item.id) ?? undefined } : {}),
          completedAt: getOptionalDateString(item.completedAt),
          completionNote: getOptionalString(item.completionNote),
          description: getOptionalString(item.description),
          isCompleted: Boolean(item.isCompleted),
          title: getString(item.title, `groups.${groupIndex}.items.${itemIndex}.title`),
        };
      }),
      title: getString(group.title, `groups.${groupIndex}.title`),
    };
  });
};

export const validateTimelineEventData = (value: unknown) => {
  if (!isRecord(value)) {
    throw new Error("Agent write validation failed: timeline event data must be an object.");
  }

  return {
    description: getOptionalString(value.description),
    eventDate: getDateString(value.eventDate, "eventDate"),
    isFeatured: getBoolean(value.isFeatured, "isFeatured"),
    relatedChecklist: getNumber(value.relatedChecklist, "relatedChecklist"),
    relatedTaskKey: getString(value.relatedTaskKey, "relatedTaskKey"),
    sortOrder: getNumber(value.sortOrder, "sortOrder"),
    status: getEnum(value.status, planStatusValues, "status"),
    title: getString(value.title, "title"),
    type: getEnum(value.type, timelineTypeValues, "type"),
    visibility: getEnum(value.visibility, visibilityValues, "visibility"),
  } satisfies Partial<TimelineEvent>;
};

const validateRelatedContent = (value: unknown): AgentRunRelatedContent | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("Agent write validation failed: relatedContent must be an array.");
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Agent write validation failed: relatedContent.${index} must be an object.`);
    }

    return {
      relationTo: getEnum(item.relationTo, relatedContentRelationValues, `relatedContent.${index}.relationTo`),
      value: getNumber(item.value, `relatedContent.${index}.value`),
    };
  }) as AgentRunRelatedContent;
};

export const validateAgentRunData = (value: unknown) => {
  if (!isRecord(value)) {
    throw new Error("Agent write validation failed: agent run data must be an object.");
  }

  const steps = Array.isArray(value.steps) ? value.steps : [];

  return {
    completedAt: getOptionalDateString(value.completedAt),
    goal: getOptionalString(value.goal),
    nextAction: getOptionalString(value.nextAction),
    relatedContent: validateRelatedContent(value.relatedContent),
    relatedPlan: getOptionalNumber(value.relatedPlan),
    startedAt: getOptionalDateString(value.startedAt),
    status: getEnum(value.status, agentRunStatusValues, "status"),
    steps: steps.map((step, index) => {
      if (!isRecord(step)) {
        throw new Error(`Agent write validation failed: steps.${index} must be an object.`);
      }

      return {
        level: getEnum(step.level, ["error", "info", "warn"] as const, `steps.${index}.level`),
        message: getString(step.message, `steps.${index}.message`),
        recordedAt: getOptionalDateString(step.recordedAt),
      };
    }),
    summary: getOptionalString(value.summary),
    title: getString(value.title, "title"),
    trigger: getEnum(value.trigger, ["agent", "manual", "scheduled", "webhook"] as const, "trigger"),
    workflow: getEnum(value.workflow, agentRunWorkflowValues, "workflow"),
  } satisfies Partial<AgentRun>;
};

export const validatePlanReviewData = (value: unknown) => {
  if (!isRecord(value)) {
    throw new Error("Agent write validation failed: plan review data must be an object.");
  }

  const recommendations = Array.isArray(value.recommendations) ? value.recommendations : [];

  return {
    health: getEnum(value.health, planReviewHealthValues, "health"),
    metrics: isRecord(value.metrics) ? value.metrics : {},
    plan: getOptionalNumber(value.plan),
    recommendations: recommendations.map((recommendation, index) => {
      if (!isRecord(recommendation)) {
        throw new Error(`Agent write validation failed: recommendations.${index} must be an object.`);
      }

      return {
        content: getString(recommendation.content, `recommendations.${index}.content`),
      };
    }),
    reviewedAt: getDateString(value.reviewedAt, "reviewedAt"),
    scope: getEnum(value.scope, planReviewScopeValues, "scope"),
    source: getEnum(value.source, planReviewSourceValues, "source"),
    summary: getString(value.summary, "summary"),
    title: getString(value.title, "title"),
  } satisfies Partial<PlanReview>;
};

export const validateAgentThreadData = (value: unknown) => {
  if (!isRecord(value)) {
    throw new Error("Agent write validation failed: agent thread data must be an object.");
  }

  const messages = Array.isArray(value.messages) ? value.messages : [];

  return {
    lastConfidence: value.lastConfidence === null ? null : getOptionalNumber(value.lastConfidence),
    lastEngine: getOptionalEnum(value.lastEngine, agentEngineValues),
    lastIntent: getOptionalEnum(value.lastIntent, agentIntentValues),
    lastInteractionAt: getOptionalDateString(value.lastInteractionAt),
    messages: messages.map((message, index) => {
      if (!isRecord(message)) {
        throw new Error(`Agent write validation failed: messages.${index} must be an object.`);
      }

      return {
        content: getString(message.content, `messages.${index}.content`),
        recordedAt: getOptionalDateString(message.recordedAt),
        role: getEnum(message.role, ["assistant", "user"] as const, `messages.${index}.role`),
      };
    }),
    pendingAction:
      value.pendingAction === null || value.pendingAction === undefined
        ? null
        : isRecord(value.pendingAction) || Array.isArray(value.pendingAction)
          ? value.pendingAction
          : null,
    status: getEnum(value.status, agentThreadStatusValues, "status"),
    title: getOptionalString(value.title) ?? undefined,
    user: getOptionalNumber(value.user),
  } satisfies Partial<AgentThread>;
};
