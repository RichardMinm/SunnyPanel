import type { AgentChatMessage } from "@/lib/agent/schemas";

type MemoryWorkspaceProps = {
  messages: AgentChatMessage[];
  statusLabel: string;
  threadId: null | number;
};

const getLatestUserMessage = (messages: AgentChatMessage[]) =>
  [...messages].reverse().find((message) => message.role === "user" && message.content.trim().length > 0);

const getLatestAssistantMessage = (messages: AgentChatMessage[]) =>
  [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim().length > 0);

export function MemoryWorkspace({ messages, statusLabel, threadId }: MemoryWorkspaceProps) {
  const latestUserMessage = getLatestUserMessage(messages);
  const latestAssistantMessage = getLatestAssistantMessage(messages);
  return (
    <section className="sunny-memory-workspace" aria-label="记忆库">
      <div className="sunny-memory-workspace-head">
        <div>
          <p>Memory Library</p>
          <h2>记忆库</h2>
        </div>
        <span>{statusLabel}</span>
      </div>

      <div className="sunny-memory-grid">
        <article className="sunny-memory-card">
          <span>来源会话</span>
          <h3>{threadId ? `Thread #${threadId}` : "尚未绑定会话"}</h3>
          <p>{latestUserMessage?.content ?? "开始一次对话后，这里会显示可沉淀为记忆的来源。"}</p>
          <small>更新时间：最近一次会话</small>
        </article>

        <article className="sunny-memory-card">
          <span>可沉淀信息</span>
          <h3>{latestAssistantMessage ? "最近助手结论" : "暂无可沉淀内容"}</h3>
          <p>{latestAssistantMessage?.content.slice(0, 180) ?? "当 Agent 形成偏好、事实或工作流规则时，会在这里整理为候选记忆。"}</p>
          <small>状态：待确认</small>
        </article>
      </div>

      <label className="sunny-memory-editor">
        <span>可编辑记忆草稿</span>
        <textarea
          defaultValue={latestAssistantMessage?.content.slice(0, 260) ?? ""}
          placeholder="把值得长期保留的偏好、事实、工作流规则整理到这里。"
        />
      </label>
    </section>
  );
}
