"use client";

type WritingEmptyStateProps = {
  onCreate?: () => void;
};

export function WritingEmptyState({ onCreate }: WritingEmptyStateProps) {
  return (
    <div className="sunny-writing-empty-state is-library">
      <p>暂无内容</p>
      <h3>点击新建开始写作</h3>
      {onCreate ? (
        <button className="sunny-writing-primary-button" onClick={onCreate} type="button">
          新建
        </button>
      ) : null}
    </div>
  );
}
