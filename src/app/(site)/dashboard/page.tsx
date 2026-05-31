import { DashboardWorkspaceChrome } from "@/components/dashboard/DashboardWorkspaceChrome";
import { DashboardAgentChatFullSection } from "@/components/dashboard/sections/DashboardAgentChatFullSection";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard-data";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    threadId?: string;
    week?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const { agentQuickPrompts, agentSuggestions, model } = await loadDashboardData(params);

  return (
    <main className="sunny-dashboard-shell-v2">
      <DashboardWorkspaceChrome />
      <div className="sunny-dashboard-workspace">
        <DashboardAgentChatFullSection
          initialThreadId={model.initialThreadId}
          quickPrompts={agentQuickPrompts}
          suggestions={agentSuggestions}
        />
      </div>
    </main>
  );
}
