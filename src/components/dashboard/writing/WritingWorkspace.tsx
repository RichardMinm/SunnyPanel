"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";
import type { DashboardContentCollection } from "@/lib/dashboard/content/config";

import { useWritingDocuments } from "./use-writing-documents";
import { useWritingLayoutContext } from "./WritingLayoutContext";
import { WritingEditorPane } from "./WritingEditorPane";
import { WritingLibrary } from "./WritingLibrary";
import { WritingMetaPanel } from "./WritingMetaPanel";
import { WritingPreviewPane } from "./WritingPreviewPane";
import type { WritingMetadataDraft } from "./writing-metadata";
import type { WritingDocumentListItem } from "./writing-types";

export function WritingWorkspace() {
  const {
    collectionFilter,
    createDocument,
    deleteDocument,
    documents,
    draft,
    duplicateDocument,
    error,
    flushSave,
    isDirty,
    isLoading,
    publishDocument,
    renameDocument,
    saveState,
    selectDocument,
    selectedDocument,
    setCollectionFilter,
    unpublishDocument,
    updateDraft,
  } = useWritingDocuments();

  const {
    layout,
    setInspectorOpen,
    setInspectorPinned,
    setLibraryOpen,
    toggleFocusMode,
    togglePreviewMode,
  } = useWritingLayoutContext();

  const [pendingSwitch, setPendingSwitch] = useState<null | WritingDocumentListItem>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | WritingDocumentListItem>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Inspector peek state
  const [peekOpen, setPeekOpen] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const peekZoneRef = useRef<HTMLDivElement | null>(null);

  const handlePeekEnter = useCallback(() => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeekOpen(true);
    setInspectorOpen(true);
  }, [setInspectorOpen]);

  const handlePeekLeave = useCallback(() => {
    if (layout.inspectorPinned) return;
    peekTimer.current = setTimeout(() => {
      setPeekOpen(false);
      setInspectorOpen(false);
    }, 300);
  }, [layout.inspectorPinned, setInspectorOpen]);

  const handlePinInspector = useCallback(() => {
    setInspectorPinned(!layout.inspectorPinned);
  }, [layout.inspectorPinned, setInspectorPinned]);

  // Esc key — exit focus / close peek
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (layout.focusMode) {
          toggleFocusMode();
          return;
        }
        if (peekOpen && !layout.inspectorPinned) {
          setPeekOpen(false);
          setInspectorOpen(false);
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout.focusMode, layout.inspectorPinned, peekOpen, setInspectorOpen, toggleFocusMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        void flushSave();
        return;
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        togglePreviewMode();
        return;
      }
      if (e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flushSave, toggleFocusMode, togglePreviewMode]);

  // beforeunload guard
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleCreateDocument = useCallback(
    (collection: DashboardContentCollection) => {
      void createDocument(collection);
    },
    [createDocument],
  );

  const handleSelectDocument = useCallback(
    async (document: WritingDocumentListItem) => {
      const result = await selectDocument(document);

      if (result.blocked && result.reason === "unsaved") {
        setPendingSwitch(document);
      }
    },
    [selectDocument],
  );

  const handleConfirmSwitch = useCallback(
    async (saveFirst: boolean) => {
      if (!pendingSwitch) {
        return;
      }

      const target = pendingSwitch;
      setPendingSwitch(null);

      if (saveFirst) {
        await flushSave();
      }

      await selectDocument(target, { discardChanges: !saveFirst });
    },
    [flushSave, pendingSwitch, selectDocument],
  );

  const handleDeleteDocument = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleteBusy(true);
    await deleteDocument(deleteTarget);
    setDeleteBusy(false);
    setDeleteTarget(null);
  }, [deleteDocument, deleteTarget]);

  const handleUpdateMetadata = useCallback(
    <Key extends keyof WritingMetadataDraft>(key: Key, value: WritingMetadataDraft[Key]) => {
      if (!draft) {
        return;
      }

      updateDraft({
        metadata: {
          ...draft.metadata,
          [key]: value,
        },
      });
    },
    [draft, updateDraft],
  );

  const inspectorVisible = layout.inspectorOpen || peekOpen;
  const libraryVisible = layout.libraryOpen;

  const workspaceClassName = [
    "sunny-writing-workspace",
    libraryVisible ? "is-library-open" : "is-library-collapsed",
    inspectorVisible ? "is-inspector-open" : "is-inspector-collapsed",
    layout.focusMode ? "is-focus-mode" : "",
    layout.previewMode ? "is-preview-mode" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={workspaceClassName} data-testid="dashboard-writing-workspace">
      {libraryVisible && !layout.focusMode ? (
        <WritingLibrary
          activeDocument={selectedDocument}
          collectionFilter={collectionFilter}
          documents={documents}
          isLoading={isLoading}
          onClose={() => setLibraryOpen(false)}
          onCollectionFilterChange={setCollectionFilter}
          onCreateDocument={handleCreateDocument}
          onDeleteDocument={setDeleteTarget}
          onDuplicateDocument={(document) => void duplicateDocument(document)}
          onRenameDocument={(document, title) => void renameDocument(document, title)}
          onSelectDocument={(document) => void handleSelectDocument(document)}
        />
      ) : !layout.focusMode ? (
        <button
          aria-label="展开内容库"
          className="sunny-writing-panel-toggle is-library"
          onClick={() => setLibraryOpen(true)}
          title="展开内容库"
          type="button"
        >
          库
        </button>
      ) : null}

      {layout.previewMode && selectedDocument && draft ? (
        <WritingPreviewPane
          document={selectedDocument}
          draft={draft}
          onBackToEdit={() => togglePreviewMode()}
        />
      ) : (
        <WritingEditorPane
          document={selectedDocument}
          draft={draft}
          error={error}
          focusMode={layout.focusMode}
          isDirty={isDirty}
          onFlushSave={flushSave}
          onPublish={publishDocument}
          onToggleFocusMode={toggleFocusMode}
          onTogglePreviewMode={togglePreviewMode}
          onUpdateDraft={updateDraft}
          saveState={saveState}
        />
      )}

      {inspectorVisible && !layout.focusMode && !layout.previewMode ? (
        <WritingMetaPanel
          document={selectedDocument}
          draft={draft}
          isPinned={layout.inspectorPinned}
          onClose={() => setInspectorOpen(false)}
          onPin={handlePinInspector}
          onPublish={publishDocument}
          onUnpublish={unpublishDocument}
          onUpdateMetadata={handleUpdateMetadata}
          saveState={saveState}
        />
      ) : !layout.focusMode && !layout.previewMode ? (
        <div
          ref={peekZoneRef}
          className="sunny-writing-inspector-peek-zone"
          onMouseEnter={handlePeekEnter}
        >
          <button
            aria-label="展开属性栏"
            className="sunny-writing-panel-toggle is-inspector"
            onClick={() => {
              setInspectorOpen(true);
              setPeekOpen(true);
            }}
            title="展开属性栏"
            type="button"
          >
            属性
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        busy={false}
        confirmLabel="保存并切换"
        message="当前文档有未保存修改。要保存后再切换吗？"
        onCancel={() => setPendingSwitch(null)}
        onConfirm={() => void handleConfirmSwitch(true)}
        open={pendingSwitch !== null}
        title="未保存的修改"
        variant="warning"
      />

      {pendingSwitch ? (
        <div className="sunny-writing-switch-actions">
          <button onClick={() => void handleConfirmSwitch(false)} type="button">
            放弃修改并切换
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        busy={deleteBusy}
        confirmLabel="删除"
        message={
          deleteTarget
            ? `确定删除「${deleteTarget.title || "未命名内容"}」？此操作不可撤销。`
            : ""
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteDocument()}
        open={deleteTarget !== null}
        title="确认删除"
        variant="danger"
      />
    </div>
  );
}
