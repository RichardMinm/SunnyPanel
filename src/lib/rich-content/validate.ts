import { createEmptyRichDocument } from "./defaults";
import { ensureRichContentBlockIds } from "./ids";
import type { RichContentDocument, RichContentNode } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  isRecord(value) && value.type === "doc" && (value.content === undefined || Array.isArray(value.content));

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
