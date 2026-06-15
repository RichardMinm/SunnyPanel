"use client";

import { useMemo, useState } from "react";

import type { DashboardContentCollection } from "@/lib/dashboard/content/config";

import { WritingDocumentRow } from "./WritingDocumentRow";
import { WritingEmptyState } from "./WritingEmptyState";
import { WritingLibraryFilters } from "./WritingLibraryFilters";
import { WritingLibraryHeader } from "./WritingLibraryHeader";
import { WritingLibrarySearch } from "./WritingLibrarySearch";
import type { WritingCollectionFilter, WritingDocumentListItem } from "./writing-types";

type WritingLibraryProps = {
  activeDocument: null | WritingDocumentListItem;
  collectionFilter: WritingCollectionFilter;
  documents: WritingDocumentListItem[];
  isLoading: boolean;
  onClose?: () => void;
  onCollectionFilterChange: (filter: WritingCollectionFilter) => void;
  onCreateDocument: (collection: DashboardContentCollection) => void;
  onDeleteDocument: (document: WritingDocumentListItem) => void;
  onDuplicateDocument: (document: WritingDocumentListItem) => void;
  onRenameDocument: (document: WritingDocumentListItem, title: string) => void;
  onSelectDocument: (document: WritingDocumentListItem) => void;
};

export function WritingLibrary({
  activeDocument,
  collectionFilter,
  documents,
  isLoading,
  onClose,
  onCollectionFilterChange,
  onCreateDocument,
  onDeleteDocument,
  onDuplicateDocument,
  onRenameDocument,
  onSelectDocument,
}: WritingLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return documents;
    }

    return documents.filter((document) => {
      const haystack = [document.title, document.excerpt].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [documents, searchQuery]);

  return (
    <aside className="sunny-writing-library" aria-label="内容库">
      <WritingLibraryHeader onClose={onClose} onCreateDocument={onCreateDocument} />
      <WritingLibrarySearch onChange={setSearchQuery} value={searchQuery} />
      <WritingLibraryFilters
        collectionFilter={collectionFilter}
        onCollectionFilterChange={onCollectionFilterChange}
      />

      <div className="sunny-writing-document-list" role="list">
        {isLoading ? (
          <p className="sunny-writing-empty">正在整理内容...</p>
        ) : filteredDocuments.length ? (
          filteredDocuments.map((document) => {
            const active =
              activeDocument?.collection === document.collection && activeDocument.id === document.id;

            return (
              <WritingDocumentRow
                active={active}
                document={document}
                key={`${document.collection}:${document.id}`}
                onDelete={onDeleteDocument}
                onDuplicate={onDuplicateDocument}
                onRename={onRenameDocument}
                onSelect={onSelectDocument}
              />
            );
          })
        ) : (
          <WritingEmptyState onCreate={() => onCreateDocument("posts")} />
        )}
      </div>
    </aside>
  );
}
