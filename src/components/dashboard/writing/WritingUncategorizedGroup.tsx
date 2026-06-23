"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import type { WritingCategoryListItem } from "@/lib/dashboard/writing-categories/normalize";

import { WritingDocumentRow } from "./WritingDocumentRow";
import { sortDocumentsByUpdatedAt } from "./writing-library-groups";
import type { WritingDocumentListItem } from "./writing-types";

type WritingUncategorizedGroupProps = {
  activeDocument: null | WritingDocumentListItem;
  categories: WritingCategoryListItem[];
  documents: WritingDocumentListItem[];
  onDelete: (document: WritingDocumentListItem) => void;
  onDuplicate: (document: WritingDocumentListItem) => void;
  onMoveToCategory: (document: WritingDocumentListItem, categoryId: null | number) => void;
  onRename: (document: WritingDocumentListItem, title: string) => void;
  onSelect: (document: WritingDocumentListItem) => void;
};

export function WritingUncategorizedGroup({
  activeDocument,
  categories,
  documents,
  onDelete,
  onDuplicate,
  onMoveToCategory,
  onRename,
  onSelect,
}: WritingUncategorizedGroupProps) {
  const hasActiveDocument = documents.some(
    (document) =>
      activeDocument?.collection === document.collection && activeDocument.id === document.id,
  );
  const [open, setOpen] = useState(hasActiveDocument || documents.length > 0);

  useEffect(() => {
    if (hasActiveDocument) {
      setOpen(true);
    }
  }, [hasActiveDocument]);

  const sortedDocuments = useMemo(() => sortDocumentsByUpdatedAt(documents), [documents]);

  if (sortedDocuments.length === 0) {
    return null;
  }

  return (
    <section aria-label="未分类" className="sunny-writing-uncategorized-group">
      <button
        aria-expanded={open}
        className="sunny-writing-library-group-head is-uncategorized"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="sunny-writing-library-group-chevron" data-open={open ? "true" : "false"}>
          <DashboardIcon name="chevronDown" />
        </span>
        <span className="sunny-writing-library-group-icon">
          <DashboardIcon name="inbox" />
        </span>
        <span className="sunny-writing-library-group-label">未分类</span>
        <span className="sunny-writing-library-group-count">{sortedDocuments.length}</span>
      </button>
      {open ? (
        <div className="sunny-writing-library-group-list" role="list">
          {sortedDocuments.map((document) => {
            const active =
              activeDocument?.collection === document.collection && activeDocument.id === document.id;

            return (
              <WritingDocumentRow
                active={active}
                categories={categories}
                document={document}
                key={`${document.collection}:${document.id}`}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onMoveToCategory={onMoveToCategory}
                onRename={onRename}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
