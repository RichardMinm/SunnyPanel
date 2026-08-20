/**
 * Unified structured model invocation with bounded retry and payload-free
 * Provider protocol diagnostics.
 *
 * Native JSON Schema and function-calling providers retain LangChain's
 * withStructuredOutput() path. Conservative prompt_json providers use the same
 * LangChain transport but parse one whole JSON object explicitly so the final
 * strict schema always sees the Provider's original parsed keys.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import type { z } from "zod";

import type { ChatMessage } from "./message-builder";
import type { ModelConfig } from "./model-config";
import type { ModelError, StructuredOutputDiagnostics } from "./model-errors";
import {
  modelAuthFailed,
  modelNotConfigured,
  modelRateLimited,
  modelTimeout,
  modelUnavailable,
  structuredOutputRetryExhausted,
  structuredOutputUnsupported,
} from "./model-errors";
import type { ModelFactory } from "./model-factory";
import { createChatModel } from "./model-factory";
import { extractWholePromptJson } from "./prompt-json-parser";
import {
  advanceSafeProtocolDiagnostics,
  createSafeProtocolDiagnostics,
  type SafeProtocolDiagnostics,
  type StructuredProtocolFailure,
} from "./structured-protocol";
import {
  getProviderCapabilities,
  type StructuredOutputMode,
} from "./provider-capabilities";

/* ---- Public types ---- */

export type InvokeStructuredOptions<TSchema extends z.ZodType> = {
  schema: TSchema;
  schemaName: string;
  messages: ChatMessage[];
  modelConfig: ModelConfig;
  modelFactory?: ModelFactory;
  signal?: AbortSignal;
  tags?: string[];
  maxTransportRetries?: number;
  maxSchemaRetries?: number;
  /**
   * A simplified schema may be used to classify base-schema failures. Its
   * transformed data is always discarded; the final schema validates the same
   * original parsed object.
   */
  modelSchema?: z.ZodType;
  providerAttemptAuthorizer?: (attempt: number) => void;
  providerAttemptObserver?: StructuredProviderAttemptObserver;
  timeoutRetryPolicy?: StructuredTimeoutRetryPolicy;
  schemaRepairInstruction?: (
    issues: StructuredOutputDiagnostics["issues"],
  ) => null | string;
};

export type StructuredTimeoutRetryPolicy = Readonly<{
  maxRetries: number;
  retryTimeoutMs: number;
}>;

export type StructuredRetryReason =
  | "connection_reset"
  | "network_transport"
  | "provider_5xx"
  | "rate_limit";

export type StructuredAttemptFailureReason =
  | StructuredRetryReason
  | "cancelled"
  | "non_retryable_transport"
  | "provider_protocol"
  | "timeout";

type StageEventPhase =
  | "providerResponseReceived"
  | "contentExtracted"
  | "jsonParsed"
  | "baseSchemaValidated"
  | "strictSchemaValidated";

export type StructuredProviderAttemptEvent =
  | { attempt: number; phase: "providerRequestStarted" }
  | {
      attempt: number;
      phase: StageEventPhase;
      safeProtocol: SafeProtocolDiagnostics;
    }
  | {
      attempt: number;
      phase: "semanticValidationCompleted";
      passed: boolean;
      safeProtocol: SafeProtocolDiagnostics;
    }
  | {
      attempt: number;
      phase: "failed";
      reason: StructuredAttemptFailureReason;
      retryScheduled: boolean;
      protocolFailure?: StructuredProtocolFailure;
      schemaIssues?: StructuredOutputDiagnostics["issues"];
      safeProtocol: SafeProtocolDiagnostics;
    };

export type StructuredProviderAttemptObserver = (
  event: StructuredProviderAttemptEvent,
) => void;

export type StructuredModelResult<T> =
  | { ok: true; data: T; provider: string; model: string }
  | { ok: false; error: ModelError };

type ProtocolFailureDetails = Readonly<{
  failure: StructuredProtocolFailure;
  diagnostics: SafeProtocolDiagnostics;
  issues: StructuredOutputDiagnostics["issues"];
}>;

class SafeProtocolFailureError extends Error {
  readonly details: ProtocolFailureDetails;

  constructor(details: ProtocolFailureDetails) {
    super("Structured Provider protocol failure");
    this.name = "SafeProtocolFailureError";
    this.details = details;
  }
}

