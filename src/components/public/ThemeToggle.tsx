"use client";

import { useTheme } from "next-themes";

import { SegmentedSwitch } from "@/components/shared/SegmentedSwitch";
import type { SunnyChromeVariant } from "@/components/shared/segmented-switch-classes";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type ThemeValue = "dark" | "light" | "system";

const themeOrder: ThemeValue[] = ["light", "dark", "system"];

type ThemeToggleProps = {
  locale: SiteLocale;
  variant?: SunnyChromeVariant;
};

export function ThemeToggle({ locale, variant = "site" }: ThemeToggleProps) {
  const { setTheme, theme } = useTheme();
  const copy = getSiteCopy(locale);
  const currentTheme = (theme ?? "system") as ThemeValue;

  return (
    <SegmentedSwitch
      ariaLabel={copy.common.themeLabel}
      onChange={(value) => setTheme(value as ThemeValue)}
      options={themeOrder.map((value) => ({
        label:
          value === "light"
            ? copy.common.themeLight
            : value === "dark"
              ? copy.common.themeDark
              : copy.common.themeSystem,
        value,
      }))}
      value={currentTheme}
      variant={variant}
    />
  );
}
