import type { AgentPromptContext } from "../prompts";
import type { AgentIntent } from "../schemas";
import type { AgentRole } from "../orchestration/types";
import type { AgentToolDryRunContext } from "../tool-registry";
import type { ModelCallBudgetRecorder } from "../orchestration/model-call-budget";
import type { ModelConfig } from "../llm/model-config";
import type { ModelFactory } from "../llm/model-factory";
import type { StructuredProviderAttemptObserver } from "../llm/invoke-structured";

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
    upstreamContext?: string,
    options?: SpecializedAgentInvocationOptions,
  ) => Promise<AgentIntent | null>;
  id: SpecializedAgentId;
  role: AgentRole;
  supportedIntents: Array<AgentIntent["intent"]>;
  systemPromptHint: string;
};

export type SpecializedAgentInvocationOptions = Readonly<{
  modelConfig?: ModelConfig;
  modelFactory?: ModelFactory;
  onProviderAttempt?: (attempt: number) => void;
  onProviderAttemptEvent?: StructuredProviderAttemptObserver;
}>;

export type SpecializedAgentRunInput = {
  dryRunContext: AgentToolDryRunContext;
  intent: AgentIntent;
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  promptContext: AgentPromptContext;
  taskLabel: string;
  /** 上游闭包的产物/推理/意图摘要，回灌给本 Agent 的 LLM 上下文。 */
  upstreamContext?: string;
};

export type SpecialistCallDisposition =
  | "bypassed_complete"
  | "required_incomplete";

export type SpecializedAgentRunResult = {
  agentId: SpecializedAgentId;
  agentRole: AgentRole;
  intent: AgentIntent;
  note: string;
  disposition: SpecialistCallDisposition;
};
