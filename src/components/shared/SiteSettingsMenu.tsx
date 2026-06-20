"use client";

import { useState } from "react";

import { LocaleToggle } from "@/components/public/LocaleToggle";
import { PaletteToggle } from "@/components/public/PaletteToggle";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { SettingsPopover } from "@/components/shared/SettingsPopover";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";
import type { SitePalette } from "@/lib/site-palette";

type SiteSettingsMenuProps = {
  locale: SiteLocale;
  palette: SitePalette;
  onLocaleChange?: (locale: SiteLocale) => void;
  onPaletteChange?: (palette: SitePalette) => void;
};

export function SiteSettingsMenu({
  locale,
  palette,
  onLocaleChange,
  onPaletteChange,
}: SiteSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const copy = getSiteCopy(locale);

  return (
    <SettingsPopover open={open} onOpenChange={setOpen} trigger={copy.common.settingsLabel}>
      <header className="settings-popover-header">
        <h2 className="settings-popover-title">设置</h2>
        <p className="settings-popover-subtitle">个性化你的界面体验</p>
      </header>

      <div className="settings-popover-section">
        <span className="settings-popover-section-label">
          {copy.common.localeLabel}
        </span>
        <LocaleToggle
          currentLocale={locale}
          label={copy.common.localeLabel}
          onLocaleChange={onLocaleChange}
        />
      </div>

      <div className="settings-popover-section">
        <span className="settings-popover-section-label">
          {copy.common.themeLabel}
        </span>
        <ThemeToggle locale={locale} />
      </div>

      <div className="settings-popover-section">
        <span className="settings-popover-section-label">
          {copy.common.paletteLabel}
        </span>
        <PaletteToggle
          currentPalette={palette}
          locale={locale}
          onPaletteChange={onPaletteChange}
        />
      </div>
    </SettingsPopover>
  );
}
