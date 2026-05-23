import type { AgentIntent } from "../schemas";

export type AgentRole = "content" | "memory" | "plan" | "query" | "review" | "schedule";

export type TaskNode = {
  agentRole: AgentRole;
  args: Record<string, unknown>;
  dependsOn: string[];
  id: string;
  intent: AgentIntent["intent"];
  label: string;
};

export type OrchestratorPlan = {
  mode: "compound" | "single";
  reasoning: string;
  tasks: TaskNode[];
};

export type ExecutionGraphResult = {
  assistantMessage: string;
  executedCount: number;
  pendingAction: import("../schemas").PendingAction | null;
  proposals: import("../schemas").ProposedAgentAction[];
};
