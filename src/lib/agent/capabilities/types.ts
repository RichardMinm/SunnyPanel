import type { AgentWriteIntentName, ProposedAgentAction } from "../schemas";
import type { UserPreferences } from "../user-preferences";
import type { AgentConversationState } from "../conversation/types";
import type { TargetResolutionStatus } from "../resolver/target-resolver";
import type { AgentIntent } from "../schemas";
import type { AgentRouterOutput } from "../router/types";

export type CapabilityRisk =
  | "read"
  | "draft"
  | "write_preview"
  | "write_execute"
  | "dangerous";

export type CapabilityTarget =
  | "plan"
  | "schedule"
  | "checklist"
  | "memory"
  | "timeline"
  | "writing"
  | "global";

export type CapabilityActionKind = "search" | "draft" | "preview" | "execute";

export type CapabilityContext = {
  confirmedPreviewId?: null | string;
  conversationState?: AgentConversationState | null;
  pendingAction?: ProposedAgentAction | null;
  structuredCapability?: null | string;
  userId?: number;
};

export type CapabilityResult = {
  data?: unknown;
  error?: string;
  ok: boolean;
  summary: string;
};

export type AgentCapability = {
  action: CapabilityActionKind;
  description: string;
  execute: (input: unknown, ctx: CapabilityContext) => Promise<CapabilityResult>;
  exposableToLLM: boolean;
  inputSchema: Record<string, unknown>;
  legacyIntent?: AgentWriteIntentName;
  name: string;
  outputSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
  risk: CapabilityRisk;
  sideEffect: boolean;
  target: CapabilityTarget;
};

export type CapabilityGateInput = {
  conversationState?: AgentConversationState | null;
  intent: AgentIntent;
  resolverStatus?: TargetResolutionStatus;
  router: AgentRouterOutput;
  userContext: { preferences?: UserPreferences | null; userId: number };
};

export type CapabilityGateResult = {
  allowed: AgentCapability["name"][];
  blocked: Array<{ name: string; reason: string }>;
  exposableToLLM: string[];
};
