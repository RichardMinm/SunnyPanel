import { AgentChatPanel, type AgentChatPanelProps } from "@/components/dashboard/AgentChatPanelLazy";

type DashboardAgentChatFullSectionProps = Pick<AgentChatPanelProps, "initialThreadId" | "quickPrompts" | "suggestions">;

export function DashboardAgentChatFullSection({ initialThreadId, quickPrompts, suggestions }: DashboardAgentChatFullSectionProps) {
  return (
    <section className="sunny-dashboard-agent-host" data-testid="dashboard-agent-host" aria-label="Agent 工作台">
      <AgentChatPanel initialThreadId={initialThreadId} quickPrompts={quickPrompts} suggestions={suggestions} />
    </section>
  );
}
