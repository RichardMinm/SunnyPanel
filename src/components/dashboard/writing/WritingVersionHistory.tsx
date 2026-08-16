"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";

import { useWritingDocumentsContext } from "./WritingDocumentsContext";
import type { WritingDocument, WritingDocumentVersion } from "./writing-types";

type VersionResponse = {
  message?: string;
  versions?: WritingDocumentVersion[];
};

const formatVersionTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));

const statusLabels: Record<WritingDocumentVersion["status"], string> = {
  archived: "已归档",
  draft: "草稿",
  published: "已发布",
};

export function WritingVersionHistory({ document }: { document: WritingDocument }) {
  const { restoreDocumentVersion } = useWritingDocumentsContext();
  const [versions, setVersions] = useState<WritingDocumentVersion[]>([]);
  const [error, setError] = useState<null | string>(null);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState<null | string>(null);
  const [restoreTarget, setRestoreTarget] = useState<null | WritingDocumentVersion>(null);
  const [restoring, setRestoring] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadGenerationRef = useRef(0);

  const loadVersions = useCallback(async () => {
    const loadGeneration = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/dashboard/content/${document.collection}/${document.id}/versions`,
      );
      const body = (await response.json().catch(() => null)) as VersionResponse | null;
      if (!response.ok) throw new Error(body?.message ?? "加载版本历史失败");
      if (loadGeneration !== loadGenerationRef.current) return;
      setVersions(body?.versions ?? []);
    } catch (nextError) {
      if (loadGeneration !== loadGenerationRef.current) return;
      setError(nextError instanceof Error ? nextError.message : "加载版本历史失败");
    } finally {
      if (loadGeneration === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [document.collection, document.id]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- document selection and restore completion refresh persisted version history */
    setRestoreTarget(null);
    setRestoreError(null);
    void loadVersions();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [loadVersions, refreshKey]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    setRestoreError(null);
    const result = await restoreDocumentVersion(document, restoreTarget.id);
    setRestoring(false);
    if (result.status === "failed") {
      setRestoreError(result.message);
      return;
    }

    setRestoreTarget(null);
    setRefreshKey((current) => current + 1);
  };

  if (loading) {
    return <p className="sunny-writing-version-empty">正在读取历史版本…</p>;
  }

  if (error) {
    return (
      <div className="sunny-writing-version-empty">
        <p>{error}</p>
        <button onClick={() => void loadVersions()} type="button">重试</button>
      </div>
    );
  }

  return (
    <>
      {versions.length ? (
        <ol className="sunny-writing-version-list">
          {versions.map((version, index) => (
            <li className="sunny-writing-version-item" key={version.id}>
              <div className="sunny-writing-version-item-head">
                <strong>{index === 0 ? "当前版本" : formatVersionTime(version.createdAt)}</strong>
                <span>{statusLabels[version.status]}</span>
              </div>
              <p>{version.title}</p>
              {version.excerpt ? <small>{version.excerpt}</small> : null}
              {index > 0 ? (
                <button
                  onClick={() => {
                    setRestoreError(null);
                    setRestoreTarget(version);
                  }}
                  type="button"
                >
                  恢复此版本
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="sunny-writing-version-empty">保存内容后，历史版本会显示在这里。</p>
      )}

      <ConfirmDialog
        busy={restoring}
        confirmLabel="恢复"
        message={restoreError ?? "当前内容会先保存为一个可恢复版本，然后再恢复所选历史内容。"}
        onCancel={() => {
          setRestoreError(null);
          setRestoreTarget(null);
        }}
        onConfirm={() => void handleRestore()}
        open={restoreTarget !== null}
        title="恢复历史版本？"
        variant="warning"
      />
    </>
  );
}
