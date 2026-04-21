"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { SiteLocale } from "@/lib/site-copy";

type LocaleToggleProps = {
  currentLocale: SiteLocale;
  label: string;
};

const locales: SiteLocale[] = ["zh", "en"];
const localeLabels: Record<SiteLocale, string> = {
  en: "EN",
  zh: "中文",
};

export function LocaleToggle({ currentLocale, label }: LocaleToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchLocale = (locale: SiteLocale) => {
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
      startTransition(() => {
        router.refresh();
      });
    });
  };

  return (
    <div className="sunny-locale-switch" aria-label={label} role="group">
      {locales.map((locale) => (
        <button
          key={locale}
          className={`sunny-locale-option ${locale === currentLocale ? "sunny-locale-option-active" : ""}`}
          disabled={isPending}
          onClick={() => switchLocale(locale)}
          type="button"
        >
          {localeLabels[locale]}
        </button>
      ))}
    </div>
  );
}
