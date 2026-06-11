import { ensureRichContentBlockIds } from "./ids";
import type { RichContentBlock, RichContentDocument, RichContentNode } from "./types";

const textNode = (text: string): RichContentNode => ({ type: "text", text });

const paragraph = (text: string): RichContentBlock => ({
  type: "paragraph",
  content: [textNode(text)],
});

const image = (src: string, alt: string): RichContentBlock => ({
  type: "image",
  attrs: { src, alt },
});

const heading = (level: number, text: string): RichContentBlock => ({
  type: "heading",
  attrs: { level: Math.min(Math.max(level, 1), 3) },
  content: [textNode(text)],
});

const blockquote = (text: string): RichContentBlock => ({
  type: "blockquote",
  content: [paragraph(text)],
});

const bulletList = (items: string[]): RichContentBlock => ({
  type: "bulletList",
  content: items.map((item) => ({
    type: "listItem",
    content: [paragraph(item)],
  })),
});

const orderedList = (items: string[]): RichContentBlock => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: items.map((item) => ({
    type: "listItem",
    content: [paragraph(item)],
  })),
});

const codeBlock = (text: string): RichContentBlock => ({
  type: "codeBlock",
  content: [textNode(text)],
});

const flushParagraph = (blocks: RichContentBlock[], paragraphLines: string[]) => {
  if (paragraphLines.length === 0) {
    return;
  }

  blocks.push(paragraph(paragraphLines.join(" ")));
  paragraphLines.length = 0;
};

const collectList = (lines: string[], start: number, pattern: RegExp) => {
  const items: string[] = [];
  let index = start;

  while (index < lines.length) {
    const match = lines[index]?.match(pattern);

    if (!match?.[1]) {
      break;
    }

    items.push(match[1].trim());
    index += 1;
  }

  return { items, nextIndex: index };
};

export const markdownToRichContent = (markdown: string): RichContentDocument => {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: RichContentBlock[] = [];
  const paragraphLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flushParagraph(blocks, paragraphLines);
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)$/);
    if (imageMatch?.[2]) {
      flushParagraph(blocks, paragraphLines);
      blocks.push(image(imageMatch[2], imageMatch[1] ?? ""));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch?.[1] && headingMatch[2]) {
      flushParagraph(blocks, paragraphLines);
      blocks.push(heading(headingMatch[1].length, headingMatch[2].trim()));
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph(blocks, paragraphLines);
      const { items, nextIndex } = collectList(lines, index, /^\s*[-*+]\s+(.+)$/);
      blocks.push(bulletList(items));
      index = nextIndex - 1;
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushParagraph(blocks, paragraphLines);
      const { items, nextIndex } = collectList(lines, index, /^\s*\d+[.)]\s+(.+)$/);
      blocks.push(orderedList(items));
      index = nextIndex - 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph(blocks, paragraphLines);
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index]?.trim().startsWith(">")) {
        quoteLines.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push(blockquote(quoteLines.join(" ").trim()));
      index -= 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph(blocks, paragraphLines);
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index]?.trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push(codeBlock(codeLines.join("\n")));
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph(blocks, paragraphLines);

  return ensureRichContentBlockIds({
    type: "doc",
    content: blocks,
  });
};
