import Link from "next/link";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
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
          title="长篇写作与系统化表达"
          description="这里适合承载更完整的观点、项目记录和阶段复盘。相比 Notes 与 Updates，Blog 更偏向可反复回看的正文层。"
          stats={[
            { label: "公开文章", value: posts.length },
            { label: "主题标签", value: uniqueTags },
            { label: "最近发布", value: latestPostDate },
          ]}
          actions={
            <>
              <Link href="/timeline" className="sunny-button-secondary">
                查看时间线
              </Link>
              <Link href="/admin/collections/posts" className="sunny-button-primary">
                写新文章
              </Link>
            </>
          }
        />

        {posts.length === 0 ? (
          <CollectionEmptyState
            title="还没有公开文章"
            body="后台内容模型已经接好。你创建第一篇公开并发布的 Post 之后，这里就会自动出现。"
          />
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Link
              href={`/blog/${posts[0].slug}`}
              className="sunny-card sunny-card-strong rounded-[2.2rem] p-8 transition hover:-translate-y-1"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="sunny-badge sunny-badge-accent">Latest essay</span>
                <span className="text-sm text-muted">{formatDate(posts[0].publishedAt)}</span>
              </div>
              <h2 className="sunny-display mt-6 text-4xl leading-tight text-foreground">
                {posts[0].title}
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted">{posts[0].summary}</p>
              {posts[0].tags && posts[0].tags.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {posts[0].tags.map((tag) => (
                    <span
                      key={`${posts[0].id}-${tag}`}
                      className="rounded-full bg-white/70 px-3 py-1 text-xs text-accent-strong"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>

            <div className="grid gap-4">
              {posts.slice(1).map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="sunny-card rounded-[1.8rem] p-6 transition hover:-translate-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="sunny-kicker text-xs text-muted">{formatDate(post.publishedAt)}</span>
                    <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                      {post.visibility}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-foreground">{post.title}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-8 text-muted">{post.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
