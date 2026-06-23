"use client";

import { useCallback, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AppContextMenu } from "@/components/primitives/AppContextMenu";
import { AppDropdownMenu } from "@/components/primitives/AppDropdownMenu";
import { getDashboardEditHref } from "@/lib/dashboard/content/config";
import type { WritingCategoryListItem } from "@/lib/dashboard/writing-categories/normalize";

import {
  renderWritingDocumentContextItems,
  renderWritingDocumentDropdownItems,
} from "./WritingDocumentActions";
import { getWritingCollectionMeta } from "./writing-collection-meta";
import type { WritingDocumentListItem } from "./writing-types";

type WritingDocumentRowProps = {
  active: boolean;
  categories?: WritingCategoryListItem[];
  document: WritingDocumentListItem;
  onDelete: (document: WritingDocumentListItem) => void;
  onDuplicate: (document: WritingDocumentListItem) => void;
  onMoveToCategory?: (document: WritingDocumentListItem, categoryId: null | number) => void;
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
  categories,
  document,
  onDelete,
  onDuplicate,
  onMoveToCategory,
  onRename,
  onSelect,
}: WritingDocumentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(document.title);
  const updatedLabel = formatDate(document.updatedAt);
  const collectionMeta = getWritingCollectionMeta(document.collection);

  const startRename = useCallback(() => {
    setRenaming(true);
    setRenameValue(document.title);
  }, [document.title]);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}${getDashboardEditHref(document.collection, document.id)}`;
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

  const actionHandlers = {
    categories,
    document,
    onCopyLink: handleCopyLink,
    onDelete,
    onDuplicate,
    onMoveToCategory,
    onRename: startRename,
  };

  const rowContent = (
    <>
      <button
        className="sunny-writing-document-row-main"
        onClick={() => onSelect(document)}
        title={`${document.title || "未命名内容"} · ${updatedLabel}`}
        type="button"
      >
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
          <>
            <span className="sunny-writing-document-title">{document.title || "未命名内容"}</span>
            <span
              aria-hidden="true"
              className="sunny-writing-document-type-icon"
              data-collection={document.collection}
              style={{
                ["--writing-collection-tint" as string]: `var(${collectionMeta.tintVar})`,
              }}
            >
              <DashboardIcon name={collectionMeta.icon} />
            </span>
            <time className="sunny-writing-document-time" dateTime={document.updatedAt}>
              {updatedLabel}
            </time>
          </>
        )}
      </button>
      <AppDropdownMenu
        align="end"
        className="sunny-writing-menu"
        collisionPadding={16}
        onOpenChange={setMenuOpen}
        open={menuOpen}
        side="bottom"
        sideOffset={6}
        trigger={<DashboardIcon name="moreHorizontal" />}
        triggerAriaLabel="更多操作"
        triggerClassName={`sunny-writing-document-menu-toggle${menuOpen ? " is-open" : ""}`}
      >
        {renderWritingDocumentDropdownItems({ ...actionHandlers, onClose: () => setMenuOpen(false) })}
      </AppDropdownMenu>
    </>
  );

  return (
    <AppContextMenu
      contentClassName="sunny-writing-menu"
      trigger={
        <div
          className={`sunny-writing-document-row${active ? " is-active" : ""}`}
          role="listitem"
        >
          {rowContent}
        </div>
      }
    >
      {renderWritingDocumentContextItems(actionHandlers)}
    </AppContextMenu>
  );
}
