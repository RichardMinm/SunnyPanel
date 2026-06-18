import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentEngine,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";

export type SunnyAgentGraphInput = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  message: string;
  pendingAction: null | PendingAction;
  resolvedHistory: AgentChatMessage[];
  threadId: number;
  userId: number;
};

export type SunnyAgentGraphContext = {
  context: unknown;
  contextSummary: string;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
};

export type SunnyAgentGraphResolution = {
  engine: AgentEngine;
  intent: AgentIntent;
  tokenUsage?: AgentChatResponse["tokenUsage"];
};

export type SunnyAgentGraphExecution = {
  assistantMessage: string;
  lastRollbackPayload?: unknown;
  pendingAction: null | PendingAction;
  tokenUsage?: AgentChatResponse["tokenUsage"];
};

export type SunnyAgentGraphState = {
  context?: unknown;
  contextSummary?: string;
  execution?: SunnyAgentGraphExecution;
  input: SunnyAgentGraphInput;
  resolution?: SunnyAgentGraphResolution;
  response?: AgentChatResponse;
  tokenUsage?: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
};
