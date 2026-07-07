/**
 * Phase LLM-R4A: Tool Planner Shadow Graph.
 *
 * A self-contained async function that runs the LLM Tool Planner in
 * shadow/trace-only mode. It records structured trace events but has
 * ZERO effect on business decisions — no tools executed, no pendingAction
 * created, no DB writes.
 *
 * Failures are caught and recorded as trace — they never propagate.
 */

import { buildLLMToolCatalog } from "./build-tool-catalog";
import { planToolsWithLLM } from "./llm-tool-planner";
import { validateLLMToolPlan } from "./validate-tool-plan";
import type { LLMToolPlan } from "./types";
import type { AgentTraceEventPayload } from "../trace/types";

/* ──── State ──── */

export type ShadowGraphStatus =
  | "idle"
  | "catalog_built"
  | "planned"
  | "validated"
  | "invalid"
  | "failed"
  | "skipped";

export type ShadowGraphError = {
  code: string;
  message: string;
};

export type ShadowGraphResult = {
  status: ShadowGraphStatus;
  warnings: string[];
  validatedPlan?: LLMToolPlan;
  error?: ShadowGraphError;
  /** Sanitized trace events — no raw prompt/response/secrets. */
  traceEvents: AgentTraceEventPayload[];
};

/* ──── Helpers ──── */

const makeTraceEvent = (
  status: AgentTraceEventPayload["status"],
  title: string,
  summary: string,
  metadata?: Record<string, unknown>,
): AgentTraceEventPayload => ({
  createdAt: new Date().toISOString(),
  phase: "tool_planning",
  status,
  threadId: "shadow",
  title,
  summary,
  outputPreview: {
    mode: "trace_only",
    ...metadata,
  },
});

const sanitizeTrace = (events: AgentTraceEventPayload[]): AgentTraceEventPayload[] => {
  const forbidden = ["sk-", "Bearer", "api_key", "apiKey", "token", "secret", "password"];
  return events.map((e) => {
    const serialized = JSON.stringify(e);
    for (const term of forbidden) {
      if (serialized.includes(term)) {
        return { ...e, outputPreview: { sanitized: true, reason: `removed: ${term}` } };
      }
    }
    return e;
  });
};

/* ──── Shadow runner ──── */

export const runToolPlannerShadowGraph = async (input: {
  userMessage: string;
  sessionId?: string;
  currentDate?: string;
  timezone?: string;
}): Promise<ShadowGraphResult> => {
  const warnings: string[] = [];
  const traceEvents: AgentTraceEventPayload[] = [];
  let status: ShadowGraphStatus = "idle";

  try {
    // Step 1: Build tool catalog
    traceEvents.push(
      makeTraceEvent("started", "Shadow planner: building catalog", "Building tool catalog for shadow planning"),
    );
    const catalog = buildLLMToolCatalog();
    traceEvents.push(
      makeTraceEvent("success", "Shadow planner: catalog built", `Catalog ready: ${catalog.length} tools`, {
        toolCount: catalog.length,
      }),
    );
    status = "catalog_built";

    // Step 2: Call LLM planner
    traceEvents.push(
      makeTraceEvent("started", "Shadow planner: calling LLM", "Calling LLM tool planner in shadow mode"),
    );

    let plannerResult;
    try {
      plannerResult = await planToolsWithLLM({
        userMessage: input.userMessage,
        currentDate: input.currentDate,
        timezone: input.timezone,
      });
    } catch (plannerError) {
      const error = {
        code: "planner_llm_error",
        message: plannerError instanceof Error ? plannerError.message : String(plannerError),
      };
      status = "failed";
      traceEvents.push(
        makeTraceEvent("failed", "Shadow planner: LLM failed", "LLM planner call failed in shadow mode", {
          error: error.message.slice(0, 200),
        }),
      );
      return { status, warnings, error, traceEvents: sanitizeTrace(traceEvents) };
    }

    // Step 3: Handle planner result
    if (plannerResult.status === "planned") {
      traceEvents.push(
        makeTraceEvent("success", "Shadow planner: plan generated", "LLM tool plan generated in shadow mode", {
          confidence: plannerResult.plan.confidence,
          stepCount: plannerResult.plan.steps.length,
          tools: plannerResult.plan.steps.map((s) => s.toolName),
        }),
      );
      status = "planned";

      // Step 4: Validate
      const validation = validateLLMToolPlan(plannerResult.plan);
      if (validation.ok) {
        status = "validated";
        traceEvents.push(
          makeTraceEvent("success", "Shadow planner: plan validated", "Tool plan passed validation in shadow mode", {
            validated: true,
            warnings: validation.warnings.length,
          }),
        );
        return {
          status,
          warnings: [...warnings, ...validation.warnings],
          validatedPlan: validation.plan,
          traceEvents: sanitizeTrace(traceEvents),
        };
      } else {
        status = "invalid";
        traceEvents.push(
          makeTraceEvent("warning", "Shadow planner: plan rejected", "LLM tool plan rejected by validator in shadow mode", {
            validated: false,
            reason: validation.reason,
          }),
        );
        return {
          status,
          warnings: [...warnings, ...validation.warnings],
          error: { code: "validation_failed", message: validation.reason },
          traceEvents: sanitizeTrace(traceEvents),
        };
      }
    } else if (plannerResult.status === "needs_clarification") {
      status = "skipped";
      traceEvents.push(
        makeTraceEvent("skipped", "Shadow planner: needs clarification", plannerResult.message, {
          missingInfo: plannerResult.missingInformation,
        }),
      );
      return { status, warnings, traceEvents: sanitizeTrace(traceEvents) };
    } else {
      // failed / unavailable
      status = "failed";
      traceEvents.push(
        makeTraceEvent("failed", "Shadow planner: failed", plannerResult.message, {
          reason: plannerResult.reason,
        }),
      );
      return {
        status,
        warnings,
        error: { code: "planner_failed", message: plannerResult.reason },
        traceEvents: sanitizeTrace(traceEvents),
      };
    }
  } catch (error) {
    // Catastrophic failure — must not affect pipeline
    status = "failed";
    traceEvents.push(
      makeTraceEvent("failed", "Shadow planner: unexpected error", "Shadow planner failed unexpectedly", {
        error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      }),
    );
    return {
      status,
      warnings,
      error: { code: "shadow_graph_error", message: "Unexpected error in shadow planner" },
      traceEvents: sanitizeTrace(traceEvents),
    };
  }
};
