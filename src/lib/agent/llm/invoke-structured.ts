/** Unified structured model invocation service.
 *
 * Wraps LangChain's `withStructuredOutput()` with provider-aware strategy
 * selection, typed error handling, cancellation support, and bounded retry.
 *
 * Unlike the legacy `completeStructured` in complete-structured.ts, this
 * service NEVER uses JSON substring extraction (no `extractJSONObject`,
 * no `{`/`}` scanning). The entire model response must be valid JSON that
 * parses against the supplied Zod schema.
 *
 * ## Retry Contract
 *
 * ChatOpenAI is created with `maxRetries=0` — all retry logic lives here.
 *
 * Two independent retry counters:
 *   maxTransportRetries (default 1) — network, HTTP 5xx, rate-limit, provider errors.
 *     Exhausted → returns MODEL_UNAVAILABLE.
 *     Each transport retry resets the schema retry counter.
 *   maxSchemaRetries (default 1) — OutputParserException, Zod validation failure.
 *     Exhausted → returns STRUCTURED_OUTPUT_RETRY_EXHAUSTED.
 *
 * NEVER retried: config errors (MODEL_NOT_CONFIGURED), abort (AbortError),
 *   timeout (TimeoutError), auth failures (401).
 *
 * Maximum provider calls per invocation:
 *   schema-only failures: (1 + maxSchemaRetries).
 *   transport-only failures: (1 + maxTransportRetries).
 *   mixed (worst case): (1 + maxTransportRetries) × (1 + maxSchemaRetries).
 */

import type { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Runnable } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { ModelConfig } from "./model-config";
import type { ModelError } from "./model-errors";
import type { StructuredOutputDiagnostics } from "./model-errors";
import {
  modelNotConfigured,
  modelTimeout,
  modelUnavailable,
  structuredOutputRetryExhausted,
  structuredOutputUnsupported,
} from "./model-errors";
import type { ModelFactory } from "./model-factory";
import { createChatModel } from "./model-factory";
import { getProviderCapabilities, type StructuredOutputMode } from "./provider-capabilities";
import type { ChatMessage } from "./message-builder";

/* ---- Public types ---- */

export type InvokeStructuredOptions<TSchema extends z.ZodType> = {
  /** The Zod schema to validate against. */
  schema: TSchema;
  /** Human-readable name for the schema (used in error messages). */
  schemaName: string;
  /** Messages to send (system, context, history, user request). */
  messages: ChatMessage[];
  /** Validated model configuration. */
  modelConfig: ModelConfig;
  /** Injectable model factory (defaults to createChatModel). */
  modelFactory?: ModelFactory;
  /** Caller-provided cancellation signal. */
  signal?: AbortSignal;
  /** LangChain tags for tracing. */
  tags?: string[];
  /** Maximum transport (network/HTTP) retries. Default 1.
   *  Config errors, abort, timeout, and auth failures are NEVER retried. */
  maxTransportRetries?: number;
  /** Maximum schema repair (parse/validation) retries. Default 1.
   *  Each schema retry causes an additional provider call.
   *  Config errors, abort, timeout are NEVER retried. */
  maxSchemaRetries?: number;
  /** Optional simplified schema for LangChain model construction.
   *  Use when the main schema has .strict() or .superRefine() that
   *  LangChain's withStructuredOutput cannot convert to JSON Schema.
   *  The main `schema` is still used for post-invoke validation.
   *  If omitted, `schema` is used for both. */
  modelSchema?: z.ZodType;
};

