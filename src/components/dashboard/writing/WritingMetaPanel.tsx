"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { useDashboardModeNavigation } from "@/components/dashboard/DashboardModeContext";
import { dashboardContentLabels } from "@/lib/dashboard/content/config";

import { WritingInspectorSection } from "./WritingInspectorSection";
import { WritingPublishControls } from "./WritingPublishControls";
import { WritingVersionHistory } from "./WritingVersionHistory";
import { WritingKnowledgePanel } from "./WritingKnowledgePanel";
import type { WritingMetadataDraft } from "./writing-metadata";
import type {
  WritingDocument,
  WritingDraft,
  WritingSaveState,
} from "./writing-types";

type WritingMetaPanelProps = {
  document: null | WritingDocument;
  draft: WritingDraft | null;
  isPinned?: boolean;
  onClose?: () => void;
  onPin?: () => void;
  onUnpublish: (document: WritingDocument) => Promise<null | WritingDocument>;
  onUpdateMetadata: <Key extends keyof WritingMetadataDraft>(
    key: Key,
    value: WritingMetadataDraft[Key],
  ) => void;
  saveState: WritingSaveState;
};

const updateTypes: Array<{ label: string; value: WritingMetadataDraft["type"] }> = [
  { label: "生活", value: "life" },
  { label: "工作", value: "work" },
  { label: "项目", value: "project" },
];

function EmptyMuted({ children }: { children: React.ReactNode }) {
  return <span className="sunny-writing-empty-muted">{children}</span>;
}

function TagsChipInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");

  const tags = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag].join(", "));
    }
    setNewTag("");
    setAdding(false);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag).join(", "));
  };

  return (
    <div className="sunny-writing-tags-chip-row">
      {tags.map((tag) => (
        <span key={tag} className="sunny-writing-tag-chip">
          {tag}
          <button
            aria-label={`移除标签 ${tag}`}
            className="sunny-writing-tag-chip-remove"
            onClick={() => removeTag(tag)}
            type="button"
          >
            &times;
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          className="sunny-writing-tag-chip-input"
          onBlur={addTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTag();
            if (e.key === "Escape") {
              setNewTag("");
              setAdding(false);
            }
          }}
          placeholder="新标签..."
          value={newTag}
        />
      ) : (
        <button
          className="sunny-writing-tag-chip-add"
          onClick={() => setAdding(true)}
          type="button"
        >
          + 添加
        </button>
      )}
    </div>
  );
}

