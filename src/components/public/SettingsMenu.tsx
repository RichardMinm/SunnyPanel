"use client";

import { LocaleToggle } from "@/components/public/LocaleToggle";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

export function SettingsMenu({ locale }: { locale: SiteLocale }) {
  const copy = getSiteCopy(locale);

  return (
    <details className="sunny-settings-menu">
      <summary className="sunny-button-secondary sunny-settings-trigger list-none">
        {locale === "en" ? "Settings" : "设置"}
      </summary>

      <div className="sunny-settings-panel">
        <div className="sunny-settings-group">
          <p className="sunny-settings-label">{copy.common.localeLabel}</p>
          <LocaleToggle currentLocale={locale} label={copy.common.localeLabel} />
        </div>

        <div className="sunny-settings-group">
          <p className="sunny-settings-label">{copy.common.themeLabel}</p>
          <ThemeToggle locale={locale} />
        </div>
      </div>
    </details>
  );
}
