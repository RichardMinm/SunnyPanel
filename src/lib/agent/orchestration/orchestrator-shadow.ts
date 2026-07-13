/** Orchestrator Shadow — comparison-only, no side effects.
 *
 * Invokes the LangChain orchestrator alongside the primary (legacy)
 * orchestrator and returns a sanitized comparison object.
 *
 * Shadow results are NEVER used as authoritative. Shadow failures
 * are ALWAYS isolated and never affect the primary result.
 *
 * ## Data Flow
 *   Provider response
 *   → Provider-facing modelSchema (non-strict)
 *   → LangChain parse
 *   → SunnyPanel strict schema validation
 *   → DAG/domain validation
 *   → Safety classification
 *   → Comparison object (sanitized, no raw content)
 */

import type { OrchestratorPlan } from "./types";
import type { OrchestratorOutput } from "../llm/schemas/orchestrator-output";
import { orchestratorOutputSchema, validateTaskDAG } from "../llm/schemas/orchestrator-output";
import { classifyIntents, type SafetyClass } from "./safety-classifier";

/* ---- Feature flag ---- */

/** Returns true when shadow comparison is enabled.
 *  AGENT_ORCHESTRATOR_SHADOW=1 enables; any other value disables. */
export const isOrchestratorShadowEnabled = (): boolean =>
  process.env.AGENT_ORCHESTRATOR_SHADOW === "1";

/* ---- Comparison types ---- */

export const SHADOW_COMPARISON_VERSION = 1;

export interface ShadowComparison {
  comparisonVersion: typeof SHADOW_COMPARISON_VERSION;

  primary: {
    schemaValid: boolean;
    mode: string;
    intents: string[];
    safetyClass: SafetyClass;
    taskCount: number;
    dependencyShape: string[];
    resourceReferenceIds: string[];
  };

  shadow: {
    attempted: boolean;
    schemaValid: boolean;
    mode?: string;
    intents?: string[];
    safetyClass?: SafetyClass;
    taskCount?: number;
    dependencyShape?: string[];
    resourceReferenceIds?: string[];
    latencyMs?: number;
    errorCode?: string;
  };

  result: {
    modeMatched: boolean;
    intentsMatched: boolean;
    safetyClassMatched: boolean;
    dependencyShapeMatched: boolean;
    resourceReferenceBehaviorMatched: boolean;

    readToWriteMismatch: boolean;
    inventedResourceId: boolean;
    unsafeFallback: boolean;
    promptInjectionSucceeded: boolean;

    mismatchCategories: string[];
  };
}

/* ---- Helpers ---- */

const extractIntents = (plan: OrchestratorPlan): string[] =>
  plan.tasks.map((t) => t.intent);

const extractDependencyShape = (plan: OrchestratorPlan): string[] =>
  plan.tasks.map((t) => `${t.id}→[${t.dependsOn.join(",")}]`);

const extractResourceIds = (plan: OrchestratorPlan): string[] => {
  const ids: string[] = [];

  for (const task of plan.tasks) {
    for (const value of Object.values(task.args)) {
      if (typeof value === "number" && value > 0) {
        ids.push(`num:${value}`);
        continue;
      }

      if (typeof value === "string" && /^\d+$/.test(value)) {
        ids.push(`str:${value}`);
      }
    }
  }

  return ids;
};

const normalizeMode = (mode: string): string =>
  mode === "single" || mode === "compound" ? mode : "unknown";

/** Build the primary side of the comparison from a plan. */
const buildPrimarySide = (plan: OrchestratorPlan) => {
  const intents = extractIntents(plan);

  return {
    schemaValid: true,
    mode: normalizeMode(plan.mode),
    intents,
    safetyClass: classifyIntents(intents),
    taskCount: plan.tasks.length,
    dependencyShape: extractDependencyShape(plan),
    resourceReferenceIds: extractResourceIds(plan),
  };
};

/** Validate a plan through strict schema + DAG. */
const validateStrict = (plan: OrchestratorPlan): { valid: boolean; errors: string[] } => {
  /* Convert to OrchestratorOutput shape for Zod validation */
  const output: OrchestratorOutput = {
    version: 1,
    mode: plan.mode as "compound" | "single",
    routingSummary: plan.reasoning.slice(0, 80),
    tasks: plan.tasks.map((t) => ({
      id: t.id,
      label: t.label,
      intent: t.intent,
      args: t.args,
      dependsOn: t.dependsOn,
      agentRole: t.agentRole,
    })),
  };

  const schemaResult = orchestratorOutputSchema.safeParse(output);

  if (!schemaResult.success) return { valid: false, errors: ["strict schema rejected"] };

  const dagResult = validateTaskDAG(output);

  return { valid: dagResult.valid, errors: dagResult.errors };
};

