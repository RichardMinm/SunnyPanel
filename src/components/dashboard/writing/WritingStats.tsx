"use client";

import { useMemo } from "react";

type WritingStatsProps = {
  contentJson?: null | { content?: Array<{ content?: Array<{ text?: string }> }> };
  lastEdited?: null | string;
  title?: string;
};

const countWords = (text: string): number => {
  // Count CJK characters + space-delimited words
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const nonCjk = text.replace(/[一-鿿㐀-䶿]/g, " ");
  const words = nonCjk.split(/\s+/).filter(Boolean).length;
  return cjk + words;
};

const extractText = (node: unknown): string => {
  if (!node || typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  if (obj.text && typeof obj.text === "string") return obj.text;
  if (Array.isArray(obj.content)) {
    return obj.content.map((child: unknown) => extractText(child)).join(" ");
  }
  return "";
};

export function WritingStats({ contentJson, lastEdited, title }: WritingStatsProps) {
  const stats = useMemo(() => {
    let text = title || "";
    if (contentJson?.content) {
      text += " " + contentJson.content.map((block) => extractText(block)).join(" ");
    }
    const wordCount = countWords(text);
    const readingMinutes = Math.max(1, Math.ceil(wordCount / 400));
    return { readingMinutes, wordCount };
  }, [contentJson, title]);

  const lastEditedLabel = useMemo(() => {
    if (!lastEdited) return "";
    const date = new Date(lastEdited);
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      month: "long",
      day: "numeric",
    }).format(date);
  }, [lastEdited]);

  return (
    <div className="sunny-writing-stats">
      <span>{stats.wordCount} 字</span>
      <span>约 {stats.readingMinutes} 分钟阅读</span>
      {lastEditedLabel ? <span>最后编辑 {lastEditedLabel}</span> : null}
    </div>
  );
}
