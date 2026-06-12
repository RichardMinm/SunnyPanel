import { ensureRichContentBlockIds } from "./ids";
import type { RichContentBlock, RichContentDocument, RichContentNode } from "./types";

const textNode = (text: string): RichContentNode => ({ type: "text", text });

const paragraph = (text: string): RichContentBlock => ({
  type: "paragraph",
  ...(text.length > 0 ? { content: [textNode(text)] } : {}),
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
  ...(text.length > 0 ? { content: [paragraph(text)] } : {}),
});

const bulletList = (items: string[]): RichContentBlock => ({
  type: "bulletList",
  content: items.map((item) => ({
    type: "listItem",
    content: [paragraph(item)],
  })),
});

const orderedList = (items: string[], start: number): RichContentBlock => ({
  type: "orderedList",
  attrs: { start },
  content: items.map((item) => ({
    type: "listItem",
    content: [paragraph(item)],
  })),
});

const codeBlock = (text: string, language: string): RichContentBlock => ({
  type: "codeBlock",
  attrs: { language },
  ...(text.length > 0 ? { content: [textNode(text)] } : {}),
});

const stripOptionalImageTitle = (value: string) => {
  const trimmed = value.trim();
  const quote = trimmed[trimmed.length - 1];

  if (quote !== "\"" && quote !== "'") {
    return trimmed;
  }

  const titleStart = trimmed.lastIndexOf(quote, trimmed.length - 2);

  if (titleStart <= 0 || !/\s/.test(trimmed[titleStart - 1] ?? "")) {
    return trimmed;
  }

  return trimmed.slice(0, titleStart).trimEnd();
};

const parseStandaloneImage = (line: string): { alt: string; src: string } | null => {
  const match = line.match(/^!\[([^\]]*)\]\((.*)\)$/);

  if (!match) {
    return null;
  }

  const src = stripOptionalImageTitle(match[2] ?? "");

  if (src.length === 0) {
    return null;
  }

  return {
    alt: match[1] ?? "",
    src,
  };
};

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

type CodeFence = {
  info: string;
  length: number;
  marker: "`" | "~";
};

const parseCodeFence = (line: string): CodeFence | null => {
  const match = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
  const fence = match?.[1];

  if (!fence) {
    return null;
  }

  return {
    info: match[2] ?? "",
    length: fence.length,
    marker: fence[0] as "`" | "~",
  };
};

const isClosingCodeFence = (line: string, openingFence: CodeFence) => {
  const closingFence = parseCodeFence(line);

  return (
    closingFence !== null &&
    closingFence.marker === openingFence.marker &&
    closingFence.length >= openingFence.length &&
    closingFence.info.trim().length === 0
  );
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

    const imageMatch = parseStandaloneImage(trimmed);
    if (imageMatch) {
      flushParagraph(blocks, paragraphLines);
      blocks.push(image(imageMatch.src, imageMatch.alt));
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

    const orderedListMatch = trimmed.match(/^(\d+)[.)]\s+/);
    if (orderedListMatch?.[1]) {
      flushParagraph(blocks, paragraphLines);
      const { items, nextIndex } = collectList(lines, index, /^\s*\d+[.)]\s+(.+)$/);
      blocks.push(orderedList(items, Number(orderedListMatch[1])));
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

      const quoteText = quoteLines.join(" ").trim();

      if (quoteText.length > 0) {
        blocks.push(blockquote(quoteText));
      }

      index -= 1;
      continue;
    }

    const codeFence = parseCodeFence(trimmed);
    if (codeFence) {
      flushParagraph(blocks, paragraphLines);
      const language = codeFence.info.trim().split(/\s+/)[0] || "text";
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !isClosingCodeFence(lines[index] ?? "", codeFence)) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push(codeBlock(codeLines.join("\n"), language));
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
