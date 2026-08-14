/**
 * Payload-free diagnostics for OpenAI-compatible structured-output attempts.
 *
 * The values exported from this module deliberately describe only protocol
 * shape. Provider message content, reasoning, tool arguments, headers, and
 * error bodies are inspected only as short-lived local values and are never
 * returned by this boundary.
 */

export type StructuredProtocolFailure =
  | "provider_empty_completion"
  | "provider_missing_content"
  | "provider_reasoning_only"
  | "provider_tool_arguments_only"
  | "provider_json_extraction_failed"
  | "provider_json_parse_failed"
  | "provider_base_schema_failed"
  | "provider_strict_schema_failed"
  | "provider_truncated"
  | "provider_finish_reason_unexpected"
  | "provider_response_envelope_invalid"
  | "provider_adapter_normalization_failed";

export type SafeProtocolDiagnostics = Readonly<{
  responseReceived: boolean;
  httpStatusClass: "2xx" | "4xx" | "5xx" | "network_error" | "not_available";
  choicesState: "missing" | "empty" | "present" | "not_available";
  contentState: "missing" | "empty" | "present" | "not_available";
  reasoningPresent: boolean;
  toolCallsPresent: boolean;
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "unknown" | null;
  parserSubstage:
    | "not_started"
    | "content_extraction"
    | "json_extraction"
    | "json_parse"
    | "base_schema"
    | "strict_schema"
    | "semantic_validation"
    | "completed";
  baseSchemaReached: boolean;
  strictSchemaReached: boolean;
  semanticValidationReached: boolean;
  latencyMs: number | null;
}>;

export type SafeProviderResponseObservation = Pick<
  SafeProtocolDiagnostics,
  | "responseReceived"
  | "httpStatusClass"
  | "choicesState"
  | "contentState"
  | "reasoningPresent"
  | "toolCallsPresent"
  | "finishReason"
>;

export type SafeProviderResponseObserver = (
  observation: SafeProviderResponseObservation,
) => void;

export const createSafeProtocolDiagnostics = (): SafeProtocolDiagnostics =>
  Object.freeze({
    responseReceived: false,
    httpStatusClass: "not_available",
    choicesState: "not_available",
    contentState: "not_available",
    reasoningPresent: false,
    toolCallsPresent: false,
    finishReason: null,
    parserSubstage: "not_started",
    baseSchemaReached: false,
    strictSchemaReached: false,
    semanticValidationReached: false,
    latencyMs: null,
  });

const statusClass = (
  status: number,
): SafeProtocolDiagnostics["httpStatusClass"] => {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "not_available";
};

const normalizeFinishReason = (
  value: unknown,
): SafeProtocolDiagnostics["finishReason"] => {
  if (value === null || value === undefined) return null;
  if (
    value === "stop"
    || value === "length"
    || value === "tool_calls"
    || value === "content_filter"
  ) {
    return value;
  }
  return "unknown";
};

const isNonEmptyValue = (value: unknown): boolean => {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
};

