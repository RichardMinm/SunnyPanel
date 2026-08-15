import { redirect } from "next/navigation";

import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard-data";
import { createServerTiming } from "@/lib/observability/server-timing";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export const dynamic = "force-dynamic";

type DashboardPageSearchParams = Record<string, string | string[] | undefined>;

type DashboardPageProps = {
  searchParams: Promise<DashboardPageSearchParams>;
};

const buildDashboardRedirectPath = (params: DashboardPageSearchParams) => {
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

const buildAdminRoute = (path: string, redirectPath: string) =>
  `${path}?redirect=${encodeURIComponent(redirectPath)}`;

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const timing = createServerTiming("/dashboard");

  /* Keep the page request on the lightweight authentication path. Workspace
     snapshots are loaded by the Agent only when a turn needs them. Suggestion
     generation is event-driven and must not start as hidden work on page mount. */
  const authResult = await timing.measure("auth", () => getPayloadAuthResult());

  if (!authResult.user) {
    const payload = await getPayloadClient();
    const existingUsers = await payload.find({
      collection: "users",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
    });

    if (existingUsers.totalDocs === 0) {
      const params = await searchParams;
      const redirectPath = buildDashboardRedirectPath(params);
      redirect(buildAdminRoute("/admin/create-first-user", redirectPath));
    }

    const params = await searchParams;
    const redirectPath = buildDashboardRedirectPath(params);
    redirect(buildAdminRoute("/admin/login", redirectPath));
  }

  /* Parse initialThreadId from URL params — the only server data needed for the shell. */
  const params = await timing.measure("parse-params", () => searchParams);
  const redirectPath = buildDashboardRedirectPath(params);
  const { initialThreadId } = await timing.measure("load-dashboard-data", () =>
    loadDashboardData(params, redirectPath),
  );

  timing.log();

  return (
    <DashboardPageClient
      initialThreadId={initialThreadId}
    />
  );
}
