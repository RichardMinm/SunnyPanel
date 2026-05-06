import { HomeHero } from "@/components/public/HomeHero";
import { HomeModuleSwitcher } from "@/components/public/HomeModuleSwitcher";
import { LatestWriting } from "@/components/public/LatestWriting";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { TimelineHighlight } from "@/components/public/TimelineHighlight";
import { getSiteLocale } from "@/lib/site-locale";
import {
  getPublicChecklists,
  getPublicNotes,
  getPublicPostsWithOptions,
  getPublicTimelineEvents,
  getPublicUpdates,
} from "@/lib/payload/public";

export const dynamic = "force-dynamic";

export default async function Home() {
  const locale = await getSiteLocale();
  const [checklists, posts, notes, updates, featuredTimeline] = await Promise.all([
    getPublicChecklists({ limit: 4 }),
    getPublicPostsWithOptions({ limit: 4 }),
    getPublicNotes({ limit: 4 }),
    getPublicUpdates({ limit: 4 }),
    getPublicTimelineEvents({ featuredOnly: true, limit: 3 }),
  ]);

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={false}>
      <main className="flex flex-1 flex-col gap-5 pb-5 md:gap-6">
        <HomeHero locale={locale} />
        <TimelineHighlight events={featuredTimeline.docs} locale={locale} />
        <LatestWriting
          locale={locale}
          notes={notes.docs}
          posts={posts.docs}
          updates={updates.docs}
        />
        <HomeModuleSwitcher
          checklists={checklists.docs}
          featuredTimeline={featuredTimeline.docs}
          locale={locale}
          updates={updates.docs}
        />
      </main>
    </PublicSiteFrame>
  );
}
