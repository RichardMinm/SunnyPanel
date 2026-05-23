import type { AgentRole, TaskNode } from "../orchestration/types";

export type SpecializedAgentId =
  | "content"
  | "memory"
  | "plan"
  | "query"
  | "review"
  | "schedule";

const roleToAgent: Record<AgentRole, SpecializedAgentId> = {
  content: "content",
  memory: "memory",
  plan: "plan",
  query: "query",
  review: "review",
  schedule: "schedule",
};

export const routeTaskToAgent = (task: TaskNode): SpecializedAgentId => roleToAgent[task.agentRole] ?? "plan";

export const groupTasksByAgent = (tasks: TaskNode[]): Map<SpecializedAgentId, TaskNode[]> => {
  const groups = new Map<SpecializedAgentId, TaskNode[]>();

  for (const task of tasks) {
    const agentId = routeTaskToAgent(task);
    const bucket = groups.get(agentId) ?? [];
    bucket.push(task);
    groups.set(agentId, bucket);
  }

  return groups;
};
