import type { Checklist } from "@/payload-types";

export type ChecklistGroup = NonNullable<Checklist["groups"]>[number];

export const getChecklistItemCount = (groups: null | ChecklistGroup[] = []) =>
  (groups ?? []).reduce((total, group) => total + (group.items?.length ?? 0), 0);

export const getChecklistCompletedCount = (groups: null | ChecklistGroup[] = []) =>
  (groups ?? []).reduce(
    (total, group) => total + (group.items ?? []).filter((item) => item?.isCompleted).length,
    0,
  );
