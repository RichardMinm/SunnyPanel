import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard-data";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{ threadId?: string; week?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const { initialThreadId, initialSuggestions } = await loadDashboardData(params);

  return <DashboardPageClient initialThreadId={initialThreadId} initialSuggestions={initialSuggestions} />;
}
