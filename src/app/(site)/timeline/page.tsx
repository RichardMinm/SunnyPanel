import type { Metadata } from "next";

import { PublicListPage } from "@/components/public/PublicListPage";
import { TimelinePageContent } from "@/components/public/timeline/TimelinePageContent";
import { getPublicTimelineEvents } from "@/lib/payload/public";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: {
    canonical: "/timeline",
  },
  description: "SunnyPanel 的公开时间线，把写作、动态、项目和长期进展串成可回看的叙事。",
  openGraph: {
    description: "公开时间线：写作、动态、项目和长期进展的长期叙事骨架。",
    title: "Timeline | SunnyPanel",
    type: "website",
    url: "/timeline",
  },
  title: "Timeline | SunnyPanel",
};

type TimelineSearchParams = Promise<{
  featured?: string;
  type?: string;
  year?: string;
}>;

type TimelinePageProps = {
  searchParams: TimelineSearchParams;
};

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const { featured, type, year } = await searchParams;
  const featuredOnly = featured === "1";
  const { docs: events } = await getPublicTimelineEvents();

  return (
    <PublicListPage className="gap-6" showTimelineRail={false}>
      {({ locale }) => (
        <TimelinePageContent
          events={events}
          featuredOnly={featuredOnly}
          locale={locale}
          selectedType={type}
          selectedYear={year}
        />
      )}
    </PublicListPage>
  );
}
