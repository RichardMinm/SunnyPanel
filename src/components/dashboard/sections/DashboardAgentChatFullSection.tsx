import { AgentChatPanel, type AgentChatPanelProps } from "@/components/dashboard/AgentChatPanel";

type DashboardAgentChatFullSectionProps = Pick<AgentChatPanelProps, "initialThreadId" | "quickPrompts" | "suggestions">;

export function DashboardAgentChatFullSection({ initialThreadId, quickPrompts, suggestions }: DashboardAgentChatFullSectionProps) {
  return (
    <section>
      <AgentChatPanel initialThreadId={initialThreadId} quickPrompts={quickPrompts} suggestions={suggestions} variant="full" />
    </section>
  );
}
