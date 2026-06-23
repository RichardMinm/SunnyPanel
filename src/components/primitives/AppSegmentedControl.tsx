"use client";

import { SegmentedSwitch } from "@/components/shared/SegmentedSwitch";
import type { SunnyChromeVariant } from "@/components/shared/segmented-switch-classes";

export type AppSegmentedControlOption<T extends string> = {
  label: string;
  value: T;
};

export type AppSegmentedControlProps<T extends string> = {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: AppSegmentedControlOption<T>[];
  value: T;
  variant?: SunnyChromeVariant;
};

export function AppSegmentedControl<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
  variant = "site",
}: AppSegmentedControlProps<T>) {
  return (
    <SegmentedSwitch
      ariaLabel={ariaLabel}
      onChange={(next) => onChange(next as T)}
      options={options}
      value={value}
      variant={variant}
    />
  );
}
