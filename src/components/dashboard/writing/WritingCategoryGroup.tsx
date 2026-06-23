"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
} from "@/components/primitives/AppDropdownMenu";
import type { WritingCategoryListItem } from "@/lib/dashboard/writing-categories/normalize";

import { WritingDocumentRow } from "./WritingDocumentRow";
import {
  getWritingCategoryTintVar,
  isWritingCategoryIconName,
} from "./writing-collection-meta";
import { sortDocumentsByUpdatedAt } from "./writing-library-groups";
import type { WritingDocumentListItem } from "./writing-types";

type WritingCategoryGroupProps = {
  activeDocument: null | WritingDocumentListItem;
  category: WritingCategoryListItem;
  documents: WritingDocumentListItem[];
  categories: WritingCategoryListItem[];
  onArchiveCategory: (category: WritingCategoryListItem) => void;
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
    if (hasActiveDocument) {
      setOpen(true);
    }
  }, [hasActiveDocument]);

  const sortedDocuments = useMemo(() => sortDocumentsByUpdatedAt(documents), [documents]);
  const tintVar = getWritingCategoryTintVar(category.tint);

  const handleRename = useCallback(() => {
    const nextTitle = window.prompt("文档集名称", category.title)?.trim();
    if (nextTitle && nextTitle !== category.title) {
      onRenameCategory(category, nextTitle);
    }
  }, [category, onRenameCategory]);

  return (
    <section
      aria-label={category.title}
      className="sunny-writing-category-group"
      data-tint={category.tint}
    >
      <div
        className="sunny-writing-library-group-head-wrap"
        style={{ ["--writing-category-tint" as string]: `var(${tintVar})` }}
      >
        <button
          aria-expanded={open}
          className="sunny-writing-library-group-head"
          onClick={() => {
            onSelectCategory?.();
            setOpen((current) => !current);
          }}
          type="button"
        >
          <span className="sunny-writing-library-group-chevron" data-open={open ? "true" : "false"}>
            <DashboardIcon name="chevronDown" />
          </span>
          <span className="sunny-writing-library-group-icon">
            <DashboardIcon name={isWritingCategoryIconName(category.icon)} />
          </span>
          <span className="sunny-writing-library-group-label">{category.title}</span>
          {sortedDocuments.length > 0 ? (
            <span className="sunny-writing-library-group-count">{sortedDocuments.length}</span>
          ) : null}
        </button>
        <AppDropdownMenu
          align="end"
          className="sunny-writing-menu"
          onOpenChange={setMenuOpen}
          open={menuOpen}
          side="bottom"
          sideOffset={6}
          trigger={<DashboardIcon name="moreHorizontal" />}
          triggerAriaLabel={`${category.title} 操作`}
          triggerClassName={`sunny-writing-category-menu-toggle${menuOpen ? " is-open" : ""}`}
        >
          <AppDropdownMenuItem onSelect={handleRename}>重命名</AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => onArchiveCategory(category)}>归档</AppDropdownMenuItem>
        </AppDropdownMenu>
      </div>
      {open ? (
        <div className="sunny-writing-library-group-list" role="list">
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
