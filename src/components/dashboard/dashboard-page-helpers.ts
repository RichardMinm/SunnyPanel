import type { Plan } from "@/payload-types";

import type { LinkedContentItem } from "./dashboard-page-constants";
import { dayInMs, relationLabelMap } from "./dashboard-page-constants";

export const getLinkedContent = (plan: Plan) =>
  ((plan.linkedContent ?? []) as LinkedContentItem[])
    .map((item: LinkedContentItem) => {
      if (!item || typeof item !== "object" || !("relationTo" in item)) {
        return null;
      }

      const relationTo = item.relationTo;
      const value = item.value;

      if (!value || typeof value === "number") {
        return {
          label: relationLabelMap[relationTo] ?? "内容",
          title: `#${value}`,
        };
      }

      if ("title" in value && typeof value.title === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "内容",
          title: value.title,
        };
      }

      if ("content" in value && typeof value.content === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "内容",
          title: value.content,
        };
      }

      if ("type" in value && typeof value.type === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "内容",
          title: value.type,
        };
      }

      return null;
    })
    .filter((item): item is { label: string; title: string } => Boolean(item));

export const getDueDayOffset = (value?: null | string) => {
  if (!value) {
    return null;
  }

  const dueDate = new Date(value);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  return Math.round((startOfDueDate.getTime() - startOfToday.getTime()) / dayInMs);
};
