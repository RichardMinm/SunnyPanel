"use client";

import { useCallback } from "react";

import type { DashboardContentCollection } from "@/lib/dashboard/content/config";

import { useWritingDocuments } from "./use-writing-documents";
import { WritingEditorPane } from "./WritingEditorPane";
import { WritingLibrary } from "./WritingLibrary";
import { WritingMetaPanel } from "./WritingMetaPanel";

export function WritingWorkspace() {
  const {
    collectionFilter,
    createDocument,
    documents,
    error,
    isLoading,
    publishDocument,
    saveDocument,
    saveState,
    selectDocument,
    selectedDocument,
    setCollectionFilter,
    unpublishDocument,
  } = useWritingDocuments();

  const handleCreateDocument = useCallback(
    (collection: DashboardContentCollection) => {
      void createDocument(collection);
    },
    [createDocument],
  );

  return (
    <div className="sunny-writing-workspace" data-testid="dashboard-writing-workspace">
      <WritingLibrary
        activeDocument={selectedDocument}
        collectionFilter={collectionFilter}
        documents={documents}
        isLoading={isLoading}
        onCollectionFilterChange={setCollectionFilter}
        onCreateDocument={handleCreateDocument}
        onSelectDocument={(document) => {
          void selectDocument(document);
        }}
      />

      <WritingEditorPane
        document={selectedDocument}
        error={error}
        onSave={saveDocument}
        saveState={saveState}
      />

      <WritingMetaPanel
        document={selectedDocument}
        onPublish={publishDocument}
        onSave={saveDocument}
        onUnpublish={unpublishDocument}
        saveState={saveState}
      />
    </div>
  );
}
