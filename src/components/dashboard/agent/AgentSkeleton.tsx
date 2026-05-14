export function AgentConversationSkeleton() {
  return (
    <div className="sunny-agent-conversation-surface" aria-busy="true" aria-label="加载中">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="sunny-agent-skeleton-row">
          <div className="sunny-agent-skeleton sunny-agent-skeleton-avatar" />
          <div style={{ flex: 1 }}>
            <div className="sunny-agent-skeleton sunny-agent-skeleton-line" />
            <div className="sunny-agent-skeleton sunny-agent-skeleton-line" style={{ width: i % 2 === 0 ? "80%" : "55%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgentSidebarSkeleton() {
  return (
    <div aria-busy="true" aria-label="加载中" style={{ padding: 12 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="sunny-agent-skeleton sunny-agent-skeleton-block" style={{ height: 40, marginBottom: 8 }} />
      ))}
    </div>
  );
}

export function AgentInspectorSkeleton() {
  return (
    <div aria-busy="true" aria-label="加载中" style={{ padding: 12 }}>
      <div className="sunny-agent-skeleton sunny-agent-skeleton-line" style={{ width: "40%", height: 20, marginBottom: 16 }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="sunny-agent-skeleton sunny-agent-skeleton-block" />
      ))}
    </div>
  );
}
