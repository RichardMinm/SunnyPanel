import type { ReactNode } from "react";

import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { getSiteLocale } from "@/lib/site-locale";
import type { SiteLocale } from "@/lib/site-copy";

export const PUBLIC_PAGE_REVALIDATE = 60;

export async function getSitePageContext() {
  const locale = await getSiteLocale();

  return { locale };
}

type PublicListPageProps = {
  children: (context: { locale: SiteLocale }) => ReactNode;
  className?: string;
  showTimelineRail?: boolean;
};

export async function PublicListPage({
  children,
  className = "gap-8",
  showTimelineRail = true,
}: PublicListPageProps) {
  const { locale } = await getSitePageContext();

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={showTimelineRail}>
      <main className={`flex flex-1 flex-col pb-4 ${className}`}>{children({ locale })}</main>
    </PublicSiteFrame>
  );
}
