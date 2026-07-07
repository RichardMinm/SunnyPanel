/**
 * Phase LLM-R3: Tool Plan Validator.
 *
 * Validates an LLM-generated tool plan against strict safety rules.
 * This is a PURE FUNCTION — no side effects, no network, no DB.
 *
 * Key invariants:
 *  - "execute" mode is FORBIDDEN
 *  - Unknown tools are rejected
 *  - Write tools can only be used in "dry_run" mode
 *  - Read tools can only be used in "read" mode
 *  - Confidence must be in [0,1] and >= minConfidence
 *  - Steps must not exceed maxSteps
 *  - dependsOn references must be valid and acyclic
 *  - No secrets / raw prompts allowed in the plan
 */

import type { agentToolRegistry } from "../tool-registry";
import { getAgentToolDefinition } from "../tool-registry";
import type {
  LLMToolPlan,
  LLMToolPlanMode,
  LLMToolPlanStep,
  LLMToolPlanValidationResult,
} from "./types";

export type ValidateLLMToolPlanOptions = {
  /** Minimum acceptable confidence (0–1). Default 0.5. */
  minConfidence?: number;
  /** Maximum allowed steps. Default 8. */
  maxSteps?: number;
  /** If provided, only these tool names are allowed. */
  allowedToolNames?: string[];
};

const VALID_MODES: ReadonlySet<string> = new Set<LLMToolPlanMode>([
  "read",
  "draft",
  "dry_run",
]);

const FORBIDDEN_TERMS = [
  "rawPrompt",
  "rawResponse",
  "raw_prompt",
  "raw_response",
  "apiKey",
  "api_key",
  "token",
  "secret",
  "password",
  "Authorization",
  "Bearer",
  "sk-",
];

const detectForbiddenTerms = (value: unknown): string | null => {
  const serialized = JSON.stringify(value);
  for (const term of FORBIDDEN_TERMS) {
    if (serialized.includes(term)) {
      return term;
    }
  }
  return null;
};

const detectCycles = (
  steps: LLMToolPlanStep[],
): string[] | null => {
  const stepIds = new Set(steps.map((s) => s.id));

  // Build adjacency list
  const deps = new Map<string, string[]>();
  for (const step of steps) {
    if (step.dependsOn) {
      deps.set(step.id, step.dependsOn.filter((d) => stepIds.has(d)));
    }
  }

  // DFS-based cycle detection
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of stepIds) color.set(id, WHITE);

  const cycle: string[] = [];

  const visit = (id: string): boolean => {
    const c = color.get(id);
    if (c === GRAY) {
      cycle.push(id);
      return true; // cycle found
    }
    if (c === BLACK) return false;

    color.set(id, GRAY);
    for (const dep of deps.get(id) ?? []) {
      if (visit(dep)) {
        cycle.push(id);
        return true;
      }
    }
    color.set(id, BLACK);
    return false;
  };

  for (const id of stepIds) {
    if (visit(id)) {
      return cycle.reverse();
    }
  }

  return null;
};

/**
 * Validate an LLM-generated tool plan.
 *
 * Pure function — does not execute tools, create pending actions, or write to DB.
 */
