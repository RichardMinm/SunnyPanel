"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import type { DashboardContentCollection } from "@/lib/dashboard/content/config";

import { useWritingDocumentsContext } from "./WritingDocumentsContext";
import { useWritingLayoutContext } from "./WritingLayoutContext";
import { WritingEditorPane } from "./WritingEditorPane";
import { WritingMetaPanel } from "./WritingMetaPanel";
import { WritingPreviewPane } from "./WritingPreviewPane";
import type { WritingMetadataDraft } from "./writing-metadata";
import type { WritingSaveStatusSnapshot } from "./writing-types";

type WritingWorkspaceProps = {
  onSaveStatusChange?: (status: WritingSaveStatusSnapshot) => void;
};

export function WritingWorkspace({ onSaveStatusChange }: WritingWorkspaceProps) {
  const {
    createDocument,
    draft,
    error,
    flushSave,
    isDirty,
    publishDocument,
    saveState,
    selectedDocument,
    unpublishDocument,
    updateDraft,
  } = useWritingDocumentsContext();

  const {
    layout,
    setInspectorOpen,
    setInspectorPinned,
    toggleFocusMode,
    togglePreviewMode,
  } = useWritingLayoutContext();

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

  const workspaceClassName = [
    "sunny-writing-layout-root",
    "sunny-writing-workspace",
    inspectorVisible ? "is-inspector-open is-inspector-drawer-open" : "is-inspector-collapsed",
    layout.focusMode ? "is-focus-mode" : "",
    layout.previewMode ? "is-preview-mode" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    onSaveStatusChange?.({ error, isDirty, saveState });
  }, [error, isDirty, onSaveStatusChange, saveState]);

  return (
    <div className={workspaceClassName} data-testid="dashboard-writing-workspace">
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
          onCreateDocument={handleCreateDocument}
          onFlushSave={flushSave}
          onOpenInspector={() => setInspectorOpen(true)}
          onPublish={publishDocument}
          onToggleFocusMode={toggleFocusMode}
          onTogglePreviewMode={togglePreviewMode}
          onUpdateDraft={updateDraft}
          saveState={saveState}
        />
      )}

      {inspectorVisible && !layout.focusMode && !layout.previewMode ? (
        <div
          className="sunny-writing-inspector-drawer"
          onMouseEnter={handlePeekEnter}
          onMouseLeave={handlePeekLeave}
        >
          <WritingMetaPanel
            document={selectedDocument}
            draft={draft}
            isPinned={layout.inspectorPinned}
            onClose={() => setInspectorOpen(false)}
            onPin={handlePinInspector}
            onUnpublish={unpublishDocument}
            onUpdateMetadata={handleUpdateMetadata}
            onUpdateSummary={(summary) => updateDraft({ summary })}
            saveState={saveState}
          />
        </div>
      ) : !layout.focusMode && !layout.previewMode ? (
        <div
          ref={peekZoneRef}
          className="sunny-writing-inspector-peek-zone"
          onMouseEnter={handlePeekEnter}
          onMouseLeave={handlePeekLeave}
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
            <DashboardIcon name="chevronLeft" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
