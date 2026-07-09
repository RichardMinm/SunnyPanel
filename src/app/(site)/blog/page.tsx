import type { Metadata } from "next";

import { PublicCollectionEmptySwitch } from "@/components/public/PublicCollectionEmptySwitch";
import { PostPreviewCard } from "@/components/public/PostPreviewCard";
import { PublicListPage } from "@/components/public/PublicListPage";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicPosts } from "@/lib/payload/public";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: {
    canonical: "/blog",
  },
  description: "Published posts.",
  openGraph: {
    description: "Published posts.",
    title: "Blog | SunnyPanel",
    type: "website",
    url: "/blog",
  },
  title: "Blog | SunnyPanel",
};

export default async function BlogIndexPage() {
  const { docs: posts } = await getPublicPosts();

  return (
    <PublicListPage>
      {({ locale }) => {
        const copy = getSiteCopy(locale);
        const latestPostDate = posts[0]?.publishedAt
          ? formatDate(posts[0].publishedAt, locale)
          : copy.blog.latestWaiting;
        const uniqueTags = new Set(posts.flatMap((post) => post.tags ?? [])).size;

        return (
          <>
            <SectionIntro
              eyebrow="Blog"
              stats={[
                { label: copy.blog.statsPosts, value: posts.length },
                { label: copy.blog.statsTags, value: uniqueTags },
                { label: copy.blog.statsLatest, value: latestPostDate },
              ]}
              title="Blog"
            />

            <PublicCollectionEmptySwitch
              body={copy.blog.emptyBody}
              isEmpty={posts.length === 0}
              title={copy.blog.emptyTitle}
            >
              <section className="sunny-blog-index grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <PostPreviewCard locale={locale} post={posts[0]} variant="featured" />

                <div className="grid gap-4">
                  {posts.slice(1).map((post) => (
                    <PostPreviewCard key={post.id} locale={locale} post={post} variant="compact" />
                  ))}
                </div>
              </section>
            </PublicCollectionEmptySwitch>
          </>
        );
      }}
    </PublicListPage>
  );
}
