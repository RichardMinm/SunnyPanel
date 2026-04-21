import Image from "next/image";
import Link from "next/link";

import { formatDate } from "@/lib/formatters";
import { getMediaAsset, getMediaDisplayUrl } from "@/lib/media";
import { estimateReadingMinutes, extractLexicalPlainText } from "@/lib/richtext";
import type { SiteLocale } from "@/lib/site-copy";
import type { Post } from "@/payload-types";

type PostPreviewCardProps = {
  locale: SiteLocale;
  post: Post;
  variant?: "compact" | "featured" | "stack";
};

export function PostPreviewCard({
  locale,
  post,
  variant = "stack",
}: PostPreviewCardProps) {
  const coverImage = getMediaAsset(post.coverImage);
  const readingTime = estimateReadingMinutes(extractLexicalPlainText(post.content));
  const isFeatured = variant === "featured";
  const isCompact = variant === "compact";

  return (
    <Link
      href={`/blog/${post.slug}`}
      className={`sunny-card group overflow-hidden transition hover:-translate-y-1 ${
        isFeatured ? "sunny-card-strong rounded-[2.2rem]" : "rounded-[1.85rem]"
      }`}
    >
      {coverImage ? (
        <div className={isFeatured ? "border-b border-border" : ""}>
          <Image
            alt={coverImage.alt}
            className={`w-full object-cover transition duration-300 group-hover:scale-[1.02] ${
              isFeatured ? "h-64 md:h-80" : "h-48"
            }`}
            height={coverImage.height || 900}
            src={getMediaDisplayUrl(coverImage, isFeatured ? "card" : "thumbnail")}
            unoptimized
            width={coverImage.width || 1600}
          />
        </div>
      ) : null}

      <div className={isFeatured ? "p-8" : "p-6"}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="sunny-kicker text-[0.7rem] text-muted">{formatDate(post.publishedAt)}</span>
          <span className="sunny-badge sunny-badge-muted">
            {readingTime} {locale === "en" ? "min read" : "分钟阅读"}
          </span>
          <span className="sunny-badge sunny-badge-accent">
            {post.visibility === "public"
              ? locale === "en"
                ? "Public"
                : "公开"
              : locale === "en"
                ? "Private"
                : "私有"}
          </span>
        </div>

        <h3
          className={`mt-4 text-foreground ${isFeatured ? "sunny-display text-4xl leading-tight" : "text-2xl font-semibold"}`}
        >
          {post.title}
        </h3>

        <p className={`mt-3 text-muted ${isCompact ? "line-clamp-2 text-sm leading-7" : "text-sm leading-8"}`}>
          {post.summary}
        </p>

        {post.tags && post.tags.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {post.tags.slice(0, isFeatured ? 4 : 3).map((tag) => (
              <span
                key={`${post.id}-${tag}`}
                className="rounded-full bg-white/70 px-3 py-1 text-xs text-accent-strong"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
