"use client";

import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import { dashboardContentLabels } from "@/lib/dashboard/content/config";

type WritingEmptyStateProps = {
  collection?: DashboardContentCollection;
  onCreate?: (collection: DashboardContentCollection) => void;
  onCreateCategory?: () => void;
  variant?: "draft-filter" | "library";
};

export function WritingEmptyState({
  collection = "posts",
  onCreate,
  onCreateCategory,
  variant = "library",
}: WritingEmptyStateProps) {
  const label = dashboardContentLabels[collection];

  if (variant === "draft-filter") {
    return (
      <div className="sunny-writing-empty-state is-library">
        <p>暂无草稿</p>
        <h3>当前没有草稿内容</h3>
        {onCreate ? (
          <button className="sunny-writing-primary-button" onClick={() => onCreate(collection)} type="button">
            新建{label}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="sunny-writing-empty-state is-library">
      <p>暂无文档集</p>
      <h3>点击新建文档集开始整理内容</h3>
      {onCreateCategory ? (
        <button className="sunny-writing-primary-button" onClick={onCreateCategory} type="button">
          新建文档集
        </button>
      ) : onCreate ? (
        <button className="sunny-writing-primary-button" onClick={() => onCreate(collection)} type="button">
          新建{label}
        </button>
      ) : null}
    </div>
  );
}
