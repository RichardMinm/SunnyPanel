export const cleanupText = (value: string) =>
  value
    .trim()
    .replace(/^[，,：:\s]+/, "")
    .replace(/[。！!？?\s]+$/, "");

export const cleanupPlanTitle = (value: string) =>
  cleanupText(
    value
      .replace(/^关于/, "")
      .replace(/^一个/, "")
      .replace(/^这条/, ""),
  );

export const parseChecklistMention = (value: string) => {
  const cleaned = cleanupText(
    value
      .replace(/^(今天|我|刚刚|已经|刚|把)/, "")
      .replace(/^(这个|这条)/, ""),
  );

  if (!cleaned) {
    return null;
  }

  const segments = cleaned
    .split("的")
    .map((item) => cleanupText(item))
    .filter(Boolean);

  if (segments.length >= 3) {
    return {
      checklistTitle: segments[0],
      groupTitle: segments[1],
      itemTitle: segments[segments.length - 1],
    };
  }

  if (segments.length === 2) {
    return {
      checklistTitle: segments[0],
      groupTitle: null,
      itemTitle: segments[1],
    };
  }

  return null;
};

export const parseChecklistGroupMention = (value: string) => {
  const cleaned = cleanupText(
    value
      .replace(/^(今天|我|刚刚|已经|刚|把|给|在|往|向)/, "")
      .replace(/(里面|里|中)$/, "")
      .replace(/^(这个|这条)/, ""),
  );

  if (!cleaned) {
    return null;
  }

  const segments = cleaned
    .split("的")
    .map((item) => cleanupText(item))
    .filter(Boolean);

  if (segments.length >= 2) {
    return {
      checklistTitle: segments[0],
      groupTitle: segments[segments.length - 1],
    };
  }

  return {
    checklistTitle: cleaned,
    groupTitle: null,
  };
};

export const normalizeTimelineSourceType = (value: string) => {
  const normalized = value.toLowerCase();

  if (/(posts|post|文章|博客)/.test(normalized)) {
    return "post" as const;
  }

  if (/(notes|note|笔记)/.test(normalized)) {
    return "note" as const;
  }

  if (/(updates|update|动态|更新)/.test(normalized)) {
    return "update" as const;
  }

  if (/(checklists|checklist|清单|条目)/.test(normalized)) {
    return "checklist_item" as const;
  }

  if (/(plans|plan|计划)/.test(normalized)) {
    return "plan" as const;
  }

  return null;
};
