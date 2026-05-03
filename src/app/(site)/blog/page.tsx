import Link from "next/link";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PostPreviewCard } from "@/components/public/PostPreviewCard";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getSiteLocale } from "@/lib/site-locale";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicPosts } from "@/lib/payload/public";

export const dynamic = "force-dynamic";

export default async function BlogIndexPage() {
  const locale = await getSiteLocale();
  const copy = getSiteCopy(locale);
  const { docs: posts } = await getPublicPosts();
  const latestPostDate = posts[0]?.publishedAt
    ? formatDate(posts[0].publishedAt, locale)
    : copy.blog.latestWaiting;
  const uniqueTags = new Set(posts.flatMap((post) => post.tags ?? [])).size;

  return (
    <PublicSiteFrame locale={locale}>
      <main className="flex flex-1 flex-col gap-8 pb-4">
        <SectionIntro
          eyebrow="Blog"
          title="Blog"
          stats={[
            { label: copy.blog.statsPosts, value: posts.length },
            { label: copy.blog.statsTags, value: uniqueTags },
            { label: copy.blog.statsLatest, value: latestPostDate },
          ]}
          actions={
            <Link href="/admin/collections/posts" className="sunny-button-secondary">
              {copy.common.managePosts}
            </Link>
          }
        />

        {posts.length === 0 ? (
          <CollectionEmptyState
            title={copy.blog.emptyTitle}
            body={copy.blog.emptyBody}
          />
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <PostPreviewCard locale={locale} post={posts[0]} variant="featured" />

            <div className="grid gap-4">
              {posts.slice(1).map((post) => (
                <PostPreviewCard key={post.id} locale={locale} post={post} variant="compact" />
              ))}
            </div>
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
