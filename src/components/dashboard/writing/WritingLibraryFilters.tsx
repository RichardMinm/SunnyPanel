"use client";

import {
  dashboardContentCollections,
  dashboardContentLabels,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";

import type { WritingCollectionFilter } from "./writing-types";

type WritingLibraryFiltersProps = {
  collectionFilter: WritingCollectionFilter;
  onCollectionFilterChange: (filter: WritingCollectionFilter) => void;
};

const filters: Array<{ key: WritingCollectionFilter; label: string }> = [
  { key: "all", label: "全部" },
  ...dashboardContentCollections.map((collection) => ({
    key: collection,
    label: dashboardContentLabels[collection],
  })),
];

export function WritingLibraryFilters({
  collectionFilter,
  onCollectionFilterChange,
}: WritingLibraryFiltersProps) {
  return (
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
  );
}
