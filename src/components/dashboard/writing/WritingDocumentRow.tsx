"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { dashboardContentLabels } from "@/lib/dashboard/content/config";

import type { WritingDocumentListItem } from "./writing-types";

type WritingDocumentRowProps = {
  active: boolean;
  document: WritingDocumentListItem;
  onDelete: (document: WritingDocumentListItem) => void;
  onDuplicate: (document: WritingDocumentListItem) => void;
  onRename: (document: WritingDocumentListItem, title: string) => void;
  onSelect: (document: WritingDocumentListItem) => void;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));

export function WritingDocumentRow({
  active,
  document,
  onDelete,
  onDuplicate,
  onRename,
  onSelect,
}: WritingDocumentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(document.title);
  const [contextMenu, setContextMenu] = useState<null | { x: number; y: number }>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCopyLink = useCallback(async () => {
    setContextMenu(null);
    const url = `${window.location.origin}/dashboard?content=${document.collection}:${document.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback silently
    }
  }, [document.collection, document.id]);

  const finishRename = () => {
    const nextTitle = renameValue.trim();
    if (nextTitle && nextTitle !== document.title) {
      onRename(document, nextTitle);
    }
    setRenaming(false);
  };

  return (
    <div
      className={`sunny-writing-document-row${active ? " is-active" : ""}`}
      onContextMenu={handleContextMenu}
      onMouseLeave={() => setMenuOpen(false)}
      role="listitem"
    >
      <button className="sunny-writing-document-row-main" onClick={() => onSelect(document)} type="button">
        <div className="sunny-writing-document-row-top">
          <span className="sunny-writing-document-type">{dashboardContentLabels[document.collection]}</span>
          <span className={`sunny-writing-document-status is-${document.status}`}>
            {document.status === "published" ? "已发布" : "草稿"}
          </span>
        </div>
        {renaming ? (
          <input
            autoFocus
            className="sunny-writing-document-rename"
            onBlur={finishRename}
            onChange={(event) => setRenameValue(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                finishRename();
              }
              if (event.key === "Escape") {
                setRenaming(false);
                setRenameValue(document.title);
              }
            }}
            value={renameValue}
          />
        ) : (
          <strong className="sunny-writing-document-title">{document.title || "未命名内容"}</strong>
        )}
        <time dateTime={document.updatedAt}>{formatDate(document.updatedAt)}</time>
      </button>
      <button
        aria-expanded={menuOpen}
        aria-label="更多操作"
        className="sunny-writing-document-menu-toggle"
        onClick={() => setMenuOpen((value) => !value)}
        type="button"
      >
        <DashboardIcon name="moreHorizontal" />
      </button>
      {menuOpen ? (
        <div className="sunny-writing-document-menu" role="menu">
          <button
            onClick={() => {
              setRenaming(true);
              setRenameValue(document.title);
              setMenuOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            重命名
          </button>
          <button
            onClick={() => {
              onDuplicate(document);
              setMenuOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            复制
          </button>
          <button
            className="is-danger"
            onClick={() => {
              onDelete(document);
              setMenuOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            删除
          </button>
        </div>
      ) : null}
      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="sunny-writing-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button onClick={() => { setRenaming(true); setRenameValue(document.title); setContextMenu(null); }} role="menuitem" type="button">重命名</button>
          <button onClick={() => { onDuplicate(document); setContextMenu(null); }} role="menuitem" type="button">复制副本</button>
          <button onClick={handleCopyLink} role="menuitem" type="button">复制链接</button>
          <button className="is-danger" onClick={() => { onDelete(document); setContextMenu(null); }} role="menuitem" type="button">删除</button>
        </div>
      ) : null}
    </div>
  );
}
