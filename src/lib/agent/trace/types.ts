export type AgentTracePhase =
  | "user_message"
  | "router"
  | "session"
  | "readiness"
  | "slot_extraction"
  | "draft"
  | "dry_run"
  | "policy_guard"
  | "pending_confirmation"
  | "execute"
  | "tool_call"
  | "api_call"
  | "receipt"
  | "rollback"
  | "finalize"
  | "llm_availability"
  | "tool_planning"
  | "tool_planner_unavailable"
  | "error";

export type AgentTraceStatus =
  | "started"
  | "success"
  | "warning"
  | "failed"
  | "skipped";

export type AgentTraceErrorSummary = {
  code?: string;
  message: string;
  name?: string;
};

export type AgentTraceEventPayload = {
  actionId?: string;
  apiPath?: string;
  createdAt?: string;
  error?: AgentTraceErrorSummary;
  inputPreview?: unknown;
  intent?: string;
  latencyMs?: number;
  method?: string;
  outputPreview?: unknown;
  phase: AgentTracePhase;
  runId?: string;
  status: AgentTraceStatus;
  statusCode?: number;
  summary?: string;
  threadId: string;
  title: string;
  toolName?: string;
};

export type AgentTraceEventInput = Omit<
  AgentTraceEventPayload,
  "createdAt" | "threadId"
> &
  Partial<Pick<AgentTraceEventPayload, "createdAt" | "threadId">>;

export type AgentTraceRecorder = (event: AgentTraceEventInput) => void;

export type AgentTraceEventSink = (
  event: AgentTraceEventPayload,
) => Promise<unknown> | unknown;

export type AppendAgentTraceEventInput = {
  alreadySanitized?: boolean;
  collector?: AgentTraceEventPayload[];
  event: AgentTraceEventPayload;
  onWarning?: (error: unknown) => void;
  sink?: AgentTraceEventSink;
};

export type AppendAgentTraceEventResult = {
  errorMessage?: string;
  event: AgentTraceEventPayload;
  persisted: boolean;
  writeFailed: boolean;
};
