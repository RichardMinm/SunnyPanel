"use client";

import type { ReactNode } from "react";

import { LocaleToggle } from "@/components/public/LocaleToggle";
import { PaletteToggle } from "@/components/public/PaletteToggle";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import type { SunnyChromeVariant } from "@/components/shared/segmented-switch-classes";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";
import type { SitePalette } from "@/lib/site-palette";

type SiteSettingsMenuProps = {
  locale: SiteLocale;
  palette: SitePalette;
  onLocaleChange?: (locale: SiteLocale) => void;
  onPaletteChange?: (palette: SitePalette) => void;
  variant?: SunnyChromeVariant;
};

function SettingsGroup({
  children,
  label,
  variant,
}: {
  children: ReactNode;
  label: string;
  variant: SunnyChromeVariant;
}) {
  if (variant === "admin") {
    return (
      <div className="sunny-admin-settings-group">
        <p className="sunny-admin-settings-label">{label}</p>
        {children}
      </div>
    );
  }

  return (
    <div className="sunny-settings-group">
      <p className="sunny-settings-label">{label}</p>
      {children}
    </div>
  );
}

export function SiteSettingsMenu({
  locale,
  palette,
  onLocaleChange,
  onPaletteChange,
  variant = "site",
}: SiteSettingsMenuProps) {
  const copy = getSiteCopy(locale);
  const isAdmin = variant === "admin";

  return (
    <details className={isAdmin ? "sunny-admin-settings" : "sunny-settings-menu"}>
      <summary
        className={
          isAdmin
            ? "sunny-admin-settings-trigger"
            : "sunny-button-secondary sunny-settings-trigger list-none"
        }
      >
        {copy.common.settingsLabel}
      </summary>

      <div className={isAdmin ? "sunny-admin-settings-panel" : "sunny-settings-panel"}>
        <SettingsGroup label={copy.common.localeLabel} variant={variant}>
          <LocaleToggle
            currentLocale={locale}
            label={copy.common.localeLabel}
            onLocaleChange={onLocaleChange}
            variant={variant}
          />
        </SettingsGroup>

        <SettingsGroup label={copy.common.themeLabel} variant={variant}>
          <ThemeToggle locale={locale} variant={variant} />
        </SettingsGroup>

        <SettingsGroup label={copy.common.paletteLabel} variant={variant}>
          <PaletteToggle
            currentPalette={palette}
            locale={locale}
            onPaletteChange={onPaletteChange}
            variant={variant}
          />
        </SettingsGroup>
      </div>
    </details>
  );
}
