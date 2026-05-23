import Link from "next/link";

import type { SunnyChromeVariant } from "@/components/shared/segmented-switch-classes";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type SiteBrandProps = {
  locale: SiteLocale;
  variant?: SunnyChromeVariant | "public";
};

export function SiteBrand({ locale, variant = "site" }: SiteBrandProps) {
  const copy = getSiteCopy(locale);

  if (variant === "admin") {
    return (
      <Link href="/" className="sunny-admin-header-brand">
        <span aria-hidden="true" className="sunny-admin-header-mark">
          S
        </span>
        <span className="sunny-admin-header-brand-copy">
          <span className="sunny-admin-header-kicker">SunnyPanel</span>
          <span className="sunny-admin-header-tagline">{copy.frame.tagline}</span>
        </span>
      </Link>
    );
  }

  return (
    <Link href="/" scroll={false} className="group inline-flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white transition md:h-10 md:w-10">
        S
      </span>
      <div className="min-w-0">
        <p className="sunny-kicker text-accent-strong">SunnyPanel</p>
        <p className="truncate text-sm-compact text-muted md:text-sm">{copy.frame.tagline}</p>
      </div>
    </Link>
  );
}
