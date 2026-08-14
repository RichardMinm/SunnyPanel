"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [restoreTarget, setRestoreTarget] = useState<null | WritingDocumentVersion>(null);
  const [restoring, setRestoring] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/dashboard/content/${document.collection}/${document.id}/versions`,
      );
      const body = (await response.json().catch(() => null)) as VersionResponse | null;
      if (!response.ok) throw new Error(body?.message ?? "加载版本历史失败");
      setVersions(body?.versions ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载版本历史失败");
    } finally {
      setLoading(false);
    }
  }, [document.collection, document.id]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- document selection and restore completion refresh persisted version history */
    void loadVersions();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadVersions, refreshKey]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    const restored = await restoreDocumentVersion(document, restoreTarget.id);
    setRestoring(false);
    setRestoreTarget(null);
    if (restored) setRefreshKey((current) => current + 1);
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
                <button onClick={() => setRestoreTarget(version)} type="button">
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
        message="当前内容会先保存为一个可恢复版本，然后再恢复所选历史内容。"
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => void handleRestore()}
        open={restoreTarget !== null}
        title="恢复历史版本？"
        variant="warning"
      />
    </>
  );
}
