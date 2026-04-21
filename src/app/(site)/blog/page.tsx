import Link from "next/link";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PostPreviewCard } from "@/components/public/PostPreviewCard";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getPublicPosts } from "@/lib/payload/public";

export default async function BlogIndexPage() {
  const { docs: posts } = await getPublicPosts();
  const latestPostDate = posts[0]?.publishedAt ? formatDate(posts[0].publishedAt) : "等待第一篇文章";
  const uniqueTags = new Set(posts.flatMap((post) => post.tags ?? [])).size;

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-8 pb-4">
        <SectionIntro
          eyebrow="Blog"
          title="Blog"
          stats={[
            { label: "公开文章", value: posts.length },
            { label: "主题标签", value: uniqueTags },
            { label: "最近发布", value: latestPostDate },
          ]}
          actions={
            <Link href="/admin/collections/posts" className="sunny-button-secondary">
              管理文章
            </Link>
          }
        />

        {posts.length === 0 ? (
          <CollectionEmptyState
            title="还没有公开文章"
            body="后台内容模型已经接好。你创建第一篇公开并发布的 Post 之后，这里就会自动出现。"
          />
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <PostPreviewCard post={posts[0]} variant="featured" />

            <div className="grid gap-4">
              {posts.slice(1).map((post) => (
                <PostPreviewCard key={post.id} post={post} variant="compact" />
              ))}
            </div>
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
