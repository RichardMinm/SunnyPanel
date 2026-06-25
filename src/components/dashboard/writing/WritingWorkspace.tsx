"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppTooltip } from "@/components/primitives/AppTooltip";
import { DashboardIcon } from "@/components/dashboard/icons";
import type { DashboardContentCollection } from "@/lib/dashboard/content/config";

import { useWritingDocumentsContext } from "./WritingDocumentsContext";
import { useWritingLayoutContext } from "./WritingLayoutContext";
import { WritingEditorPane } from "./WritingEditorPane";
import { WritingMetaPanel } from "./WritingMetaPanel";
import { WritingPreviewPane } from "./WritingPreviewPane";
import { countWritingWords, extractRichText } from "@/lib/dashboard/writing-text-stats";
import type { WritingMetadataDraft } from "./writing-metadata";
import type { WritingSaveStatusSnapshot } from "./writing-types";

type WritingWorkspaceProps = {
  onPrefillComposer?: (prompt: string) => void;
  onSaveStatusChange?: (status: WritingSaveStatusSnapshot) => void;
};

export function WritingWorkspace({
  onPrefillComposer,
  onSaveStatusChange,
}: WritingWorkspaceProps) {
  const {
    createDocument,
    draft,
    error,
    flushSave,
    isDirty,
    isLoadingDocument,
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
    if (!draft && !selectedDocument) {
      onSaveStatusChange?.({ error, isDirty, saveState });
      return;
    }

    let text = draft?.title ?? selectedDocument?.title ?? "";
    if (draft?.contentRich?.content) {
      text += ` ${draft.contentRich.content.map((block) => extractRichText(block)).join(" ")}`;
    }
    const wordCount = countWritingWords(text);
    const readingMinutes = Math.max(1, Math.ceil(wordCount / 400));
    const lastEdited = selectedDocument?.updatedAt
      ? new Intl.DateTimeFormat("zh-CN", {
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          month: "long",
        }).format(new Date(selectedDocument.updatedAt))
      : undefined;

    onSaveStatusChange?.({
      error,
      isDirty,
      lastEdited,
      readingMinutes,
      saveState,
      wordCount,
    });
  }, [draft, error, isDirty, onSaveStatusChange, saveState, selectedDocument]);

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
          isLoadingDocument={isLoadingDocument}
          onCreateDocument={handleCreateDocument}
          onFlushSave={flushSave}
          onOpenInspector={() => setInspectorOpen(true)}
          onPrefillComposer={onPrefillComposer}
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
          <AppTooltip content="打开属性面板">
            <button
              aria-label="打开属性面板"
              className="sunny-writing-panel-toggle is-inspector"
              onClick={() => {
                setInspectorOpen(true);
                setPeekOpen(true);
              }}
              type="button"
            >
              <DashboardIcon name="chevronLeft" />
            </button>
          </AppTooltip>
        </div>
      ) : null}
    </div>
  );
}
