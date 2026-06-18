import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard-data";
import { loadWorkbenchData } from "@/lib/dashboard/load-workbench-data";

export const dynamic = "force-dynamic";

type DashboardPageSearchParams = Record<string, string | string[] | undefined>;

type DashboardPageProps = {
  searchParams: Promise<DashboardPageSearchParams>;
};

export const buildDashboardRedirectPath = (params: DashboardPageSearchParams) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
      return;
    }

    if (typeof value === "string") {
      search.set(key, value);
    }
  });

  const query = search.toString();

  return query ? `/dashboard?${query}` : "/dashboard";
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const redirectPath = buildDashboardRedirectPath(params);
  const [{ initialThreadId }] = await Promise.all([
    loadDashboardData(params, redirectPath),
    loadWorkbenchData(redirectPath),
  ]);

  return (
    <DashboardPageClient
      initialThreadId={initialThreadId}
    />
  );
}
