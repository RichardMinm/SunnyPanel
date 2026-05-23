"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SegmentedSwitch } from "@/components/shared/SegmentedSwitch";
import type { SunnyChromeVariant } from "@/components/shared/segmented-switch-classes";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type LocaleToggleProps = {
  currentLocale: SiteLocale;
  label: string;
  onLocaleChange?: (locale: SiteLocale) => void;
  variant?: SunnyChromeVariant;
};

const locales: SiteLocale[] = ["zh", "en"];

export function LocaleToggle({
  currentLocale,
  label,
  onLocaleChange,
  variant = "site",
}: LocaleToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchLocale = (nextLocale: string) => {
    const locale = nextLocale as SiteLocale;

    if (locale === currentLocale) {
      return;
    }

    fetch("/api/site-locale", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ locale }),
    }).then(() => {
      onLocaleChange?.(locale);
      startTransition(() => {
        router.refresh();
      });
    });
  };

  const copy = getSiteCopy(currentLocale);

  return (
    <SegmentedSwitch
      ariaLabel={label}
      disabled={isPending}
      onChange={switchLocale}
      options={locales.map((locale) => ({
        label: copy.common.localeOptions[locale],
        value: locale,
      }))}
      value={currentLocale}
      variant={variant}
    />
  );
}
