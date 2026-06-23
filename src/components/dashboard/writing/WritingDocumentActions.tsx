"use client";

import { AppContextMenuItem } from "@/components/primitives/AppContextMenu";
import {
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
} from "@/components/primitives/AppDropdownMenu";
import type { WritingCategoryListItem } from "@/lib/dashboard/writing-categories/normalize";

import type { WritingDocumentListItem } from "./writing-types";

type WritingDocumentActionHandlers = {
  categories?: WritingCategoryListItem[];
  document: WritingDocumentListItem;
  includeCopyLink?: boolean;
  onClose?: () => void;
  onCopyLink?: () => void;
  onDelete: (document: WritingDocumentListItem) => void;
  onDuplicate: (document: WritingDocumentListItem) => void;
  onMoveToCategory?: (document: WritingDocumentListItem, categoryId: null | number) => void;
  onRename: () => void;
};

function closeAfter(action: () => void, onClose?: () => void) {
  return () => {
    action();
    onClose?.();
  };
}

const renderMoveItems = ({
  categories = [],
  document,
  onClose,
  onMoveToCategory,
}: WritingDocumentActionHandlers) => {
  if (!onMoveToCategory || categories.length === 0) {
    return null;
  }

  const activeCategories = categories.filter((category) => !category.archived);

  return (
    <>
      <AppDropdownMenuLabel>移动到文档集</AppDropdownMenuLabel>
      {document.categoryId ? (
        <AppDropdownMenuItem onSelect={closeAfter(() => onMoveToCategory(document, null), onClose)}>
          未分类
        </AppDropdownMenuItem>
      ) : null}
      {activeCategories.map((category) => (
        <AppDropdownMenuItem
          disabled={category.id === document.categoryId}
          key={category.id}
          onSelect={closeAfter(() => onMoveToCategory(document, category.id), onClose)}
        >
          {category.title}
        </AppDropdownMenuItem>
      ))}
    </>
  );
};

export function renderWritingDocumentDropdownItems(handlers: WritingDocumentActionHandlers) {
  const { document, onClose, onDelete, onDuplicate, onRename } = handlers;

  return (
    <>
      <AppDropdownMenuItem onSelect={closeAfter(onRename, onClose)}>重命名</AppDropdownMenuItem>
      <AppDropdownMenuItem onSelect={closeAfter(() => onDuplicate(document), onClose)}>复制</AppDropdownMenuItem>
      {renderMoveItems(handlers)}
      <AppDropdownMenuItem
        className="is-danger"
        onSelect={closeAfter(() => onDelete(document), onClose)}
      >
        删除
      </AppDropdownMenuItem>
    </>
  );
}

export function renderWritingDocumentContextItems(handlers: WritingDocumentActionHandlers) {
  const { document, includeCopyLink = true, onClose, onCopyLink, onDelete, onDuplicate, onRename } =
    handlers;

  return (
    <>
      <AppContextMenuItem onSelect={closeAfter(onRename, onClose)}>重命名</AppContextMenuItem>
      <AppContextMenuItem onSelect={closeAfter(() => onDuplicate(document), onClose)}>复制副本</AppContextMenuItem>
      {includeCopyLink && onCopyLink ? (
        <AppContextMenuItem onSelect={closeAfter(onCopyLink, onClose)}>复制链接</AppContextMenuItem>
      ) : null}
      {handlers.categories && handlers.onMoveToCategory
        ? handlers.categories
            .filter((category) => !category.archived && category.id !== document.categoryId)
            .map((category) => (
              <AppContextMenuItem
                key={category.id}
                onSelect={closeAfter(
                  () => handlers.onMoveToCategory?.(document, category.id),
                  onClose,
                )}
              >
                移动到 {category.title}
              </AppContextMenuItem>
            ))
        : null}
      {document.categoryId && handlers.onMoveToCategory ? (
        <AppContextMenuItem onSelect={closeAfter(() => handlers.onMoveToCategory?.(document, null), onClose)}>
          移到未分类
        </AppContextMenuItem>
      ) : null}
      <AppContextMenuItem
        className="is-danger"
        onSelect={closeAfter(() => onDelete(document), onClose)}
      >
        删除
      </AppContextMenuItem>
    </>
  );
}
