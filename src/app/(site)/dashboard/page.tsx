import { DashboardActionAndQuickSection } from "@/components/dashboard/sections/DashboardActionAndQuickSection";
import { DashboardAgentChatFullSection } from "@/components/dashboard/sections/DashboardAgentChatFullSection";
import { DashboardAgentChatSidebarSection } from "@/components/dashboard/sections/DashboardAgentChatSidebarSection";
import { DashboardContentQueuesSection } from "@/components/dashboard/sections/DashboardContentQueuesSection";
import { DashboardFocusHero } from "@/components/dashboard/sections/DashboardFocusHero";
import { DashboardKeyMetricsStrip } from "@/components/dashboard/sections/DashboardKeyMetricsStrip";
import { DashboardMaintenanceSection } from "@/components/dashboard/sections/DashboardMaintenanceSection";
import { DashboardPlanRunwaySection } from "@/components/dashboard/sections/DashboardPlanRunwaySection";
import { DashboardScheduleBlock } from "@/components/dashboard/sections/DashboardScheduleBlock";
import { DashboardTimelineGapsSection } from "@/components/dashboard/sections/DashboardTimelineGapsSection";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard-data";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    agent?: string;
    threadId?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const { agentQuickPrompts, agentSuggestions, model } = await loadDashboardData(params);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-5 md:px-7 lg:px-8">
      <DashboardFocusHero model={model} />
      <DashboardKeyMetricsStrip model={model} />
      <DashboardScheduleBlock model={model} />

      {model.showFullAgentConsole ? (
        <DashboardAgentChatFullSection
          initialThreadId={model.initialThreadId}
          quickPrompts={agentQuickPrompts}
          suggestions={agentSuggestions}
        />
      ) : null}

      <div className={`grid gap-5 xl:items-start ${model.showFullAgentConsole ? "" : "xl:grid-cols-[minmax(0,1fr)_22rem]"}`}>
        <div className="flex min-w-0 flex-col gap-6">
          <DashboardActionAndQuickSection model={model} />
          <DashboardPlanRunwaySection model={model} />
          <DashboardContentQueuesSection model={model} />
          <DashboardTimelineGapsSection model={model} />
          <DashboardMaintenanceSection model={model} />
        </div>

        {model.showFullAgentConsole ? null : (
          <DashboardAgentChatSidebarSection
            fullConsoleHref={model.fullAgentHref}
            initialThreadId={model.initialThreadId}
            quickPrompts={agentQuickPrompts}
            suggestions={agentSuggestions}
          />
        )}
      </div>
    </main>
  );
}
