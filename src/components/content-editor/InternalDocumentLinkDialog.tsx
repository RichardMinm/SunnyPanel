"use client";

import { useEffect, useMemo, useState } from "react";

import { AppDialog, AppDialogBody } from "@/components/primitives/AppDialog";
import type { WritingDocumentListItem } from "@/components/dashboard/writing/writing-types";

type InternalDocumentLinkDialogProps = {
  onCancel: () => void;
  onSelect: (document: WritingDocumentListItem) => void;
  open: boolean;
};

export function InternalDocumentLinkDialog({ onCancel, onSelect, open }: InternalDocumentLinkDialogProps) {
  const [documents, setDocuments] = useState<WritingDocumentListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- opening the picker starts a new asynchronous document load */
    setLoading(true);
    void fetch("/api/dashboard/content?limit=80")
      .then((response) => response.json())
      .then((body: { documents?: WritingDocumentListItem[] }) => setDocuments(body.documents ?? []))
      .finally(() => setLoading(false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return documents;
    return documents.filter((document) =>
      `${document.title} ${document.excerpt}`.toLocaleLowerCase("zh-CN").includes(normalized),
    );
  }, [documents, query]);

  return (
    <AppDialog onCancel={onCancel} open={open} title="链接到文档">
      <AppDialogBody className="sunny-writing-internal-link-dialog">
        <input
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题或内容"
          value={query}
        />
        <div className="sunny-writing-internal-link-results">
          {loading ? <p>正在读取文档…</p> : null}
          {!loading && filtered.length === 0 ? <p>没有找到匹配文档</p> : null}
          {filtered.map((document) => (
            <button key={`${document.collection}:${document.id}`} onClick={() => onSelect(document)} type="button">
              <strong>{document.title}</strong>
              <span>{document.excerpt || "暂无摘要"}</span>
            </button>
          ))}
        </div>
      </AppDialogBody>
    </AppDialog>
  );
}
