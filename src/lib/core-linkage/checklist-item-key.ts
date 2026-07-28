const normalizeChecklistItemTitle = (title: string) => title.trim().replace(/\s+/g, " ");

export function buildChecklistItemReferenceKey(input: {
  groupIndex: number;
  itemIndex: number;
  title: string;
}): string {
  return `${input.groupIndex + 1}-${input.itemIndex + 1}-${normalizeChecklistItemTitle(input.title)}`;
}
