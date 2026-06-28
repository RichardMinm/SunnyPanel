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
  libraryOpen?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
  variant?: "column" | "embedded";
};

export function WritingLibrary({
  libraryOpen = true,
  onClose,
  onToggle,
  variant = "column",
}: WritingLibraryProps) {
  const {
    activeCategoryId,
    archiveCategory,
    categories,
    createDocument,
    documents,
    duplicateDocument,
    error,
    handleDeleteRequest,
    handleSelectDocument,
    isLoading,
    isLoadingCategories,
    loadDocuments,
    moveDocumentToCategory,
    renameDocument,
    selectedDocument,
    setActiveCategoryId,
    updateCategory,
  } = useWritingDocumentsContext();

  const { draftFilter, setCreateCategoryOpen, showArchivedCategories } = useWritingLibraryFiltersContext();

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
  const showGlobalEmptyState =
    !isLoading &&
    !isLoadingCategories &&
    !hasDocuments &&
    visibleCategories.length === 0 &&
    !showArchivedCategories;
  const showDraftEmptyState =
    !isLoading &&
    !isLoadingCategories &&
    !hasDocuments &&
    draftFilter &&
    !showGlobalEmptyState;

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
      aria-label="文档集"
    >
      <WritingLibraryHeader
        libraryOpen={libraryOpen}
        onClose={onClose}
        onToggle={onToggle}
        showClose={Boolean(onClose)}
      />

      <div className="sunny-writing-document-list" role="list">
        {error && !isLoading ? (
          <div className="sunny-writing-library-error">
            <p className="sunny-writing-inline-error">{error}</p>
            <button onClick={() => void loadDocuments()} type="button">
              重试
            </button>
          </div>
        ) : isLoading || isLoadingCategories ? (
          <p className="sunny-writing-empty">正在整理内容...</p>
        ) : showGlobalEmptyState ? (
          <WritingEmptyState onCreateCategory={() => setCreateCategoryOpen(true)} variant="library" />
        ) : showDraftEmptyState ? (
          <WritingEmptyState
            collection={selectedDocument?.collection ?? "posts"}
            onCreate={handleCreateDocument}
            variant="draft-filter"
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
                onCreateDocument={handleCreateDocument}
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
