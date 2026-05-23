import { AgentChatPanel, type AgentChatPanelProps } from "@/components/dashboard/AgentChatPanelLazy";

type DashboardAgentChatFullSectionProps = Pick<AgentChatPanelProps, "initialThreadId" | "quickPrompts" | "suggestions">;

export function DashboardAgentChatFullSection({ initialThreadId, quickPrompts, suggestions }: DashboardAgentChatFullSectionProps) {
  return (
    <section className="sunny-dashboard-col-center sunny-dashboard-agent-host">
      <AgentChatPanel initialThreadId={initialThreadId} quickPrompts={quickPrompts} suggestions={suggestions} />
    </section>
  );
}
