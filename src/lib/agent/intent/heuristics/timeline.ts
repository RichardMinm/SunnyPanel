import type { AgentIntent } from "../../schemas";
import { timelineComposerKeywords } from "./keywords";
import { cleanupText, normalizeTimelineSourceType } from "./shared-text";

export const parseComposeTimelineEventIntent = (message: string): AgentIntent | null => {
  const hasKeyword = timelineComposerKeywords.some((keyword) => message.includes(keyword));

  if (!hasKeyword) {
    return null;
  }

  const quotedTitle = message.match(/\u300c([^\u300d]+)\u300d/)?.[1] ?? message.match(/\u201c([^\u201d]+)\u201d/)?.[1] ?? null;
  const sourceIdMatch = message.match(/(?:来源\s*ID|source\s*id|#)\s*[:：]?\s*(\d+)/i);
  const sourceTypeMatch = message.match(/(?:来源类型|source\s*type)\s*[:：]?\s*([a-zA-Z_-]+|文章|博客|笔记|动态|更新|清单|条目|计划)/i);
  const explicitSourceType = sourceTypeMatch ? normalizeTimelineSourceType(sourceTypeMatch[1] ?? "") : null;
  const inferredSourceType =
    explicitSourceType ??
    normalizeTimelineSourceType(message) ??
    (message.includes("这段") || message.includes("下面") ? "free_text" : null);
  const sourceText = cleanupText(
    message
      .replace(/^.*?(?:整理成 Timeline|写进 Timeline|补时间线|时间线节点|Timeline 节点|timeline 节点)/, "")
      .replace(/^(：|:|，|,)/, ""),
  );
  const wantsPreviewOnly = /(提案|预览|只生成|先生成|不要创建|不写入|先别写入)/.test(message);
  const visibility = message.includes("私有")
    ? "private" as const
    : message.includes("公开")
      ? "public" as const
      : null;

  return {
    args: {
      createEvent: !wantsPreviewOnly,
      sourceId: sourceIdMatch ? Number(sourceIdMatch[1]) : null,
      sourceText: quotedTitle ? null : sourceText || null,
      sourceTitle: quotedTitle,
      sourceType: inferredSourceType,
      visibility,
    },
    confidence: 0.68,
    intent: "compose_timeline_event",
  };
};
