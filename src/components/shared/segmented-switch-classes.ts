export type SunnyChromeVariant = "site" | "admin";

export function getSegmentedSwitchClasses(variant: SunnyChromeVariant = "site") {
  if (variant === "admin") {
    return {
      root: "sunny-segmented-switch sunny-segmented-switch--admin",
      option: "sunny-segmented-switch__option",
      optionActive: "is-active",
    };
  }

  return {
    root: "sunny-segmented-switch",
    option: "sunny-segmented-switch__option",
    optionActive: "is-active",
  };
}

export function getPaletteSwitchClasses(variant: SunnyChromeVariant = "site") {
  if (variant === "admin") {
    return {
      root: "sunny-palette-switch sunny-palette-switch--admin",
      option: "sunny-palette-option",
    };
  }

  return {
    root: "sunny-palette-switch",
    option: "sunny-palette-option",
  };
}
