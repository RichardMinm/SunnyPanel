"use client";

import { useMemo } from "react";

import type { DashboardContentCollection } from "@/lib/dashboard/content/config";

import { WritingCategoryGroup } from "./WritingCategoryGroup";
import { useWritingDocumentsContext } from "./WritingDocumentsContext";
import { WritingEmptyState } from "./WritingEmptyState";
import { useWritingLibraryFiltersContext } from "./WritingLibraryFiltersContext";
import { WritingLibraryHeader } from "./WritingLibraryHeader";
import { WritingUncategorizedGroup } from "./WritingUncategorizedGroup";
import { groupDocumentsByCategory } from "./writing-library-groups";
import type { WritingDocumentListItem } from "./writing-types";

type WritingLibraryProps = {
  onClose?: () => void;
  variant?: "column" | "embedded";
};

export function WritingLibrary({ onClose, variant = "column" }: WritingLibraryProps) {
  const {
    activeCategoryId,
    archiveCategory,
    categories,
    createDocument,
    documents,
    duplicateDocument,
    handleDeleteRequest,
    handleSelectDocument,
    isLoading,
    isLoadingCategories,
    moveDocumentToCategory,
    renameDocument,
    selectedDocument,
    setActiveCategoryId,
    updateCategory,
  } = useWritingDocumentsContext();

  const { draftFilter, showArchivedCategories } = useWritingLibraryFiltersContext();

  const filteredDocuments = useMemo(() => {
    if (!draftFilter) {
      return documents;
    }

    return documents.filter((document) => document.status === "draft");
  }, [documents, draftFilter]);

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.archived === showArchivedCategories),
    [categories, showArchivedCategories],
  );

  const grouped = useMemo(
    () => groupDocumentsByCategory(filteredDocuments, visibleCategories),
    [filteredDocuments, visibleCategories],
  );

  const hasDocuments = filteredDocuments.length > 0;
  const showEmptyState =
    !isLoading &&
    !isLoadingCategories &&
    !hasDocuments &&
    visibleCategories.length === 0 &&
    draftFilter;

  const handleCreateDocument = (collection: DashboardContentCollection) => {
    void createDocument(collection, { categoryId: activeCategoryId });
  };

  const handleArchiveCategory = (category: (typeof categories)[number]) => {
    void archiveCategory(category.id);
  };

  const handleRenameCategory = (category: (typeof categories)[number], title: string) => {
    void updateCategory(category.id, { title });
  };

  const sharedDocumentProps = {
    activeDocument: selectedDocument,
    categories: visibleCategories,
    onDelete: handleDeleteRequest,
    onDuplicate: (document: WritingDocumentListItem) => void duplicateDocument(document),
    onMoveToCategory: (document: WritingDocumentListItem, categoryId: null | number) => {
      void moveDocumentToCategory(document, categoryId);
    },
    onRename: (document: WritingDocumentListItem, title: string) => void renameDocument(document, title),
    onSelect: (document: WritingDocumentListItem) => void handleSelectDocument(document),
  };

  return (
    <aside
      className={`sunny-writing-library${variant === "embedded" ? " is-embedded" : ""}`}
      aria-label="内容库"
    >
      <WritingLibraryHeader onClose={onClose} showClose={Boolean(onClose)} />

      <div className="sunny-writing-document-list" role="list">
        {isLoading || isLoadingCategories ? (
          <p className="sunny-writing-empty">正在整理内容...</p>
        ) : showEmptyState ? (
          <WritingEmptyState
            collection={selectedDocument?.collection ?? "posts"}
            onCreate={handleCreateDocument}
          />
        ) : (
          <>
            {visibleCategories.map((category) => (
              <WritingCategoryGroup
                {...sharedDocumentProps}
                category={category}
                documents={grouped.byCategory.get(category.id) ?? []}
                key={category.id}
                onArchiveCategory={handleArchiveCategory}
                onRenameCategory={handleRenameCategory}
                onSelectCategory={() => setActiveCategoryId(category.id)}
              />
            ))}
            {!showArchivedCategories ? (
              <WritingUncategorizedGroup
                {...sharedDocumentProps}
                documents={grouped.uncategorized}
              />
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
