import { estimateReadingMinutes, stripMarkdownToPlainText } from "./plain-text";

export const getReadingPlainTextFromContent = (content: unknown) =>
  typeof content === "string" ? stripMarkdownToPlainText(content) : "";

export const getReadingMinutesFromContent = (content: unknown) => {
  if (typeof content !== "string" || !content.trim()) {
    return 0;
  }

  return estimateReadingMinutes(getReadingPlainTextFromContent(content));
};