export const validateLLMToolPlan = (
  output: unknown,
  options: ValidateLLMToolPlanOptions = {},
): LLMToolPlanValidationResult => {
  const warnings: string[] = [];
  const {
    minConfidence = 0.5,
    maxSteps = 8,
    allowedToolNames,
  } = options;

  // Rule 1: output must be an object
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, reason: "Plan output must be a non-array object.", warnings };
  }

  const plan = output as Record<string, unknown>;

  // Rule 2: goal must be a string
  if (typeof plan.goal !== "string" || !plan.goal.trim()) {
    return { ok: false, reason: "Plan must have a non-empty goal string.", warnings };
  }

  // Rule 3: intent must be a string
  if (typeof plan.intent !== "string" || !plan.intent.trim()) {
    return { ok: false, reason: "Plan must have a non-empty intent string.", warnings };
  }

  // Rule 4: confidence must be in [0, 1]
  if (typeof plan.confidence !== "number" || plan.confidence < 0 || plan.confidence > 1) {
    return { ok: false, reason: "Plan confidence must be a number between 0 and 1.", warnings };
  }

  // Rule 5: steps must be an array
  if (!Array.isArray(plan.steps)) {
    return { ok: false, reason: "Plan steps must be an array.", warnings };
  }

  // Rule 6: steps.length <= maxSteps
  if (plan.steps.length > maxSteps) {
    return {
      ok: false,
      reason: `Plan has ${plan.steps.length} steps, max ${maxSteps} allowed.`,
      warnings,
    };
  }

  // Rule 7: confidence < minConfidence → reject
  if (plan.confidence < minConfidence) {
    const missingInformation = Array.isArray(plan.missingInformation)
      ? plan.missingInformation.filter((m: unknown) => typeof m === "string")
      : [];
    return {
      ok: false,
      reason: `Plan confidence ${plan.confidence} is below minimum ${minConfidence}.`,
      warnings,
      missingInformation: missingInformation.length > 0 ? missingInformation : undefined,
    };
  }

  // Rule 19: no forbidden terms anywhere in the plan
  const forbidden = detectForbiddenTerms(output);
  if (forbidden) {
    return {
      ok: false,
      reason: `Plan contains forbidden term: "${forbidden}".`,
      warnings,
    };
  }

  // Rule 16: if missingInformation is non-empty, no dry_run steps allowed
  const missingInfo: string[] = Array.isArray(plan.missingInformation)
    ? plan.missingInformation.filter((m: unknown) => typeof m === "string")
    : [];

  // Validate each step
  if (plan.steps.length === 0) {
    return {
      ok: false,
      reason: "Plan has no steps.",
      warnings,
      ...(missingInfo.length > 0 ? { missingInformation: missingInfo } : {}),
    };
  }

  const typedPlan: LLMToolPlan = {
    goal: plan.goal as string,
    intent: plan.intent as string,
    confidence: plan.confidence as number,
    steps: [],
    ...(plan.userFacingSummary && typeof plan.userFacingSummary === "string"
      ? { userFacingSummary: plan.userFacingSummary as string }
      : {}),
    ...(missingInfo.length > 0 ? { missingInformation: missingInfo } : {}),
  };

  const stepIds = new Set<string>();
  let hasDryRunStep = false;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i] as Record<string, unknown>;

    // Rule 8: step must have required fields
    if (typeof step.id !== "string" || !step.id.trim()) {
      return { ok: false, reason: `Step ${i}: missing or empty id.`, warnings };
    }
    if (typeof step.toolName !== "string" || !step.toolName.trim()) {
      return { ok: false, reason: `Step ${i} ("${step.id || "?"}"): missing toolName.`, warnings };
    }
    if (typeof step.mode !== "string") {
      return { ok: false, reason: `Step ${i} ("${step.id || "?"}"): missing mode.`, warnings };
    }
    if (typeof step.reason !== "string") {
      return { ok: false, reason: `Step ${i} ("${step.id || "?"}"): missing reason.`, warnings };
    }
    if (step.input === undefined) {
      return { ok: false, reason: `Step ${i} ("${step.id || "?"}"): missing input.`, warnings };
    }

    // Duplicate id check
    if (stepIds.has(step.id as string)) {
      return { ok: false, reason: `Step ${i}: duplicate id "${step.id}".`, warnings };
    }
    stepIds.add(step.id as string);

    // Rule 9: toolName must exist in registry, or be in allowedToolNames
    const toolDef = getAgentToolDefinition(step.toolName as string as keyof typeof agentToolRegistry);
    if (!toolDef) {
      return {
        ok: false,
        reason: `Step "${step.id}": unknown tool "${step.toolName}".`,
        warnings,
      };
    }

    // Rule 10: mode must be read/draft/dry_run
    if (!VALID_MODES.has(step.mode as string)) {
      return {
        ok: false,
        reason: `Step "${step.id}": mode "${step.mode}" is not allowed (only read/draft/dry_run).`,
        warnings,
      };
    }

    const mode = step.mode as LLMToolPlanMode;

    // Rule 11: mode must not be "execute"
    if ((step.mode as string) === "execute") {
      return {
        ok: false,
        reason: `Step "${step.id}": "execute" mode is forbidden.`,
        warnings,
      };
    }

    // Rule 12-14: capability-mode compatibility
    if (toolDef.capability === "read" && mode !== "read") {
      return {
        ok: false,
        reason: `Step "${step.id}": read tool "${step.toolName}" can only use mode "read".`,
        warnings,
      };
    }

    if (toolDef.capability === "write") {
      if (mode !== "dry_run") {
        return {
          ok: false,
          reason: `Step "${step.id}": write tool "${step.toolName}" can only use mode "dry_run", got "${mode}".`,
          warnings,
        };
      }
      hasDryRunStep = true;
    }

    if (toolDef.capability === "draft" && mode !== "draft" && mode !== "dry_run") {
      return {
        ok: false,
        reason: `Step "${step.id}": draft tool "${step.toolName}" can only use mode "draft" or "dry_run", got "${mode}".`,
        warnings,
      };
    }

    // Rule 18: step.input should be an object
    if (typeof step.input !== "object" || step.input === null) {
      warnings.push(`Step "${step.id}": input is not an object (manual schema tool).`);
    }

    // Rule 22: manual inputSchema → warning
    if (toolDef.inputSchema.kind === "manual") {
      warnings.push(`Step "${step.id}": tool "${step.toolName}" has manual inputSchema — cannot auto-validate args.`);
    }

    // Rule 23: if inputSchema maps to write-schema, note it (don't execute)
    if (toolDef.inputSchema.kind === "write-schema") {
      // We note the schema exists but do NOT validate against write-schemas here
      // (that would require importing write-schemas and adding DB dependencies)
    }

    // Rule 15: riskLevel must be valid
    if (
      typeof step.riskLevel !== "string" ||
      !["low", "medium", "high"].includes(step.riskLevel as string)
    ) {
      warnings.push(`Step "${step.id}": riskLevel "${step.riskLevel}" is not valid (low/medium/high).`);
    }

    // Allowed tool names check
    if (allowedToolNames && !allowedToolNames.includes(step.toolName as string)) {
      return {
        ok: false,
        reason: `Step "${step.id}": tool "${step.toolName}" is not in the allowed list.`,
        warnings,
      };
    }

    typedPlan.steps.push({
      id: step.id as string,
      toolName: step.toolName as string,
      mode,
      reason: (step.reason as string) || "",
      input: step.input,
      dependsOn: Array.isArray(step.dependsOn)
        ? step.dependsOn.filter((d: unknown) => typeof d === "string")
        : undefined,
      riskLevel: (step.riskLevel as "low" | "medium" | "high") || "medium",
    });
  }

  // Rule 16: missingInformation non-empty + has dry_run steps → reject
  if (missingInfo.length > 0 && hasDryRunStep) {
    return {
      ok: false,
      reason: "Plan has missing information but contains dry_run steps. Clarify first.",
      warnings,
      missingInformation: missingInfo,
    };
  }

  // Rule 17-18: dependsOn validation
  for (const step of typedPlan.steps) {
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        if (!stepIds.has(depId)) {
          return {
            ok: false,
            reason: `Step "${step.id}" depends on "${depId}" which does not exist.`,
            warnings,
          };
        }
      }
    }
  }

  // Rule 18: no circular dependencies
  const cycle = detectCycles(typedPlan.steps);
  if (cycle) {
    return {
      ok: false,
      reason: `Circular dependency detected: ${cycle.join(" → ")}.`,
      warnings,
    };
  }

  // Rule 24: validator must not create pendingAction — we just return the validated plan
  // Rule 25: validator must not execute tool — plan is data, not execution

  return { ok: true, plan: typedPlan, warnings };
};