export function WritingMetaPanel({
  document,
  draft,
  isPinned = false,
  onClose,
  onPin,
  onUnpublish,
  onUpdateMetadata,
  saveState,
}: WritingMetaPanelProps) {
  const navigateDashboard = useDashboardModeNavigation();
  const title = useMemo(() => {
    if (!document) {
      return "属性";
    }

    return dashboardContentLabels[document.collection];
  }, [document]);

  if (!document || !draft) {
    return (
      <aside className="sunny-writing-meta-panel" aria-label="写作属性">
        <section className="sunny-writing-side-section">
          <h3>{title}</h3>
          <p className="sunny-writing-side-muted">选择内容后可管理发布、标签和层次。</p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="sunny-writing-meta-panel" aria-label="写作属性">
      <div className="sunny-writing-meta-head">
        <div>
          <h3>属性</h3>
          <p>{title}</p>
        </div>
        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
          {onPin ? (
            <button
              aria-label={isPinned ? "取消固定属性栏" : "固定属性栏"}
              className={`sunny-writing-meta-pin-button${isPinned ? " is-pinned" : ""}`}
              onClick={onPin}
              title={isPinned ? "取消固定" : "固定属性栏"}
              type="button"
            >
              <DashboardIcon name="pin" />
            </button>
          ) : null}
          {onClose ? (
            <button
              aria-label="收起属性栏"
              className="sunny-writing-icon-button"
              onClick={onClose}
              title="收起属性栏"
              type="button"
            >
              <DashboardIcon name="chevronRight" />
            </button>
          ) : null}
        </div>
      </div>

      <WritingInspectorSection defaultOpen={false} title="基本信息">
        {(document.collection === "posts" || document.collection === "pages") ? (
          <label className="sunny-writing-field">
            <span>Slug</span>
            <input
              onChange={(event) => onUpdateMetadata("slug", event.target.value)}
              placeholder="my-writing"
              value={draft.metadata.slug}
            />
          </label>
        ) : null}

        <label className="sunny-writing-field">
          <span>可见性</span>
          <select
            onChange={(event) =>
              onUpdateMetadata("visibility", event.target.value as WritingMetadataDraft["visibility"])
            }
            value={draft.metadata.visibility}
          >
            <option value="private">私有</option>
            <option value="public">公开</option>
          </select>
        </label>

        {document.collection === "updates" ? (
          <>
            <label className="sunny-writing-field">
              <span>类型</span>
              <select
                onChange={(event) =>
                  onUpdateMetadata("type", event.target.value as WritingMetadataDraft["type"])
                }
                value={draft.metadata.type}
              >
                {updateTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sunny-writing-field">
              <span>关联链接</span>
              {draft.metadata.link ? (
                <input
                  onChange={(event) => onUpdateMetadata("link", event.target.value)}
                  placeholder="https://..."
                  value={draft.metadata.link}
                />
              ) : (
                <EmptyMuted>暂无链接</EmptyMuted>
              )}
            </label>
          </>
        ) : null}

        {document.collection === "notes" ? (
          <>
            <label className="sunny-writing-field">
              <span>分类</span>
              {draft.metadata.category ? (
                <input
                  onChange={(event) => onUpdateMetadata("category", event.target.value)}
                  value={draft.metadata.category}
                />
              ) : (
                <EmptyMuted>未设置</EmptyMuted>
              )}
            </label>
            <label className="sunny-writing-field">
              <span>心情</span>
              <input
                onChange={(event) => onUpdateMetadata("mood", event.target.value)}
                placeholder="平静、兴奋、卡住了"
                value={draft.metadata.mood}
              />
            </label>
            <label className="sunny-writing-checkbox">
              <input
                checked={draft.metadata.pinned}
                onChange={(event) => onUpdateMetadata("pinned", event.target.checked)}
                type="checkbox"
              />
              <span>置顶</span>
            </label>
          </>
        ) : null}
      </WritingInspectorSection>

      <WritingInspectorSection defaultOpen={false} title="发布设置">
        <WritingPublishControls
          document={document}
          onUnpublish={onUnpublish}
          saveState={saveState}
        />
      </WritingInspectorSection>

      <WritingInspectorSection defaultOpen={false} title="标签">
        {document.collection === "posts" ? (
          <TagsChipInput
            onChange={(value) => onUpdateMetadata("tags", value)}
            value={draft.metadata.tags}
          />
        ) : (
          <EmptyMuted>当前内容类型不支持标签</EmptyMuted>
        )}
      </WritingInspectorSection>

      <WritingInspectorSection defaultOpen title="文档结构">
        <WritingKnowledgePanel document={document} draft={draft} />
      </WritingInspectorSection>

      <WritingInspectorSection defaultOpen={false} title="关联">
        <div className="sunny-writing-related-links">
          <button
            className="sunny-writing-related-link"
            onClick={() => navigateDashboard?.("checklist")}
            type="button"
          >
            关联清单
          </button>
          <button
            className="sunny-writing-related-link"
            onClick={() => navigateDashboard?.("plans")}
            type="button"
          >
            关联计划
          </button>
          <button
            className="sunny-writing-related-link"
            onClick={() => navigateDashboard?.("timeline")}
            type="button"
          >
            关联时间线
          </button>
        </div>
        <EmptyMuted>前往对应工作区查看和管理关联内容</EmptyMuted>
      </WritingInspectorSection>

      <WritingInspectorSection defaultOpen={false} title="版本历史">
        <WritingVersionHistory document={document} />
      </WritingInspectorSection>

      <WritingInspectorSection defaultOpen={false} sectionId="advanced" title="高级设置">
        <div className="sunny-writing-advanced-links">
          <Link className="sunny-writing-admin-link" href={document.advancedAdminHref}>
            在高级管理中打开
          </Link>
        </div>
      </WritingInspectorSection>
    </aside>
  );
}
