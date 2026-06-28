"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
} from "@/components/primitives/AppDropdownMenu";
import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import type { WritingCategoryListItem } from "@/lib/dashboard/writing-categories/normalize";

import { WritingDocumentRow } from "./WritingDocumentRow";
import { sortDocumentsByUpdatedAt } from "./writing-library-groups";
import type { WritingDocumentListItem } from "./writing-types";

type WritingCategoryGroupProps = {
  activeDocument: null | WritingDocumentListItem;
  category: WritingCategoryListItem;
  documents: WritingDocumentListItem[];
  categories: WritingCategoryListItem[];
  onArchiveCategory: (category: WritingCategoryListItem) => void;
  onCreateDocument?: (collection: DashboardContentCollection) => void;
  onDelete: (document: WritingDocumentListItem) => void;
  onDuplicate: (document: WritingDocumentListItem) => void;
  onMoveToCategory: (document: WritingDocumentListItem, categoryId: null | number) => void;
  onRename: (document: WritingDocumentListItem, title: string) => void;
  onRenameCategory: (category: WritingCategoryListItem, title: string) => void;
  onSelect: (document: WritingDocumentListItem) => void;
  onSelectCategory?: () => void;
};

export function WritingCategoryGroup({
  activeDocument,
  category,
  categories,
  documents,
  onArchiveCategory,
  onCreateDocument,
  onDelete,
  onDuplicate,
  onMoveToCategory,
  onRename,
  onRenameCategory,
  onSelect,
  onSelectCategory,
}: WritingCategoryGroupProps) {
  const hasActiveDocument = documents.some(
    (document) =>
      activeDocument?.collection === document.collection && activeDocument.id === document.id,
  );
  const [open, setOpen] = useState(hasActiveDocument || documents.length > 0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- auto-expand the category that contains the active document */
    if (hasActiveDocument) {
      setOpen(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [hasActiveDocument]);

  const sortedDocuments = useMemo(() => sortDocumentsByUpdatedAt(documents), [documents]);

  const handleRename = useCallback(() => {
    const nextTitle = window.prompt("文档集名称", category.title)?.trim();
    if (nextTitle && nextTitle !== category.title) {
      onRenameCategory(category, nextTitle);
    }
  }, [category, onRenameCategory]);

  const handleCreateDocument = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onSelectCategory?.();
      onCreateDocument?.("posts");
    },
    [onCreateDocument, onSelectCategory],
  );

  return (
    <section aria-label={category.title} className="sunny-writing-tree-node">
      <div className="sunny-writing-tree-row-wrap is-folder">
        <button
          aria-expanded={open}
          className="sunny-writing-tree-row is-folder"
          onClick={() => {
            onSelectCategory?.();
            setOpen((current) => !current);
          }}
          type="button"
        >
          <span className="sunny-writing-tree-chevron" data-open={open ? "true" : "false"}>
            <DashboardIcon name="chevronDown" />
          </span>
          <span className="sunny-writing-tree-label">{category.title}</span>
        </button>
        <div className="sunny-writing-tree-row-actions">
          {onCreateDocument ? (
            <button
              aria-label={`在「${category.title}」中新建文档`}
              className="sunny-writing-tree-action"
              onClick={handleCreateDocument}
              type="button"
            >
              <DashboardIcon name="plus" />
            </button>
          ) : null}
          <AppDropdownMenu
            align="end"
            className="sunny-writing-menu"
            onOpenChange={setMenuOpen}
            open={menuOpen}
            side="bottom"
            sideOffset={6}
            trigger={<DashboardIcon name="moreHorizontal" />}
            triggerAriaLabel={`${category.title} 操作`}
            triggerClassName={`sunny-writing-tree-action${menuOpen ? " is-open" : ""}`}
          >
            <AppDropdownMenuItem onSelect={handleRename}>重命名</AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => onArchiveCategory(category)}>归档</AppDropdownMenuItem>
          </AppDropdownMenu>
        </div>
      </div>
      {open ? (
        <div className="sunny-writing-tree-children" role="list">
          {sortedDocuments.length === 0 ? (
            <div className="sunny-writing-tree-empty">
              <span className="sunny-writing-tree-empty-label">暂无文档</span>
              {onCreateDocument ? (
                <button
                  className="sunny-writing-tree-empty-create"
                  onClick={handleCreateDocument}
                  type="button"
                >
                  新建
                </button>
              ) : null}
            </div>
          ) : null}
          {sortedDocuments.map((document) => {
            const active =
              activeDocument?.collection === document.collection && activeDocument.id === document.id;

            return (
              <WritingDocumentRow
                active={active}
                categories={categories}
                document={document}
                key={`${document.collection}:${document.id}`}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onMoveToCategory={onMoveToCategory}
                onRename={onRename}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
