"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import {
  dashboardContentCollections,
  dashboardContentLabels,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";

import { WritingDocumentRow } from "./WritingDocumentRow";
import { getWritingCollectionMeta } from "./writing-collection-meta";
import type { WritingDocumentListItem } from "./writing-types";

type WritingLibraryGroupProps = {
  activeDocument: null | WritingDocumentListItem;
  collection: DashboardContentCollection;
  documents: WritingDocumentListItem[];
  onDelete: (document: WritingDocumentListItem) => void;
  onDuplicate: (document: WritingDocumentListItem) => void;
  onRename: (document: WritingDocumentListItem, title: string) => void;
  onSelect: (document: WritingDocumentListItem) => void;
};

export function WritingLibraryGroup({
  activeDocument,
  collection,
  documents,
  onDelete,
  onDuplicate,
  onRename,
  onSelect,
}: WritingLibraryGroupProps) {
  const hasActiveDocument = activeDocument?.collection === collection;
  const [open, setOpen] = useState(hasActiveDocument);

  useEffect(() => {
    if (hasActiveDocument) {
      setOpen(true);
    }
  }, [hasActiveDocument]);

  const toggleOpen = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const sortedDocuments = useMemo(
    () =>
      [...documents].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [documents],
  );

  const { icon, tintVar } = getWritingCollectionMeta(collection);
  const documentCount = sortedDocuments.length;

  return (
    <section
      aria-label={dashboardContentLabels[collection]}
      className="sunny-writing-library-group"
      data-collection={collection}
    >
      <button
        aria-expanded={open}
        className="sunny-writing-library-group-head"
        onClick={toggleOpen}
        style={{ ["--writing-collection-tint" as string]: `var(${tintVar})` }}
        type="button"
      >
        <span className="sunny-writing-library-group-chevron" data-open={open ? "true" : "false"}>
          <DashboardIcon name="chevronDown" />
        </span>
        <span className="sunny-writing-library-group-icon" data-collection={collection}>
          <DashboardIcon name={icon} />
        </span>
        <span className="sunny-writing-library-group-label">{dashboardContentLabels[collection]}</span>
        {documentCount > 0 ? (
          <span className="sunny-writing-library-group-count">{documentCount}</span>
        ) : null}
      </button>
      {open && documentCount > 0 ? (
        <div className="sunny-writing-library-group-list" role="list">
          {sortedDocuments.map((document) => {
            const active =
              activeDocument?.collection === document.collection && activeDocument.id === document.id;

            return (
              <WritingDocumentRow
                active={active}
                document={document}
                key={`${document.collection}:${document.id}`}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
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

export const groupDocumentsByCollection = (
  documents: WritingDocumentListItem[],
): Record<DashboardContentCollection, WritingDocumentListItem[]> => {
  const groups = Object.fromEntries(
    dashboardContentCollections.map((collection) => [collection, [] as WritingDocumentListItem[]]),
  ) as Record<DashboardContentCollection, WritingDocumentListItem[]>;

  for (const document of documents) {
    groups[document.collection].push(document);
  }

  return groups;
};
