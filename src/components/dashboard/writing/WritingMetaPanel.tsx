"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { dashboardContentLabels } from "@/lib/dashboard/content/config";

import { WritingOutlinePanel } from "./WritingOutlinePanel";
import { WritingPreviewPanel } from "./WritingPreviewPanel";
import { WritingPublishControls } from "./WritingPublishControls";
import type {
  WritingDocument,
  WritingDocumentPatch,
  WritingSaveState,
} from "./writing-types";

type WritingMetaPanelProps = {
  document: null | WritingDocument;
  onPublish: (document: WritingDocument) => Promise<null | WritingDocument>;
  onSave: (document: WritingDocument, patch: WritingDocumentPatch) => Promise<null | WritingDocument>;
  onUnpublish: (document: WritingDocument) => Promise<null | WritingDocument>;
  saveState: WritingSaveState;
};

type MetadataDraft = {
  category: string;
  link: string;
  mood: string;
  pinned: boolean;
  slug: string;
  summary: string;
  tags: string;
  type: "life" | "project" | "work";
  visibility: "private" | "public";
};

const updateTypes: Array<{ label: string; value: MetadataDraft["type"] }> = [
  { label: "生活", value: "life" },
  { label: "工作", value: "work" },
  { label: "项目", value: "project" },
];

const readString = (metadata: Record<string, unknown>, key: string) =>
  typeof metadata[key] === "string" ? metadata[key] : "";

const buildDraft = (document: WritingDocument): MetadataDraft => ({
  category: readString(document.metadata, "category") || "note",
  link: readString(document.metadata, "link"),
  mood: readString(document.metadata, "mood"),
  pinned: document.metadata.pinned === true,
  slug: readString(document.metadata, "slug"),
  summary: readString(document.metadata, "summary"),
  tags: Array.isArray(document.metadata.tags)
    ? document.metadata.tags.filter((tag): tag is string => typeof tag === "string").join(", ")
    : "",
  type:
    document.metadata.type === "work" || document.metadata.type === "project"
      ? document.metadata.type
      : "life",
  visibility: document.visibility,
});

const parseTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export function WritingMetaPanel({
  document,
  onPublish,
  onSave,
  onUnpublish,
  saveState,
}: WritingMetaPanelProps) {
  const [draft, setDraft] = useState<MetadataDraft | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!document) {
      setDraft(null);
      setIsDirty(false);
      return;
    }

    setDraft(buildDraft(document));
    setIsDirty(false);
  }, [document]);

  const title = useMemo(() => {
    if (!document) {
      return "属性";
    }

    return dashboardContentLabels[document.collection];
  }, [document]);

  const updateDraft = useCallback(<Key extends keyof MetadataDraft,>(key: Key, value: MetadataDraft[Key]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!document || !draft) {
      return;
    }

    const patch: WritingDocumentPatch = {
      visibility: draft.visibility,
    };

    if (document.collection === "posts") {
      patch.slug = draft.slug.trim();
      patch.summary = draft.summary.trim();
      patch.tags = parseTags(draft.tags);
    }

    if (document.collection === "pages") {
      patch.slug = draft.slug.trim();
    }

    if (document.collection === "notes") {
      patch.category = draft.category.trim() || "note";
      patch.mood = draft.mood.trim();
      patch.pinned = draft.pinned;
    }

    if (document.collection === "updates") {
      patch.type = draft.type;
      patch.link = draft.link.trim();
    }

    const saved = await onSave(document, patch);
    if (saved) {
      setIsDirty(false);
    }
  }, [document, draft, onSave]);

  if (!document || !draft) {
    return (
      <aside className="sunny-writing-meta-panel" aria-label="写作属性">
        <section className="sunny-writing-side-section">
          <h3>{title}</h3>
          <p className="sunny-writing-side-muted">选择内容后可管理发布、摘要和层次。</p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="sunny-writing-meta-panel" aria-label="写作属性">
      <section className="sunny-writing-side-section">
        <div className="sunny-writing-meta-head">
          <div>
            <h3>{title}</h3>
            <p>#{document.id}</p>
          </div>
          <button
            disabled={!isDirty || saveState === "saving"}
            onClick={handleSave}
            type="button"
          >
            保存属性
          </button>
        </div>

        <label className="sunny-writing-field">
          <span>可见性</span>
          <select
            onChange={(event) => updateDraft("visibility", event.target.value as MetadataDraft["visibility"])}
            value={draft.visibility}
          >
            <option value="private">私有</option>
            <option value="public">公开</option>
          </select>
        </label>

        {(document.collection === "posts" || document.collection === "pages") ? (
          <label className="sunny-writing-field">
            <span>Slug</span>
            <input
              onChange={(event) => updateDraft("slug", event.target.value)}
              placeholder="my-writing"
              value={draft.slug}
            />
          </label>
        ) : null}

        {document.collection === "posts" ? (
          <>
            <label className="sunny-writing-field">
              <span>摘要</span>
              <textarea
                onChange={(event) => updateDraft("summary", event.target.value)}
                rows={4}
                value={draft.summary}
              />
            </label>
            <label className="sunny-writing-field">
              <span>标签</span>
              <input
                onChange={(event) => updateDraft("tags", event.target.value)}
                placeholder="design, agent, notes"
                value={draft.tags}
              />
            </label>
          </>
        ) : null}

        {document.collection === "notes" ? (
          <>
            <label className="sunny-writing-field">
              <span>分类</span>
              <input
                onChange={(event) => updateDraft("category", event.target.value)}
                value={draft.category}
              />
            </label>
            <label className="sunny-writing-field">
              <span>心情</span>
              <input
                onChange={(event) => updateDraft("mood", event.target.value)}
                placeholder="平静、兴奋、卡住了"
                value={draft.mood}
              />
            </label>
            <label className="sunny-writing-checkbox">
              <input
                checked={draft.pinned}
                onChange={(event) => updateDraft("pinned", event.target.checked)}
                type="checkbox"
              />
              <span>置顶</span>
            </label>
          </>
        ) : null}

        {document.collection === "updates" ? (
          <>
            <label className="sunny-writing-field">
              <span>类型</span>
              <select
                onChange={(event) => updateDraft("type", event.target.value as MetadataDraft["type"])}
                value={draft.type}
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
              <input
                onChange={(event) => updateDraft("link", event.target.value)}
                placeholder="https://..."
                value={draft.link}
              />
            </label>
          </>
        ) : null}
      </section>

      <WritingPublishControls
        document={document}
        onPublish={onPublish}
        onUnpublish={onUnpublish}
        saveState={saveState}
      />
      <WritingOutlinePanel outline={document.contentOutline} />
      <WritingPreviewPanel document={document} />
    </aside>
  );
}