const inspectResponsesEnvelope = (
  envelope: Record<string, unknown>,
  fallback: SafeProviderResponseObservation,
): SafeProviderResponseObservation | null => {
  if (envelope.object !== "response" && !Array.isArray(envelope.output)) {
    return null;
  }

  const status = envelope.status;
  const finishReason: SafeProtocolDiagnostics["finishReason"] =
    status === "completed"
      ? "stop"
      : status === "incomplete"
        ? "length"
        : status === "failed" || status === "cancelled"
          ? "unknown"
          : null;

  const output = envelope.output;
  if (!Array.isArray(output)) {
    return Object.freeze({
      ...fallback,
      choicesState: "missing",
      finishReason,
    });
  }
  if (output.length === 0) {
    return Object.freeze({
      ...fallback,
      choicesState: "empty",
      finishReason,
    });
  }

  let contentObserved = false;
  let textPresent = false;
  let reasoningPresent = false;
  let toolCallsPresent = false;

  for (const item of output) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.type === "reasoning") reasoningPresent = true;
    if (
      record.type === "function_call"
      || record.type === "custom_tool_call"
      || record.type === "web_search_call"
    ) {
      toolCallsPresent = true;
    }
    if (record.type !== "message" || !Array.isArray(record.content)) continue;
    contentObserved = true;
    for (const part of record.content) {
      if (typeof part !== "object" || part === null || Array.isArray(part)) {
        continue;
      }
      const contentPart = part as Record<string, unknown>;
      if (
        contentPart.type === "output_text"
        && typeof contentPart.text === "string"
        && contentPart.text.trim().length > 0
      ) {
        textPresent = true;
      }
    }
  }

  return Object.freeze({
    ...fallback,
    choicesState: "present",
    contentState: textPresent
      ? "present"
      : contentObserved
        ? "empty"
        : "missing",
    finishReason,
    reasoningPresent,
    toolCallsPresent,
  });
};

/** Inspect one cloned response and return only bounded protocol shape. */
export const inspectSafeProviderResponse = async (
  response: Response,
): Promise<SafeProviderResponseObservation> => {
  const fallback: SafeProviderResponseObservation = Object.freeze({
    responseReceived: true,
    httpStatusClass: statusClass(response.status),
    choicesState: "not_available",
    contentState: "not_available",
    reasoningPresent: false,
    toolCallsPresent: false,
    finishReason: null,
  });

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return fallback;
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fallback;
  }

  const envelope = body as Record<string, unknown>;
  const responsesObservation = inspectResponsesEnvelope(envelope, fallback);
  if (responsesObservation) return responsesObservation;

  if (!("choices" in envelope)) {
    return Object.freeze({ ...fallback, choicesState: "missing" });
  }
  if (!Array.isArray(envelope.choices)) return fallback;
  if (envelope.choices.length === 0) {
    return Object.freeze({ ...fallback, choicesState: "empty" });
  }

  const firstChoice = envelope.choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null) {
    return Object.freeze({ ...fallback, choicesState: "present" });
  }
  const choice = firstChoice as Record<string, unknown>;
  const finishReason = normalizeFinishReason(choice.finish_reason);
  const message = choice.message;
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return Object.freeze({
      ...fallback,
      choicesState: "present",
      finishReason,
    });
  }

  const messageRecord = message as Record<string, unknown>;
  const hasContent = Object.prototype.hasOwnProperty.call(messageRecord, "content");
  const content = messageRecord.content;
  const contentState: SafeProtocolDiagnostics["contentState"] = !hasContent
    ? "missing"
    : typeof content === "string" && content.trim().length === 0
      ? "empty"
      : content === null || content === undefined
        ? "missing"
        : "present";

  return Object.freeze({
    responseReceived: true,
    httpStatusClass: statusClass(response.status),
    choicesState: "present",
    contentState,
    reasoningPresent:
      isNonEmptyValue(messageRecord.reasoning_content)
      || isNonEmptyValue(messageRecord.reasoning),
    toolCallsPresent: isNonEmptyValue(messageRecord.tool_calls),
    finishReason,
  });
};

/**
 * Wrap fetch without changing its result. Inspection failures are swallowed:
 * evaluation instrumentation must never alter Provider behavior.
 */
export const createSafeProtocolFetch = (
  baseFetch: typeof fetch,
  observer: SafeProviderResponseObserver,
): typeof fetch => async (input, init) => {
  const response = await baseFetch(input, init);
  try {
    observer(await inspectSafeProviderResponse(response));
  } catch {
    // Safe diagnostics are best-effort and may not affect the invocation.
  }
  return response;
};

export const advanceSafeProtocolDiagnostics = (
  current: SafeProtocolDiagnostics,
  patch: Partial<SafeProtocolDiagnostics>,
): SafeProtocolDiagnostics => Object.freeze({ ...current, ...patch });
