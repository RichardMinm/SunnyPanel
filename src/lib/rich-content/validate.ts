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

const topLevelNodeTypes = new Set([
  "blockquote",
  "bulletList",
  "callout",
  "codeBlock",
  "heading",
  "horizontalRule",
  "image",
  "orderedList",
  "paragraph",
  "table",
  "taskList",
]);

const inlineNodeTypes = new Set(["hardBreak", "text"]);
const listItemNodeTypes = topLevelNodeTypes;
const listNodeTypes = new Set(["listItem"]);
const leafNodeTypes = new Set(["hardBreak", "horizontalRule", "image", "text"]);
const tableCellNodeTypes = topLevelNodeTypes;
const tableNodeTypes = new Set(["tableRow"]);
const tableRowNodeTypes = new Set(["tableCell", "tableHeader"]);
const taskListNodeTypes = new Set(["taskItem"]);
const textNodeTypes = new Set(["text"]);

const childNodeTypesByParent = new Map<string, Set<string>>([
  ["doc", topLevelNodeTypes],
  ["blockquote", topLevelNodeTypes],
  ["bulletList", listNodeTypes],
  ["callout", topLevelNodeTypes],
  ["codeBlock", textNodeTypes],
  ["heading", inlineNodeTypes],
  ["listItem", listItemNodeTypes],
  ["orderedList", listNodeTypes],
  ["paragraph", inlineNodeTypes],
  ["table", tableNodeTypes],
  ["tableCell", tableCellNodeTypes],
  ["tableHeader", tableCellNodeTypes],
  ["tableRow", tableRowNodeTypes],
  ["taskItem", listItemNodeTypes],
  ["taskList", taskListNodeTypes],
]);

const supportedMarkTypes = new Set(["bold", "code", "italic", "link", "strike"]);
const safeImageSrcProtocols = new Set(["http:", "https:"]);
const safeHrefProtocols = new Set(["http:", "https:", "mailto:"]);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isNonEmptyTrimmedString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isHeadingLevel = (value: unknown): value is 1 | 2 | 3 => value === 1 || value === 2 || value === 3;
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const hasOptionalNullableStringAttr = (attrs: Record<string, unknown>, key: string) =>
  !(key in attrs) || attrs[key] === null || typeof attrs[key] === "string";

const hasOnlyAttrs = (attrs: Record<string, unknown>, keys: string[]) =>
  Object.keys(attrs).every((key) => keys.includes(key));

const hasOptionalPositiveIntegerAttr = (attrs: Record<string, unknown>, key: string) =>
  !(key in attrs) || isPositiveInteger(attrs[key]);

const hasOptionalBooleanAttr = (attrs: Record<string, unknown>, key: string) =>
  !(key in attrs) || typeof attrs[key] === "boolean";

const hasOptionalColwidthAttr = (attrs: Record<string, unknown>) =>
  !("colwidth" in attrs) ||
  attrs.colwidth === null ||
  (Array.isArray(attrs.colwidth) && attrs.colwidth.every(isPositiveInteger));

const hasValidIdAttr = (attrs: Record<string, unknown>) => hasOptionalNullableStringAttr(attrs, "id");

const hasIdOnlyAttrs = (attrs: unknown) =>
  attrs === undefined || (isRecord(attrs) && hasOnlyAttrs(attrs, ["id"]) && hasValidIdAttr(attrs));

const isSafeHref = (href: unknown): href is string => {
  if (!isNonEmptyTrimmedString(href)) {
    return false;
  }

  const trimmedHref = href.trim();
  if ((trimmedHref.startsWith("/") && !trimmedHref.startsWith("//")) || trimmedHref.startsWith("#")) {
    return true;
  }

  try {
    return safeHrefProtocols.has(new URL(trimmedHref).protocol);
  } catch {
    return false;
  }
};

const isSafeImageSrc = (src: unknown): src is string => {
  if (!isNonEmptyTrimmedString(src)) {
    return false;
  }

  const trimmedSrc = src.trim();
  if (trimmedSrc.startsWith("//") || trimmedSrc.startsWith("#")) {
    return false;
  }

  try {
    const parsed = new URL(trimmedSrc, "https://sunny.local");

    return parsed.origin === "https://sunny.local" || safeImageSrcProtocols.has(parsed.protocol);
  } catch {
    return false;
  }
};

