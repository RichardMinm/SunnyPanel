"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function useDashboardUrlThreadSync(threadId: number | null, enabled: boolean) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());

    if (threadId != null) {
      params.set("threadId", String(threadId));
    } else {
      params.delete("threadId");
    }

    const nextQuery = params.toString();
    const nextHref = nextQuery ? `/dashboard?${nextQuery}` : "/dashboard";
    const currentQuery = searchParams.toString();
    const currentHref = currentQuery ? `/dashboard?${currentQuery}` : "/dashboard";

    if (nextHref !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
  }, [enabled, router, searchParams, threadId]);
}
