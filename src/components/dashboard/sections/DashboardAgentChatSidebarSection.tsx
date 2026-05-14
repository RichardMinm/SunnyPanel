import { AgentChatPanel, type AgentChatPanelProps } from "@/components/dashboard/AgentChatPanel";

type DashboardAgentChatSidebarSectionProps = Pick<
  AgentChatPanelProps,
  "fullConsoleHref" | "initialThreadId" | "quickPrompts" | "suggestions"
>;

export function DashboardAgentChatSidebarSection({
  fullConsoleHref,
  initialThreadId,
  quickPrompts,
  suggestions,
}: DashboardAgentChatSidebarSectionProps) {
  return (
    <aside className="max-xl:order-first min-w-0 max-w-full xl:sticky xl:top-5">
      <AgentChatPanel
        fullConsoleHref={fullConsoleHref}
        initialThreadId={initialThreadId}
        quickPrompts={quickPrompts}
        suggestions={suggestions}
        variant="sidebar"
      />
    </aside>
  );
}
