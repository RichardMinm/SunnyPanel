"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { deriveRichContentFields } from "@/lib/rich-content/derive";

import type { WritingDocument, WritingDocumentListItem, WritingDraft } from "./writing-types";

export function WritingKnowledgePanel({
  document: currentDocument,
  draft,
}: {
  document: WritingDocument;
  draft: WritingDraft;
}) {
  const [backlinks, setBacklinks] = useState<WritingDocumentListItem[]>([]);
  const [backlinksLoading, setBacklinksLoading] = useState(true);
  const outline = useMemo(
    () => deriveRichContentFields(draft.contentRich).contentOutline,
    [draft.contentRich],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- document selection starts a new asynchronous backlink lookup */
    setBacklinksLoading(true);
    void fetch(`/api/dashboard/content/${currentDocument.collection}/${currentDocument.id}/backlinks`)
      .then((response) => response.json())
      .then((body: { backlinks?: WritingDocumentListItem[] }) => setBacklinks(body.backlinks ?? []))
      .finally(() => setBacklinksLoading(false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [currentDocument.collection, currentDocument.id, currentDocument.updatedAt]);

  const scrollToHeading = (id: string, order: number) => {
    const selector = `[data-id="${CSS.escape(id)}"]`;
    const canvas = window.document.querySelector<HTMLElement>(".sunny-writing-editor-canvas");
    const target = canvas?.querySelector<HTMLElement>(selector) ??
      canvas?.querySelectorAll<HTMLElement>(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3")[order];
    target?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <div className="sunny-writing-knowledge-panel">
      <div>
        <h4>本文目录</h4>
        {outline.length ? (
          <ol className="sunny-writing-outline-list">
            {outline.map((item) => (
              <li data-level={item.level} key={`${item.id}:${item.order}`}>
                <button onClick={() => scrollToHeading(item.id, item.order)} type="button">{item.text}</button>
              </li>
            ))}
          </ol>
        ) : (
          <p>添加标题后会自动生成目录。</p>
        )}
      </div>

      <div>
        <h4>引用本文</h4>
        {backlinksLoading ? <p>正在检查引用…</p> : null}
        {!backlinksLoading && backlinks.length === 0 ? <p>还没有其他文档引用本文。</p> : null}
        {backlinks.length ? (
          <ul className="sunny-writing-backlink-list">
            {backlinks.map((backlink) => (
              <li key={`${backlink.collection}:${backlink.id}`}>
                <Link href={backlink.editHref}>{backlink.title}</Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
