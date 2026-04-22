import type { Update } from "@/payload-types";

import { RecordCoverImage } from "@/components/public/RecordCoverImage";
import { formatDate } from "@/lib/formatters";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type UpdateCardProps = {
  locale: SiteLocale;
  update: Update;
  variant?: "feed" | "home";
};

export function UpdateCard({ locale, update, variant = "feed" }: UpdateCardProps) {
  const copy = getSiteCopy(locale);
  const isHomeCard = variant === "home";

  return (
    <article
      className={
        isHomeCard
          ? "rounded-[1.15rem] border border-border bg-white/60 px-4 py-4 md:rounded-[1.35rem] md:px-5 md:py-5"
          : "relative rounded-[1.3rem] border border-border bg-white/60 p-4 sm:p-5 md:ml-12 md:rounded-[1.7rem] md:p-6"
      }
    >
      {!isHomeCard ? (
        <div className="absolute -left-[2.55rem] top-7 hidden h-4 w-4 rounded-full border-4 border-background bg-accent md:block" />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted sm:text-sm">
        <span className="sunny-badge sunny-badge-accent">{update.type}</span>
        <span>{formatDate(update.createdAt, locale)}</span>
      </div>

      <RecordCoverImage
        containerClassName="mt-4 overflow-hidden rounded-[1rem] border border-border/80"
        imageClassName={isHomeCard ? "h-44 w-full object-cover" : "h-52 w-full object-cover"}
        preferredSize={isHomeCard ? "thumbnail" : "card"}
        record={update as unknown as Record<string, unknown>}
      />

      <p
        className={
          isHomeCard
            ? "mt-4 text-sm leading-8 text-foreground"
            : "mt-4 text-[0.97rem] leading-7 text-foreground md:text-[1.02rem] md:leading-8"
        }
      >
        {update.content}
      </p>

      {update.link ? (
        <a
          className="mt-4 inline-flex text-sm font-semibold text-accent-strong"
          href={update.link}
          rel="noreferrer"
          target="_blank"
        >
          {copy.common.relatedLink}
        </a>
      ) : null}
    </article>
  );
}
