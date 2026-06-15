import assert from "node:assert/strict";
import { test } from "node:test";

import { persistMemoryWithEmbedding } from "../../src/lib/agent/memory";
import type { AgentMemoryDocument, AgentMemoryInput } from "../../src/lib/agent/memory";

const fakeMemory = (memory: AgentMemoryInput): AgentMemoryDocument => ({
  confidence: typeof memory.confidence === "number" ? memory.confidence : 0.8,
  content: memory.content,
  createdAt: "2026-06-14T00:00:00.000Z",
  id: 4242,
  lastUsedAt: null,
  status: "active",
  title: memory.title ?? memory.content.slice(0, 12),
  type: (memory.type as AgentMemoryDocument["type"]) ?? "fact",
  updatedAt: "2026-06-14T00:00:00.000Z",
  visibility: "private",
});

test("persistMemoryWithEmbedding upserts the memory and then syncs an embedding from title + content", async () => {
  const embedCalls: Array<{ id: number; text: string }> = [];

  const memory = await persistMemoryWithEmbedding(
    {
      confidence: 0.8,
      content: "用户偏好排日程时默认 90 分钟时长。",
      title: "默认日程时长",
      type: "workflow_rule",
    },
    {
      syncEmbedding: async (id, text) => {
        embedCalls.push({ id, text });

        return [0.1, 0.2, 0.3];
      },
      upsert: async (input) => fakeMemory(input),
    },
  );

  assert.equal(memory.id, 4242);
  assert.equal(embedCalls.length, 1);
  assert.equal(embedCalls[0]?.id, 4242);
  assert.equal(embedCalls[0]?.text, "默认日程时长\n用户偏好排日程时默认 90 分钟时长。");
});

test("persistMemoryWithEmbedding still returns the saved memory when embedding sync fails", async () => {
  const memory = await persistMemoryWithEmbedding(
    {
      confidence: 0.8,
      content: "用户偏好先给结论。",
      title: "回答风格",
      type: "preference",
    },
    {
      syncEmbedding: async () => {
        throw new Error("embedding endpoint unavailable");
      },
      upsert: async (input) => fakeMemory(input),
    },
  );

  assert.equal(memory.id, 4242);
  assert.equal(memory.title, "回答风格");
});
