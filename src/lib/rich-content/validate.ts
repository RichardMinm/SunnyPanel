import { createEmptyRichDocument } from "./defaults";
import { ensureRichContentBlockIds } from "./ids";
import type { RichContentDocument, RichContentNode } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const supportedNodeTypes = new Set([
  "blockquote",
  "bulletList",
  "callout",
  "codeBlock",
  "hardBreak",
  "heading",
  "horizontalRule",
  "image",
  "listItem",
  "orderedList",
  "paragraph",
  "table",
  "tableCell",
  "tableHeader",
  "tableRow",
  "taskItem",
  "taskList",
  "text",
]);

const inlineNodeTypes = new Set(["hardBreak", "text"]);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const isValidMarks = (marks: unknown): marks is RichContentNode["marks"] =>
  Array.isArray(marks) &&
  marks.every(
    (mark) => isRecord(mark) && isNonEmptyString(mark.type) && (!("attrs" in mark) || isRecord(mark.attrs)),
  );

const isValidRichContentNode = (value: unknown): value is RichContentNode => {
  if (!isRecord(value) || !isNonEmptyString(value.type) || !supportedNodeTypes.has(value.type)) {
    return false;
  }

  if ("attrs" in value && !isRecord(value.attrs)) {
    return false;
  }

  if ("marks" in value && !isValidMarks(value.marks)) {
    return false;
  }

  if ("text" in value && typeof value.text !== "string") {
    return false;
  }

  if ("content" in value) {
    return Array.isArray(value.content) && value.content.every(isValidRichContentNode);
  }

  return true;
};

const isTopLevelRichContentNode = (value: unknown): value is RichContentNode =>
  isValidRichContentNode(value) && !inlineNodeTypes.has(value.type);

const normalizeAttrs = (attrs: unknown) => (isRecord(attrs) ? attrs : undefined);

const normalizeMarks = (marks: unknown): RichContentNode["marks"] | undefined => {
  if (!Array.isArray(marks)) {
    return undefined;
  }

  const normalized = marks
    .filter((mark): mark is Record<string, unknown> => isRecord(mark) && typeof mark.type === "string")
    .map((mark) => ({
      type: mark.type as string,
      ...(isRecord(mark.attrs) ? { attrs: mark.attrs } : {}),
    }));

  return normalized.length > 0 ? normalized : undefined;
};

export const isRichContentDocument = (value: unknown): value is RichContentDocument =>
  isRecord(value) &&
  value.type === "doc" &&
  (value.content === undefined || (Array.isArray(value.content) && value.content.every(isTopLevelRichContentNode)));

const normalizeNode = (value: unknown): RichContentNode | null => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  const content = Array.isArray(value.content)
    ? value.content.map(normalizeNode).filter((node): node is RichContentNode => node !== null)
    : undefined;

  return {
    type: value.type,
    ...(normalizeAttrs(value.attrs) ? { attrs: normalizeAttrs(value.attrs) } : {}),
    ...(content ? { content } : {}),
    ...(normalizeMarks(value.marks) ? { marks: normalizeMarks(value.marks) } : {}),
    ...(typeof value.text === "string" ? { text: value.text } : {}),
  };
};

export const normalizeRichContentDocument = (value: unknown): RichContentDocument => {
  if (!isRichContentDocument(value)) {
    return createEmptyRichDocument();
  }

  return ensureRichContentBlockIds({
    type: "doc",
    content: (value.content ?? []).map(normalizeNode).filter((node): node is RichContentNode => node !== null),
  });
};
