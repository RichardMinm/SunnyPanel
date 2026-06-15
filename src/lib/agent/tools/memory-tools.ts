import { persistMemoryWithEmbedding, validateAgentMemoryData as validateAgentMemoryPayload } from "../memory";
import type { SaveMemoryArgs } from "../schemas";
import { createAgentRun, type AgentExecutionTraceReporter, type AgentToolResult } from "../tool-shared";

export const buildArchiveMemoryRollbackPayload = (documentId: number) => ({
  strategy: "archive_created_memory",
  target: {
    collection: "agent-memories",
    documentId,
  },
});

export const saveMemoryFromIntent = async (
  args: SaveMemoryArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  onTrace?.({
    detail: args.content,
    id: "tool-save-memory-prepare",
    kind: "action",
    status: "running",
    title: "正在准备保存长期记忆",
  });
  const data = validateAgentMemoryPayload({
    ...args,
    lastUsedAt: new Date().toISOString(),
    status: "active",
  });
  const memory = await persistMemoryWithEmbedding({
    confidence: data.confidence,
    content: data.content!,
    lastUsedAt: data.lastUsedAt ?? null,
    title: data.title,
    type: data.type,
  });

  onTrace?.({
    detail: `AgentMemory #${memory.id} · ${memory.type}`,
    id: "tool-save-memory-written",
    kind: "write",
    status: "done",
    title: "长期记忆已写入",
  });

  await createAgentRun({
    affectedDocuments: [
      {
        collection: "agent-memories",
        documentId: memory.id,
        operation: "create",
        visibility: memory.visibility,
      },
    ],
    afterSnapshot: {
      confidence: memory.confidence,
      content: memory.content,
      id: memory.id,
      status: memory.status,
      title: memory.title,
      type: memory.type,
    },
    beforeSnapshot: null,
    relatedContent: [
      {
        relationTo: "agent-memories",
        value: memory.id,
      },
    ],
    rollbackAvailable: true,
    rollbackPayload: buildArchiveMemoryRollbackPayload(memory.id),
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `已保存长期记忆：${memory.title}`,
      },
    ],
    summary: `Agent 已保存长期记忆「${memory.title}」。`,
    title: `Agent saved memory · ${memory.title}`,
    workflow: "sync",
  });
  onTrace?.({
    detail: "本次长期记忆写入已经进入 AgentRun 审计记录。",
    id: "tool-save-memory-audit",
    kind: "complete",
    status: "done",
    title: "已记录审计日志",
  });

  return {
    assistantMessage: `已记住：${memory.content}`,
    pendingAction: null,
    rollbackPayload: buildArchiveMemoryRollbackPayload(memory.id),
  };
};