class NativeSchemaValidationError extends Error {
  readonly issues: StructuredOutputDiagnostics["issues"];

  constructor(issues: StructuredOutputDiagnostics["issues"]) {
    super("Native structured output schema validation failed");
    this.name = "NativeSchemaValidationError";
    this.issues = issues;
  }
}

/* ---- Main entry point ---- */

export const invokeStructured = async <TSchema extends z.ZodType>(
  options: InvokeStructuredOptions<TSchema>,
): Promise<StructuredModelResult<z.infer<TSchema>>> => {
  const {
    schema,
    schemaName,
    messages,
    modelConfig,
    modelFactory = createChatModel,
    signal,
    tags = [],
    maxTransportRetries = 1,
    maxSchemaRetries = 1,
    modelSchema,
    providerAttemptAuthorizer,
    providerAttemptObserver,
    timeoutRetryPolicy,
    schemaRepairInstruction,
  } = options;

  const capabilities = getProviderCapabilities(modelConfig);
  const strategy = capabilities.structuredOutputMode;
  const configuredTimeoutRetries = boundedNonNegativeInteger(
    timeoutRetryPolicy?.maxRetries ?? 0,
  );
  const timeoutRetryMs = boundedPositiveInteger(
    timeoutRetryPolicy?.retryTimeoutMs ?? 0,
  );
  let timeoutRetriesRemaining =
    timeoutRetryMs === null ? 0 : configuredTimeoutRetries;
  const logicalTimeoutBudgetMs =
    timeoutRetryMs === null || configuredTimeoutRetries === 0
      ? null
      : modelConfig.timeoutMs + timeoutRetryMs * configuredTimeoutRetries;
  const logicalTimeoutDeadlineAt = logicalTimeoutBudgetMs === null
    ? null
    : Date.now() + logicalTimeoutBudgetMs;
  let providerAttempt = 0;
  let activeAttempt = 0;
  let activeAttemptStartedAt = 0;
  let responseEventEmitted = false;
  let safeProtocol = createSafeProtocolDiagnostics();

  const observeAttempt = (event: StructuredProviderAttemptEvent) => {
    try {
      providerAttemptObserver?.(event);
    } catch {
      // Evaluation instrumentation must never change Provider behavior.
    }
  };

  const advance = (
    patch: Partial<SafeProtocolDiagnostics>,
  ): SafeProtocolDiagnostics => {
    safeProtocol = advanceSafeProtocolDiagnostics(safeProtocol, patch);
    return safeProtocol;
  };

  const emitStage = (phase: StageEventPhase): void => {
    observeAttempt({ attempt: activeAttempt, phase, safeProtocol });
  };

  const markResponseReceivedWithoutEnvelope = (): void => {
    if (responseEventEmitted) return;
    responseEventEmitted = true;
    advance({
      responseReceived: true,
      latencyMs: Date.now() - activeAttemptStartedAt,
    });
    emitStage("providerResponseReceived");
  };

  let model: BaseChatModel;
  try {
    model = modelFactory(modelConfig, {
      safeResponseObserver: (observation) => {
        if (activeAttempt === 0) return;
        responseEventEmitted = true;
        advance({
          ...observation,
          latencyMs: Date.now() - activeAttemptStartedAt,
        });
        emitStage("providerResponseReceived");
      },
    });
  } catch {
    return {
      ok: false,
      error: modelNotConfigured("模型配置不可用，请检查 Agent 设置。"),
    };
  }

  const lcMessages = messages.map((message) => {
    switch (message.role) {
      case "system":
        return new SystemMessage(message.content);
      case "user":
        return new HumanMessage(message.content);
      case "assistant":
        return new AIMessage(message.content);
      default:
        return new HumanMessage(message.content);
    }
  });

  let structuredRunnable: Runnable<typeof lcMessages, unknown> | null = null;
  if (strategy !== "prompt_json") {
    try {
      structuredRunnable = buildStructuredRunnable(
        model,
        modelSchema ?? schema,
        schemaName,
        strategy,
      );
    } catch {
      return {
        ok: false,
        error: structuredOutputUnsupported(modelConfig.provider, modelConfig.model),
      };
    }
  }

  let lastStructuredOutputDiagnostics: StructuredOutputDiagnostics | undefined;
  let schemaRepairMessage: string | null = null;

  const scheduleRepairMessage = (
    issues: StructuredOutputDiagnostics["issues"],
  ): void => {
    if (!schemaRepairInstruction) return;
    try {
      const candidate = schemaRepairInstruction(issues)?.trim() ?? "";
      schemaRepairMessage = candidate.length > 0 ? candidate : null;
    } catch {
      schemaRepairMessage = null;
    }
  };

  transportLoop: for (
    let transportAttempt = 0;
    transportAttempt <= maxTransportRetries;
    transportAttempt += 1
  ) {
    schemaLoop: for (
      let schemaAttempt = 0;
      schemaAttempt <= maxSchemaRetries;
      schemaAttempt += 1
    ) {
      const attemptMessages = schemaRepairMessage
        ? [...lcMessages, new SystemMessage(schemaRepairMessage)]
        : lcMessages;
      let attemptTimeoutMs = modelConfig.timeoutMs;
      let isTimeoutRecoveryAttempt = false;

      providerAttemptLoop: while (true) {
        const remainingLogicalTimeoutMs = remainingTimeoutMs(
          logicalTimeoutDeadlineAt,
        );
        if (
          logicalTimeoutBudgetMs !== null
          && remainingLogicalTimeoutMs !== null
          && remainingLogicalTimeoutMs <= 0
        ) {
          return {
            ok: false,
            error: modelTimeout(
              logicalTimeoutBudgetMs,
              modelConfig.provider,
            ),
          };
        }
        const effectiveAttemptTimeoutMs = remainingLogicalTimeoutMs === null
          ? attemptTimeoutMs
          : Math.min(attemptTimeoutMs, remainingLogicalTimeoutMs);
        const attemptBoundedByLogicalDeadline =
          effectiveAttemptTimeoutMs < attemptTimeoutMs;
        const nextProviderAttempt = providerAttempt + 1;
        providerAttemptAuthorizer?.(nextProviderAttempt);
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(new DOMException("Timeout", "TimeoutError")),
          effectiveAttemptTimeoutMs,
        );
        const onCallerAbort = () => controller.abort();
        signal?.addEventListener("abort", onCallerAbort, { once: true });

        providerAttempt = nextProviderAttempt;
        activeAttempt = providerAttempt;
        activeAttemptStartedAt = Date.now();
        responseEventEmitted = false;
        safeProtocol = createSafeProtocolDiagnostics();
        observeAttempt({
          attempt: activeAttempt,
          phase: "providerRequestStarted",
        });

        try {
          let rawResult: unknown;

          if (strategy === "prompt_json") {
            const jsonModel = model.withConfig({
              outputVersion: "v0",
              response_format: { type: "json_object" },
            } as unknown as Parameters<typeof model.withConfig>[0]);
            const message = await jsonModel.invoke(attemptMessages, {
              signal: controller.signal,
              tags,
            });
            markResponseReceivedWithoutEnvelope();
            rawResult = parsePromptJsonMessage(
              message,
              modelSchema ?? schema,
              schema,
              {
                advance,
                emitStage,
                safeProtocol: () => safeProtocol,
              },
            );
          } else {
            const parsed = await structuredRunnable!.invoke(attemptMessages, {
              signal: controller.signal,
              tags,
            });
            markResponseReceivedWithoutEnvelope();
            rawResult = validateNativeStructuredResult(
              parsed,
              modelSchema ?? schema,
              schema,
              { advance, emitStage, safeProtocol: () => safeProtocol },
            );
          }

          clearTimeout(timeoutId);
          signal?.removeEventListener("abort", onCallerAbort);

          return {
            ok: true,
            data: rawResult as z.infer<TSchema>,
            provider: modelConfig.provider,
            model: modelConfig.model,
          };
        } catch (error) {
          clearTimeout(timeoutId);
          signal?.removeEventListener("abort", onCallerAbort);

          if (isCallerAbort(error, signal)) {
            advance({ latencyMs: Date.now() - activeAttemptStartedAt });
            observeAttempt({
              attempt: activeAttempt,
              phase: "failed",
              reason: "cancelled",
              retryScheduled: false,
              safeProtocol,
            });
            return {
              ok: false,
              error: {
                code: "MODEL_TIMEOUT",
                retryable: false,
                provider: modelConfig.provider,
                safeMessage: "请求已被取消。",
                structuredOutput: transportDiagnostics(safeProtocol),
              },
            };
          }

          if (isTimeoutError(error, controller.signal)) {
            const retryScheduled =
              !isTimeoutRecoveryAttempt
              && !attemptBoundedByLogicalDeadline
              && timeoutRetriesRemaining > 0
              && timeoutRetryMs !== null;
            if (retryScheduled) timeoutRetriesRemaining -= 1;
            advance({
              httpStatusClass: safeProtocol.responseReceived
                ? safeProtocol.httpStatusClass
                : "network_error",
              latencyMs: Date.now() - activeAttemptStartedAt,
            });
            observeAttempt({
              attempt: activeAttempt,
              phase: "failed",
              reason: "timeout",
              retryScheduled,
              safeProtocol,
            });
            if (retryScheduled) {
              isTimeoutRecoveryAttempt = true;
              attemptTimeoutMs = timeoutRetryMs;
              continue providerAttemptLoop;
            }
            return {
              ok: false,
              error: modelTimeout(
                effectiveAttemptTimeoutMs,
                modelConfig.provider,
                transportDiagnostics(safeProtocol),
              ),
            };
          }

          const observedEnvelopeFailure = classifyObservedEnvelopeFailure(
            error,
            safeProtocol,
          );
          if (error instanceof NativeSchemaValidationError) {
            const retryScheduled =
              !isTimeoutRecoveryAttempt
              && schemaAttempt < maxSchemaRetries
              && hasRemainingTimeout(logicalTimeoutDeadlineAt);
            lastStructuredOutputDiagnostics = {
              stage: "zod_validation",
              issues: error.issues,
            };
            observeAttempt({
              attempt: activeAttempt,
              phase: "failed",
              reason: "provider_protocol",
              retryScheduled,
              schemaIssues: error.issues,
              safeProtocol,
            });
            if (retryScheduled) {
              scheduleRepairMessage(error.issues);
              continue schemaLoop;
            }
            return {
              ok: false,
              error: structuredOutputRetryExhausted(
                maxSchemaRetries,
                modelConfig.provider,
                modelConfig.model,
                lastStructuredOutputDiagnostics,
              ),
            };
          }
          const protocolError = error instanceof SafeProtocolFailureError
            ? error
            : observedEnvelopeFailure;
          if (protocolError !== null) {
            const retryScheduled =
              !isTimeoutRecoveryAttempt
              && schemaAttempt < maxSchemaRetries
              && hasRemainingTimeout(logicalTimeoutDeadlineAt);
            lastStructuredOutputDiagnostics = protocolDiagnostics(
              protocolError.details,
            );
            observeAttempt({
              attempt: activeAttempt,
              phase: "failed",
              reason: "provider_protocol",
              retryScheduled,
              protocolFailure: protocolError.details.failure,
              schemaIssues: protocolError.details.issues,
              safeProtocol: protocolError.details.diagnostics,
            });
            if (retryScheduled) {
              scheduleRepairMessage(protocolError.details.issues);
              continue schemaLoop;
            }
            return {
              ok: false,
              error: structuredOutputRetryExhausted(
                maxSchemaRetries,
                modelConfig.provider,
                modelConfig.model,
                lastStructuredOutputDiagnostics,
              ),
            };
          }

          if (isOutputParserException(error)) {
            const retryScheduled =
              !isTimeoutRecoveryAttempt
              && schemaAttempt < maxSchemaRetries
              && hasRemainingTimeout(logicalTimeoutDeadlineAt);
            observeAttempt({
              attempt: activeAttempt,
              phase: "failed",
              reason: "provider_protocol",
              retryScheduled,
              safeProtocol,
            });
            lastStructuredOutputDiagnostics = {
              stage: "provider_protocol",
              issues: [],
            };
            if (retryScheduled) {
              scheduleRepairMessage([]);
              continue schemaLoop;
            }
            return {
              ok: false,
              error: structuredOutputRetryExhausted(
                maxSchemaRetries,
                modelConfig.provider,
                modelConfig.model,
                lastStructuredOutputDiagnostics,
              ),
            };
          }

          advance({
            httpStatusClass: safeProtocol.responseReceived
              ? safeProtocol.httpStatusClass
              : "network_error",
            latencyMs: Date.now() - activeAttemptStartedAt,
          });
          const retryReason = classifyStructuredTransportRetry(error);
          const transportRetryDelayMs = 500 * (transportAttempt + 1);
          const remainingBeforeTransportRetry = remainingTimeoutMs(
            logicalTimeoutDeadlineAt,
          );
          const retryScheduled =
            !isTimeoutRecoveryAttempt
            && retryReason !== null
            && transportAttempt < maxTransportRetries
            && (
              remainingBeforeTransportRetry === null
              || remainingBeforeTransportRetry > transportRetryDelayMs
            );
          observeAttempt({
            attempt: activeAttempt,
            phase: "failed",
            reason: retryReason ?? "non_retryable_transport",
            retryScheduled,
            safeProtocol,
          });

          if (retryScheduled) {
            await new Promise((resolve) =>
              setTimeout(resolve, transportRetryDelayMs));
            continue transportLoop;
          }

          const diagnostics = transportDiagnostics(safeProtocol);
          const status = getErrorStatus(error);
          if (status === 401 || status === 403) {
            return {
              ok: false,
              error: modelAuthFailed(modelConfig.provider, diagnostics),
            };
          }
          if (status === 429) {
            return {
              ok: false,
              error: modelRateLimited(
                modelConfig.provider,
                modelConfig.model,
                diagnostics,
              ),
            };
          }
          return {
            ok: false,
            error: modelUnavailable(
              modelConfig.provider,
              undefined,
              diagnostics,
            ),
          };
        }
      }
    }
  }

  return {
    ok: false,
    error: modelUnavailable(modelConfig.provider),
  };
};