export type StructuredModelResult<T> =
  | { ok: true; data: T; provider: string; model: string }
  | { ok: false; error: ModelError };

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
  } = options;

  /* 1. Build the LangChain chat model.
   *    ChatOpenAI is created with maxRetries=0 — we own all retry. */
  let model: BaseChatModel;

  try {
    model = modelFactory(modelConfig);
  } catch (err) {
    return {
      ok: false,
      error: modelNotConfigured(
        `Failed to create chat model: ${err instanceof Error ? err.message : String(err)}`,
      ),
    };
  }

  /* 2. Determine structured output strategy */
  const capabilities = getProviderCapabilities(modelConfig.provider);
  const strategy = capabilities.structuredOutputMode;

  /* 3. Convert messages to LangChain format */
  const lcMessages = messages.map((m) => {
    switch (m.role) {
      case "system":
        return new SystemMessage(m.content);
      case "user":
        return new HumanMessage(m.content);
      case "assistant":
        return new AIMessage(m.content);
      default:
        return new HumanMessage(m.content);
    }
  });

  let lastStructuredOutputDiagnostics: StructuredOutputDiagnostics | undefined;

  /* 4. Build the structured runnable */
  let structuredRunnable: Runnable<typeof lcMessages, z.infer<TSchema>>;

  try {
    /* Use modelSchema for LangChain if provided (avoids .strict()/.superRefine() issues).
     *   The main `schema` is always used for post-invoke validation. */
    structuredRunnable = buildStructuredRunnable(model, modelSchema ?? schema, schemaName, strategy);
  } catch {
    return {
      ok: false,
      error: structuredOutputUnsupported(
        modelConfig.provider,
        modelConfig.model,
      ),
    };
  }

  /* 5. Transport retry loop (outer) — network/HTTP/provider errors */
  for (let transportAttempt = 0; transportAttempt <= maxTransportRetries; transportAttempt++) {
    /* 5a. Schema retry loop (inner) — parse/validation errors */
    for (let schemaAttempt = 0; schemaAttempt <= maxSchemaRetries; schemaAttempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(new DOMException("Timeout", "TimeoutError")),
        modelConfig.timeoutMs,
      );

      const onCallerAbort = () => controller.abort();
      signal?.addEventListener("abort", onCallerAbort, { once: true });

      try {
        const result = await structuredRunnable.invoke(lcMessages, {
          signal: controller.signal,
          tags,
        });

        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onCallerAbort);

        /* Double-validate with Zod for defense in depth */
        const validated = schema.safeParse(result);

        if (validated.success) {
          return {
            ok: true,
            data: validated.data as z.infer<TSchema>,
            provider: modelConfig.provider,
            model: modelConfig.model,
          };
        }

        lastStructuredOutputDiagnostics = {
          stage: "zod_validation",
          issues: validated.error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path.map((segment) =>
              typeof segment === "symbol"
                ? segment.description ?? "symbol"
                : segment,
            ),
            missing: getValueAtPath(result, issue.path) === undefined,
          })),
        };

        /* Schema validation failed — retry if we have schema attempts left */
        if (schemaAttempt < maxSchemaRetries) {
          continue; /* inner loop: schema retry */
        }

        /* Schema retries exhausted */
        return {
          ok: false,
          error: structuredOutputRetryExhausted(
            maxSchemaRetries,
            modelConfig.provider,
            modelConfig.model,
            lastStructuredOutputDiagnostics,
          ),
        };
      } catch (err) {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onCallerAbort);

        /* NEVER retry: timeout */
        if (err instanceof DOMException && err.name === "TimeoutError") {
          return {
            ok: false,
            error: modelTimeout(modelConfig.timeoutMs, modelConfig.provider),
          };
        }

        /* NEVER retry: caller abort */
        if (err instanceof DOMException && err.name === "AbortError") {
          return {
            ok: false,
            error: {
              code: "MODEL_TIMEOUT",
              retryable: false,
              provider: modelConfig.provider,
              safeMessage: "请求已被取消。",
            },
          };
        }

        /* Schema retry: OutputParserException or Zod validation failure.
         *   Check both err.name and constructor.name for cross-version compat. */
        if (
          err instanceof Error
          && (err.name === "OutputParserException"
            || err.constructor?.name === "OutputParserException"
            || (err as unknown as Record<string, unknown>).lc_error_code === "OUTPUT_PARSING_FAILURE")
        ) {
          lastStructuredOutputDiagnostics = {
            stage: "provider_protocol",
            issues: [],
          };

          if (schemaAttempt < maxSchemaRetries) {
            continue; /* inner loop: schema retry */
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

        /* Transport retry: network/HTTP/provider errors.
         *   Break out of inner loop to retry at the transport level. */
        if (transportAttempt < maxTransportRetries) {
          await new Promise((r) => setTimeout(r, 500 * (transportAttempt + 1)));
          break; /* exit inner loop → retry at transport level */
        }

        /* Transport retries exhausted */
        return {
          ok: false,
          error: modelUnavailable(modelConfig.provider, err),
        };
      }
    }
  }

  /* Should not reach here, but safety net */
  return {
    ok: false,
    error: modelUnavailable(modelConfig.provider),
  };
};

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

/* ---- Internal helpers ---- */

/** Build a structured output runnable using the appropriate strategy.
 *  Returns a Runnable that, when invoked, produces validated output. */
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
      });

    case "function_calling":
      return model.withStructuredOutput(schema, {
        name: schemaName,
        method: "functionCalling",
      });

    case "prompt_json":
    default:
      return model.withStructuredOutput(schema, {
        name: schemaName,
        method: "jsonMode",
      });
  }
};
