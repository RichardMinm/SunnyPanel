/** Typed error contract for the LLM model layer.
 *
 * Every error includes a `safeMessage` that is suitable for user-facing display
 * and agent activity logs — it must never contain API keys, raw request headers,
 * or provider response bodies.
 *
 * The `retryable` flag lets callers decide whether to retry without inspecting
 * internal provider details.
 */

export type ModelErrorCode =
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_RATE_LIMITED"
  | "MODEL_AUTH_FAILED"
  | "MODEL_TIMEOUT"
  | "MODEL_INVALID_RESPONSE"
  | "MODEL_SCHEMA_VIOLATION"
  | "STRUCTURED_OUTPUT_UNSUPPORTED"
  | "STRUCTURED_OUTPUT_INVALID"
  | "STRUCTURED_OUTPUT_RETRY_EXHAUSTED";

export type ModelError = Readonly<{
  code: ModelErrorCode;
  retryable: boolean;
  provider?: string;
  model?: string;
  safeMessage: string;
  cause?: unknown;
}>;

/* ---- Constructors ---- */

export const modelNotConfigured = (
  reason = "Model config is missing or incomplete",
): ModelError => ({
  code: "MODEL_NOT_CONFIGURED",
  retryable: false,
  safeMessage: reason,
});

export const modelUnavailable = (
  provider?: string,
  cause?: unknown,
): ModelError => ({
  code: "MODEL_UNAVAILABLE",
  retryable: true,
  provider,
  safeMessage: "AI 服务暂时不可用，请稍后重试。",
  cause,
});

export const modelRateLimited = (
  provider?: string,
  model?: string,
): ModelError => ({
  code: "MODEL_RATE_LIMITED",
  retryable: true,
  provider,
  model,
  safeMessage: "请求频率过高，请稍后重试。",
});

export const modelAuthFailed = (
  provider?: string,
): ModelError => ({
  code: "MODEL_AUTH_FAILED",
  retryable: false,
  provider,
  safeMessage: "AI 服务认证失败，请检查 API 配置。",
});

export const modelTimeout = (
  timeoutMs: number,
  provider?: string,
): ModelError => ({
  code: "MODEL_TIMEOUT",
  retryable: true,
  provider,
  safeMessage: `请求超时（${Math.round(timeoutMs / 1000)}s），请稍后重试。`,
});

export const modelInvalidResponse = (
  detail: string,
  provider?: string,
  model?: string,
): ModelError => ({
  code: "MODEL_INVALID_RESPONSE",
  retryable: true,
  provider,
  model,
  safeMessage: detail,
});

export const modelSchemaViolation = (
  issues: string,
  provider?: string,
  model?: string,
): ModelError => ({
  code: "MODEL_SCHEMA_VIOLATION",
  retryable: true,
  provider,
  model,
  safeMessage: `模型输出格式不符合预期: ${issues}`,
});

export const structuredOutputUnsupported = (
  provider?: string,
  model?: string,
): ModelError => ({
  code: "STRUCTURED_OUTPUT_UNSUPPORTED",
  retryable: false,
  provider,
  model,
  safeMessage: "当前模型不支持结构化输出。",
});

export const structuredOutputInvalid = (
  issues: string,
  provider?: string,
  model?: string,
): ModelError => ({
  code: "STRUCTURED_OUTPUT_INVALID",
  retryable: true,
  provider,
  model,
  safeMessage: `结构化输出验证失败: ${issues}`,
});

export const structuredOutputRetryExhausted = (
  maxRetries: number,
  provider?: string,
  model?: string,
): ModelError => ({
  code: "STRUCTURED_OUTPUT_RETRY_EXHAUSTED",
  retryable: false,
  provider,
  model,
  safeMessage: `结构化输出重试已达上限（${maxRetries} 次）。`,
});

/* ---- Type guard ---- */

export const isModelError = (value: unknown): value is ModelError =>
  typeof value === "object"
  && value !== null
  && "code" in value
  && "safeMessage" in value
  && "retryable" in value;
