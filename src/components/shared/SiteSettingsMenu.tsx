"use client";

import { useState } from "react";

import { PreferencesPanel } from "@/components/shared/PreferencesPanel";
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
      <PreferencesPanel
        locale={locale}
        palette={palette}
        onLocaleChange={onLocaleChange}
        onPaletteChange={onPaletteChange}
      />
    </SettingsPopover>
  );
}
