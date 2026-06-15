import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import type { RichContentDocument } from "@/lib/rich-content/types";

import {
  type CompleteStructuredOptions,
  type StructuredLLMResult,
  completeStructured,
} from "./llm/complete-structured";
import { getRelevantMemories, persistMemoryWithEmbedding, type AgentMemoryDocument } from "./memory";
import {
  buildWritingAssistMessages,
  parseWritingAssistResult,
  type WritingAssistAction,
  type WritingAssistResult,
} from "./prompts/writing-assist";

export type WritingAssistRequest = {
  action: WritingAssistAction;
  collection?: DashboardContentCollection;
  contentRich?: RichContentDocument;
  summary?: string;
  text?: string;
  title?: string;
};

export type WritingAssistDeps = {
  complete?: (
    options: CompleteStructuredOptions<WritingAssistResult>,
  ) => Promise<StructuredLLMResult<WritingAssistResult> | null>;
  fetchRelatedTitles?: (collection: DashboardContentCollection, excludeTitle?: string) => Promise<string[]>;
  fetchStyleMemories?: (query: string) => Promise<string[]>;
};

const MAX_STYLE_MEMORIES = 3;
const MAX_RELATED_TITLES = 5;
const MAX_STYLE_SAMPLE_LENGTH = 280;

const buildContextQuery = (request: WritingAssistRequest): string =>
  [request.title, request.summary, request.text].filter(Boolean).join(" ").trim();

/**
 * 默认拉取 writing_style 记忆：复用主智能内核的记忆检索（含向量/关键词排序与命中强化），
 * 仅保留 writing_style 类型，向写作辅助 prompt 注入用户既有文风。query 为空时跳过，避免无谓检索。
 */
const defaultFetchStyleMemories = async (query: string): Promise<string[]> => {
  if (!query) {
    return [];
  }

  try {
    const memories = await getRelevantMemories(query, 8, "writing_style");

    return memories
      .filter((memory) => memory.type === "writing_style")
      .slice(0, MAX_STYLE_MEMORIES)
      .map((memory) => `${memory.title}：${memory.content}`.trim());
  } catch {
    return [];
  }
};

/**
 * 默认拉取近期同类内容标题，给写作辅助提供"风格一致性"上下文（不照抄，仅参考）。
 */
const defaultFetchRelatedTitles = async (
  collection: DashboardContentCollection,
  excludeTitle?: string,
): Promise<string[]> => {
  try {
    const { getPayloadClient } = await import("@/lib/payload/client");
    const payload = await getPayloadClient();
    const result = await payload.find({
      collection,
      depth: 0,
      limit: MAX_RELATED_TITLES + 1,
      overrideAccess: true,
      pagination: false,
      sort: "-updatedAt",
    });

    return (result.docs as Array<{ title?: unknown }>)
      .map((doc) => (typeof doc.title === "string" ? doc.title.trim() : ""))
      .filter((titleValue) => titleValue.length > 0 && titleValue !== excludeTitle?.trim())
      .slice(0, MAX_RELATED_TITLES);
  } catch {
    return [];
  }
};

export const runWritingAssist = async (
  request: WritingAssistRequest,
  deps: WritingAssistDeps = {},
): Promise<WritingAssistResult> => {
  const complete = deps.complete ?? completeStructured;
  const fetchStyleMemories = deps.fetchStyleMemories ?? defaultFetchStyleMemories;
  const fetchRelatedTitles = deps.fetchRelatedTitles ?? defaultFetchRelatedTitles;

  const query = buildContextQuery(request);
  const styleMemories = await fetchStyleMemories(query);
  const relatedTitles = request.collection
    ? await fetchRelatedTitles(request.collection, request.title)
    : [];

  const messages = buildWritingAssistMessages({
    action: request.action,
    collection: request.collection,
    contentRich: request.contentRich,
    relatedTitles,
    styleMemories,
    summary: request.summary,
    text: request.text,
    title: request.title,
  });

  const result = await complete({
    messages,
    parse: (value) => parseWritingAssistResult(request.action, value),
    temperature: 0.4,
  });

  return result?.data ?? {};
};

export type RememberWritingStyleInput = {
  action: WritingAssistAction;
  collection?: DashboardContentCollection;
  resultText: string;
  sourceText?: string;
};

export type RememberWritingStyleDeps = {
  persist?: typeof persistMemoryWithEmbedding;
};

const actionLabels: Partial<Record<WritingAssistAction, string>> = {
  condense: "精简",
  expand: "扩写",
  polish: "润色",
  rewrite: "改写",
};

/**
 * 把用户显式采纳的改写沉淀为 writing_style 记忆（轻量样例）。
 * 仅在前端确认采纳后调用，confidence 适中以便后续按使用反复强化。
 */
export const rememberWritingStyle = async (
  input: RememberWritingStyleInput,
  deps: RememberWritingStyleDeps = {},
): Promise<AgentMemoryDocument | null> => {
  const sample = input.resultText.trim();

  if (!sample) {
    return null;
  }

  const persist = deps.persist ?? persistMemoryWithEmbedding;
  const label = actionLabels[input.action] ?? "改写";
  const truncated = sample.length > MAX_STYLE_SAMPLE_LENGTH ? `${sample.slice(0, MAX_STYLE_SAMPLE_LENGTH)}…` : sample;

  return persist({
    confidence: 0.55,
    content: `用户采纳的${label}样例，体现其偏好的语气与表达：${truncated}`,
    title: `文风样例·${label}`,
    type: "writing_style",
    visibility: "private",
  });
};
