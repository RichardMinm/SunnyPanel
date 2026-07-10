/** Unified structured model invocation service.
 *
 * Wraps LangChain's `withStructuredOutput()` with provider-aware strategy
 * selection, typed error handling, cancellation support, and bounded retry.
 *
 * Unlike the legacy `completeStructured` in complete-structured.ts, this
 * service NEVER uses JSON substring extraction (no `extractJSONObject`,
 * no `{`/`}` scanning). The entire model response must be valid JSON that
 * parses against the supplied Zod schema.
 */

import type { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Runnable } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { ModelConfig } from "./model-config";
import type { ModelError } from "./model-errors";
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
  /** Maximum schema repair retries (default 1). */
  maxSchemaRetries?: number;
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
    maxSchemaRetries = 1,
  } = options;

  /* 1. Build the LangChain chat model */
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

  /* 4. Build the structured runnable */
  let structuredRunnable: Runnable<typeof lcMessages, z.infer<TSchema>>;

  try {
    structuredRunnable = buildStructuredRunnable(model, schema, schemaName, strategy);
  } catch {
    return {
      ok: false,
      error: structuredOutputUnsupported(
        modelConfig.provider,
        modelConfig.model,
      ),
    };
  }

  /* 5. Invoke with timeout + cancellation protection */
  for (let attempt = 0; attempt <= maxSchemaRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new DOMException("Timeout", "TimeoutError")),
      modelConfig.timeoutMs,
    );

    const onCallerAbort = () => controller.abort();
    signal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      /* On success, LangChain returns the validated structured output directly. */
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

      /* Validation failed — retry if we have attempts left */
      if (attempt < maxSchemaRetries) {
        continue;
      }

      return {
        ok: false,
        error: structuredOutputRetryExhausted(
          maxSchemaRetries,
          modelConfig.provider,
          modelConfig.model,
        ),
      };
    } catch (err) {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onCallerAbort);

      /* Don't retry on cancellation or timeout */
      if (err instanceof DOMException) {
        if (err.name === "TimeoutError") {
          return {
            ok: false,
            error: modelTimeout(
              modelConfig.timeoutMs,
              modelConfig.provider,
            ),
          };
        }

        if (err.name === "AbortError") {
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
      }

      /* Check if it's a structured output parse error from LangChain */
      if (err instanceof Error && err.name === "OutputParserException") {
        if (attempt < maxSchemaRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }

        return {
          ok: false,
          error: structuredOutputRetryExhausted(
            maxSchemaRetries,
            modelConfig.provider,
            modelConfig.model,
          ),
        };
      }

      /* Network/HTTP errors from LangChain — last attempt? */
      if (attempt >= maxSchemaRetries) {
        return {
          ok: false,
          error: modelUnavailable(modelConfig.provider, err),
        };
      }

      /* Wait briefly before retry */
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
  }

  /* Should not reach here, but safety net */
  return {
    ok: false,
    error: structuredOutputRetryExhausted(
      maxSchemaRetries,
      modelConfig.provider,
      modelConfig.model,
    ),
  };
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
        method: "json_schema",
      });

    case "function_calling":
      return model.withStructuredOutput(schema, {
        name: schemaName,
        method: "function_calling",
      });

    case "prompt_json":
    default:
      return model.withStructuredOutput(schema, {
        name: schemaName,
        method: "function_calling",
      });
  }
};
