"use client";

import { useMemo, useState } from "react";

import { AppCommandMenu } from "@/components/primitives/AppCommandMenu";
import { dashboardContentLabels } from "@/lib/dashboard/content/config";

import type { WritingDocumentListItem } from "./writing-types";

type WritingLibrarySearchDialogProps = {
  documents: WritingDocumentListItem[];
  onOpenChange: (open: boolean) => void;
  onSelectDocument: (document: WritingDocumentListItem) => void;
  open: boolean;
};

export function WritingLibrarySearchDialog({
  documents,
  onOpenChange,
  onSelectDocument,
  open,
}: WritingLibrarySearchDialogProps) {
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const filtered = normalized
      ? documents.filter((document) => {
          const haystack = [document.title, document.excerpt].join(" ").toLowerCase();
          return haystack.includes(normalized);
        })
      : documents;

    return filtered.slice(0, 40).map((document) => ({
      description: document.excerpt || undefined,
      group: dashboardContentLabels[document.collection],
      id: `${document.collection}-${document.id}`,
      label: document.title || "未命名内容",
      onSelect: () => {
        onSelectDocument(document);
        onOpenChange(false);
        setQuery("");
      },
    }));
  }, [documents, onOpenChange, onSelectDocument, query]);

  return (
    <AppCommandMenu
      emptyLabel="没有匹配的文档"
      items={items}
      onClose={() => {
        onOpenChange(false);
        setQuery("");
      }}
      onQueryChange={setQuery}
      open={open}
      placeholder="搜索文章、动态、页面..."
      query={query}
      title="搜索内容"
    />
  );
}
