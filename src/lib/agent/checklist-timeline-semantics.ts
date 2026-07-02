export const CHECKLIST_TIMELINE_SOURCE_TYPE = "checklist" as const;
export const CHECKLIST_TIMELINE_TYPE = "project" as const;

const compactText = (value: string, maxLength: number) => {
  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trimEnd()}...`;
};

const optionalText = (value: null | string | undefined) => {
  const normalized = value?.trim();

  return normalized ? normalized : null;
};

export const buildChecklistTimelineTitle = ({
  itemTitle,
}: {
  checklistTitle: string;
  groupTitle?: null | string;
  itemTitle: string;
}) => `完成清单项：${compactText(itemTitle, 56)}`;

export const buildChecklistTimelineDescription = ({
  checklistTitle,
  completionNote,
  groupTitle,
  itemDescription,
  itemTitle,
}: {
  checklistTitle: string;
  completionNote?: null | string;
  groupTitle?: null | string;
  itemDescription?: null | string;
  itemTitle: string;
}) => {
  const lines = [
    `清单：${compactText(checklistTitle, 80)}`,
    optionalText(groupTitle) ? `分组：${compactText(optionalText(groupTitle) ?? "", 80)}` : null,
    `条目：${compactText(itemTitle, 80)}`,
    optionalText(itemDescription) ? `说明：${optionalText(itemDescription)}` : null,
    optionalText(completionNote) ? `完成备注：${optionalText(completionNote)}` : null,
  ];

  return lines.filter((line): line is string => Boolean(line)).join("\n");
};
