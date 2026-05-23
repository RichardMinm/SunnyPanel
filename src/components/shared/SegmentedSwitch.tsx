"use client";

import { getSegmentedSwitchClasses, type SunnyChromeVariant } from "@/components/shared/segmented-switch-classes";

export type SegmentedSwitchOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type SegmentedSwitchProps = {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: SegmentedSwitchOption[];
  value: string;
  variant?: SunnyChromeVariant;
};

export function SegmentedSwitch({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  value,
  variant = "site",
}: SegmentedSwitchProps) {
  const classes = getSegmentedSwitchClasses(variant);

  return (
    <div aria-label={ariaLabel} className={classes.root} role="group">
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            aria-pressed={isActive}
            className={`${classes.option}${isActive ? ` ${classes.optionActive}` : ""}`}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
