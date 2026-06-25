export const extractRichText = (node: unknown): string => {
  if (!node || typeof node !== "object") {
    return "";
  }

  const obj = node as Record<string, unknown>;

  if (typeof obj.text === "string") {
    return obj.text;
  }

  if (Array.isArray(obj.content)) {
    return obj.content.map((child) => extractRichText(child)).join(" ");
  }

  return "";
};

export const countWritingWords = (text: string): number => {
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const nonCjk = text.replace(/[一-鿿㐀-䶿]/g, " ");
  const words = nonCjk.split(/\s+/).filter(Boolean).length;
  return cjk + words;
};
