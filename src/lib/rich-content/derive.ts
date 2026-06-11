import type { ContentOutlineItem, DerivedRichContentFields, RichContentDocument, RichContentNode } from "./types";

const wordsPerMinute = 220;
const excerptLength = 180;

const isHeadingLevel = (value: unknown): value is 1 | 2 | 3 =>
  value === 1 || value === 2 || value === 3;

const textFromNode = (node: RichContentNode): string => {
  if (node.type === "text") {
    return node.text ?? "";
  }

  return node.content?.map(textFromNode).join("") ?? "";
};

const blockTextFromNode = (node: RichContentNode): string[] => {
  const text = textFromNode(node).trim();

  if (text.length > 0) {
    return [text];
  }

  return node.content?.flatMap(blockTextFromNode) ?? [];
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncateExcerpt = (value: string) => {
  if (value.length <= excerptLength) {
    return value;
  }

  return `${value.slice(0, excerptLength).trimEnd()}...`;
};

const wordCount = (value: string) => {
  const words = normalizeWhitespace(value).match(/\S+/g);
  return words?.length ?? 0;
};

export const deriveRichContentFields = (document: RichContentDocument): DerivedRichContentFields => {
  const blocks = document.content ?? [];
  const contentText = blocks.flatMap(blockTextFromNode).join("\n");
  const plainText = normalizeWhitespace(contentText);
  const contentOutline: ContentOutlineItem[] = [];

  blocks.forEach((node, order) => {
    const level = node.attrs?.level;

    if (node.type !== "heading" || !isHeadingLevel(level)) {
      return;
    }

    const id = typeof node.attrs?.id === "string" ? node.attrs.id : `heading-${order + 1}`;
    const text = normalizeWhitespace(textFromNode(node));

    if (text.length > 0) {
      contentOutline.push({ id, level, order, text });
    }
  });

  return {
    contentExcerpt: truncateExcerpt(plainText),
    contentOutline,
    contentText,
    readingMinutes: plainText.length === 0 ? 0 : Math.max(1, Math.ceil(wordCount(plainText) / wordsPerMinute)),
  };
};
