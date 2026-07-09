import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PostPreviewCard } from "@/components/public/PostPreviewCard";
import { PublicCollectionEmptySwitch } from "@/components/public/PublicCollectionEmptySwitch";
import { PublicListPage } from "@/components/public/PublicListPage";
import { SectionIntro } from "@/components/public/SectionIntro";
import {
  getPublicPostsByCategorySlug,
  resolveWritingCategoryBySlug,
} from "@/lib/payload/public";

export const revalidate = 60;

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const categoryId = await resolveWritingCategoryBySlug(slug);

  if (categoryId === null) {
    return {
      alternates: {
        canonical: `/categories/${slug}`,
      },
      title: "Category not found | SunnyPanel",
    };
  }

  return {
    alternates: {
      canonical: `/categories/${slug}`,
    },
    description: `Published posts in "${decoded}".`,
    openGraph: {
      description: `Published posts in the "${decoded}" category.`,
      title: `Category · ${decoded} | SunnyPanel`,
      type: "website",
      url: `/categories/${slug}`,
    },
    title: `Category · ${decoded} | SunnyPanel`,
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const result = await getPublicPostsByCategorySlug(slug);

  if (result === null) {
    notFound();
  }

  const { docs: posts } = result;

  return (
    <PublicListPage showTimelineRail={false}>
      {({ locale }) => {
        return (
          <>
            <SectionIntro
              eyebrow={locale === "en" ? "Category" : "分类"}
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
                  ? "No published posts in this category yet."
                  : "暂无此分类的已发布文章。"
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
