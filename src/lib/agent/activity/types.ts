export type AgentActivityStatus =
  | "failed"
  | "idle"
  | "queued"
  | "running"
  | "skipped"
  | "success"
  | "waiting"
  | "warning";

export type AgentActivityKind =
  | "awaiting_confirmation"
  | "calling_api"
  | "calling_tool"
  | "checking_conflicts"
  | "checking_read_write_boundary"
  | "checking_readiness"
  | "classifying_intent"
  | "completed"
  | "decomposing_goal"
  | "dry_run"
  | "executing"
  | "failed"
  | "finding_free_slots"
  | "generating_draft"
  | "idle"
  | "loading_context"
  | "planning"
  | "policy_guard"
  | "querying_database"
  | "reading_checklists"
  | "reading_memory"
  | "reading_plans"
  | "reading_schedule"
  | "reading_workspace"
  | "received"
  | "recording_receipt"
  | "revising_draft"
  | "rollback"
  | "routing"
  | "summarizing"
  | "understanding"
  | "writing_database";

export type AgentActivityVisibility = "developer" | "user";

export type AgentActivityStep = {
  actionId?: string;
  details?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
  };
  id: string;
  intent?: string;
  kind: AgentActivityKind;
  latencyMs?: number;
  runId?: string;
  status: AgentActivityStatus;
  summary?: string;
  timestamp?: string;
  title: string;
  toolName?: string;
  visibility?: AgentActivityVisibility;
};