const boundedNonNegativeInteger = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const boundedPositiveInteger = (value: number): number | null =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : null;

const remainingTimeoutMs = (deadlineAt: number | null): number | null =>
  deadlineAt === null ? null : Math.max(0, deadlineAt - Date.now());

const hasRemainingTimeout = (deadlineAt: number | null): boolean => {
  const remaining = remainingTimeoutMs(deadlineAt);
  return remaining === null || remaining > 0;
};

type ProtocolStageContext = Readonly<{
  advance: (
    patch: Partial<SafeProtocolDiagnostics>,
  ) => SafeProtocolDiagnostics;
  emitStage: (phase: StageEventPhase) => void;
  safeProtocol: () => SafeProtocolDiagnostics;
}>;

const parsePromptJsonMessage = <TSchema extends z.ZodType>(
  message: unknown,
  baseSchema: z.ZodType,
  strictSchema: TSchema,
  context: ProtocolStageContext,
): z.infer<TSchema> => {
  const diagnostics = context.safeProtocol();
  const finalContentAbsent =
    diagnostics.contentState === "missing"
    || diagnostics.contentState === "empty";
  if (diagnostics.finishReason === "length") {
    throwProtocol("provider_truncated", context, "content_extraction");
  }
  if (
    diagnostics.finishReason !== null
    && diagnostics.finishReason !== "stop"
  ) {
    if (
      finalContentAbsent
      && diagnostics.toolCallsPresent
    ) {
      throwProtocol("provider_tool_arguments_only", context, "content_extraction");
    }
    throwProtocol(
      "provider_finish_reason_unexpected",
      context,
      "content_extraction",
    );
  }
  if (
    diagnostics.httpStatusClass === "2xx"
    && diagnostics.choicesState !== "present"
  ) {
    throwProtocol(
      "provider_response_envelope_invalid",
      context,
      "not_started",
    );
  }
  if (finalContentAbsent) {
    if (diagnostics.reasoningPresent) {
      throwProtocol("provider_reasoning_only", context, "content_extraction");
    }
    if (diagnostics.toolCallsPresent) {
      throwProtocol("provider_tool_arguments_only", context, "content_extraction");
    }
    throwProtocol(
      diagnostics.contentState === "missing"
        ? "provider_missing_content"
        : "provider_empty_completion",
      context,
      "content_extraction",
    );
  }

  if (typeof message !== "object" || message === null || !("content" in message)) {
    throwProtocol(
      "provider_adapter_normalization_failed",
      context,
      "content_extraction",
    );
  }
  const content = (message as { content: unknown }).content;
  if (typeof content !== "string") {
    throwProtocol(
      "provider_adapter_normalization_failed",
      context,
      "content_extraction",
    );
  }
  const textContent = content as string;
  if (textContent.trim().length === 0) {
    throwProtocol("provider_empty_completion", context, "content_extraction");
  }

  context.advance({ parserSubstage: "content_extraction" });
  context.emitStage("contentExtracted");

  const extracted = extractWholePromptJson(textContent);
  const candidate = "candidate" in extracted ? extracted.candidate : null;
  if (candidate === null) {
    throwProtocol("provider_json_extraction_failed", context, "json_extraction");
  }

  let rawObject: unknown;
  try {
    rawObject = JSON.parse(candidate as string);
  } catch {
    throwProtocol("provider_json_parse_failed", context, "json_parse");
  }
  if (typeof rawObject !== "object" || rawObject === null || Array.isArray(rawObject)) {
    throwProtocol("provider_json_extraction_failed", context, "json_extraction");
  }

  context.advance({ parserSubstage: "json_parse" });
  context.emitStage("jsonParsed");

  context.advance({ baseSchemaReached: true, parserSubstage: "base_schema" });
  const baseValidated = baseSchema.safeParse(rawObject);
  if (!baseValidated.success) {
    throw new SafeProtocolFailureError({
      failure: "provider_base_schema_failed",
      diagnostics: context.safeProtocol(),
      issues: sanitizeZodIssues(baseValidated.error.issues, rawObject),
    });
  }
  context.emitStage("baseSchemaValidated");

  context.advance({ strictSchemaReached: true, parserSubstage: "strict_schema" });
  const strictValidated = strictSchema.safeParse(rawObject);
  if (!strictValidated.success) {
    throw new SafeProtocolFailureError({
      failure: "provider_strict_schema_failed",
      diagnostics: context.safeProtocol(),
      issues: sanitizeZodIssues(strictValidated.error.issues, rawObject),
    });
  }
  context.emitStage("strictSchemaValidated");
  return strictValidated.data;
};

