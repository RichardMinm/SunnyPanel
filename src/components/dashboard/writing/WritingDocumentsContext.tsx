"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";

import { useWritingCategories } from "./use-writing-categories";
import { useWritingDocuments } from "./use-writing-documents";
import type { WritingDocumentListItem } from "./writing-types";

type WritingDocumentsContextValue = ReturnType<typeof useWritingDocuments> &
  ReturnType<typeof useWritingCategories> & {
    handleDeleteRequest: (document: WritingDocumentListItem) => void;
    handleSelectDocument: (document: WritingDocumentListItem) => Promise<void>;
  };

const WritingDocumentsContext = createContext<WritingDocumentsContextValue | null>(null);

export function WritingDocumentsProvider({ children }: { children: ReactNode }) {
  const documentsState = useWritingDocuments();
  const categoriesState = useWritingCategories();
  const {
    deleteDocument,
    flushSave,
    selectDocument,
  } = documentsState;

  const [pendingSwitch, setPendingSwitch] = useState<null | WritingDocumentListItem>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | WritingDocumentListItem>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  const handleDeleteRequest = useCallback((document: WritingDocumentListItem) => {
    setDeleteTarget(document);
  }, []);

  const handleDeleteDocument = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleteBusy(true);
    await deleteDocument(deleteTarget);
    setDeleteBusy(false);
    setDeleteTarget(null);
  }, [deleteDocument, deleteTarget]);

  const value: WritingDocumentsContextValue = {
    ...documentsState,
    ...categoriesState,
    handleDeleteRequest,
    handleSelectDocument,
  };

  return (
    <WritingDocumentsContext.Provider value={value}>
      {children}

      <ConfirmDialog
        busy={false}
        cancelLabel="放弃修改并切换"
        confirmLabel="保存并切换"
        message="当前文档有未保存修改。要保存后再切换吗？"
        onCancel={() => void handleConfirmSwitch(false)}
        onConfirm={() => void handleConfirmSwitch(true)}
        open={pendingSwitch !== null}
        title="未保存的修改"
        variant="warning"
      />

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
    </WritingDocumentsContext.Provider>
  );
}

export function useWritingDocumentsContext() {
  const context = useContext(WritingDocumentsContext);

  if (!context) {
    throw new Error("useWritingDocumentsContext must be used within WritingDocumentsProvider");
  }

  return context;
}
