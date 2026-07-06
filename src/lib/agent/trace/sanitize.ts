import { isRecord } from "@/lib/shared/is-record";

import type {
  AgentTraceErrorSummary,
  AgentTraceEventPayload,
} from "./types";

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|password|secret|token|api[-_]?key|apikey|session|raw[-_]?prompt|raw[-_]?response|raw[-_]?input|raw[-_]?output/i;
const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/authorization\s*[:=]\s*[^,\n;]+/gi, "Authorization: [redacted]"],
  [/cookie\s*[:=]\s*[^,\n;]+/gi, "Cookie: [redacted]"],
  [/bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\b(password|secret|token|api[-_]?key|apikey)\s*[:=]\s*[^,\n;]+/gi, "$1: [redacted]"],
];

const MAX_STRING_LENGTH = 320;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 50;
const MAX_DEPTH = 5;

const redactSensitiveText = (value: string) =>
  SENSITIVE_TEXT_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );

const truncateString = (value: string) => {
  const redacted = redactSensitiveText(value);

  if (redacted.length <= MAX_STRING_LENGTH) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
};

export const sanitizeAgentTraceValue = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) {
    return "[truncated]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeAgentTraceValue(item, depth + 1));

    if (value.length > MAX_ARRAY_ITEMS) {
      sanitized.push(`[${value.length - MAX_ARRAY_ITEMS} more items truncated]`);
    }

    return sanitized;
  }

  if (!isRecord(value)) {
    return "[unsupported]";
  }

  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
  const sanitized: Record<string, unknown> = {};

  for (const [key, entryValue] of entries) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[redacted]"
      : sanitizeAgentTraceValue(entryValue, depth + 1);
  }

  if (Object.keys(value).length > MAX_OBJECT_KEYS) {
    sanitized.__truncatedKeys = Object.keys(value).length - MAX_OBJECT_KEYS;
  }

  return sanitized;
};

const sanitizeTraceError = (
  error: AgentTraceErrorSummary | undefined,
): AgentTraceErrorSummary | undefined => {
  if (!error) {
    return undefined;
  }

  return {
    ...(error.code ? { code: truncateString(error.code) } : {}),
    message: truncateString(error.message),
    ...(error.name ? { name: truncateString(error.name) } : {}),
  };
};

export const sanitizeAgentTraceEvent = (
  event: AgentTraceEventPayload,
): AgentTraceEventPayload => ({
  ...event,
  ...(event.actionId ? { actionId: truncateString(event.actionId) } : {}),
  ...(event.apiPath ? { apiPath: truncateString(event.apiPath) } : {}),
  ...(event.error ? { error: sanitizeTraceError(event.error) } : {}),
  ...(event.inputPreview !== undefined
    ? { inputPreview: sanitizeAgentTraceValue(event.inputPreview) }
    : {}),
  ...(event.intent ? { intent: truncateString(event.intent) } : {}),
  ...(event.method ? { method: truncateString(event.method) } : {}),
  ...(event.outputPreview !== undefined
    ? { outputPreview: sanitizeAgentTraceValue(event.outputPreview) }
    : {}),
  ...(event.runId ? { runId: truncateString(event.runId) } : {}),
  ...(event.summary ? { summary: truncateString(event.summary) } : {}),
  threadId: truncateString(event.threadId),
  title: truncateString(event.title),
  ...(event.toolName ? { toolName: truncateString(event.toolName) } : {}),
});
