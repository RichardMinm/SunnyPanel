"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  dashboardContentCollections,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";
import {
  buildMetadataDraft,
  canEditTitle,
  getTitleValue,
  parseTags,
} from "./writing-metadata";
import type {
  WritingCollectionFilter,
  WritingDocument,
  WritingDocumentListItem,
  WritingDocumentPatch,
  WritingDraft,
  WritingSaveState,
} from "./writing-types";

type DocumentListResponse = {
  documents?: WritingDocumentListItem[];
  message?: string;
};

type DocumentResponse = {
  document?: WritingDocument;
  message?: string;
};

const AUTOSAVE_MS = 1500;

const parseCollection = (value: null | string): DashboardContentCollection | null =>
  dashboardContentCollections.includes(value as DashboardContentCollection)
    ? (value as DashboardContentCollection)
    : null;

const getDocumentKey = (document: Pick<WritingDocumentListItem, "collection" | "id">) =>
  `${document.collection}:${document.id}`;

const readDashboardJson = async <T extends { message?: string }>(response: Response): Promise<T> => {
  const body = (await response.json().catch(() => null)) as null | T;

  if (!response.ok) {
    throw new Error(body?.message ?? "请求失败");
  }

  if (!body) {
    throw new Error("响应为空");
  }

  return body;
};

