import Link from "next/link";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getPublicPosts } from "@/lib/payload/public";

export default async function BlogIndexPage() {
  const { docs: posts } = await getPublicPosts();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 md:px-10">
      <SectionIntro
        eyebrow="Blog"
        title="Long-form writing"
        description="Public essays, project notes, and longer reflections will live here once content starts flowing through Payload."
      />

      {posts.length === 0 ? (
        <CollectionEmptyState
          title="还没有公开文章"
          body="后台内容模型已经接好。你创建第一篇公开并发布的 Post 之后，这里就会自动出现。"
        />
      ) : (
        <section className="grid gap-5">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="sunny-card rounded-[2rem] p-7 transition hover:-translate-y-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="sunny-kicker text-xs text-muted">{formatDate(post.publishedAt)}</span>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                  {post.visibility}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-foreground">{post.title}</h2>
              <p className="mt-3 max-w-3xl leading-8 text-muted">{post.summary}</p>
              {post.tags && post.tags.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={`${post.id}-${tag}`}
                      className="rounded-full bg-white/70 px-3 py-1 text-xs text-accent-strong"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
