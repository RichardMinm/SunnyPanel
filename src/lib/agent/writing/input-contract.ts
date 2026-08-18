import { containsSensitiveLearningData } from "../learning/sensitive-data";
import { isRichContentDocument } from "@/lib/rich-content/validate";
import type { RichContentDocument } from "@/lib/rich-content/types";

export const MAX_WRITING_RICH_CONTENT_BYTES = 250_000;
const MAX_WRITING_RICH_CONTENT_DEPTH = 32;
const MAX_WRITING_RICH_CONTENT_NODES = 5_000;
const MAX_WRITING_RICH_TEXT_CHARS = 100_000;
// Each content level adds both an array container and a node object.
const MAX_WRITING_RICH_JSON_DEPTH = (MAX_WRITING_RICH_CONTENT_DEPTH * 2) + 8;
const MAX_WRITING_RICH_JSON_VALUES = 25_000;

const documentKeys = new Set(["content", "type"]);
const nodeKeys = new Set(["attrs", "content", "marks", "text", "type"]);
const markKeys = new Set(["attrs", "type"]);
const textEncoder = new TextEncoder();

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const encodedJsonScalarBytes = (value: string | number | boolean | null) => {
  const serialized = JSON.stringify(value);
  return textEncoder.encode(serialized).byteLength;
};

/**
 * Validates the complete JSON graph before any recursive validator or whole-value
 * serialization is allowed to see it. The byte total matches JSON punctuation and
 * scalar escaping without recursively calling JSON.stringify on containers.
 */
const hasSafeBoundedJsonShape = (value: unknown) => {
  const seen = new WeakSet<object>();
  const stack: Array<{ depth: number; value: unknown }> = [{ depth: 0, value }];
  let bytes = 0;
  let values = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    values += 1;
    if (
      values > MAX_WRITING_RICH_JSON_VALUES
      || current.depth > MAX_WRITING_RICH_JSON_DEPTH
    ) {
      return false;
    }

    if (
      current.value === null
      || typeof current.value === "string"
      || typeof current.value === "boolean"
    ) {
      bytes += encodedJsonScalarBytes(current.value);
    } else if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) return false;
      bytes += encodedJsonScalarBytes(current.value);
    } else if (Array.isArray(current.value)) {
      if (seen.has(current.value)) return false;
      seen.add(current.value);
      bytes += 2 + Math.max(0, current.value.length - 1);
      for (const item of current.value) {
        stack.push({ depth: current.depth + 1, value: item });
      }
    } else if (isPlainRecord(current.value)) {
      if (seen.has(current.value)) return false;
      seen.add(current.value);
      const entries = Object.entries(current.value);
      bytes += 2 + Math.max(0, entries.length - 1);
      for (const [key, entryValue] of entries) {
        bytes += encodedJsonScalarBytes(key) + 1;
        stack.push({ depth: current.depth + 1, value: entryValue });
      }
    } else {
      return false;
    }

    if (bytes > MAX_WRITING_RICH_CONTENT_BYTES) return false;
  }

  return true;
};

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
) => Object.keys(value).every((key) => allowedKeys.has(key));

export const isBoundedWritingRichContent = (
  value: unknown,
): value is RichContentDocument => {
  if (
    !isPlainRecord(value)
    || value.type !== "doc"
    || !hasOnlyKeys(value, documentKeys)
    || !hasSafeBoundedJsonShape(value)
  ) {
    return false;
  }

  let nodeCount = 0;
  let textChars = 0;
  const rootContent = "content" in value ? value.content : undefined;
  if (rootContent !== undefined && !Array.isArray(rootContent)) return false;
  const stack = (rootContent ?? []).map((node) => ({ depth: 1, node }));
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodeCount += 1;
    if (
      nodeCount > MAX_WRITING_RICH_CONTENT_NODES
      || current.depth > MAX_WRITING_RICH_CONTENT_DEPTH
    ) {
      return false;
    }
    if (
      !isPlainRecord(current.node)
      || !hasOnlyKeys(current.node, nodeKeys)
    ) {
      return false;
    }
    if ("text" in current.node && typeof current.node.text === "string") {
      textChars += current.node.text.length;
      if (textChars > MAX_WRITING_RICH_TEXT_CHARS) return false;
    }
    if ("marks" in current.node) {
      if (!Array.isArray(current.node.marks)) return false;
      for (const mark of current.node.marks) {
        if (!isPlainRecord(mark) || !hasOnlyKeys(mark, markKeys)) return false;
      }
    }
    const children = "content" in current.node
      ? current.node.content
      : undefined;
    if (children !== undefined && !Array.isArray(children)) return false;
    for (const child of children ?? []) {
      stack.push({ depth: current.depth + 1, node: child });
    }
  }

  return isRichContentDocument(value);
};

export type WritingAssistInputValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ code: "invalid_input" | "sensitive_input"; ok: false }>;

export const validateWritingAssistInput = (
  request: Readonly<{
    contentRich?: unknown;
    summary?: string;
    text?: string;
    title?: string;
  }>,
): WritingAssistInputValidation => {
  if (
    (request.title?.length ?? 0) > 500
    || (request.summary?.length ?? 0) > 4_000
    || (request.text?.length ?? 0) > 50_000
    || (
      request.contentRich !== undefined
      && !isBoundedWritingRichContent(request.contentRich)
    )
  ) {
    return { code: "invalid_input", ok: false };
  }

  const sensitiveCandidate = [
    request.title,
    request.summary,
    request.text,
    request.contentRich ? JSON.stringify(request.contentRich) : null,
  ].filter((item): item is string => Boolean(item)).join("\n");

  return containsSensitiveLearningData(sensitiveCandidate)
    ? { code: "sensitive_input", ok: false }
    : { ok: true };
};
