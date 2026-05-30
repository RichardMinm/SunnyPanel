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

export type TaskObservationStatus =
  | "answered"
  | "auto_executed"
  | "blocked"
  | "clarified"
  | "executed"
  | "failed"
  | "proposed"
  | "skipped";

export type AgentTaskObservation = {
  actionId?: string;
  agentRole: AgentRole;
  collections?: string[];
  error?: string;
  intent: AgentIntent["intent"];
  label: string;
  message: string;
  riskLevel?: "high" | "low" | "medium";
  status: TaskObservationStatus;
  taskId: string;
};

export type ExecutionGraphResult = {
  assistantMessage: string;
  executedCount: number;
  observations: AgentTaskObservation[];
  pendingAction: import("../schemas").PendingAction | null;
  proposals: import("../schemas").ProposedAgentAction[];
};
