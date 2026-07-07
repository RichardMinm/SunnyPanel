/**
 * Phase LLM-R3: LLM Tool Planner.
 *
 * Calls the LLM to generate a structured tool plan, then validates it.
 * The planner NEVER executes tools — it only produces a validated plan.
 */

import { completeStructured } from "../llm/complete-structured";
import { buildLLMToolCatalog } from "./build-tool-catalog";
import { validateLLMToolPlan } from "./validate-tool-plan";
import { isLLMToolPlannerEnabled } from "./feature-flag";
import { isAgentRequireLLMEnabled, isAgentLLMDisabled } from "../llm-required";
import type {
  LLMToolCatalogEntry,
  LLMToolPlan,
  LLMToolPlannerInput,
  LLMToolPlannerResult,
} from "./types";

/* ──── Prompt builder ──── */

const buildPlannerSystemPrompt = (catalog: LLMToolCatalogEntry[]): string => {
  const toolList = catalog
    .map(
      (t) =>
        `- ${t.name} [${t.capability}] risk=${t.riskLevel}: ${t.description}` +
        (t.inputSchema.kind === "manual"
          ? ` Input: ${(t.inputSchema as { description: string }).description}`
          : ""),
    )
    .join("\n");

  return `You are SunnyPanel's Tool Planner. Your ONLY job is to produce a structured tool-use plan.

## Available Tools
${toolList}

## Rules
1. You ONLY generate a plan — you do NOT execute any tool.
2. Mode MUST be one of: "read", "draft", "dry_run". NEVER "execute".
3. Write tools (capability=write) can ONLY use mode "dry_run".
4. Read tools (capability=read) can ONLY use mode "read".
5. Draft tools (capability=draft) can use mode "draft" or "dry_run".
6. If you lack information to plan confidently, set "missingInformation" — do NOT guess.
7. Set "confidence" honestly. Below 0.5 means you aren't sure.
8. Each step must have: id, toolName, mode, reason, input, riskLevel.
9. "dependsOn" is optional — only use when one step truly needs another's output.
10. Output STRICT JSON only. No markdown. No explanation.

## Output Schema
{
  "goal": "string",
  "intent": "string",
  "confidence": 0.0-1.0,
  "steps": [
    {
      "id": "step-1",
      "toolName": "query_plan_progress",
      "mode": "read",
      "reason": "string",
      "input": {},
      "dependsOn": [],
      "riskLevel": "low"
    }
  ],
  "missingInformation": [],
  "userFacingSummary": "string"
}`;
};

const buildPlannerUserMessage = (input: LLMToolPlannerInput): string => {
  const parts: string[] = [];
  parts.push(`User message: ${input.userMessage}`);
  if (input.currentDate) parts.push(`Current date: ${input.currentDate}`);
  if (input.timezone) parts.push(`Timezone: ${input.timezone}`);
  if (input.recentContextSummary) {
    parts.push(`Recent context: ${input.recentContextSummary}`);
  }
  return parts.join("\n");
};

/* ──── Parse function ──── */

const parseLLMToolPlan = (value: unknown): LLMToolPlan | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  if (typeof plan.goal !== "string") return null;
  if (!Array.isArray(plan.steps)) return null;
  return value as LLMToolPlan;
};

/* ──── Planner ──── */

export const planToolsWithLLM = async (
  input: LLMToolPlannerInput,
): Promise<LLMToolPlannerResult> => {
  // Feature flag gate
  if (!isLLMToolPlannerEnabled()) {
    return {
      status: "failed",
      source: "unavailable",
      reason: "AGENT_LLM_TOOL_PLANNER is not enabled.",
      message: "Tool Planner is not active. Set AGENT_LLM_TOOL_PLANNER=1 to enable.",
    };
  }

  // LLM required mode gate
  if (isAgentRequireLLMEnabled() && isAgentLLMDisabled()) {
    return {
      status: "failed",
      source: "unavailable",
      reason: "LLM required but disabled.",
      message: "LLM is required but AGENT_DISABLE_LLM=1. Tool Planner cannot run.",
    };
  }

  const catalog = buildLLMToolCatalog();
  const maxSteps = input.maxSteps ?? 8;

  // Call LLM
  const result = await completeStructured<LLMToolPlan>({
    messages: [
      { role: "system", content: buildPlannerSystemPrompt(catalog) },
      { role: "user", content: buildPlannerUserMessage(input) },
    ],
    parse: parseLLMToolPlan,
    temperature: 0.2,
  });

  if (!result) {
    return {
      status: "failed",
      source: "llm",
      reason: "LLM returned no valid structured output.",
      message: "The model did not return a valid tool plan. Try rephrasing your request.",
    };
  }

  // Validate
  const validation = validateLLMToolPlan(result.data, { maxSteps });

  if (validation.ok) {
    // Handle missingInformation from the plan
    if (
      validation.plan.missingInformation &&
      validation.plan.missingInformation.length > 0
    ) {
      return {
        status: "needs_clarification",
        source: "validator",
        message:
          validation.plan.userFacingSummary ||
          "The plan requires more information before proceeding.",
        missingInformation: validation.plan.missingInformation,
      };
    }

    return {
      status: "planned",
      source: "llm",
      plan: validation.plan,
      validationWarnings: validation.warnings,
    };
  }

  // Validation failed — check if it's a missing-information case
  if (validation.missingInformation && validation.missingInformation.length > 0) {
    return {
      status: "needs_clarification",
      source: "validator",
      message: validation.reason,
      missingInformation: validation.missingInformation,
    };
  }

  return {
    status: "failed",
    source: "validator",
    reason: validation.reason,
    message: `Tool plan validation failed: ${validation.reason}`,
  };
};
