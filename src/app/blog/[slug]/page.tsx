import Link from "next/link";
import { notFound } from "next/navigation";

import { RichTextContent } from "@/components/public/RichTextContent";
import { formatDate } from "@/lib/formatters";
import { getPublicPostBySlug } from "@/lib/payload/public";

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPublicPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <Link href="/blog" className="rounded-full border border-border px-4 py-2 hover:bg-white/60">
          Back to Blog
        </Link>
        <span>{formatDate(post.publishedAt)}</span>
      </div>

      <article className="sunny-card sunny-card-strong rounded-[2rem] p-8 md:p-10">
        <p className="sunny-kicker text-xs text-muted">Post</p>
        <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-6xl">
          {post.title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">{post.summary}</p>

        {post.tags && post.tags.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={`${post.id}-${tag}`}
                className="rounded-full border border-border bg-white/70 px-3 py-1 text-xs text-accent-strong"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-10 border-t border-border pt-8">
          <RichTextContent data={post.content} />
        </div>
      </article>
    </main>
  );
}
