/**
 * Transition Engine — LLM-driven semantic session state transition.
 *
 * Phase 3 of Semantic Session Coordinator v1.
 *
 * Takes the current session + user message, calls an LLM (injected),
 * validates the output with Zod + safety checks, retries once on failure,
 * and falls back to a safe default on double failure.
 *
 * This module is scoped to semantic state ONLY:
 * - ❌ Does NOT execute tools
 * - ❌ Does NOT call dry-run
 * - ❌ Does NOT write to DB
 * - ❌ Does NOT modify Agent behavior
 * - ✅ Outputs validated TransitionOutput
 */

import type { AgentSessionState } from "./types";
import type { ValidatedTransitionOutput } from "./transition-schema";
import { safeValidateTransitionOutput } from "./transition-schema";
import {
  TRANSITION_SYSTEM_PROMPT,
  buildTransitionUserPrompt,
  buildRetryPrompt,
} from "./transition-prompt";

/* ──── Types ──── */

/**
 * LLM call interface — injected for testability.
 *
 * Receives system prompt + user prompt, returns raw text output.
 * The implementation may call any LLM provider (OpenAI, Anthropic, etc.).
 */
export type TransitionLLMCall = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<string>;

/**
 * Result of a transition engine run.
 */
export type TransitionEngineResult = {
  /** The validated (or fallback) transition output */
  output: ValidatedTransitionOutput;
  /** Whether a retry was attempted */
  didRetry: boolean;
  /** Whether the result is a fallback (both attempts failed) */
  isFallback: boolean;
  /** Trace information for debugging */
  trace: {
    firstAttemptRaw?: string;
    firstAttemptError?: string;
    retryAttemptRaw?: string;
    retryAttemptError?: string;
  };
};

/* ──── Fallback Output ──── */

const buildFallbackOutput = (reason: string): ValidatedTransitionOutput => ({
  shouldUpdateSession: false,
  sessionPatch: {},
  routeHint: {
    source: "fallback",
    contextualClues: ["LLM transition engine failed, falling back to stateless routing"],
    expectedIntents: [],
    confidence: 0.3,
  },
  transitionType: "fallback",
  reason,
});

/* ──── JSON Extraction ──── */

/**
 * Extract JSON from LLM output that may contain markdown fences,
 * surrounding text, or other noise.
 */
const extractJSON = (raw: string): string => {
  // Try to find JSON in markdown code fences first
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // Try to find a JSON object directly
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return objectMatch[0].trim();
  }

  return raw.trim();
};

/* ──── Core Engine ──── */

/**
 * Run the LLM Transition Engine.
 *
 * Flow:
 * 1. Build prompt from session + message
 * 2. Call LLM (first attempt)
 * 3. Extract JSON, validate with Zod + safety check
 * 4. If validation fails → retry with error context
 * 5. If retry also fails → return safe fallback
 *
 * @param session — current AgentSessionState (read-only)
 * @param message — latest user message
 * @param llmCall — injected LLM call function (for testability)
 * @returns TransitionEngineResult
 */
export const runTransitionEngine = async (
  session: AgentSessionState,
  message: string,
  llmCall: TransitionLLMCall,
): Promise<TransitionEngineResult> => {
  const trace: TransitionEngineResult["trace"] = {};
  const userPrompt = buildTransitionUserPrompt(session, message);

  /* ── First attempt ── */
  const firstRaw = await llmCall(TRANSITION_SYSTEM_PROMPT, userPrompt);
  trace.firstAttemptRaw = firstRaw;

  const firstJSON = extractJSON(firstRaw);

  let firstResult;
  try {
    firstResult = safeValidateTransitionOutput(JSON.parse(firstJSON));
  } catch (parseErr) {
    firstResult = {
      success: false as const,
      error: `Failed to parse as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    };
  }

  if (firstResult.success) {
    return {
      output: firstResult.data,
      didRetry: false,
      isFallback: false,
      trace,
    };
  }

  trace.firstAttemptError = firstResult.error;

  /* ── Retry attempt ── */
  const retryPrompt = buildRetryPrompt(userPrompt, firstRaw, firstResult.error);
  const retryRaw = await llmCall(TRANSITION_SYSTEM_PROMPT, retryPrompt);
  trace.retryAttemptRaw = retryRaw;

  const retryJSON = extractJSON(retryRaw);

  let retryResult;
  try {
    retryResult = safeValidateTransitionOutput(JSON.parse(retryJSON));
  } catch (parseErr) {
    retryResult = {
      success: false as const,
      error: `Failed to parse retry output as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    };
  }

  if (retryResult.success) {
    return {
      output: retryResult.data,
      didRetry: true,
      isFallback: false,
      trace,
    };
  }

  trace.retryAttemptError = retryResult.error;

  /* ── Fallback ── */
  return {
    output: buildFallbackOutput(
      `LLM transition engine failed after retry. First error: ${trace.firstAttemptError}. Retry error: ${trace.retryAttemptError}`,
    ),
    didRetry: true,
    isFallback: true,
    trace,
  };
};

/* ──── Convenience: synchronous safety filter ──── */

/**
 * Post-hoc safety filter: if a TransitionOutput contains forbidden tokens
 * (executeTool, toolCall, etc.), reject it and return a fallback instead.
 *
 * This is an additional layer of defense beyond Zod validation.
 */
export const filterUnsafeOutput = (
  output: ValidatedTransitionOutput,
): ValidatedTransitionOutput => {
  const serialized = JSON.stringify(output).toLowerCase();
  const forbidden = [
    "executetool", "execute_tool", "toolcall", "tool_call",
    "toolname", "tool_name", "dryrun", "dry_run",
    "runtool", "run_tool", "calltool", "call_tool",
    "invoketool", "invoke_tool",
  ];

  if (forbidden.some((token) => serialized.includes(token))) {
    return buildFallbackOutput(
      "TransitionOutput rejected by post-hoc safety filter: contained tool execution tokens",
    );
  }

  return output;
};