const validateNativeStructuredResult = <TSchema extends z.ZodType>(
  result: unknown,
  baseSchema: z.ZodType,
  strictSchema: TSchema,
  context: ProtocolStageContext,
): z.infer<TSchema> => {
  const diagnostics = context.safeProtocol();
  if (diagnostics.finishReason === "length") {
    throwProtocol("provider_truncated", context, "content_extraction");
  }
  if (
    diagnostics.finishReason !== null
    && diagnostics.finishReason !== "stop"
  ) {
    throwProtocol(
      "provider_finish_reason_unexpected",
      context,
      "content_extraction",
    );
  }
  if (
    diagnostics.httpStatusClass === "2xx"
    && diagnostics.choicesState !== "present"
  ) {
    throwProtocol(
      "provider_response_envelope_invalid",
      context,
      "not_started",
    );
  }

  context.advance({ baseSchemaReached: true, parserSubstage: "base_schema" });
  const baseValidated = baseSchema.safeParse(result);
  if (!baseValidated.success) {
    throw new NativeSchemaValidationError(
      sanitizeZodIssues(baseValidated.error.issues, result),
    );
  }
  context.emitStage("baseSchemaValidated");

  context.advance({ strictSchemaReached: true, parserSubstage: "strict_schema" });
  const strictValidated = strictSchema.safeParse(result);
  if (!strictValidated.success) {
    throw new NativeSchemaValidationError(
      sanitizeZodIssues(strictValidated.error.issues, result),
    );
  }
  context.emitStage("strictSchemaValidated");
  return strictValidated.data;
};

