import type { AgentTraceStep } from "@/lib/agent/schemas";

type MemoryEntry = {
  key: string;
  source: string;
  title: string;
};

function parseMemoryFromTrace(traceSteps: AgentTraceStep[]): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const contextStep = traceSteps.find(
    (step) => step.id === "context-bootstrap" && step.status === "done",
  );

  if (contextStep?.detail) {
    const memoryMatch = contextStep.detail.match(/命中记忆：(.+)/);

    if (memoryMatch) {
      const titles = memoryMatch[1].split("、").filter(Boolean);

      for (const title of titles) {
        entries.push({
          key: `ctx:${title}`,
          source: "上下文加载",
          title,
        });
      }
    }
  }

  for (const step of traceSteps) {
    if (step.kind === "write" && step.title?.includes("记忆")) {
      entries.push({
        key: `write:${step.id}`,
        source: "本轮写入",
        title: step.detail ?? step.title,
      });
    }
  }

  return entries;
}

type AgentMemoryPanelProps = {
  traceSteps: AgentTraceStep[];
};

export function AgentMemoryPanel({ traceSteps }: AgentMemoryPanelProps) {
  const memories = parseMemoryFromTrace(traceSteps);

  if (memories.length === 0) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>暂无记忆数据</h3>
        <p>Agent 在处理任务时命中或写入的长期记忆条目会出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      <div className="sunny-agent-memory-list">
        {memories.map((entry) => (
          <div key={entry.key} className="sunny-agent-memory-entry">
            <span className="sunny-agent-memory-source">{entry.source}</span>
            <strong>{entry.title}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
