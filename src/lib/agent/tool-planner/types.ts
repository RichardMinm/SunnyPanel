/**
 * Phase LLM-R3: LLM Tool Planner — shared types.
 *
 * LLM produces a structured Tool Plan. The plan is validated by the system
 * but NOT executed by the planner. Existing workflow controls execution.
 */

import type { AgentToolCapability, AgentToolInputSchema } from "../tool-registry";

/* ──── Plan mode ──── */

/** Allowed tool modes in an LLM plan. "execute" is FORBIDDEN. */
export type LLMToolPlanMode = "read" | "draft" | "dry_run";

/* ──── Plan step ──── */

export type LLMToolPlanStep = {
  /** Unique step id within this plan. */
  id: string;
  /** Registered tool name (must match an AgentToolDefinition name). */
  toolName: string;
  /** How the tool should be used — read, draft proposal, or dry-run preview. */
  mode: LLMToolPlanMode;
  /** Why this step is needed. */
  reason: string;
  /** Arguments for the tool (validated against tool.inputSchema). */
  input: unknown;
  /** Optional dependency ids (must reference other step ids in the same plan). */
  dependsOn?: string[];
  /** LLM-assessed risk level for this step. */
  riskLevel: "low" | "medium" | "high";
};

/* ──── Full plan ──── */

export type LLMToolPlan = {
  /** High-level goal inferred from the user message. */
  goal: string;
  /** Best-guess intent classification. */
  intent: string;
  /** LLM confidence in this plan (0–1). */
  confidence: number;
  /** Ordered steps. */
  steps: LLMToolPlanStep[];
  /** Information the LLM could not determine — should trigger clarification. */
  missingInformation?: string[];
  /** Optional user-facing summary for trace/activity display. */
  userFacingSummary?: string;
};

/* ──── Catalog entry ──── */

export type LLMToolCatalogEntry = {
  name: string;
  description: string;
  capability: AgentToolCapability;
  riskLevel: "low" | "medium" | "high";
  inputSchema: AgentToolInputSchema;
  canRunWithoutConfirmation: boolean;
  supportsDryRun: boolean;
  supportsExecute: boolean;
  supportsRollback: boolean;
};

/* ──── Validator result ──── */

export type LLMToolPlanValidationResult =
  | {
      ok: true;
      plan: LLMToolPlan;
      warnings: string[];
    }
  | {
      ok: false;
      reason: string;
      warnings: string[];
      missingInformation?: string[];
    };
