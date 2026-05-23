import type { AgentRoleArtifactMap, SpecializedAgentRunResult } from "./types";
import type { AgentRole, TaskNode } from "../orchestration/types";

export type AgentBusMessage = {
  from: AgentRole | string;
  payload: AgentRoleArtifactMap[AgentRole] | Record<string, unknown>;
  taskId: string;
  type: "artifact" | "error" | "intent" | "note";
};

export type AgentBusState = {
  messages: AgentBusMessage[];
  results: SpecializedAgentRunResult[];
};

export const createAgentBus = (): AgentBusState => ({
  messages: [],
  results: [],
});

export const publishBusMessage = (bus: AgentBusState, message: AgentBusMessage): AgentBusState => ({
  ...bus,
  messages: [...bus.messages, message].slice(-50),
});

export const publishAgentResult = (
  bus: AgentBusState,
  result: SpecializedAgentRunResult,
): AgentBusState => ({
  ...bus,
  results: [...bus.results, result],
});

export const publishTaskArtifact = <T extends AgentRole>(
  bus: AgentBusState,
  input: {
    from: T;
    payload: AgentRoleArtifactMap[T];
    taskId: string;
  },
): AgentBusState =>
  publishBusMessage(bus, {
    from: input.from,
    payload: input.payload,
    taskId: input.taskId,
    type: "artifact",
  });

const pickNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

export const mergeTaskArgsWithBus = (task: TaskNode, bus: AgentBusState): TaskNode => {
  const upstream = bus.messages.filter(
    (message) => task.dependsOn.includes(message.taskId) && message.type === "artifact",
  );

  if (upstream.length === 0) {
    return task;
  }

  const merged: Record<string, unknown> = { ...task.args };

  for (const message of upstream) {
    const payload = message.payload as Record<string, unknown>;

    const relatedPlanId = pickNumber(payload.relatedPlanId);

    if (relatedPlanId !== undefined) {
      merged.relatedPlanId = relatedPlanId;
    }

    const planId = pickNumber(payload.planId);

    if (planId !== undefined) {
      merged.planId = planId;
    }

    const checklistId = pickNumber(payload.checklistId);

    if (checklistId !== undefined) {
      merged.checklistId = checklistId;
    }

    const scheduleItemIds = payload.scheduleItemIds;

    if (Array.isArray(scheduleItemIds) && scheduleItemIds.length > 0) {
      merged.scheduleItemIds = scheduleItemIds;
    }

    const timelineEventId = pickNumber(payload.timelineEventId);

    if (timelineEventId !== undefined) {
      merged.timelineEventId = timelineEventId;
    }

    const memoryId = pickNumber(payload.memoryId);

    if (memoryId !== undefined) {
      merged.memoryId = memoryId;
    }

    const planTitle = pickString(payload.planTitle);

    if (planTitle && !merged.title) {
      merged.title = planTitle;
    }
  }

  return {
    ...task,
    args: merged,
  };
};
