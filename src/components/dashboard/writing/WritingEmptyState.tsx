"use client";

import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import { dashboardContentLabels } from "@/lib/dashboard/content/config";

type WritingEmptyStateProps = {
  collection?: DashboardContentCollection;
  onCreate?: (collection: DashboardContentCollection) => void;
};

export function WritingEmptyState({ collection = "posts", onCreate }: WritingEmptyStateProps) {
  const label = dashboardContentLabels[collection];

  return (
    <div className="sunny-writing-empty-state is-library">
      <p>暂无内容</p>
      <h3>新建{label}，开始写作</h3>
      {onCreate ? (
        <button className="sunny-writing-primary-button" onClick={() => onCreate(collection)} type="button">
          新建{label}
        </button>
      ) : null}
    </div>
  );
}
