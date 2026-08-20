import type { AgentIntent } from "../schemas";
import type { SafeExecutionFailureCode } from "./safe-execution-failure";

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
  /** How this plan was produced; heuristic plans must not bypass LLM arbitration for Q&A. */
  source?: "heuristic" | "llm";
  tasks: TaskNode[];
};

export type TaskObservationStatus =
  | "answered"
  | "auto_executed"
  | "blocked"
  | "clarified"
  | "deferred"
  | "executed"
  | "failed"
  | "proposed"
  | "skipped";

export type AgentTaskObservation = {
  actionId?: string;
  affectedDocuments?: Array<{
    collection: string;
    documentId?: number;
    operation: "create" | "delete" | "update";
    rollbackStrategy?: string;
  }>;
  agentRole: AgentRole;
  collections?: string[];
  error?: string;
  errorCode?: SafeExecutionFailureCode;
  intent: AgentIntent["intent"];
  label: string;
  message: string;
  repairedByTaskId?: string;
  riskLevel?: "high" | "low" | "medium";
  rollbackAvailable?: boolean;
  status: TaskObservationStatus;
  taskId: string;
};

export type ExecutionQueueState = {
  autoExecutedTaskIds: string[];
  blockedTaskIds: string[];
  completedTaskIds: string[];
  deferredTaskIds: string[];
  failedTaskIds: string[];
  pendingTaskIds: string[];
  proposedTaskIds: string[];
  skippedTaskIds: string[];
  totalTasks: number;
};

export type AgentExecutionEvaluation = {
  action: "ask_user" | "complete" | "continue" | "replan" | "resume_queue" | "wait_for_confirmation";
  affectedDocuments: NonNullable<AgentTaskObservation["affectedDocuments"]>;
  confidence: number;
  deferredTaskIds: string[];
  failedTaskId?: string;
  nextStep: string;
  reason: string;
  strategy: AgentExecutionStrategy;
  summary: string;
};

export type AgentExecutionStrategy = {
  confidence: number;
  constraints: string[];
  memoryIds: number[];
  mode: "autonomous" | "avoid_recent_failure" | "cautious_replan" | "confirm_first" | "neutral";
  reason: string;
  recentRunIds: number[];
};

export type ExecutionGraphResult = {
  assistantMessage: string;
  evaluation: AgentExecutionEvaluation;
  executedCount: number;
  observations: AgentTaskObservation[];
  pendingAction: import("../schemas").PendingAction | null;
  proposals: import("../schemas").ProposedAgentAction[];
  queueState: ExecutionQueueState;
};
