import type { ContentOutlineItem, DerivedRichContentFields, RichContentDocument, RichContentNode } from "./types";

const wordsPerMinute = 220;
const cjkCharactersPerMinute = 500;
const excerptLength = 180;
const cjkCharacterPattern = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
const latinWordPattern = /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g;

const isHeadingLevel = (value: unknown): value is 1 | 2 | 3 =>
  value === 1 || value === 2 || value === 3;

const textBlockNodeTypes = new Set(["codeBlock", "heading", "paragraph"]);

const imageTextFromNode = (node: RichContentNode) => {
  const alt = node.attrs?.alt;
  const title = node.attrs?.title;

  if (typeof alt === "string" && alt.trim().length > 0) {
    return alt;
  }

  if (typeof title === "string" && title.trim().length > 0) {
    return title;
  }

  return "";
};

const textFromNode = (node: RichContentNode): string => {
  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  if (node.type === "image") {
    return imageTextFromNode(node);
  }

  return node.content?.map(textFromNode).join("") ?? "";
};

const blockTextFromNode = (node: RichContentNode): string[] => {
  if (node.type === "text") {
    const text = node.text?.trim() ?? "";
    return text.length > 0 ? [text] : [];
  }

  if (node.type === "image") {
    const text = imageTextFromNode(node).trim();
    return text.length > 0 ? [text] : [];
  }

  if (!textBlockNodeTypes.has(node.type)) {
    return node.content?.flatMap(blockTextFromNode) ?? [];
  }

  const text = textFromNode(node).trim();

  if (text.length > 0) {
    return [text];
  }

  return [];
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncateExcerpt = (value: string) => {
  if (value.length <= excerptLength) {
    return value;
  }

  return `${value.slice(0, excerptLength).trimEnd()}...`;
};

const wordCount = (value: string) => {
  const words = normalizeWhitespace(value).replace(cjkCharacterPattern, " ").match(latinWordPattern);
  return words?.length ?? 0;
};

const cjkCharacterCount = (value: string) => value.match(cjkCharacterPattern)?.length ?? 0;

const readingMinutes = (value: string) => {
  const normalized = normalizeWhitespace(value);

  if (normalized.length === 0) {
    return 0;
  }

  const estimatedMinutes = wordCount(normalized) / wordsPerMinute + cjkCharacterCount(normalized) / cjkCharactersPerMinute;

  return Math.max(1, Math.ceil(estimatedMinutes));
};

export const deriveRichContentFields = (document: RichContentDocument): DerivedRichContentFields => {
  const blocks = document.content ?? [];
  const contentText = blocks.flatMap(blockTextFromNode).join("\n");
  const plainText = normalizeWhitespace(contentText);
  const contentOutline: ContentOutlineItem[] = [];

  const collectOutline = (node: RichContentNode) => {
    const level = node.attrs?.level;

    if (node.type === "heading" && isHeadingLevel(level)) {
      const order = contentOutline.length;
      const id = typeof node.attrs?.id === "string" ? node.attrs.id : `heading-${order + 1}`;
      const text = normalizeWhitespace(textFromNode(node));

      if (text.length > 0) {
        contentOutline.push({ id, level, order, text });
      }
    }

    node.content?.forEach(collectOutline);
  };

  blocks.forEach(collectOutline);

  return {
    contentExcerpt: truncateExcerpt(plainText),
    contentOutline,
    contentText,
    readingMinutes: readingMinutes(plainText),
  };
};
