import type { AgentPromptContext } from "../prompts";
import type { AgentIntent } from "../schemas";
import type { AgentRole } from "../orchestration/types";
import type { AgentToolDryRunContext } from "../tool-registry";

export type PlanAgentArtifact = {
  checklistId?: number;
  phases?: number;
  planId?: number;
  planTitle?: string;
  relatedPlanId?: number;
  visibility?: "private" | "public";
};

export type ScheduleAgentArtifact = {
  dateRange?: [string, string];
  planId?: number;
  relatedPlanId?: number;
  scheduleItemIds?: number[];
};

export type MemoryAgentArtifact = {
  confidence?: number;
  memoryId?: number;
  title?: string;
  type?: string;
};

export type ContentAgentArtifact = {
  timelineEventId?: number;
};

export type ReviewAgentArtifact = {
  planReviewId?: number;
  suggestions?: number;
};

export type QueryAgentArtifact = {
  report?: string;
};

export type AgentRoleArtifactMap = {
  content: ContentAgentArtifact;
  memory: MemoryAgentArtifact;
  plan: PlanAgentArtifact;
  query: QueryAgentArtifact;
  review: ReviewAgentArtifact;
  schedule: ScheduleAgentArtifact;
};

export type SpecializedAgentId = "content" | "memory" | "plan" | "query" | "review" | "schedule";

export type SpecializedAgentDefinition = {
  enrichIntent?: (
    intent: AgentIntent,
    context: AgentPromptContext,
    message: string,
  ) => Promise<AgentIntent | null>;
  id: SpecializedAgentId;
  role: AgentRole;
  supportedIntents: Array<AgentIntent["intent"]>;
  systemPromptHint: string;
};

export type SpecializedAgentRunInput = {
  dryRunContext: AgentToolDryRunContext;
  intent: AgentIntent;
  message: string;
  promptContext: AgentPromptContext;
  taskLabel: string;
};

export type SpecializedAgentRunResult = {
  agentId: SpecializedAgentId;
  agentRole: AgentRole;
  intent: AgentIntent;
  note: string;
};
