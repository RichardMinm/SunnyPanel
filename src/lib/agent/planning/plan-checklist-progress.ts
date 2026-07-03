export type PlanChecklistProgress = {
  completedChecklistCount: number;
  completedItems: number;
  completionRate: number;
  hasLinkedChecklists: boolean;
  linkedChecklistCount: number;
  totalItems: number;
};

export type PlanChecklistProgressChecklist = {
  groups?: Array<{
    items?: Array<{
      isCompleted?: boolean | null;
    } | null> | null;
  } | null> | null;
  id?: null | number | string;
  title?: null | string;
};

export type PlanChecklistProgressLinkedContentItem = {
  relationTo?: unknown;
  value?: unknown;
};

export type CalculatePlanChecklistProgressInput = {
  checklists?: Array<PlanChecklistProgressChecklist | null | undefined> | null;
  linkedContent?: PlanChecklistProgressLinkedContentItem[] | null;
};

const zeroProgress = (linkedChecklistCount = 0): PlanChecklistProgress => ({
  completedChecklistCount: 0,
  completedItems: 0,
  completionRate: 0,
  hasLinkedChecklists: linkedChecklistCount > 0,
  linkedChecklistCount,
  totalItems: 0,
});

const idKey = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getLinkedValueId = (value: unknown) => {
  const primitiveKey = idKey(value);

  if (primitiveKey) {
    return primitiveKey;
  }

  return isRecord(value) ? idKey(value.id) : null;
};

const asChecklist = (value: unknown): null | PlanChecklistProgressChecklist => {
  if (!isRecord(value)) {
    return null;
  }

  const key = idKey(value.id);

  if (!key) {
    return null;
  }

  return value as PlanChecklistProgressChecklist;
};

const collectItems = (checklist: PlanChecklistProgressChecklist) =>
  Array.isArray(checklist.groups)
    ? checklist.groups.flatMap((group) =>
        group && Array.isArray(group.items)
          ? group.items.filter((item): item is { isCompleted?: boolean | null } => Boolean(item))
          : [],
      )
    : [];

export const calculatePlanChecklistProgress = ({
  checklists,
  linkedContent,
}: CalculatePlanChecklistProgressInput): PlanChecklistProgress => {
  const linkedChecklistKeys: string[] = [];
  const checklistById = new Map<string, PlanChecklistProgressChecklist>();
  const hasExplicitLinkedContent = linkedContent !== undefined;

  if (Array.isArray(linkedContent)) {
    for (const item of linkedContent) {
      if (item?.relationTo !== "checklists") {
        continue;
      }

      const key = getLinkedValueId(item.value);

      if (!key || linkedChecklistKeys.includes(key)) {
        continue;
      }

      linkedChecklistKeys.push(key);
      const populatedChecklist = asChecklist(item.value);

      if (populatedChecklist) {
        checklistById.set(key, populatedChecklist);
      }
    }
  }

  if (Array.isArray(checklists)) {
    for (const checklist of checklists) {
      if (!checklist) {
        continue;
      }

      const key = idKey(checklist.id);

      if (!key) {
        continue;
      }

      if (!hasExplicitLinkedContent && !linkedChecklistKeys.includes(key)) {
        linkedChecklistKeys.push(key);
      }

      if (linkedChecklistKeys.includes(key) && !checklistById.has(key)) {
        checklistById.set(key, checklist);
      }
    }
  }

  if (linkedChecklistKeys.length === 0) {
    return zeroProgress();
  }

  let completedChecklistCount = 0;
  let completedItems = 0;
  let totalItems = 0;

  for (const key of linkedChecklistKeys) {
    const checklist = checklistById.get(key);

    if (!checklist) {
      continue;
    }

    const items = collectItems(checklist);
    const checklistTotalItems = items.length;
    const checklistCompletedItems = items.filter((item) => item.isCompleted === true).length;

    totalItems += checklistTotalItems;
    completedItems += checklistCompletedItems;

    if (checklistTotalItems > 0 && checklistCompletedItems === checklistTotalItems) {
      completedChecklistCount += 1;
    }
  }

  if (totalItems === 0) {
    return zeroProgress(linkedChecklistKeys.length);
  }

  return {
    completedChecklistCount,
    completedItems,
    completionRate: (completedItems / totalItems) * 100,
    hasLinkedChecklists: true,
    linkedChecklistCount: linkedChecklistKeys.length,
    totalItems,
  };
};
