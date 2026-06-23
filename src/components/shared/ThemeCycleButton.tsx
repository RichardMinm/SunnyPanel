"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";

import { AppButton } from "@/components/primitives/AppButton";
import { AppTooltip } from "@/components/primitives/AppTooltip";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type ThemeValue = "dark" | "light" | "system";

const themeOrder: ThemeValue[] = ["light", "dark", "system"];

const themeShortLabel: Record<ThemeValue, string> = {
  light: "浅色",
  dark: "深色",
  system: "系统",
};

type ThemeCycleButtonProps = {
  locale: SiteLocale;
};

export function ThemeCycleButton({ locale }: ThemeCycleButtonProps) {
  const { setTheme, theme } = useTheme();
  const copy = getSiteCopy(locale);
  const currentTheme = (theme ?? "system") as ThemeValue;

  const labels: Record<ThemeValue, string> = {
    light: copy.common.themeLight,
    dark: copy.common.themeDark,
    system: copy.common.themeSystem,
  };

  const currentIndex = themeOrder.indexOf(currentTheme);
  const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length] ?? "system";

  const tooltip = useMemo(
    () => `当前：${labels[currentTheme]} · 点击切换到${labels[nextTheme]}`,
    [currentTheme, labels, nextTheme],
  );

  return (
    <AppTooltip content={tooltip}>
      <AppButton
        aria-label={tooltip}
        onClick={() => setTheme(nextTheme)}
        type="button"
        variant="secondary"
      >
        {themeShortLabel[currentTheme]}
      </AppButton>
    </AppTooltip>
  );
}
