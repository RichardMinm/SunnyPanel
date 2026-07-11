/** Read/clarify-only Router canary gate and single-call coordinator. */

import { classifyIntentRoute } from "../llm/schemas/router-output";
import { createClarifyIntent, type AgentIntent } from "../schemas";
import {
  invokeRouterCandidate,
  isRouterShadowEnabledForActor,
  observeRouterShadowCandidate,
  scheduleRouterShadow,
  type RouterShadowInput,
  type RouterShadowResult,
} from "./router-shadow";
import {
  normalizeRouterCanaryTimeoutMs,
  resolveRouterCanaryMode,
  resolveRouterCanaryTimeoutMs,
  type RouterCanaryMode,
} from "./router-canary-config";

export type RouterCanaryActor = "admin" | "user";

export type CanaryDecisionReason =
  | "adopted_clarify"
  | "adopted_read"
  | "compound_excluded"
  | "disabled"
  | "invalid_resource"
  | "low_confidence"
  | "not_allowlisted"
  | "provider_failure"
  | "schema_failure"
  | "timeout"
  | "unsafe_mismatch"
  | "unsupported_intent"
  | "write_excluded";

export type RouterCanaryDecision = {
  adopted: boolean;
  decision: AgentIntent;
  latencyMs: number;
  reason: CanaryDecisionReason;
};

export type DecideRouterCanaryInput = {
  actor: RouterCanaryActor;
  candidate: RouterShadowResult | null;
  invalidResource?: boolean;
  latencyMs?: number;
  mode: RouterCanaryMode;
  primary: AgentIntent;
  timedOut?: boolean;
  unsafeMismatch?: boolean;
};

const MIN_ROUTER_CANARY_CONFIDENCE = 0.8;

const fallback = (
  primary: AgentIntent,
  reason: CanaryDecisionReason,
  latencyMs = 0,
): RouterCanaryDecision => ({ adopted: false, decision: primary, latencyMs, reason });

export const decideRouterCanary = (
  input: DecideRouterCanaryInput,
): RouterCanaryDecision => {
  const latencyMs = input.latencyMs ?? 0;
  if (input.mode === "off") return fallback(input.primary, "disabled", latencyMs);
  if (input.actor !== "admin") return fallback(input.primary, "not_allowlisted", latencyMs);
  if (input.timedOut) return fallback(input.primary, "timeout", latencyMs);

  const candidate = input.candidate;
  if (!candidate || candidate.failureKind === "provider") {
    return fallback(input.primary, "provider_failure", latencyMs);
  }
  if (input.invalidResource || candidate.errorCode === "ROUTER_CONTEXT_REFERENCE_INVALID") {
    return fallback(input.primary, "invalid_resource", latencyMs);
  }
  if (candidate.failureKind === "schema" || candidate.schemaValid !== true) {
    return fallback(input.primary, "schema_failure", latencyMs);
  }
  if (candidate.readWriteClass === "write_candidate") {
    return fallback(input.primary, "write_excluded", latencyMs);
  }
  if (candidate.mode !== "single") {
    return fallback(
      input.primary,
      candidate.mode === "compound" ? "compound_excluded" : "schema_failure",
      latencyMs,
    );
  }
  if (
    typeof candidate.confidence !== "number"
    || candidate.confidence < MIN_ROUTER_CANARY_CONFIDENCE
    || candidate.riskFlags?.includes("low_confidence")
  ) {
    return fallback(input.primary, "low_confidence", latencyMs);
  }
  if (input.unsafeMismatch || (candidate.riskFlags?.length ?? 0) > 0) {
    return fallback(input.primary, "unsafe_mismatch", latencyMs);
  }
  if (!candidate.intent || classifyIntentRoute(candidate.intent) === "write_candidate") {
    return fallback(input.primary, "unsupported_intent", latencyMs);
  }

  const clarifyClass = candidate.readWriteClass === "clarify";
  const clarifyIntent = candidate.intent === "clarify";
  if (clarifyClass !== clarifyIntent) {
    return fallback(input.primary, "unsafe_mismatch", latencyMs);
  }
  if (clarifyClass) {
    const question = candidate.clarificationQuestion?.trim();
    if (!question || candidate.needsClarification !== true) {
      return fallback(input.primary, "schema_failure", latencyMs);
    }
    const decision = {
      ...createClarifyIntent(question, candidate.missingFields ?? []),
      confidence: candidate.confidence,
    };
    return { adopted: true, decision, latencyMs, reason: "adopted_clarify" };
  }

  if (candidate.readWriteClass !== "answer") {
    return fallback(input.primary, "unsupported_intent", latencyMs);
  }

  /* C0 is deliberately agreement-only for reads: RouterOutput args are not a
   * domain-validated AgentIntent payload, so a different read route cannot be
   * adopted without entering the explicitly deferred query-dispatch work. */
  if (candidate.intent !== input.primary.intent || classifyIntentRoute(input.primary.intent) !== "answer") {
    return fallback(input.primary, "unsafe_mismatch", latencyMs);
  }

  return {
    adopted: true,
    decision: { ...input.primary, confidence: candidate.confidence },
    latencyMs,
    reason: "adopted_read",
  };
};

export type RouterCanaryRoutingInput = RouterShadowInput & {
  actor: RouterCanaryActor;
  primary: AgentIntent;
  timeoutMs?: number;
};