/* ---- Shadow invocation ---- */

export type ShadowInvokeOptions = {
  message: string;
  context: import("../prompts").AgentPromptContext;
  signal?: AbortSignal;
};

/** Run shadow comparison — catches ALL errors, never throws.
 *  Returns null when shadow is disabled or invocation is skipped. */
export const runOrchestratorShadow = async (
  primaryPlan: OrchestratorPlan,
  options: ShadowInvokeOptions,
): Promise<ShadowComparison | null> => {
  if (!isOrchestratorShadowEnabled()) return null;

  const primary = buildPrimarySide(primaryPlan);
  const start = Date.now();

  let shadowResult: ShadowComparison["shadow"];
  try {
    /* Dynamic import to avoid loading LangChain when shadow is disabled */
    const { runLangChainOrchestrator } = await import("./langchain-orchestrator");

    const shadowPlan = await runLangChainOrchestrator({
      message: options.message,
      context: options.context,
      signal: options.signal,
    });

    const shadowIntents = extractIntents(shadowPlan);
    const strict = validateStrict(shadowPlan);

    shadowResult = {
      attempted: true,
      schemaValid: strict.valid,
      mode: normalizeMode(shadowPlan.mode),
      intents: shadowIntents,
      safetyClass: classifyIntents(shadowIntents),
      taskCount: shadowPlan.tasks.length,
      dependencyShape: extractDependencyShape(shadowPlan),
      resourceReferenceIds: extractResourceIds(shadowPlan),
      latencyMs: Date.now() - start,
    };
  } catch {
    shadowResult = {
      attempted: true,
      schemaValid: false,
      errorCode: "SHADOW_EXCEPTION",
      latencyMs: Date.now() - start,
    };
  }

  const s = shadowResult;

  /* Compute comparison result */
  const modeMatched = s.mode === primary.mode;
  const intentsMatched = s.intents
    ? primary.intents.length === s.intents.length
      && primary.intents.every((i, idx) => i === s.intents?.[idx])
    : false;
  const safetyClassMatched = s.safetyClass === primary.safetyClass;
  const dependencyShapeMatched = s.dependencyShape
    ? JSON.stringify(primary.dependencyShape) === JSON.stringify(s.dependencyShape)
    : false;
  const resourceRefMatched = s.resourceReferenceIds
    ? JSON.stringify(primary.resourceReferenceIds.sort()) === JSON.stringify(s.resourceReferenceIds.sort())
    : false;

  /* Safety-critical mismatch detection */
  const readToWriteMismatch =
    primary.safetyClass === "read" && s.safetyClass === "write_candidate";

  const inventedResourceId = Boolean(
    s.resourceReferenceIds
    && s.resourceReferenceIds.length > 0
    && primary.resourceReferenceIds.length === 0,
  );

  const unsafeFallback = s.schemaValid === false
    && s.errorCode != null
    && s.errorCode !== "SHADOW_EXCEPTION";
  const promptInjectionSucceeded = readToWriteMismatch;

  const mismatchCategories: string[] = [];

  if (!modeMatched) mismatchCategories.push("mode");
  if (!intentsMatched) mismatchCategories.push("intent");
  if (!safetyClassMatched) mismatchCategories.push("safetyClass");
  if (!dependencyShapeMatched) mismatchCategories.push("dependencyShape");
  if (!resourceRefMatched) mismatchCategories.push("resourceReference");
  if (readToWriteMismatch) mismatchCategories.push("readToWrite");
  if (inventedResourceId) mismatchCategories.push("inventedResourceId");
  if (unsafeFallback) mismatchCategories.push("unsafeFallback");
  if (promptInjectionSucceeded) mismatchCategories.push("promptInjection");

  return {
    comparisonVersion: SHADOW_COMPARISON_VERSION,
    primary,
    shadow: s,
    result: {
      modeMatched,
      intentsMatched,
      safetyClassMatched,
      dependencyShapeMatched,
      resourceReferenceBehaviorMatched: resourceRefMatched,
      readToWriteMismatch,
      inventedResourceId,
      unsafeFallback,
      promptInjectionSucceeded,
      mismatchCategories,
    },
  };
};
