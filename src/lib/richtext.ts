type RichNode = {
  children?: unknown;
  text?: unknown;
};

type RichDocument = {
  root?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const collectText = (node?: unknown): string => {
  if (!isRecord(node)) {
    return "";
  }

  const richNode = node as RichNode;
  const text = typeof richNode.text === "string" ? richNode.text : "";
  const childText = Array.isArray(richNode.children)
    ? richNode.children.map((child) => collectText(child)).join(" ")
    : "";

  return [text, childText].filter(Boolean).join(" ").trim();
};

export const extractLexicalPlainText = (document?: RichDocument | null) => {
  const text = collectText(document?.root);

  return text.replace(/\s+/g, " ").trim();
};

export const estimateReadingMinutes = (text: string, wordsPerMinute = 220) => {
  if (!text) {
    return 1;
  }

  const words = text.split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.ceil(words / wordsPerMinute));
};
