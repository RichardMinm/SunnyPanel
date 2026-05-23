export const stripMarkdownForExcerpt = (markdown: string, maxLength = 120) => {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/[#>*_~`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) {
    return "";
  }

  return plain.length <= maxLength ? plain : `${plain.slice(0, maxLength).trimEnd()}...`;
};

export const stripMarkdownToPlainText = (markdown: string) =>
  stripMarkdownForExcerpt(markdown, Number.MAX_SAFE_INTEGER).replace(/\.\.\.$/, "");

export const estimateReadingMinutes = (text: string, wordsPerMinute = 220) => {
  if (!text) {
    return 1;
  }

  const words = text.split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.ceil(words / wordsPerMinute));
};
