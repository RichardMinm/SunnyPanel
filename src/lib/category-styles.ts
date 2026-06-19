export const categoryIds = [
  "agent",
  "course",
  "default",
  "exam",
  "plan",
  "plan_action",
  "study",
] as const;

export type CategoryId = (typeof categoryIds)[number];

export const categoryChipClass = "sunny-cat-chip";

export const categoryDotClass = "sunny-cat-dot";

/** Maps schedule `plan_action` to palette token prefix `plan`. */
export function resolveCategoryTokenKey(category: string): "agent" | "course" | "default" | "exam" | "plan" | "study" {
  if (category === "plan_action") return "plan";
  if (category === "agent" || category === "course" || category === "exam" || category === "study") {
    return category;
  }
  return "default";
}
