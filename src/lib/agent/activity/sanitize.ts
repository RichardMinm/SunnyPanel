import { isRecord } from "@/lib/shared/is-record";

const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|secret|token|api[-_]?key|apikey|session|csrf|bearer/i;
const MAX_STRING_LENGTH = 320;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 50;

const redactSensitiveText = (value: string) =>
  value
    .replace(/authorization\s*[:=]\s*[^,\n;]+/gi, "Authorization: [redacted]")
    .replace(/cookie\s*[:=]\s*[^,\n;]+/gi, "Cookie: [redacted]")
    .replace(/set-cookie\s*[:=]\s*[^,\n;]+/gi, "Set-Cookie: [redacted]")
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:access_?|refresh_?)?token\s*[:=]\s*[^,\n;]+/gi, "token: [redacted]")
    .replace(/\bclient_?secret\s*[:=]\s*[^,\n;]+/gi, "client_secret: [redacted]")
    .replace(/\bcsrf\s*[:=]\s*[^,\n;]+/gi, "csrf: [redacted]")
    .replace(/\b(password|secret|api[-_]?key|apikey)\s*[:=]\s*[^,\n;]+/gi, "$1: [redacted]");

const truncateString = (value: string) => {
  const redacted = redactSensitiveText(value);

  if (redacted.length <= MAX_STRING_LENGTH) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
};

export const sanitizeAgentActivityDetails = (value: unknown, depth = 0): unknown => {
  if (depth > 5) {
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
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeAgentActivityDetails(item, depth + 1));

    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[${value.length - MAX_ARRAY_ITEMS} more items truncated]`);
    }

    return items;
  }

  if (!isRecord(value)) {
    return "[unsupported]";
  }

  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
  const sanitized: Record<string, unknown> = {};

  for (const [key, entryValue] of entries) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[redacted]"
      : sanitizeAgentActivityDetails(entryValue, depth + 1);
  }

  if (Object.keys(value).length > MAX_OBJECT_KEYS) {
    sanitized.__truncatedKeys = Object.keys(value).length - MAX_OBJECT_KEYS;
  }

  return sanitized;
};

export const sanitizeAgentActivityDetailsRecord = (value: unknown): Record<string, unknown> | undefined => {
  const sanitized = sanitizeAgentActivityDetails(value);

  return isRecord(sanitized) ? sanitized : undefined;
};
