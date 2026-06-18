import type { StructuredLLMMessage } from "@/lib/agent/llm/complete-structured";
import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import type { RichContentDocument } from "@/lib/rich-content/types";

export type WritingAssistAction =
  | "condense"
  | "continue"
  | "expand"
  | "extract_tags"
  | "generate_outline"
  | "generate_summary"
  | "generate_title"
  | "polish"
  | "rewrite"
  | "summarize";

export type WritingAssistResult = {
  outline?: Array<{ id: string; level: number; text: string }>;
  result?: string;
  tags?: string[];
};

const actionInstruction: Record<WritingAssistAction, string> = {
  condense: "精简以下文本，保留核心信息，使用简体中文。仅返回 JSON：{\"result\":\"<结果文本>\"}",
  continue:
    "根据给定标题、摘要和正文，续写一段自然的中文内容。仅返回 JSON：{\"result\":\"<续写内容>\"}",
  expand: "扩写以下文本，补充细节与例子，使用简体中文。仅返回 JSON：{\"result\":\"<结果文本>\"}",
  extract_tags: "从给定内容中提取 3-8 个中文或英文标签，仅返回 JSON：{\"tags\":[\"...\"]}",
  generate_outline:
    "根据给定内容生成文章大纲，仅返回 JSON：{\"outline\":[{\"id\":\"section-1\",\"level\":1,\"text\":\"...\"}]}",
  generate_summary: "根据给定正文生成一句中文摘要，仅返回 JSON：{\"result\":\"<摘要文本>\"}",
  generate_title: "根据给定正文生成一个吸引人的中文标题，仅返回 JSON：{\"result\":\"<标题文本>\"}",
  polish: "润色以下文本，使表达更流畅专业，使用简体中文。仅返回 JSON：{\"result\":\"<结果文本>\"}",
  rewrite: "改写以下文本，保持原意但换种表达，使用简体中文。仅返回 JSON：{\"result\":\"<结果文本>\"}",
  summarize: "总结以下文本，使用简体中文。仅返回 JSON：{\"result\":\"<结果文本>\"}",
};

const richContentToText = (contentRich?: RichContentDocument) => {
  if (!contentRich?.content?.length) {
    return "";
  }

  const walk = (nodes: NonNullable<RichContentDocument["content"]>): string => {
    return nodes
      .map((node) => {
        if (node.type === "text" && typeof node.text === "string") {
          return node.text;
        }

        if (Array.isArray(node.content)) {
          const inner = walk(node.content);
          if (node.type === "heading") {
            return `\n${inner}\n`;
          }
          return inner;
        }

        return "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  };

  return walk(contentRich.content ?? []);
};

const SYSTEM_PROMPT = [
  "你是 SunnyPanel 的写作助手，是用户内容运营的协作者，而非独立工具。",
  "遵循指令，产出简洁、可直接粘贴进编辑器的中文结果。",
  "若提供了「文风偏好」，必须严格沿用其语气与用词习惯；缺失时使用通用、克制、专业的风格。",
  "严格输出 JSON 对象，不要输出解释、过程、Markdown 代码块围栏或 JSON 以外的任何文字。",
  "negative example：不要回复『好的，这是润色后的版本：……』这类前缀，只返回 JSON。",
].join("\n");

export const buildWritingAssistMessages = ({
  action,
  collection,
  contentRich,
  relatedTitles,
  styleMemories,
  summary,
  text,
  title,
}: {
  action: WritingAssistAction;
  collection?: DashboardContentCollection;
  contentRich?: RichContentDocument;
  relatedTitles?: string[];
  styleMemories?: string[];
  summary?: string;
  text?: string;
  title?: string;
}): StructuredLLMMessage[] => {
  const bodyText = text?.trim() || richContentToText(contentRich);

  const styleBlock =
    styleMemories && styleMemories.length > 0
      ? ["## 文风偏好（请严格遵循）", ...styleMemories.map((item) => `- ${item}`)].join("\n")
      : null;

  const relatedBlock =
    relatedTitles && relatedTitles.length > 0
      ? [
          "## 近期同类内容（保持一致性，勿照抄）",
          ...relatedTitles.map((item) => `- ${item}`),
        ].join("\n")
      : null;

  const context = [
    styleBlock,
    relatedBlock,
    collection ? `内容类型：${collection}` : null,
    title ? `标题：${title}` : null,
    summary ? `摘要：${summary}` : null,
    bodyText ? `正文：${bodyText}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    {
      content: SYSTEM_PROMPT,
      role: "system" as const,
    },
    {
      content: `${actionInstruction[action]}\n\n${context}`,
      role: "user" as const,
    },
  ];
};

import { isRecord } from "@/lib/shared/is-record";

export const parseWritingAssistResult = (
  action: WritingAssistAction,
  value: unknown,
): WritingAssistResult => {
  if (!isRecord(value)) {
    return {};
  }

  if (action === "extract_tags") {
    return Array.isArray(value.tags)
      ? { tags: value.tags.filter((tag): tag is string => typeof tag === "string") }
      : {};
  }

  if (action === "generate_outline") {
    return Array.isArray(value.outline)
      ? {
          outline: value.outline.filter(
            (item): item is { id: string; level: number; text: string } =>
              isRecord(item) &&
              typeof item.id === "string" &&
              typeof item.text === "string" &&
              (item.level === 1 || item.level === 2 || item.level === 3),
          ),
        }
      : {};
  }

  return typeof value.result === "string" ? { result: value.result.trim() } : {};
};