const isValidNodeAttrs = (nodeType: string, attrs: unknown) => {
  switch (nodeType) {
    case "blockquote":
    case "bulletList":
    case "callout":
    case "horizontalRule":
    case "listItem":
    case "paragraph":
    case "table":
    case "taskList":
      return hasIdOnlyAttrs(attrs);
    case "codeBlock":
      return (
        attrs === undefined ||
        (isRecord(attrs) &&
          hasOnlyAttrs(attrs, ["id", "language"]) &&
          hasValidIdAttr(attrs) &&
          hasOptionalNullableStringAttr(attrs, "language"))
      );
    case "heading":
      return isRecord(attrs) && hasOnlyAttrs(attrs, ["id", "level"]) && hasValidIdAttr(attrs) && isHeadingLevel(attrs.level);
    case "image":
      return (
        isRecord(attrs) &&
        hasOnlyAttrs(attrs, ["id", "src", "alt", "title", "width", "height"]) &&
        hasValidIdAttr(attrs) &&
        isSafeImageSrc(attrs.src) &&
        hasOptionalNullableStringAttr(attrs, "alt") &&
        hasOptionalNullableStringAttr(attrs, "title") &&
        hasOptionalNullableStringAttr(attrs, "width") &&
        hasOptionalNullableStringAttr(attrs, "height")
      );
    case "orderedList":
      return (
        attrs === undefined ||
        (isRecord(attrs) &&
          hasOnlyAttrs(attrs, ["id", "start", "type"]) &&
          hasValidIdAttr(attrs) &&
          hasOptionalPositiveIntegerAttr(attrs, "start") &&
          hasOptionalNullableStringAttr(attrs, "type"))
      );
    case "tableCell":
    case "tableHeader":
      return (
        attrs === undefined ||
        (isRecord(attrs) &&
          hasOnlyAttrs(attrs, ["colspan", "rowspan", "colwidth"]) &&
          hasOptionalPositiveIntegerAttr(attrs, "colspan") &&
          hasOptionalPositiveIntegerAttr(attrs, "rowspan") &&
          hasOptionalColwidthAttr(attrs))
      );
    case "tableRow":
      return attrs === undefined;
    case "taskItem":
      return (
        attrs === undefined ||
        (isRecord(attrs) &&
          hasOnlyAttrs(attrs, ["id", "checked"]) &&
          hasValidIdAttr(attrs) &&
          hasOptionalBooleanAttr(attrs, "checked"))
      );
    case "text":
      return attrs === undefined;
    default:
      return attrs === undefined;
  }
};

const isValidMark = (mark: unknown): mark is NonNullable<RichContentNode["marks"]>[number] => {
  if (!isRecord(mark) || !isNonEmptyString(mark.type) || !supportedMarkTypes.has(mark.type)) {
    return false;
  }

  if (mark.type === "link") {
    return (
      isRecord(mark.attrs) &&
      hasOnlyAttrs(mark.attrs, ["href", "target", "rel", "class"]) &&
      isSafeHref(mark.attrs.href) &&
      hasOptionalNullableStringAttr(mark.attrs, "target") &&
      hasOptionalNullableStringAttr(mark.attrs, "rel") &&
      hasOptionalNullableStringAttr(mark.attrs, "class")
    );
  }

  return !("attrs" in mark);
};

const isValidMarks = (marks: unknown): marks is RichContentNode["marks"] =>
  Array.isArray(marks) && marks.every(isValidMark);

const hasNonEmptyContent = (node: Record<string, unknown>): node is Record<string, unknown> & { content: unknown[] } =>
  Array.isArray(node.content) && node.content.length > 0;

const hasOptionalNonEmptyContent = (
  node: Record<string, unknown>,
): node is Record<string, unknown> & { content?: unknown[] } =>
  !("content" in node) || (Array.isArray(node.content) && node.content.length > 0);

const isNodeType = (value: unknown, nodeType: string) =>
  isRecord(value) && value.type === nodeType;

const hasValidChildren = (node: { content: unknown[] }, nodeType: string) =>
  node.content.every((child) => isValidRichContentNode(child, nodeType));

const hasValidContentShape = (node: Record<string, unknown>, nodeType: string) => {
  if (leafNodeTypes.has(nodeType)) {
    return !("content" in node);
  }

  switch (nodeType) {
    case "codeBlock":
    case "heading":
    case "paragraph":
      return hasOptionalNonEmptyContent(node) && (!node.content || hasValidChildren({ content: node.content }, nodeType));
    case "blockquote":
    case "bulletList":
    case "callout":
    case "orderedList":
    case "table":
    case "tableCell":
    case "tableHeader":
    case "tableRow":
    case "taskList":
      return hasNonEmptyContent(node) && hasValidChildren(node, nodeType);
    case "listItem":
    case "taskItem":
      return hasNonEmptyContent(node) && isNodeType(node.content[0], "paragraph") && hasValidChildren(node, nodeType);
    default:
      return false;
  }
};

const isValidRichContentNode = (value: unknown, parentType: string): value is RichContentNode => {
  if (!isRecord(value) || !isNonEmptyString(value.type) || !supportedNodeTypes.has(value.type)) {
    return false;
  }

  const nodeType = value.type;
  const allowedChildTypes = childNodeTypesByParent.get(parentType);
  if (!allowedChildTypes?.has(nodeType)) {
    return false;
  }

  if (nodeType === "text" && "attrs" in value) {
    return false;
  }

  if (nodeType !== "text" && "text" in value) {
    return false;
  }

  if ("attrs" in value && !isRecord(value.attrs)) {
    return false;
  }

  if (!isValidNodeAttrs(nodeType, value.attrs)) {
    return false;
  }

  if (nodeType !== "text" && "marks" in value) {
    return false;
  }

  if (nodeType === "text" && "marks" in value && !isValidMarks(value.marks)) {
    return false;
  }

  if (parentType === "codeBlock" && "marks" in value) {
    return false;
  }

  if (nodeType === "text" && !isNonEmptyString(value.text)) {
    return false;
  }

  if ("text" in value && typeof value.text !== "string") {
    return false;
  }

  return hasValidContentShape(value, nodeType);
};

const isTopLevelRichContentNode = (value: unknown): value is RichContentNode =>
  isValidRichContentNode(value, "doc");

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
