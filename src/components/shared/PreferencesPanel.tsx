"use client";

import Link from "next/link";

import { LocaleToggle } from "@/components/public/LocaleToggle";
import { PaletteToggle } from "@/components/public/PaletteToggle";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";
import type { SitePalette } from "@/lib/site-palette";

type PreferencesPanelProps = {
  advancedManagementHref?: string;
  locale: SiteLocale;
  palette: SitePalette;
  onLocaleChange?: (locale: SiteLocale) => void;
  onPaletteChange?: (palette: SitePalette) => void;
  /** Use compact admin styling for locale/palette/theme controls. */
  variant?: "site" | "admin";
};

export function PreferencesPanel({
  advancedManagementHref,
  locale,
  palette,
  onLocaleChange,
  onPaletteChange,
  variant = "site",
}: PreferencesPanelProps) {
  const copy = getSiteCopy(locale);

  return (
    <>
      <header className="settings-popover-header">
        <h2 className="settings-popover-title">设置</h2>
        <p className="settings-popover-subtitle">个性化你的界面体验</p>
      </header>

      <div className="settings-popover-section">
        <span className="settings-popover-section-label">{copy.common.localeLabel}</span>
        <LocaleToggle
          currentLocale={locale}
          label={copy.common.localeLabel}
          onLocaleChange={onLocaleChange}
          variant={variant}
        />
      </div>

      <div className="settings-popover-section">
        <span className="settings-popover-section-label">{copy.common.themeLabel}</span>
        <ThemeToggle locale={locale} variant={variant} />
      </div>

      <div className="settings-popover-section">
        <span className="settings-popover-section-label">{copy.common.paletteLabel}</span>
        <PaletteToggle
          currentPalette={palette}
          locale={locale}
          onPaletteChange={onPaletteChange}
          variant={variant}
        />
      </div>

      {advancedManagementHref ? (
        <div className="settings-popover-section settings-popover-section--advanced">
          <Link className="settings-popover-advanced-link" href={advancedManagementHref}>
            <span>{copy.admin.advancedManagement}</span>
            <small>{copy.admin.advancedDescription}</small>
          </Link>
        </div>
      ) : null}
    </>
  );
}
