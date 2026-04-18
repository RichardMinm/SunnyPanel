import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RichTextContent } from "@/components/public/RichTextContent";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { getPublicPostBySlug } from "@/lib/payload/public";
import { estimateReadingMinutes, extractLexicalPlainText } from "@/lib/richtext";
import type { Media } from "@/payload-types";

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type MediaWithUrl = Media & {
  url: string;
};

const getCoverImage = (value: Media | number | null | undefined): MediaWithUrl | null => {
  if (!value || typeof value === "number") {
    return null;
  }

  if (typeof value.url !== "string" || value.url.length === 0) {
    return null;
  }

  return value as MediaWithUrl;
};

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicPostBySlug(slug);

  if (!post) {
    return {
      title: "文章未找到 | SunnyPanel",
    };
  }

  const coverImage = getCoverImage(post.coverImage);

  return {
    title: `${post.title} | SunnyPanel`,
    description: post.summary,
    openGraph: {
      description: post.summary,
      images: coverImage?.url ? [{ alt: coverImage.alt, url: coverImage.url }] : undefined,
      title: post.title,
      type: "article",
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPublicPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const coverImage = getCoverImage(post.coverImage);
  const readingTime = estimateReadingMinutes(extractLexicalPlainText(post.content));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <Link href="/blog" className="rounded-full border border-border px-4 py-2 hover:bg-white/60">
          返回文章列表
        </Link>
        <span>{formatDate(post.publishedAt)}</span>
        <span>约 {readingTime} 分钟阅读</span>
      </div>

      <article className="grid gap-6 xl:grid-cols-[0.9fr_1.5fr]">
        <aside className="sunny-card rounded-[2rem] p-8">
          <p className="sunny-kicker text-xs text-muted">Article overview</p>
          <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-5 text-base leading-8 text-muted">{post.summary}</p>

          <div className="mt-8 space-y-4 border-t border-border pt-6 text-sm text-muted">
            <div className="flex items-center justify-between gap-3">
              <span>发布时间</span>
              <span className="text-foreground">{formatDate(post.publishedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>最近更新</span>
              <span className="text-foreground">{formatDateTime(post.updatedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>阅读时长</span>
              <span className="text-foreground">{readingTime} 分钟</span>
            </div>
          </div>

          {post.tags && post.tags.length > 0 ? (
            <div className="mt-8 flex flex-wrap gap-2">
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
        </aside>

        <div className="sunny-card sunny-card-strong overflow-hidden rounded-[2rem]">
          {coverImage ? (
            <figure className="border-b border-border">
              <Image
                alt={coverImage.alt}
                className="h-[280px] w-full object-cover md:h-[360px]"
                height={coverImage.height || 900}
                priority
                src={coverImage.url}
                unoptimized
                width={coverImage.width || 1600}
              />
              <figcaption className="px-8 py-4 text-sm text-muted md:px-10">
                {coverImage.alt}
              </figcaption>
            </figure>
          ) : null}

          <div className="p-8 md:p-10">
            <div className="mb-8 rounded-[1.5rem] border border-border bg-white/45 p-5 text-sm leading-8 text-muted">
              这篇文章属于 SunnyPanel 的公开写作层。它会和首页、Blog 列表、Timeline
              叙事一起构成长期可回看的个人表达系统。
            </div>

            <RichTextContent data={post.content} />
          </div>
        </div>
      </article>
    </main>
  );
}
