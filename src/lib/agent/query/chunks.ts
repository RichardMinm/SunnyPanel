import type { AIMessageChunk } from "@langchain/core/messages";

export type QueryChunkClassification = { kind: "ignore" } | { kind: "text"; text: string } | { kind: "violation"; code: "numeric_output" | "tool_call" };

export const classifyQueryChunk = (chunk: AIMessageChunk): QueryChunkClassification => {
  if ((chunk.tool_call_chunks?.length ?? 0) > 0
    || (chunk.tool_calls?.length ?? 0) > 0
    || Boolean(chunk.additional_kwargs?.function_call)) return { kind: "violation", code: "tool_call" };
  const blocks = chunk.contentBlocks ?? [];
  if (blocks.some((block) => block.type === "tool_call")) return { kind: "violation", code: "tool_call" };
  const text = blocks.length > 0
    ? blocks.filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text").map((block) => block.text).join("")
    : typeof chunk.content === "string" ? chunk.content : "";
  if (!text) return { kind: "ignore" };
  if (/\p{Nd}/u.test(text)) return { kind: "violation", code: "numeric_output" };
  return { kind: "text", text };
};
