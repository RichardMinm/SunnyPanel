import type { Metadata } from "next";
import Link from "next/link";

import { PostPreviewCard } from "@/components/public/PostPreviewCard";
import { PublicCollectionEmptySwitch } from "@/components/public/PublicCollectionEmptySwitch";
import { PublicListPage } from "@/components/public/PublicListPage";
import { SectionIntro } from "@/components/public/SectionIntro";
import { getPublicPostsByTag } from "@/lib/payload/public";

export const revalidate = 60;

type TagPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);

  return {
    alternates: {
      canonical: `/tags/${slug}`,
    },
    description: `Posts tagged "${decoded}".`,
    openGraph: {
      description: `Published posts tagged "${decoded}".`,
      title: `Tag · ${decoded} | SunnyPanel`,
      type: "website",
      url: `/tags/${slug}`,
    },
    title: `Tag · ${decoded} | SunnyPanel`,
  };
}

export default async function TagPage({ params }: TagPageProps) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const { docs: posts } = await getPublicPostsByTag(slug);

  return (
    <PublicListPage showTimelineRail={false}>
      {({ locale }) => {
        return (
          <>
            <SectionIntro
              eyebrow={locale === "en" ? "Tag" : "标签"}
              stats={[
                {
                  label:
                    locale === "en" ? "Published posts" : "已发布文章",
                  value: posts.length,
                },
              ]}
              title={`${decoded}`}
            />

            <PublicCollectionEmptySwitch
              body={
                locale === "en"
                  ? "No published posts with this tag yet."
                  : "暂无此标签的已发布文章。"
              }
              isEmpty={posts.length === 0}
              title={
                locale === "en"
                  ? "No posts"
                  : "暂无文章"
              }
            >
              <section className="grid gap-4">
                {posts.map((post) => (
                  <PostPreviewCard
                    key={post.id}
                    locale={locale}
                    post={post}
                    variant="compact"
                  />
                ))}
              </section>
            </PublicCollectionEmptySwitch>

            <div className="mt-10">
              <Link
                className="text-sm text-muted underline underline-offset-4"
                href="/blog"
              >
                {locale === "en" ? "Back to Blog" : "返回文章"}
              </Link>
            </div>
          </>
        );
      }}
    </PublicListPage>
  );
}
