import type { AgentRoleArtifactMap } from "./types";
import type { AgentRole, TaskNode } from "../orchestration/types";

export type AgentBusMessage = {
  from: AgentRole | string;
  payload: AgentRoleArtifactMap[AgentRole] | Record<string, unknown>;
  /** 语义补充：上游推理/中间产物摘要，供下游 LLM 回灌（artifact/intent/note 通用）。 */
  reasoning?: string;
  taskId: string;
  type: "artifact" | "error" | "intent" | "note";
};

export type AgentBusState = {
  messages: AgentBusMessage[];
};

export const createAgentBus = (): AgentBusState => ({
  messages: [],
});

export const publishBusMessage = (bus: AgentBusState, message: AgentBusMessage): AgentBusState => ({
  ...bus,
  messages: [...bus.messages, message].slice(-50),
});

export const publishTaskArtifact = <T extends AgentRole>(
  bus: AgentBusState,
  input: {
    from: T;
    payload: AgentRoleArtifactMap[T];
    reasoning?: string;
    taskId: string;
  },
): AgentBusState =>
  publishBusMessage(bus, {
    from: input.from,
    payload: input.payload,
    ...(input.reasoning ? { reasoning: input.reasoning } : {}),
    taskId: input.taskId,
    type: "artifact",
  });

/** 发布一条上游推理/说明（note 消息），供下游任务的 LLM 上下文回灌。 */
export const publishTaskNote = (
  bus: AgentBusState,
  input: { from: AgentRole | string; note: string; taskId: string },
): AgentBusState =>
  publishBusMessage(bus, {
    from: input.from,
    payload: { note: input.note },
    reasoning: input.note,
    taskId: input.taskId,
    type: "note",
  });

/** 发布一条上游意图决策（intent 消息），记录上游 Agent 最终选择的意图与理由。 */
export const publishTaskIntent = (
  bus: AgentBusState,
  input: { from: AgentRole | string; intent: string; reasoning?: string; taskId: string },
): AgentBusState =>
  publishBusMessage(bus, {
    from: input.from,
    payload: { intent: input.intent },
    ...(input.reasoning ? { reasoning: input.reasoning } : {}),
    taskId: input.taskId,
    type: "intent",
  });

const pickNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

/**
 * 计算 task 的上游依赖闭包（传递闭包，而非仅直接 dependsOn）。
 * 传入 allTasks 才能解析多级依赖；缺省时退化为直接依赖。
 */
export const resolveUpstreamTaskIds = (task: TaskNode, allTasks?: TaskNode[]): Set<string> => {
  const closure = new Set<string>();

  if (!allTasks || allTasks.length === 0) {
    for (const id of task.dependsOn) {
      closure.add(id);
    }

    return closure;
  }

  const byId = new Map(allTasks.map((node) => [node.id, node]));
  const stack = [...task.dependsOn];

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined || closure.has(current)) {
      continue;
    }

    closure.add(current);
    const upstream = byId.get(current);

    if (upstream) {
      for (const id of upstream.dependsOn) {
        if (!closure.has(id)) {
          stack.push(id);
        }
      }
    }
  }

  return closure;
};

export const mergeTaskArgsWithBus = (task: TaskNode, bus: AgentBusState, allTasks?: TaskNode[]): TaskNode => {
  const upstreamIds = resolveUpstreamTaskIds(task, allTasks);
  const upstream = bus.messages.filter(
    (message) => upstreamIds.has(message.taskId) && message.type === "artifact",
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

const summarizeArtifactPayload = (payload: Record<string, unknown>): string => {
  const parts = [
    pickNumber(payload.planId) !== undefined ? `planId=${pickNumber(payload.planId)}` : null,
    pickNumber(payload.checklistId) !== undefined ? `checklistId=${pickNumber(payload.checklistId)}` : null,
    pickString(payload.planTitle) ? `plan=${pickString(payload.planTitle)}` : null,
    Array.isArray(payload.scheduleItemIds) && payload.scheduleItemIds.length > 0
      ? `scheduleItems=${(payload.scheduleItemIds as unknown[]).join(",")}`
      : null,
    pickNumber(payload.timelineEventId) !== undefined ? `timelineEventId=${pickNumber(payload.timelineEventId)}` : null,
    pickNumber(payload.memoryId) !== undefined ? `memoryId=${pickNumber(payload.memoryId)}` : null,
  ].filter(Boolean);

  return parts.join(" | ");
};

/**
 * 把上游闭包内的 artifact/intent/note 消息汇成一段可读上下文，供下游任务的 LLM enrich 回灌，
 * 形成「上游产物/推理 → 下游决策」的反馈闭环。
 */
export const formatUpstreamContext = (task: TaskNode, bus: AgentBusState, allTasks?: TaskNode[]): string => {
  const upstreamIds = resolveUpstreamTaskIds(task, allTasks);

  if (upstreamIds.size === 0) {
    return "";
  }

  const lines: string[] = [];

  for (const message of bus.messages) {
    if (!upstreamIds.has(message.taskId)) {
      continue;
    }

    if (message.type === "artifact") {
      const summary = summarizeArtifactPayload(message.payload as Record<string, unknown>);
      const detail = [summary, message.reasoning].filter(Boolean).join(" · ");
      lines.push(`- [${message.from}] 产物（${message.taskId}）：${detail || "无显式产物"}`);
    } else if (message.type === "note") {
      lines.push(`- [${message.from}] 说明（${message.taskId}）：${message.reasoning ?? ""}`);
    } else if (message.type === "intent") {
      const intentName = pickString((message.payload as Record<string, unknown>).intent);
      lines.push(
        `- [${message.from}] 意图（${message.taskId}）：${intentName ?? "?"}${message.reasoning ? ` · ${message.reasoning}` : ""}`,
      );
    }
  }

  return lines.join("\n");
};
