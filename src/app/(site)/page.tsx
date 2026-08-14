import type { Metadata } from "next";

import { HomeHero, type HomeHeroFocus, type HomeHeroSignal } from "@/components/public/HomeHero";
import { HomeModuleSwitcher } from "@/components/public/HomeModuleSwitcher";
import { LatestWriting } from "@/components/public/LatestWriting";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { TimelineHighlight } from "@/components/public/TimelineHighlight";
import { formatShortDate } from "@/lib/formatters";
import { stripMarkdownForExcerpt } from "@/lib/markdown/plain-text";
import { getContentMarkdownFallback } from "@/lib/rich-content/compat";
import { getSiteLocale } from "@/lib/site-locale";
import {
  getPublicNotes,
  getPublicPostsWithOptions,
  getPublicTimelineEvents,
} from "@/lib/payload/public";

// Database-backed public pages render at runtime so application images never
// need production database access during compilation.
export const dynamic = "force-dynamic";

const excerpt = (value: null | string | undefined, fallback: string, maxLength = 120) => {
  const normalized = (value || fallback).replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
};

type DatedHomeHeroSignal = {
  signal: HomeHeroSignal;
  sortDate: string;
};

export const generateMetadata = async (): Promise<Metadata> => ({
  alternates: {
    canonical: "/",
  },
  description: "公开写作、笔记与时间线。",
  openGraph: {
    description: "公开写作、笔记与时间线。",
    title: "SunnyPanel",
    type: "website",
    url: "/",
  },
  title: "SunnyPanel",
});

export default async function Home() {
  const locale = await getSiteLocale();
  const [posts, notes, featuredTimeline] = await Promise.all([
    getPublicPostsWithOptions({ limit: 4 }),
    getPublicNotes({ limit: 4 }),
    getPublicTimelineEvents({ featuredOnly: true, limit: 3 }),
  ]);
  const latestSignals: DatedHomeHeroSignal[] = [
    ...posts.docs.map((post) => ({
      signal: {
        date: formatShortDate(post.publishedAt ?? post.createdAt, locale),
        description: excerpt(post.summary, locale === "en" ? "Recent post." : "最近文章。"),
        href: `/blog/${post.slug}`,
        label: locale === "en" ? "Post" : "文章",
        title: post.title,
      } satisfies HomeHeroSignal,
      sortDate: post.publishedAt ?? post.createdAt,
    })),
    ...notes.docs.map((note) => ({
      signal: {
        date: formatShortDate(note.createdAt, locale),
        description: excerpt(
          stripMarkdownForExcerpt(getContentMarkdownFallback(note)),
          locale === "en" ? "Recent note." : "最近笔记。",
        ),
        href: "/notes",
        label: locale === "en" ? "Note" : "笔记",
        title: note.category || note.mood || (locale === "en" ? "Recent Note" : "最近笔记"),
      } satisfies HomeHeroSignal,
      sortDate: note.createdAt,
    })),
    ...featuredTimeline.docs.map((event) => ({
      signal: {
        date: formatShortDate(event.eventDate, locale),
        description: excerpt(event.description, locale === "en" ? "Featured milestone." : "精选节点。"),
        href: "/timeline?featured=1",
        label: locale === "en" ? "Timeline" : "时间线",
        title: event.title,
      } satisfies HomeHeroSignal,
      sortDate: event.eventDate,
    })),
  ].sort((first, second) => new Date(second.sortDate).getTime() - new Date(first.sortDate).getTime());
  const fallbackSignal: DatedHomeHeroSignal = {
    signal: {
      description:
        locale === "en"
          ? "Publish writing or a timeline event to see it appear here."
          : "发布文章或时间线节点后，这里会自动更新。",
      href: "/now",
      label: locale === "en" ? "Now" : "Now",
      title: locale === "en" ? "What I'm doing now" : "当前在做的事",
    },
    sortDate: new Date().toISOString(),
  };
  const focusSignal: DatedHomeHeroSignal = latestSignals[0] ?? fallbackSignal;
  const recentAction = latestSignals.find((item) => item.signal.href !== focusSignal.signal.href) ?? latestSignals[0] ?? fallbackSignal;
  const currentFocus: HomeHeroFocus = {
    focus: focusSignal.signal,
    lastUpdated: formatShortDate([focusSignal, recentAction].sort((first, second) => new Date(second.sortDate).getTime() - new Date(first.sortDate).getTime())[0].sortDate, locale),
    recentAction: recentAction.signal,
  };

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={false}>
      <main className="flex flex-1 flex-col gap-5 pb-5 md:gap-6">
        <HomeHero currentFocus={currentFocus} locale={locale} />
        <TimelineHighlight events={featuredTimeline.docs} locale={locale} />
        <LatestWriting
          locale={locale}
          notes={notes.docs}
          posts={posts.docs}
        />
        <HomeModuleSwitcher
          featuredTimeline={featuredTimeline.docs}
          locale={locale}
        />
      </main>
    </PublicSiteFrame>
  );
}
