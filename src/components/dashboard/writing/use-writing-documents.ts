"use client";

import { useCallback, useEffect, useState } from "react";

import {
  dashboardContentCollections,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";

import type {
  WritingCollectionFilter,
  WritingDocument,
  WritingDocumentListItem,
  WritingDocumentPatch,
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

export function useWritingDocuments() {
  const [collectionFilter, setCollectionFilter] = useState<WritingCollectionFilter>("all");
  const [documents, setDocuments] = useState<WritingDocumentListItem[]>([]);
  const [error, setError] = useState<null | string>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<WritingSaveState>("idle");
  const [selectedDocument, setSelectedDocument] = useState<null | WritingDocument>(null);

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
      setDocuments(data.documents ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载内容失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDocument = useCallback(async (collection: DashboardContentCollection, id: number) => {
    setError(null);

    try {
      const data = await readDashboardJson<DocumentResponse>(
        await fetch(`/api/dashboard/content/${collection}/${id}`),
      );

      const nextDocument = data.document;
      if (!nextDocument) {
        throw new Error("内容不存在");
      }

      setSelectedDocument(nextDocument);
      setDocuments((current) => upsertListItem(current, nextDocument));
      setSaveState("idle");

      return nextDocument;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "打开内容失败");
      setSaveState("error");
      return null;
    }
  }, []);

  const selectDocument = useCallback(
    async (document: WritingDocumentListItem) => {
      await loadDocument(document.collection, document.id);
    },
    [loadDocument],
  );

  const createDocument = useCallback(async (collection: DashboardContentCollection, title?: string) => {
    setError(null);
    setSaveState("saving");

    try {
      const data = await readDashboardJson<DocumentResponse>(
        await fetch("/api/dashboard/content", {
          body: JSON.stringify({ collection, title }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
      );

      const nextDocument = data.document;
      if (!nextDocument) {
        throw new Error("创建内容失败");
      }

      setSelectedDocument(nextDocument);
      setDocuments((current) => upsertListItem(current, nextDocument));
      setSaveState("saved");

      return nextDocument;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "创建内容失败");
      setSaveState("error");
      return null;
    }
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

        setSelectedDocument(nextDocument);
        setDocuments((current) => upsertListItem(current, nextDocument));
        setSaveState("saved");

        return nextDocument;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "保存内容失败");
        setSaveState("error");
        return null;
      }
    },
    [],
  );

  const setPublicationState = useCallback(
    async (document: WritingDocument, action: "publish" | "unpublish") => {
      setError(null);
      setSaveState("saving");

      try {
        const data = await readDashboardJson<DocumentResponse>(
          await fetch(`/api/dashboard/content/${document.collection}/${document.id}/${action}`, {
            method: "POST",
          }),
        );

        const nextDocument = data.document;
        if (!nextDocument) {
          throw new Error(action === "publish" ? "发布失败" : "取消发布失败");
        }

        setSelectedDocument(nextDocument);
        setDocuments((current) => upsertListItem(current, nextDocument));
        setSaveState("saved");

        return nextDocument;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "发布状态更新失败");
        setSaveState("error");
        return null;
      }
    },
    [],
  );

  const publishDocument = useCallback(
    (document: WritingDocument) => setPublicationState(document, "publish"),
    [setPublicationState],
  );

  const unpublishDocument = useCallback(
    (document: WritingDocument) => setPublicationState(document, "unpublish"),
    [setPublicationState],
  );

  useEffect(() => {
    void loadDocuments(collectionFilter);
  }, [collectionFilter, loadDocuments]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const collection = parseCollection(params.get("collection"));
    const rawId = Number(params.get("id"));

    if (collection) {
      setCollectionFilter(collection);
    }

    if (collection && Number.isFinite(rawId) && rawId > 0) {
      void loadDocument(collection, rawId);
    }
  }, [loadDocument]);

  return {
    collectionFilter,
    createDocument,
    documents,
    error,
    isLoading,
    loadDocuments,
    publishDocument,
    saveDocument,
    saveState,
    selectDocument,
    selectedDocument,
    setCollectionFilter,
    unpublishDocument,
  };
}