const upsertListItem = (
  documents: WritingDocumentListItem[],
  nextDocument: WritingDocumentListItem,
) => {
  const nextKey = getDocumentKey(nextDocument);
  const withoutCurrent = documents.filter((document) => getDocumentKey(document) !== nextKey);

  return [nextDocument, ...withoutCurrent].sort(
    (first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime(),
  );
};

const buildDraftFromDocument = (document: WritingDocument): WritingDraft => ({
  contentRich: document.contentRich,
  metadata: buildMetadataDraft(document),
  summary: typeof document.metadata.summary === "string" ? document.metadata.summary : "",
  title: getTitleValue(document),
});

const draftToPatch = (document: WritingDocument, draft: WritingDraft): WritingDocumentPatch => {
  const patch: WritingDocumentPatch = {
    contentRich: draft.contentRich,
    visibility: draft.metadata.visibility,
  };

  if (canEditTitle(document)) {
    patch.title = draft.title.trim() || document.title;
  }

  if (document.collection === "posts") {
    patch.slug = draft.metadata.slug.trim();
    patch.summary = (draft.summary || draft.metadata.summary).trim();
    patch.tags = parseTags(draft.metadata.tags);
  }

  if (document.collection === "pages") {
    patch.slug = draft.metadata.slug.trim();
    patch.summary = (draft.summary || draft.metadata.summary).trim();
  }

  if (document.collection === "notes") {
    patch.category = draft.metadata.category.trim() || "note";
    patch.mood = draft.metadata.mood.trim();
    patch.pinned = draft.metadata.pinned;
  }

  if (document.collection === "updates") {
    patch.type = draft.metadata.type;
    patch.link = draft.metadata.link.trim();
  }

  return patch;
};

export function useWritingDocuments() {
  const [collectionFilter, setCollectionFilter] = useState<WritingCollectionFilter>("all");
  const [documents, setDocuments] = useState<WritingDocumentListItem[]>([]);
  const [draft, setDraft] = useState<WritingDraft | null>(null);
  const [error, setError] = useState<null | string>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [saveState, setSaveState] = useState<WritingSaveState>("idle");
  const [selectedDocument, setSelectedDocument] = useState<null | WritingDocument>(null);

  const selectedDocumentRef = useRef<null | WritingDocument>(null);
  const draftRef = useRef<WritingDraft | null>(null);
  const isDirtyRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentSelectionGenerationRef = useRef(0);

  useEffect(() => {
    selectedDocumentRef.current = selectedDocument;
  }, [selectedDocument]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const loadDocuments = useCallback(async (filter: WritingCollectionFilter = "all") => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("collection", filter);
      }

      const endpoint = `/api/dashboard/content${params.size ? `?${params.toString()}` : ""}`;
      const data = await readDashboardJson<DocumentListResponse>(await fetch(endpoint));
      const loadedDocs = data.documents ?? [];
      setDocuments(loadedDocs);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载内容失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applySavedDocument = useCallback((nextDocument: WritingDocument) => {
    setSelectedDocument(nextDocument);
    setDocuments((current) => upsertListItem(current, nextDocument));
    setDraft(buildDraftFromDocument(nextDocument));
    setIsDirty(false);
    setSaveState("saved");
  }, []);

  const saveDocument = useCallback(
    async (document: WritingDocument, patch: WritingDocumentPatch) => {
      setError(null);
      setSaveState("saving");

      try {
        const data = await readDashboardJson<DocumentResponse>(
          await fetch(`/api/dashboard/content/${document.collection}/${document.id}`, {
            body: JSON.stringify({
              ...patch,
              lastKnownUpdatedAt: document.updatedAt,
            }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }),
        );

        const nextDocument = data.document;
        if (!nextDocument) {
          throw new Error("保存内容失败");
        }

        applySavedDocument(nextDocument);
        return nextDocument;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "保存内容失败");
        setSaveState("error");
        return null;
      }
    },
    [applySavedDocument],
  );

  const flushSave = useCallback(async () => {
    const document = selectedDocumentRef.current;
    const currentDraft = draftRef.current;

    if (!document || !currentDraft || !isDirtyRef.current) {
      return document;
    }

    return saveDocument(document, draftToPatch(document, currentDraft));
  }, [saveDocument]);

  const scheduleAutosave = useCallback(() => {
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, AUTOSAVE_MS);
  }, [clearAutosaveTimer, flushSave]);

  const updateDraft = useCallback(
    (patch: Partial<WritingDraft> | ((current: WritingDraft) => WritingDraft)) => {
      setDraft((current) => {
        if (!current) {
          return current;
        }

        if (typeof patch === "function") {
          return patch(current);
        }

        return {
          ...current,
          ...patch,
          metadata: patch.metadata ? { ...current.metadata, ...patch.metadata } : current.metadata,
        };
      });
      setIsDirty(true);
      setSaveState("dirty");
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const loadDocument = useCallback(
    async (collection: DashboardContentCollection, id: number) => {
      const selectionGeneration = ++documentSelectionGenerationRef.current;
      clearAutosaveTimer();
      setError(null);
      setIsLoadingDocument(true);

      try {
        const data = await readDashboardJson<DocumentResponse>(
          await fetch(`/api/dashboard/content/${collection}/${id}`),
        );

        const nextDocument = data.document;
        if (!nextDocument) {
          throw new Error("内容不存在");
        }

        if (selectionGeneration !== documentSelectionGenerationRef.current) {
          return null;
        }

        setSelectedDocument(nextDocument);
        setDocuments((current) => upsertListItem(current, nextDocument));
        setDraft(buildDraftFromDocument(nextDocument));
        setIsDirty(false);
        setSaveState("idle");

        return nextDocument;
      } catch (nextError) {
        if (selectionGeneration !== documentSelectionGenerationRef.current) {
          return null;
        }
        setError(nextError instanceof Error ? nextError.message : "打开内容失败");
        setSaveState("error");
        return null;
      } finally {
        if (selectionGeneration === documentSelectionGenerationRef.current) {
          setIsLoadingDocument(false);
        }
      }
    },
    [clearAutosaveTimer],
  );

  const selectDocument = useCallback(
    async (document: WritingDocumentListItem, options?: { discardChanges?: boolean; saveFirst?: boolean }) => {
      if (isDirtyRef.current && !options?.discardChanges) {
        if (options?.saveFirst) {
          const saved = await flushSave();
          if (!saved) {
            return { blocked: true as const, reason: "save_failed" as const };
          }
        } else {
          return { blocked: true as const, reason: "unsaved" as const };
        }
      }

      await loadDocument(document.collection, document.id);
      return { blocked: false as const };
    },
    [flushSave, loadDocument],
  );

  const createDocument = useCallback(
    async (
      collection: DashboardContentCollection,
      options?: { categoryId?: null | number; title?: string },
    ) => {
      const selectionGeneration = ++documentSelectionGenerationRef.current;
      clearAutosaveTimer();
      setError(null);
      setSaveState("saving");

      try {
        const data = await readDashboardJson<DocumentResponse>(
          await fetch("/api/dashboard/content", {
            body: JSON.stringify({
              collection,
              title: options?.title,
              writingCategoryId: options?.categoryId ?? undefined,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }),
        );

        const nextDocument = data.document;
        if (!nextDocument) {
          throw new Error("创建内容失败");
        }

        if (selectionGeneration === documentSelectionGenerationRef.current) {
          applySavedDocument(nextDocument);
        }
        return nextDocument;
      } catch (nextError) {
        if (selectionGeneration !== documentSelectionGenerationRef.current) {
          return null;
        }
        setError(nextError instanceof Error ? nextError.message : "创建内容失败");
        setSaveState("error");
        return null;
      }
    },
    [applySavedDocument, clearAutosaveTimer],
  );

  const deleteDocument = useCallback(
    async (document: WritingDocumentListItem) => {
      setError(null);

      try {
        await readDashboardJson<{ message?: string }>(
          await fetch(`/api/dashboard/content/${document.collection}/${document.id}`, {
            method: "DELETE",
          }),
        );

        setDocuments((current) =>
          current.filter((item) => getDocumentKey(item) !== getDocumentKey(document)),
        );

        if (
          selectedDocumentRef.current &&
          getDocumentKey(selectedDocumentRef.current) === getDocumentKey(document)
        ) {
          clearAutosaveTimer();
          setSelectedDocument(null);
          setDraft(null);
          setIsDirty(false);
          setSaveState("idle");
        }

        return true;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "删除内容失败");
        return false;
      }
    },
    [clearAutosaveTimer],
  );

  const duplicateDocument = useCallback(
    async (document: WritingDocumentListItem) => {
      const full = await loadDocument(document.collection, document.id);
      if (!full) {
        return null;
      }

      const sourceDraft = draftRef.current ?? buildDraftFromDocument(full);
      const created = await createDocument(document.collection, {
        title: `${full.title} 副本`,
        categoryId: document.categoryId,
      });

      if (!created) {
        return null;
      }

      return saveDocument(created, {
        ...draftToPatch(created, {
          ...sourceDraft,
          title: `${full.title} 副本`,
        }),
      });
    },
    [createDocument, loadDocument, saveDocument],
  );

  const renameDocument = useCallback(
    async (document: WritingDocumentListItem, title: string) => {
      const full = selectedDocumentRef.current;
      const currentDraft = draftRef.current;

      if (
        full &&
        getDocumentKey(full) === getDocumentKey(document) &&
        currentDraft &&
        canEditTitle(full)
      ) {
        updateDraft({ title });
        return true;
      }

      const loaded = await loadDocument(document.collection, document.id);
      if (!loaded || !canEditTitle(loaded)) {
        return false;
      }

      const saved = await saveDocument(loaded, { title: title.trim() || loaded.title });
      return Boolean(saved);
    },
    [loadDocument, saveDocument, updateDraft],
  );

  const setPublicationState = useCallback(
    async (
      document: WritingDocument,
      action: "publish" | "unpublish",
      options?: { visibility?: "private" | "public" },
    ) => {
      if (isDirtyRef.current) {
        const saved = await flushSave();
        if (!saved) {
          return null;
        }
      }

      setError(null);
      setSaveState("saving");

      try {
        const data = await readDashboardJson<DocumentResponse>(
          await fetch(`/api/dashboard/content/${document.collection}/${document.id}/${action}`, {
            body:
              action === "publish" && options?.visibility
                ? JSON.stringify({ visibility: options.visibility })
                : undefined,
            headers:
              action === "publish" && options?.visibility
                ? { "Content-Type": "application/json" }
                : undefined,
            method: "POST",
          }),
        );

        const nextDocument = data.document;
        if (!nextDocument) {
          throw new Error(action === "publish" ? "发布失败" : "取消发布失败");
        }

        applySavedDocument(nextDocument);
        return nextDocument;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "发布状态更新失败");
        setSaveState("error");
        return null;
      }
    },
    [applySavedDocument, flushSave],
  );

  const publishDocument = useCallback(
    (document: WritingDocument, options?: { visibility?: "private" | "public" }) =>
      setPublicationState(document, "publish", options),
    [setPublicationState],
  );

  const unpublishDocument = useCallback(
    (document: WritingDocument) => setPublicationState(document, "unpublish"),
    [setPublicationState],
  );

  const moveDocumentToCategory = useCallback(
    async (document: WritingDocumentListItem, categoryId: null | number) => {
      setError(null);

      try {
        const data = await readDashboardJson<DocumentResponse>(
          await fetch(`/api/dashboard/content/${document.collection}/${document.id}`, {
            body: JSON.stringify({
              lastKnownUpdatedAt: document.updatedAt,
              writingCategory: categoryId,
            }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }),
        );

        const nextDocument = data.document;
        if (!nextDocument) {
          throw new Error("移动文档失败");
        }

        setDocuments((current) => upsertListItem(current, nextDocument));

        if (
          selectedDocumentRef.current &&
          getDocumentKey(selectedDocumentRef.current) === getDocumentKey(document)
        ) {
          setSelectedDocument(nextDocument);
        }

        return nextDocument;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "移动文档失败");
        return null;
      }
    },
    [],
  );

  const restoreDocumentVersion = useCallback(
    async (document: WritingDocument, versionId: string) => {
      clearAutosaveTimer();

      if (isDirtyRef.current) {
        const saved = await flushSave();
        if (!saved) return null;
      }

      setError(null);
      setSaveState("saving");

      try {
        const data = await readDashboardJson<DocumentResponse>(
          await fetch(
            `/api/dashboard/content/${document.collection}/${document.id}/versions`,
            {
              body: JSON.stringify({ versionId }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            },
          ),
        );

        const restored = data.document;
        if (!restored) throw new Error("恢复版本失败");
        applySavedDocument(restored);
        return restored;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "恢复版本失败");
        setSaveState("error");
        return null;
      }
    },
    [applySavedDocument, clearAutosaveTimer, flushSave],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch Dashboard content whenever the selected collection filter changes */
    void loadDocuments(collectionFilter);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [collectionFilter, loadDocuments]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- initialize the writing workspace from URL search params */
    const params = new URLSearchParams(window.location.search);
    const collection = parseCollection(params.get("collection"));
    const rawId = Number(params.get("id"));

    if (collection) {
      setCollectionFilter(collection);
    }

    if (collection && Number.isFinite(rawId) && rawId > 0) {
      void loadDocument(collection, rawId);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadDocument]);

  useEffect(() => {
    if (documents.length === 0 || selectedDocumentRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const collection = parseCollection(params.get("collection"));
    const rawId = Number(params.get("id"));

    if (collection && Number.isFinite(rawId) && rawId > 0) {
      return;
    }

    const firstDocument = documents[0];
    /* eslint-disable react-hooks/set-state-in-effect -- select the first available document after the list hydrates */
    void loadDocument(firstDocument.collection, firstDocument.id);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [documents, loadDocument]);

  useEffect(() => () => clearAutosaveTimer(), [clearAutosaveTimer]);

  return {
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
    isLoadingDocument,
    loadDocuments,
    moveDocumentToCategory,
    publishDocument,
    renameDocument,
    restoreDocumentVersion,
    saveDocument,
    saveState,
    selectDocument,
    selectedDocument,
    setCollectionFilter,
    unpublishDocument,
    updateDraft,
  };
}
