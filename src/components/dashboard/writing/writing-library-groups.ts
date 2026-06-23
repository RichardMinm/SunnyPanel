import type { WritingCategoryListItem } from "@/lib/dashboard/writing-categories/normalize";

import type { WritingDocumentListItem } from "./writing-types";

export const groupDocumentsByCategory = (
  documents: WritingDocumentListItem[],
  categories: WritingCategoryListItem[],
) => {
  const byCategory = new Map<number, WritingDocumentListItem[]>(
    categories.map((category) => [category.id, []]),
  );
  const uncategorized: WritingDocumentListItem[] = [];

  for (const document of documents) {
    if (document.categoryId && byCategory.has(document.categoryId)) {
      byCategory.get(document.categoryId)?.push(document);
      continue;
    }

    uncategorized.push(document);
  }

  return {
    byCategory,
    uncategorized: uncategorized.sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    ),
  };
};

export const sortDocumentsByUpdatedAt = (documents: WritingDocumentListItem[]) =>
  [...documents].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
