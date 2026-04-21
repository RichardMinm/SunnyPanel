import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { RichTextContent } from "@/components/public/RichTextContent";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { getMediaAsset, getMediaDisplayUrl } from "@/lib/media";
import { getSiteLocale } from "@/lib/site-locale";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicPostBySlug } from "@/lib/payload/public";
import { estimateReadingMinutes, extractLexicalPlainText } from "@/lib/richtext";

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getSiteLocale();
  const copy = getSiteCopy(locale);
  const post = await getPublicPostBySlug(slug);

  if (!post) {
    return {
      title: copy.blogPost.notFound,
    };
  }

  const coverImage = getMediaAsset(post.coverImage);

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
  const locale = await getSiteLocale();
  const copy = getSiteCopy(locale);
  const post = await getPublicPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const coverImage = getMediaAsset(post.coverImage);
  const readingTime = estimateReadingMinutes(extractLexicalPlainText(post.content));

  return (
    <PublicSiteFrame locale={locale}>
      <main className="flex flex-1 flex-col gap-6 pb-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <Link href="/blog" className="sunny-button-secondary px-4 py-2 text-sm">
            {copy.blogPost.backList}
          </Link>
          <span className="sunny-badge sunny-badge-muted">{formatDate(post.publishedAt)}</span>
          <span className="sunny-badge sunny-badge-accent">
            {copy.blogPost.approxRead} {readingTime} {copy.common.readMinutes}
          </span>
        </div>

        <article className="grid gap-6 xl:grid-cols-[0.88fr_1.52fr]">
          <aside className="sunny-card rounded-[2.2rem] p-8">
            <p className="sunny-kicker text-xs text-muted">{copy.blogPost.overview}</p>
            <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-5xl">
              {post.title}
            </h1>
            <p className="mt-5 text-base leading-8 text-muted">{post.summary}</p>

            <div className="mt-8 space-y-4 border-t border-border pt-6 text-sm text-muted">
              <div className="flex items-center justify-between gap-3">
                <span>{copy.blogPost.publishedAt}</span>
                <span className="text-foreground">{formatDate(post.publishedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{copy.blogPost.updatedAt}</span>
                <span className="text-foreground">{formatDateTime(post.updatedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{copy.blogPost.readingTime}</span>
                <span className="text-foreground">{readingTime} {copy.common.readMinutes}</span>
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

          <div className="sunny-card sunny-card-strong overflow-hidden rounded-[2.2rem]">
            {coverImage ? (
              <figure className="border-b border-border">
                <Image
                  alt={coverImage.alt}
                  className="h-[280px] w-full object-cover md:h-[380px]"
                  height={coverImage.height || 900}
                  priority
                  src={getMediaDisplayUrl(coverImage)}
                  unoptimized
                  width={coverImage.width || 1600}
                />
                <figcaption className="px-8 py-4 text-sm text-muted md:px-10">
                  {coverImage.alt}
                </figcaption>
              </figure>
            ) : null}

            <div className="p-8 md:p-10">
              <div className="mb-8 rounded-[1.65rem] border border-border bg-white/45 p-5 text-sm leading-8 text-muted">
                {copy.blogPost.articleLayer}
              </div>

              <RichTextContent data={post.content} />
            </div>
          </div>
        </article>
      </main>
    </PublicSiteFrame>
  );
}