const throwProtocol = (
  failure: StructuredProtocolFailure,
  context: ProtocolStageContext,
  parserSubstage: SafeProtocolDiagnostics["parserSubstage"],
): never => {
  context.advance({ parserSubstage });
  throw new SafeProtocolFailureError({
    failure,
    diagnostics: context.safeProtocol(),
    issues: [],
  });
};

const classifyObservedEnvelopeFailure = (
  error: unknown,
  diagnostics: SafeProtocolDiagnostics,
): SafeProtocolFailureError | null => {
  if (!diagnostics.responseReceived || diagnostics.httpStatusClass !== "2xx") {
    return null;
  }
  if (diagnostics.finishReason === "length") {
    return new SafeProtocolFailureError({
      failure: "provider_truncated",
      diagnostics,
      issues: [],
    });
  }
  if (
    diagnostics.finishReason !== null
    && diagnostics.finishReason !== "stop"
  ) {
    return new SafeProtocolFailureError({
      failure: "provider_finish_reason_unexpected",
      diagnostics,
      issues: [],
    });
  }
  if (
    diagnostics.choicesState === "missing"
    || diagnostics.choicesState === "empty"
    || diagnostics.choicesState === "not_available"
  ) {
    return new SafeProtocolFailureError({
      failure: "provider_response_envelope_invalid",
      diagnostics,
      issues: [],
    });
  }
  if (isOutputParserException(error)) {
    return new SafeProtocolFailureError({
      failure: "provider_adapter_normalization_failed",
      diagnostics,
      issues: [],
    });
  }
  return null;
};

