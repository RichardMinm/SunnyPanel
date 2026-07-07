/**
 * Phase LLM-R4B: LangGraph Tool Planner Runtime — state types.
 */

import type { AgentTraceEventPayload } from "../trace/types";
import type { LLMToolPlan, LLMToolPlanStep } from "./types";
import type { PendingAction, ProposedAgentAction } from "../schemas";
import type { PolicyGuardOutput } from "../policy/guard";
import type { PolicyGuardResult } from "../policy/tool-gate";

/* ──── Status ──── */

export type ToolPlannerGraphStatus =
  | "idle"
  | "planning"
  | "validated"
  | "running_read_draft"
  | "blocked_write"
  | "completed"
  | "failed";

/* ──── Dry-run result (sanitized) ──── */

export type ToolPlannerStepResult = {
  stepId: string;
  toolName: string;
  mode: string;
  status: "previewed" | "blocked" | "skipped" | "error";
  /** Sanitized preview — no raw data, no secrets. */
  preview?: unknown;
  reason?: string;
};

/** R4C: Write tool dry-run proposal result. */
export type ToolPlannerWriteProposalResult = {
  stepId: string;
  toolName: string;
  status:
    | "dry_run_success"
    | "dry_run_failed"
    | "blocked"
    | "policy_blocked"
    | "policy_failed"
    | "pending_preview";
  dryRunPreview?: unknown;
  policyDecision?: string;
  pendingActionPreview?: unknown;
  reason?: string;
};

/** R4D: Real Policy Guard evaluation result for a write proposal. */
export type ToolPlannerPolicyResult = {
  stepId: string;
  toolName: string;
  /** Policy Guard output from applyPolicyGuard. */
  policyGuardOutput: PolicyGuardOutput;
  /** Tool-gate policy result from evaluatePolicyGuard. */
  toolGateResult: PolicyGuardResult;
  /** Whether the proposal passed both policy checks. */
  passed: boolean;
  /** Human-readable reason if blocked. */
  blockReason?: string;
};

/** R4D: Real PendingAction generated from a write proposal. */
export type ToolPlannerRealPendingActionResult = {
  stepId: string;
  toolName: string;
  /** The real ProposedAgentAction from dry-run. */
  proposedAction: ProposedAgentAction;
  /** The real PendingAction (await_confirmation shape). */
  pendingAction: Extract<PendingAction, { type: "await_confirmation" }>;
  /** Policy guard output used to approve this. */
  policyGuardOutput: PolicyGuardOutput;
  /** Source marker for traceability. */
  source: "llm_tool_planner";
};

/* ──── Graph state ──── */

export type ToolPlannerGraphState = {
  sessionId?: string;
  userMessage: string;
  currentDate?: string;
  timezone?: string;

  status: ToolPlannerGraphStatus;

  toolPlan?: LLMToolPlan;
  validatedPlan?: LLMToolPlan;
  validationWarnings: string[];

  readSteps: LLMToolPlanStep[];
  draftSteps: LLMToolPlanStep[];
  blockedSteps: LLMToolPlanStep[];

  stepResults: ToolPlannerStepResult[];

  /** R4C: Write tool dry-run proposal results. */
  writeProposalResults: ToolPlannerWriteProposalResult[];
  /** R4C: Proposal status tracking. */
  proposalStatus:
    | "none"
    | "dry_run_ready"
    | "policy_blocked"
    | "pending_preview"
    | "failed";

  /** R4D: Real Policy Guard results. */
  policyResults: ToolPlannerPolicyResult[];
  /** R4D: Real PendingAction (only one, per single-write-step constraint). */
  realPendingAction?: ToolPlannerRealPendingActionResult | null;

  traceEvents: AgentTraceEventPayload[];

  error?: {
    code: string;
    message: string;
  };
};
