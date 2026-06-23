"use client";

import { PreferencesPanel } from "@/components/shared/PreferencesPanel";
import { SettingsPopover } from "@/components/shared/SettingsPopover";
import type { SiteLocale } from "@/lib/site-copy";
import type { SitePalette } from "@/lib/site-palette";

type DashboardSettingsMenuProps = {
  locale: SiteLocale;
  palette: SitePalette;
  onLocaleChange?: (locale: SiteLocale) => void;
  onPaletteChange?: (palette: SitePalette) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: React.ReactNode;
  triggerClassName?: string;
};

export function DashboardSettingsMenu({
  locale,
  palette,
  onLocaleChange,
  onPaletteChange,
  open,
  onOpenChange,
  trigger,
  triggerClassName = "sunny-dashboard-sidebar-action",
}: DashboardSettingsMenuProps) {
  return (
    <SettingsPopover
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      triggerClassName={triggerClassName}
    >
      <PreferencesPanel
        locale={locale}
        palette={palette}
        onLocaleChange={onLocaleChange}
        onPaletteChange={onPaletteChange}
        variant="admin"
      />
    </SettingsPopover>
  );
}