const protocolDiagnostics = (
  details: ProtocolFailureDetails,
): StructuredOutputDiagnostics => ({
  stage: "provider_protocol",
  issues: details.issues,
  protocolFailure: details.failure,
  safeProtocol: details.diagnostics,
});

const transportDiagnostics = (
  diagnostics: SafeProtocolDiagnostics,
): StructuredOutputDiagnostics => ({
  stage: "provider_protocol",
  issues: [],
  safeProtocol: diagnostics,
});

const sanitizeZodIssues = (
  issues: readonly z.core.$ZodIssue[],
  value: unknown,
): StructuredOutputDiagnostics["issues"] => issues.map((issue) => ({
  code: issue.code,
  path: issue.path.map((segment) =>
    typeof segment === "symbol" ? segment.description ?? "symbol" : segment),
  missing: getValueAtPath(value, issue.path) === undefined,
}));

const getValueAtPath = (
  value: unknown,
  path: readonly PropertyKey[],
): unknown => {
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
};

const isOutputParserException = (error: unknown): boolean =>
  error instanceof Error
  && (
    error.name === "OutputParserException"
    || error.constructor?.name === "OutputParserException"
    || (error as unknown as Record<string, unknown>).lc_error_code
      === "OUTPUT_PARSING_FAILURE"
  );

