"use client";

import Link from "next/link";

import {
  dashboardContentCollections,
  dashboardContentLabels,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";

import type {
  WritingCollectionFilter,
  WritingDocumentListItem,
} from "./writing-types";

type WritingLibraryProps = {
  activeDocument: null | WritingDocumentListItem;
  collectionFilter: WritingCollectionFilter;
  documents: WritingDocumentListItem[];
  isLoading: boolean;
  onCollectionFilterChange: (filter: WritingCollectionFilter) => void;
  onCreateDocument: (collection: DashboardContentCollection) => void;
  onSelectDocument: (document: WritingDocumentListItem) => void;
};

const filters: Array<{ key: WritingCollectionFilter; label: string }> = [
  { key: "all", label: "全部" },
  ...dashboardContentCollections.map((collection) => ({
    key: collection,
    label: dashboardContentLabels[collection],
  })),
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));

export function WritingLibrary({
  activeDocument,
  collectionFilter,
  documents,
  isLoading,
  onCollectionFilterChange,
  onCreateDocument,
  onSelectDocument,
}: WritingLibraryProps) {
  return (
    <aside className="sunny-writing-library" aria-label="内容库">
      <div className="sunny-writing-library-head">
        <div>
          <p className="sunny-writing-eyebrow">Dashboard Studio</p>
          <h2>写作</h2>
        </div>
        <div className="sunny-writing-library-actions">
          <span className="sunny-writing-library-count">{documents.length}</span>
          <Link className="sunny-writing-admin-link" href="/admin/collections/posts">
            Admin
          </Link>
        </div>
      </div>

      <div className="sunny-writing-filter-row" aria-label="内容类型">
        {filters.map((filter) => (
          <button
            aria-pressed={collectionFilter === filter.key}
            className={`sunny-writing-filter${collectionFilter === filter.key ? " is-active" : ""}`}
            key={filter.key}
            onClick={() => onCollectionFilterChange(filter.key)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="sunny-writing-create-grid" aria-label="新建内容">
        {dashboardContentCollections.map((collection) => (
          <button
            className="sunny-writing-create-button"
            key={collection}
            onClick={() => onCreateDocument(collection)}
            type="button"
          >
            <span>+</span>
            {dashboardContentLabels[collection]}
          </button>
        ))}
      </div>

      <div className="sunny-writing-document-list" role="list">
        {isLoading ? (
          <p className="sunny-writing-empty">正在整理内容...</p>
        ) : documents.length ? (
          documents.map((document) => {
            const active =
              activeDocument?.collection === document.collection && activeDocument.id === document.id;

            return (
              <button
                className={`sunny-writing-document-row${active ? " is-active" : ""}`}
                key={`${document.collection}-${document.id}`}
                onClick={() => onSelectDocument(document)}
                role="listitem"
                type="button"
              >
                <span className="sunny-writing-document-kind">
                  {dashboardContentLabels[document.collection]}
                </span>
                <strong>{document.title}</strong>
                <span>{document.excerpt || "还没有正文"}</span>
                <time dateTime={document.updatedAt}>{formatDate(document.updatedAt)}</time>
              </button>
            );
          })
        ) : (
          <p className="sunny-writing-empty">还没有内容，先新建一篇。</p>
        )}
      </div>
    </aside>
  );
}
