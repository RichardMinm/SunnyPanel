import Link from "next/link";

import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type SiteBrandProps = {
  locale: SiteLocale;
};

export function SiteBrand({ locale }: SiteBrandProps) {
  const copy = getSiteCopy(locale);

  return (
    <Link href="/" scroll={false} className="group inline-flex min-w-0 items-center gap-3">
      <span className="sunny-brand-mark" aria-hidden="true">
        S
      </span>
      <div className="min-w-0">
        <p className="sunny-kicker text-accent-strong">SunnyPanel</p>
        <p className="truncate text-sm-compact text-muted md:text-sm">{copy.frame.tagline}</p>
      </div>
    </Link>
  );
}