const getBoundedErrorChain = (error: unknown): readonly Record<string, unknown>[] => {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null || seen.has(current)) {
      break;
    }
    seen.add(current);
    const record = current as Record<string, unknown>;
    chain.push(record);
    current = record.cause;
  }
  return chain;
};

const hasErrorIdentity = (
  error: unknown,
  identity: string,
): boolean => getBoundedErrorChain(error).some((item) =>
  item.name === identity
  || (
    typeof item.constructor === "function"
    && item.constructor.name === identity
  ));

const isTimeoutError = (error: unknown, attemptSignal: AbortSignal): boolean =>
  hasErrorIdentity(error, "TimeoutError")
  || hasErrorIdentity(error, "APIConnectionTimeoutError")
  || (
    attemptSignal.aborted
    && attemptSignal.reason instanceof DOMException
    && attemptSignal.reason.name === "TimeoutError"
  );

const isCallerAbort = (
  error: unknown,
  callerSignal: AbortSignal | undefined,
): boolean => callerSignal?.aborted === true
  || (error instanceof DOMException && error.name === "AbortError");

const getErrorStatus = (error: unknown): number | null => {
  for (const item of getBoundedErrorChain(error)) {
    const response = typeof item.response === "object" && item.response !== null
      ? item.response as Record<string, unknown>
      : undefined;
    const status = Number(item.status ?? item.statusCode ?? response?.status);
    if (Number.isInteger(status)) return status;
  }
  return null;
};

export const classifyStructuredTransportRetry = (
  error: unknown,
): StructuredRetryReason | null => {
  const chain = getBoundedErrorChain(error);
  if (chain.some((item) => item.providerPayloadReceived === true)) return null;

  for (const item of chain) {
    const code = typeof item.code === "string" ? item.code : "";
    if (code === "ECONNRESET") return "connection_reset";
    if (["ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN"].includes(code)) {
      return "network_transport";
    }
  }

  const status = getErrorStatus(error);
  if (status === 429) return "rate_limit";
  if (status !== null && [500, 502, 503, 504].includes(status)) {
    return "provider_5xx";
  }
  return null;
};

const buildStructuredRunnable = <TSchema extends z.ZodType>(
  model: BaseChatModel,
  schema: TSchema,
  schemaName: string,
  strategy: StructuredOutputMode,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Runnable<any, any> => {
  switch (strategy) {
    case "native_json_schema":
      return model.withStructuredOutput(schema, {
        name: schemaName,
        method: "jsonSchema",
        strict: true,
      });
    case "function_calling":
      return model.withStructuredOutput(schema, {
        name: schemaName,
        method: "functionCalling",
      });
    case "prompt_json":
    case "unsupported":
    default:
      throw new Error("Unsupported structured output strategy");
  }
};
