import type { Metadata } from "next";

import { PublicListPage } from "@/components/public/PublicListPage";
import { TimelinePageContent } from "@/components/public/timeline/TimelinePageContent";
import { getPublicTimelineEvents } from "@/lib/payload/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: "/timeline",
  },
  description: "Milestones, progress, and memory — a timeline of public events.",
  openGraph: {
    description: "Milestones, progress, and memory.",
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
