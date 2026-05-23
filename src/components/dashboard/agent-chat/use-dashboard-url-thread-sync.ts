"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { buildDashboardHref } from "@/lib/dashboard/dashboard-href";

export function useDashboardUrlThreadSync(threadId: number | null, enabled: boolean) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const week = searchParams.get("week");
    const currentThreadId = searchParams.get("threadId");
    const nextHref = buildDashboardHref({
      threadId,
      week,
    });
    const currentHref = buildDashboardHref({
      threadId: currentThreadId ? Number(currentThreadId) : null,
      week,
    });

    if (nextHref !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
  }, [enabled, router, searchParams, threadId]);
}