export type RouterCanaryRuntimeDependencies = {
  invokeCandidate?: (input: RouterShadowInput) => Promise<RouterShadowResult | null>;
  isShadowEnabled?: () => boolean;
  observeShadow?: (candidate: RouterShadowResult | null) => void;
  scheduleShadow?: () => void;
};

export type RouterCanaryCollectorEntry = {
  adopted: boolean;
  candidateIntent?: string;
  latencyMs: number;
  primaryIntent: string;
  reason: CanaryDecisionReason;
  timestamp: string;
};

const collector: RouterCanaryCollectorEntry[] = [];
const MAX_COLLECTOR_SIZE = 100;

export const clearRouterCanaryCollector = (): void => { collector.length = 0; };
export const getRouterCanaryCollectorEntries = (): readonly RouterCanaryCollectorEntry[] => collector;

const collect = (
  input: RouterCanaryRoutingInput,
  candidate: RouterShadowResult | null,
  decision: RouterCanaryDecision,
): void => {
  if (collector.length >= MAX_COLLECTOR_SIZE) collector.shift();
  collector.push({
    adopted: decision.adopted,
    ...(candidate?.intent ? { candidateIntent: candidate.intent } : {}),
    latencyMs: decision.latencyMs,
    primaryIntent: input.primary.intent,
    reason: decision.reason,
    timestamp: new Date().toISOString(),
  });
};

const providerFailureCandidate = (): RouterShadowResult => ({
  attempted: true,
  errorCode: "MODEL_ABORTED",
  failureKind: "provider",
});

export const resolveRouterCanaryRouting = async (
  input: RouterCanaryRoutingInput,
  dependencies: RouterCanaryRuntimeDependencies = {},
): Promise<RouterCanaryDecision> => {
  const mode = resolveRouterCanaryMode();
  if (mode === "off" || input.actor !== "admin") {
    (dependencies.scheduleShadow ?? (() => scheduleRouterShadow({
      actor: input.actor,
      hasActivePlans: input.context.hasActivePlans,
      hasChecklists: input.context.hasChecklists,
      hasMemories: input.context.hasMemories,
      message: input.message,
      now: input.context.now,
      primaryIntent: input.primary.intent,
    })))();
    return decideRouterCanary({ actor: input.actor, candidate: null, mode, primary: input.primary });
  }

  if (input.signal?.aborted) {
    const decision = decideRouterCanary({
      actor: input.actor,
      candidate: providerFailureCandidate(),
      mode,
      primary: input.primary,
    });
    collect(input, null, decision);
    return decision;
  }

  const timeoutMs = input.timeoutMs === undefined
    ? resolveRouterCanaryTimeoutMs()
    : normalizeRouterCanaryTimeoutMs(input.timeoutMs);
  const controller = new AbortController();
  const startedAt = Date.now();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let externalAbortHandler: (() => void) | undefined;

  const candidatePromise = (dependencies.invokeCandidate ?? invokeRouterCandidate)({
    ...input,
    signal: controller.signal,
  }).catch(() => providerFailureCandidate());
  const timeoutToken = Symbol("timeout");
  const abortToken = Symbol("abort");
  const timeoutPromise = new Promise<typeof timeoutToken>((resolve) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      resolve(timeoutToken);
    }, timeoutMs);
  });
  const abortPromise = new Promise<typeof abortToken>((resolve) => {
    if (!input.signal) return;
    externalAbortHandler = () => {
      controller.abort();
      resolve(abortToken);
    };
    input.signal.addEventListener("abort", externalAbortHandler, { once: true });
  });

  const raced = await Promise.race([candidatePromise, timeoutPromise, abortPromise]);
  if (timeoutHandle) clearTimeout(timeoutHandle);
  if (externalAbortHandler) input.signal?.removeEventListener("abort", externalAbortHandler);
  const latencyMs = Date.now() - startedAt;

  if (raced === timeoutToken || raced === abortToken) {
    void candidatePromise.catch(() => undefined);
    const decision = decideRouterCanary({
      actor: input.actor,
      candidate: raced === timeoutToken ? null : providerFailureCandidate(),
      latencyMs,
      mode,
      primary: input.primary,
      timedOut: raced === timeoutToken,
    });
    collect(input, null, decision);
    return decision;
  }

  const candidateResult = raced;
  const shadowEnabled = dependencies.isShadowEnabled?.()
    ?? isRouterShadowEnabledForActor(input.actor);
  if (shadowEnabled) {
    try {
      (dependencies.observeShadow ?? ((result) => observeRouterShadowCandidate({
        actor: input.actor,
        hasActivePlans: input.context.hasActivePlans,
        hasChecklists: input.context.hasChecklists,
        hasMemories: input.context.hasMemories,
        message: input.message,
        now: input.context.now,
        primaryIntent: input.primary.intent,
      }, result)))(candidateResult);
    } catch {
      /* Shadow observation is best-effort and cannot suppress Canary. */
    }
  }

  const decision = decideRouterCanary({
    actor: input.actor,
    candidate: candidateResult,
    invalidResource: candidateResult?.errorCode === "ROUTER_CONTEXT_REFERENCE_INVALID",
    latencyMs,
    mode,
    primary: input.primary,
    unsafeMismatch:
      candidateResult?.readWriteClass === "write_candidate"
      && classifyIntentRoute(input.primary.intent) !== "write_candidate",
  });
  collect(input, candidateResult, decision);
  return decision;
};
