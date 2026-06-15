# Writing Editor UI Refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the writing studio editor UI to feel like a mature writing product — title/body as visual center, AI features embedded as ghost controls, inspector panel lightened, overall cleaner and more restrained.

**Architecture:** CSS-heavy refinement with targeted component restructures. The token system (`--writing-*`) established by the dark-mode spec is the foundation; this plan adds new component-level classes and reorganizes toolbar/metapanel markup. No new dependencies. Two new SVG icons extend the existing `DashboardIcon` library.

**Tech Stack:** React 19 (Next.js), TypeScript, Tiptap editor, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-06-15-writing-editor-ui-refinement.md`

---

## File Map

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `src/components/dashboard/icons.tsx` | Icon library — add `sparkle`, `chevronDown` | Extend |
| `src/components/content-editor/EditorToolbar.tsx` | Format toolbar — AI dropdown + layout groups | Restructure |
| `src/components/dashboard/writing/WritingEditorPane.tsx` | Main editor — title row, summary row, topbar buttons | Modify |
| `src/components/dashboard/writing/WritingInspectorSection.tsx` | Right panel section wrapper — custom chevron | Modify |
| `src/components/dashboard/writing/WritingMetaPanel.tsx` | Right panel — fold defaults, chip tags, empty values | Modify |
| `src/app/styles/sunny-dashboard-writing.css` | All writing styles | Heavy modify |

---

### Task 1: Extend Icon Library (`icons.tsx`)

**Files:**
- Modify: `src/components/dashboard/icons.tsx`

- [ ] **Step 1: Add `sparkle` and `chevronDown` to the type union**

Open `src/components/dashboard/icons.tsx`. At line 32, insert two new icon names into `DashboardIconName`:

```tsx
export type DashboardIconName =
  | "agent"
  | "archive"
  | "calendar"
  | "checklist"
  | "chevronDown"       // ← new
  | "command"
  | "debug"
  | "document"
  | "inbox"
  | "inspectorPanel"
  | "memory"
  | "new"
  | "note"
  | "pencil"
  | "plans"
  | "post"
  | "project"
  | "review"
  | "schedule"
  | "search"
  | "settings"
  | "sparkle"           // ← new
  | "chevronLeft"
  | "chevronRight"
  | "clock"
  | "layers"
  | "plus"
  | "thinking"
  | "timeline";
```

- [ ] **Step 2: Add icon paths to `ICON_PATHS`**

In the same file, inside `ICON_PATHS` object, add `chevronDown` after `chevronLeft`/`chevronRight` (around line 173):

```tsx
chevronDown: <path d="M5.5 7.5 10 13l4.5-5.5" />,
```

And add `sparkle` before the closing `};` of `ICON_PATHS`:

```tsx
sparkle: (
  <path d="M10 2.5c.3 1.5.6 2.5 1.8 3.7C13 7.4 14 7.7 15.5 8c-1.5.3-2.5.6-3.7 1.8C10.6 11 10.3 12 10 13.5c-.3-1.5-.6-2.5-1.8-3.7C7 8.6 6 8.3 4.5 8c1.5-.3 2.5-.6 3.7-1.8C9.4 5 9.7 4 10 2.5Z" />
),
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors from `icons.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/icons.tsx
git commit -m "feat: add sparkle and chevronDown icons for writing UI

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Title Row Redesign

**Files:**
- Modify: `src/components/dashboard/writing/WritingEditorPane.tsx` (lines 247-264)
- Modify: `src/app/styles/sunny-dashboard-writing.css` (lines 303-317, 1563-1568)

- [ ] **Step 1: Restructure title row JSX (`WritingEditorPane.tsx`)**

Replace the current title row block (lines 247-263):

```tsx
{canEditTitle(document) ? (
  <div className="sunny-writing-title-row">
    <input
      aria-label="标题"
      className="sunny-writing-title-input"
      onChange={(event) => onUpdateDraft({ title: event.target.value })}
      placeholder="输入标题..."
      value={draft.title}
    />
    <button
      className="sunny-writing-ai-inline-button"
      disabled={aiLoading}
      onClick={() => void handleAssist("generate_title")}
      type="button"
    >
      生成标题
    </button>
  </div>
) : null}
```

With:

```tsx
{canEditTitle(document) ? (
  <div className="sunny-writing-title-row">
    <input
      aria-label="标题"
      className="sunny-writing-title-input"
      onChange={(event) => onUpdateDraft({ title: event.target.value })}
      placeholder="输入标题..."
      value={draft.title}
    />
    <button
      className="sunny-writing-title-ai-ghost"
      data-title-empty={!draft.title.trim() ? "true" : "false"}
      disabled={aiLoading}
      onClick={() => void handleAssist("generate_title")}
      type="button"
    >
      生成标题
    </button>
  </div>
) : null}
```

Key changes:
- Class changed from `sunny-writing-ai-inline-button` to `sunny-writing-title-ai-ghost`
- Added `data-title-empty` attribute for conditional opacity

- [ ] **Step 2: Update title row CSS**

In `sunny-dashboard-writing.css`, replace the `.sunny-writing-title-row` rule (lines 1563-1568):

```css
.sunny-writing-title-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}
```

Replace `.sunny-writing-title-input` rules (lines 303-320):

```css
.sunny-writing-title-input {
  display: block;
  flex: 1;
  min-width: 0;
  margin: 0;
  border: 0;
  background: transparent;
  color: var(--writing-text);
  font-family: var(--sunny-font-sans);
  font-size: clamp(2.5rem, 4.5vw, 3rem);
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.08;
  outline: none;
}
```

- [ ] **Step 3: Add ghost pill button styles**

Insert after `.sunny-writing-title-input::placeholder` rule:

```css
/* Title ghost AI button */
.sunny-writing-title-ai-ghost {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--writing-text);
  font-family: var(--sunny-font-sans);
  font-size: 0.8125rem;
  font-weight: 600;
  opacity: 0.55;
  padding: 0 0.7rem;
  cursor: pointer;
  transition: opacity 180ms ease, background 180ms ease;
  white-space: nowrap;
}

.sunny-writing-title-ai-ghost[data-title-empty="true"] {
  opacity: 0.72;
}

.sunny-writing-title-ai-ghost:hover {
  opacity: 1;
  background: var(--writing-hover);
}

.sunny-writing-title-ai-ghost:disabled {
  opacity: 0.3;
  cursor: default;
}

.sunny-writing-title-ai-ghost:disabled:hover {
  background: transparent;
}
```

- [ ] **Step 4: Add dark mode override for ghost button**

In the dark mode section (after line 756), insert:

```css
html[data-theme="dark"] .sunny-writing-title-ai-ghost {
  color: #cbd5e1;
}

html[data-theme="dark"] .sunny-writing-title-ai-ghost:hover {
  background: #1e293b;
  color: #f1f5f9;
}
```

- [ ] **Step 5: Add responsive override for narrow screens**

In the `@media (max-width: 820px)` block (line 1238), add:

```css
.sunny-writing-title-ai-ghost {
  align-self: flex-end;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/writing/WritingEditorPane.tsx src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: redesign title row with ghost pill AI button

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Summary Row Redesign

**Files:**
- Modify: `src/components/dashboard/writing/WritingEditorPane.tsx` (lines 266-285)
- Modify: `src/app/styles/sunny-dashboard-writing.css` (lines 1570-1580)

- [ ] **Step 1: Restructure summary row JSX**

First, add the `DashboardIcon` import at the top of `WritingEditorPane.tsx`:

```tsx
import { DashboardIcon } from "@/components/dashboard/icons";
```

Replace the summary row block (lines 266-285):

```tsx
{showsSummaryField(document.collection) ? (
  <div className="sunny-writing-summary-row">
    <textarea
      aria-label="摘要"
      className="sunny-writing-summary-input"
      onChange={(event) => onUpdateDraft({ summary: event.target.value })}
      placeholder="可选：写一句摘要..."
      rows={2}
      value={draft.summary}
    />
    <button
      className="sunny-writing-summary-ai-ghost"
      disabled={aiLoading}
      onClick={() => void handleAssist("generate_summary")}
      title="自动生成摘要"
      type="button"
    >
      <DashboardIcon name="sparkle" />
    </button>
  </div>
) : null}
```

Key changes:
- Placeholder "添加一句简短摘要..."
- Button class changed to `sunny-writing-summary-ai-ghost`
- Button uses `<DashboardIcon name="sparkle" />` instead of text
- Added `title` attribute for tooltip

- [ ] **Step 2: Update summary row CSS**

In `sunny-dashboard-writing.css`, replace `.sunny-writing-summary-row` (lines 1563-1568 range, the `.sunny-writing-summary-row` block):

```css
.sunny-writing-summary-row {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  margin-bottom: 1.25rem;
}
```

Replace `.sunny-writing-summary-input` (lines 1570-1580):

```css
.sunny-writing-summary-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--writing-muted);
  font-family: var(--sunny-font-sans);
  font-size: 0.9375rem;
  line-height: 1.5;
  outline: none;
  resize: vertical;
}

.sunny-writing-summary-input:hover,
.sunny-writing-summary-input:focus {
  border-bottom: 1px solid var(--writing-rule);
}

.sunny-writing-summary-input::placeholder {
  color: var(--writing-muted);
}
```

- [ ] **Step 3: Add ghost sparkle button styles**

Insert after `.sunny-writing-summary-input` rules:

```css
/* Summary ghost AI button — sparkle icon */
.sunny-writing-summary-ai-ghost {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--writing-muted);
  opacity: 0;
  cursor: pointer;
  transition: opacity 180ms ease, background 180ms ease, color 180ms ease;
  margin-top: 0.25rem;
}

.sunny-writing-summary-row:hover .sunny-writing-summary-ai-ghost,
.sunny-writing-summary-ai-ghost:hover {
  opacity: 1;
}

.sunny-writing-summary-ai-ghost:hover {
  background: var(--writing-hover);
  color: var(--writing-text);
}

.sunny-writing-summary-ai-ghost:disabled {
  opacity: 0;
  cursor: default;
  pointer-events: none;
}

.sunny-writing-summary-ai-ghost .sunny-dashboard-nav-icon {
  width: 0.875rem;
  height: 0.875rem;
}
```

- [ ] **Step 4: Add dark mode override for summary ghost button**

In the dark mode section, insert:

```css
html[data-theme="dark"] .sunny-writing-summary-ai-ghost {
  color: #64748b;
}

html[data-theme="dark"] .sunny-writing-summary-ai-ghost:hover {
  background: #1e293b;
  color: #cbd5e1;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/writing/WritingEditorPane.tsx src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: redesign summary row with hover sparkle AI button

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Toolbar AI Dropdown + Layout Groups

**Files:**
- Modify: `src/components/content-editor/EditorToolbar.tsx` (entire file - major restructure)
- Modify: `src/app/styles/sunny-dashboard-writing.css` (toolbar styles)

- [ ] **Step 1: Rewrite `EditorToolbar.tsx`**

Replace the entire file content:

```tsx
"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { uploadDashboardImage } from "@/lib/editor/upload-dashboard-image";

type EditorToolbarProps = {
  editor: Editor | null;
  onAiAction?: (action: "continue" | "extract_tags" | "generate_outline" | "generate_summary") => void;
};

const askForHref = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.prompt("链接地址")?.trim() || null;
};

const insertItems = [
  {
    label: "表格",
    run: (editor: Editor) =>
      editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
  },
  {
    label: "Callout",
    run: (editor: Editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          attrs: { tone: "note" },
          content: [{ type: "paragraph" }],
          type: "callout",
        })
        .run(),
  },
  {
    label: "分割线",
    run: (editor: Editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    label: "任务列表",
    run: (editor: Editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    label: "有序列表",
    run: (editor: Editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "项目列表",
    run: (editor: Editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "代码块",
    run: (editor: Editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

const aiActions = [
  { action: "continue" as const, label: "续写" },
  { action: "extract_tags" as const, label: "提取标签" },
  { action: "generate_outline" as const, label: "生成大纲" },
  { action: "generate_summary" as const, label: "生成摘要" },
];

export function EditorToolbar({ editor, onAiAction }: EditorToolbarProps) {
  const [insertOpen, setInsertOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const insertRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!insertOpen && !aiOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (insertOpen && insertRef.current && !insertRef.current.contains(event.target as Node)) {
        setInsertOpen(false);
      }
      if (aiOpen && aiRef.current && !aiRef.current.contains(event.target as Node)) {
        setAiOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [insertOpen, aiOpen]);

  if (!editor) {
    return null;
  }

  return (
    <div className="sunny-rich-editor-toolbar" aria-label="编辑器工具栏">
      {/* Group 1: Text style */}
      <div className="sunny-rich-editor-toolbar-group">
        <select
          aria-label="文本样式"
          className="sunny-rich-editor-style-select"
          onChange={(event) => {
            const value = event.target.value;
            if (value === "paragraph") {
              editor.chain().focus().setParagraph().run();
            } else {
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(value) as 1 | 2 | 3 })
                .run();
            }
          }}
          value={
            editor.isActive("heading", { level: 1 })
              ? "1"
              : editor.isActive("heading", { level: 2 })
                ? "2"
                : editor.isActive("heading", { level: 3 })
                  ? "3"
                  : "paragraph"
          }
        >
          <option value="paragraph">正文</option>
          <option value="1">标题 1</option>
          <option value="2">标题 2</option>
          <option value="3">标题 3</option>
        </select>

        <button
          aria-pressed={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="标题 1"
          type="button"
        >
          H1
        </button>
        <button
          aria-pressed={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="标题 2"
          type="button"
        >
          H2
        </button>
        <button
          aria-pressed={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="标题 3"
          type="button"
        >
          H3
        </button>
      </div>

      {/* Divider */}
      <div className="sunny-rich-editor-toolbar-divider" />

      {/* Group 2: Inline format */}
      <div className="sunny-rich-editor-toolbar-group">
        <button
          aria-pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="加粗"
          type="button"
        >
          B
        </button>
        <button
          aria-pressed={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体"
          type="button"
        >
          I
        </button>
        <button
          aria-pressed={editor.isActive("link")}
          onClick={() => {
            const href = askForHref();
            if (href) {
              editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            }
          }}
          title="链接"
          type="button"
        >
          Link
        </button>
      </div>

      {/* Divider */}
      <div className="sunny-rich-editor-toolbar-divider" />

      {/* Group 3: Block actions + Insert */}
      <div className="sunny-rich-editor-toolbar-group">
        <button
          aria-pressed={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="列表"
          type="button"
        >
          列表
        </button>
        <button
          aria-pressed={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="引用"
          type="button"
        >
          引用
        </button>

        <label className="sunny-rich-editor-image-action" title="插入图片">
          图片
          <input
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                void uploadDashboardImage(file).then((result) => {
                  editor.chain().focus().setImage({ alt: file.name, src: result.url }).run();
                });
              }
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>

        <div className="sunny-rich-editor-insert-dropdown" ref={insertRef}>
          <button
            aria-expanded={insertOpen}
            onClick={() => setInsertOpen((value) => !value)}
            title="插入更多内容块"
            type="button"
          >
            + 插入
          </button>
          {insertOpen ? (
            <div className="sunny-rich-editor-insert-menu" role="menu">
              {insertItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    item.run(editor);
                    setInsertOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* AI dropdown — right aligned */}
      {onAiAction ? (
        <div className="sunny-rich-editor-ai-dropdown" ref={aiRef}>
          <button
            aria-expanded={aiOpen}
            className="sunny-rich-editor-ai-trigger"
            onClick={() => setAiOpen((value) => !value)}
            title="AI 辅助"
            type="button"
          >
            AI
            <DashboardIcon name="chevronDown" />
          </button>
          {aiOpen ? (
            <div className="sunny-rich-editor-ai-menu" role="menu">
              {aiActions.map((item) => (
                <button
                  key={item.action}
                  onClick={() => {
                    onAiAction(item.action);
                    setAiOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Update toolbar CSS**

In `sunny-dashboard-writing.css`, replace the toolbar-related rules (lines 1666-1721). Find and replace the block:

Replace `.sunny-rich-editor-toolbar` rule (lines 1666-1678):

```css
.sunny-rich-editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem;
  min-height: 2.5rem;
  border: 1px solid var(--writing-rule);
  border-radius: 12px;
  background: var(--writing-card-bg);
  padding: 0.35rem;
  margin-bottom: 1rem;
}
```

Replace the toolbar button/style-select rules (lines 1687-1698):

```css
.sunny-rich-editor-toolbar button,
.sunny-rich-editor-style-select {
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--writing-text);
  font-size: 0.8125rem;
  font-weight: 600;
  min-height: 1.75rem;
  padding: 0 0.55rem;
  cursor: pointer;
  transition: background 160ms ease;
}

.sunny-rich-editor-toolbar button:hover,
.sunny-rich-editor-toolbar button[aria-pressed="true"] {
  background: var(--writing-active-bg);
  color: var(--writing-accent);
}

.sunny-rich-editor-style-select:hover {
  background: var(--writing-active-bg);
}
```

Add toolbar group and divider styles (new):

```css
/* Toolbar groups & divider */
.sunny-rich-editor-toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.sunny-rich-editor-toolbar-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--writing-rule);
  margin-inline: 0.2rem;
  flex-shrink: 0;
}
```

Replace the AI actions rule (lines 1717-1721):

```css
/* AI dropdown */
.sunny-rich-editor-ai-dropdown {
  position: relative;
  margin-left: auto;
}

.sunny-rich-editor-ai-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.sunny-rich-editor-ai-trigger .sunny-dashboard-nav-icon {
  width: 0.625rem;
  height: 0.625rem;
  transition: transform 180ms ease;
}

.sunny-rich-editor-ai-trigger[aria-expanded="true"] .sunny-dashboard-nav-icon {
  transform: rotate(180deg);
}

.sunny-rich-editor-ai-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 20;
  display: grid;
  gap: 0.15rem;
  min-width: 9rem;
  border: 1px solid var(--writing-rule);
  border-radius: 12px;
  background: var(--writing-card-bg);
  box-shadow: var(--writing-shadow);
  padding: 0.35rem;
}

.sunny-rich-editor-ai-menu button {
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--writing-text);
  font-size: 0.8125rem;
  padding: 0.45rem 0.55rem;
  text-align: left;
  cursor: pointer;
}

.sunny-rich-editor-ai-menu button:hover {
  background: var(--writing-hover);
}
```

- [ ] **Step 3: Update dark mode toolbar styles**

In the dark mode section (lines 983-1011), update toolbar styles:

Replace the dark mode floating-menu/toolbar rules (lines 983-1011) to also cover the new AI menu:

```css
html[data-theme="dark"] .sunny-rich-editor-toolbar {
  background: #1e293b;
  border-color: #334155;
}

html[data-theme="dark"] .sunny-rich-editor-toolbar button,
html[data-theme="dark"] .sunny-rich-editor-style-select {
  color: #cbd5e1;
}

html[data-theme="dark"] .sunny-rich-editor-toolbar button:hover,
html[data-theme="dark"] .sunny-rich-editor-toolbar button[aria-pressed="true"] {
  background: #334155;
  color: #f1f5f9;
}

html[data-theme="dark"] .sunny-rich-editor-toolbar-divider {
  background: #334155;
}

html[data-theme="dark"] .sunny-rich-editor-ai-menu {
  background: #1e293b;
  border-color: #334155;
}

html[data-theme="dark"] .sunny-rich-editor-ai-menu button {
  color: #cbd5e1;
}

html[data-theme="dark"] .sunny-rich-editor-ai-menu button:hover {
  background: #273449;
}
```

- [ ] **Step 4: Update `ContentEditor.tsx` type to include `generate_summary`**

Open `src/components/content-editor/ContentEditor.tsx`, update the `onAiToolbarAction` type at line 36:

```tsx
onAiToolbarAction?: (action: "continue" | "extract_tags" | "generate_outline" | "generate_summary") => void;
```

The `WritingEditorPane.tsx` `handleAssist` already handles `"generate_summary"` (line 107) — no other changes needed there.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/content-editor/EditorToolbar.tsx src/components/content-editor/ContentEditor.tsx src/components/dashboard/writing/WritingEditorPane.tsx src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: restructure toolbar with AI dropdown and format groups

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Body Entry & Spacing Optimization

**Files:**
- Modify: `src/app/styles/sunny-dashboard-writing.css`

- [ ] **Step 1: Update placeholder color and sizing**

In `sunny-dashboard-writing.css`, find `.sunny-writing-workspace .sunny-rich-editor-content` block (lines 333-340). Add after the existing rules:

```css
/* Placeholder styling for Tiptap */
.sunny-writing-workspace .ProseMirror p.is-editor-empty:first-child::before {
  float: left;
  height: 0;
  color: #64748b;
  content: attr(data-placeholder);
  pointer-events: none;
}

html[data-theme="dark"] .sunny-writing-workspace .ProseMirror p.is-editor-empty:first-child::before {
  color: #64748b;
}
```

- [ ] **Step 2: Update content width constraints**

Find the content width rule (lines 295-301). Replace:

```css
.sunny-writing-editor-canvas > .sunny-writing-title-row,
.sunny-writing-editor-canvas > .sunny-writing-summary-row,
.sunny-writing-editor-canvas > .sunny-writing-tiptap-editor,
.sunny-writing-preview-canvas > .sunny-writing-preview-article {
  width: min(100%, 780px);
  margin-inline: auto;
}
```

- [ ] **Step 3: Adjust canvas top padding**

Replace `.sunny-writing-editor-canvas` padding (line 290):

```css
.sunny-writing-editor-canvas {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: clamp(1.5rem, 4vh, 2.8rem) clamp(1.25rem, 4vw, 3.75rem) 5rem;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--muted) 24%, transparent) transparent;
}
```

- [ ] **Step 4: Adjust body font size for readability**

In the `.sunny-writing-workspace .sunny-rich-editor-content` rule (line 337), update:

```css
font-size: 1.0625rem;
```

- [ ] **Step 5: Commit**

```bash
git add src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: optimize body entry — placeholder color, content width 780px, spacing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Inspector Fold States + Summary Style

**Files:**
- Modify: `src/components/dashboard/writing/WritingMetaPanel.tsx` (fold defaults)
- Modify: `src/components/dashboard/writing/WritingInspectorSection.tsx` (summary chevron)
- Modify: `src/app/styles/sunny-dashboard-writing.css` (summary style)

- [ ] **Step 1: Add `DashboardIcon` import to `WritingInspectorSection.tsx`**

At the top of the file, add:

```tsx
import { DashboardIcon } from "@/components/dashboard/icons";
```

- [ ] **Step 2: Replace summary content in `WritingInspectorSection.tsx`**

Replace the current JSX:

```tsx
export function WritingInspectorSection({
  children,
  defaultOpen = true,
  title,
}: WritingInspectorSectionProps) {
  return (
    <details className="sunny-writing-inspector-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="sunny-writing-inspector-section-body">{children}</div>
    </details>
  );
}
```

With:

```tsx
export function WritingInspectorSection({
  children,
  defaultOpen = true,
  title,
}: WritingInspectorSectionProps) {
  return (
    <details className="sunny-writing-inspector-section" open={defaultOpen}>
      <summary>
        <span className="sunny-writing-inspector-chevron">
          <DashboardIcon name="chevronDown" />
        </span>
        <span>{title}</span>
      </summary>
      <div className="sunny-writing-inspector-section-body">{children}</div>
    </details>
  );
}
```

- [ ] **Step 3: Update inspector section CSS**

Replace `.sunny-writing-inspector-section` and `.sunny-writing-inspector-section summary` rules (lines 1617-1634):

```css
.sunny-writing-inspector-section {
  border-top: 1px solid var(--writing-rule);
  padding-top: 0.65rem;
}

.sunny-writing-inspector-section summary {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--writing-text);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  list-style: none;
  margin-bottom: 0.55rem;
  padding: 0.15rem 0.25rem;
  border-radius: 4px;
  transition: background 160ms ease;
}

.sunny-writing-inspector-section summary:hover {
  background: var(--writing-hover);
}

.sunny-writing-inspector-section summary::-webkit-details-marker {
  display: none;
}
```

Add chevron rotation style:

```css
.sunny-writing-inspector-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 180ms ease;
  color: var(--writing-muted);
}

.sunny-writing-inspector-chevron .sunny-dashboard-nav-icon {
  width: 0.75rem;
  height: 0.75rem;
}

.sunny-writing-inspector-section[open] > summary .sunny-writing-inspector-chevron {
  transform: rotate(0deg);
}

.sunny-writing-inspector-section:not([open]) > summary .sunny-writing-inspector-chevron {
  transform: rotate(-90deg);
}
```

- [ ] **Step 4: Update fold defaults in `WritingMetaPanel.tsx`**

Find `<WritingInspectorSection title="内容结构">` (line 157). Change its `defaultOpen`:

```tsx
<WritingInspectorSection defaultOpen={false} title="内容结构">
```

Line 200 already has `defaultOpen={false}` for "高级设置" — verify it's unchanged.

- [ ] **Step 5: Add dark mode inspector section styles**

In the dark mode section, add (after line 1036):

```css
html[data-theme="dark"] .sunny-writing-inspector-section summary:hover {
  background: rgba(255, 255, 255, 0.04);
}

html[data-theme="dark"] .sunny-writing-inspector-chevron {
  color: #64748b;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/writing/WritingMetaPanel.tsx src/components/dashboard/writing/WritingInspectorSection.tsx src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: fold inspector sections + custom chevron summary style

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Topbar Button Optimization (P1)

**Files:**
- Modify: `src/components/dashboard/writing/WritingEditorPane.tsx` (topbar actions)
- Modify: `src/app/styles/sunny-dashboard-writing.css` (save state, secondary button styles)

- [ ] **Step 1: Conditionally hide save button**

In `WritingEditorPane.tsx`, find the topbar actions block (lines 200-241). Replace the "保存" button:

```tsx
{(saveState !== "saved" || isDirty) ? (
  <button
    className="sunny-writing-secondary-button"
    disabled={!isDirty || saveState === "saving"}
    onClick={() => void onFlushSave()}
    type="button"
  >
    保存
  </button>
) : null}
```

- [ ] **Step 2: Update save state label styling**

Find `.sunny-writing-save-state` CSS (lines 257-271). Update:

```css
.sunny-writing-save-state {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--writing-muted);
  font-size: 0.75rem;
  font-weight: 600;
}
```

Remove the explicit color rules for `[data-state="error"]` and `[data-state="saved"]` — the base muted color is sufficient, with error being the only special state:

```css
.sunny-writing-save-state[data-state="error"] {
  color: var(--tone-danger-text);
}
```

- [ ] **Step 3: Dark mode save state adjustment**

In the dark mode section (lines 702-712), simplify:

```css
html[data-theme="dark"] .sunny-writing-save-state {
  color: #64748b;
}

html[data-theme="dark"] .sunny-writing-save-state[data-state="error"] {
  color: #f87171;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/writing/WritingEditorPane.tsx src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: optimize topbar — hide save when saved, mute save state text

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Library List Refinement (P1)

**Files:**
- Modify: `src/app/styles/sunny-dashboard-writing.css` (document row + dark mode)

- [ ] **Step 1: Update active card background**

Replace `.sunny-writing-document-row.is-active` (lines 1351-1354):

```css
.sunny-writing-document-row.is-active {
  background: color-mix(in srgb, var(--writing-accent) 6%, transparent);
  border-color: color-mix(in srgb, var(--writing-accent) 16%, transparent);
}
```

- [ ] **Step 2: Update document row spacing and sizing**

Replace `.sunny-writing-document-row` (lines 1330-1338):

```css
.sunny-writing-document-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.15rem;
  align-items: start;
  border: 1px solid transparent;
  border-radius: 10px;
}
```

Replace `.sunny-writing-document-row-main` padding (line 1347):

```css
padding: 0.45rem 0.55rem;
```

Replace `.sunny-writing-document-list` gap (line 225):

```css
gap: 0.2rem;
```

- [ ] **Step 3: Shrink type/status labels**

Replace `.sunny-writing-document-type` and `.sunny-writing-document-status` (lines 1363-1367):

```css
.sunny-writing-document-type,
.sunny-writing-document-status {
  font-size: 0.6875rem;
  font-weight: 600;
}
```

- [ ] **Step 4: Strengthen document title**

Replace `.sunny-writing-document-title` (lines 1377-1384):

```css
.sunny-writing-document-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.35;
}
```

- [ ] **Step 5: Update dark mode active row**

Replace `html[data-theme="dark"] .sunny-writing-document-row.is-active` (lines 841-844):

```css
html[data-theme="dark"] .sunny-writing-document-row.is-active {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(96, 165, 250, 0.25);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: refine library list — lighter active state, tighter spacing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Chip-Style Tags + Empty Values (P1)

**Files:**
- Modify: `src/components/dashboard/writing/WritingMetaPanel.tsx` (tags field, empty values)
- Modify: `src/app/styles/sunny-dashboard-writing.css` (chip styles, empty value styles)

- [ ] **Step 1: Rename the tags section with empty value helper**

In `WritingMetaPanel.tsx`, first add a helper function inside the component or before it:

```tsx
function EmptyMuted({ children }: { children: React.ReactNode }) {
  return <span className="sunny-writing-empty-muted">{children}</span>;
}
```

- [ ] **Step 2: Add empty value display for fields**

In the "内容结构" section (lines 157-198), update empty fields to show placeholder text.

For the "分类" field in notes (line 173):

```tsx
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
```

For the "心情" field in notes (line 179):

```tsx
<label className="sunny-writing-field">
  <span>心情</span>
  <input
    onChange={(event) => onUpdateMetadata("mood", event.target.value)}
    placeholder="平静、兴奋、卡住了"
    value={draft.metadata.mood}
  />
</label>
```

For the "关联链接" field in updates (line 138), if empty:

```tsx
<label className="sunny-writing-field">
  <span>关联链接</span>
  {draft.metadata.link ? (
    <input
      onChange={(event) => onUpdateMetadata("link", event.target.value)}
      placeholder="https://..."
      value={draft.metadata.link}
    />
  ) : (
    <EmptyMuted>暂无所属层级</EmptyMuted>
  )}
</label>
```

- [ ] **Step 3: Add chip-style tags for posts collection**

Replace the tags `<input>` (line 160-166) with a chip-based editor. Add this inside the "内容结构" section for `posts`:

```tsx
{document.collection === "posts" ? (
  <label className="sunny-writing-field">
    <span>标签</span>
    <TagsChipInput
      onTags={(tags) => void handleAssist("extract_tags")}
      onChange={(value) => onUpdateMetadata("tags", value)}
      value={draft.metadata.tags}
    />
  </label>
) : null}
```

Define `TagsChipInput` as a local component in the file:

```tsx
function TagsChipInput({
  value,
  onChange,
  onTags,
}: {
  value: string;
  onChange: (value: string) => void;
  onTags: (tags: string[]) => void;
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
```

- [ ] **Step 4: Add chip CSS**

Insert new CSS rules in `sunny-dashboard-writing.css`:

```css
/* Tags chip row */
.sunny-writing-tags-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.sunny-writing-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 8px;
  background: var(--writing-hover);
  color: var(--writing-text);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
}

.sunny-writing-tag-chip-remove {
  border: 0;
  background: transparent;
  color: var(--writing-muted);
  font-size: 0.875rem;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}

.sunny-writing-tag-chip-remove:hover {
  color: var(--tone-danger-text);
}

.sunny-writing-tag-chip-add {
  border: 1px dashed var(--writing-rule);
  border-radius: 8px;
  background: transparent;
  color: var(--writing-muted);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}

.sunny-writing-tag-chip-add:hover {
  border-color: var(--writing-accent);
  color: var(--writing-accent);
}

.sunny-writing-tag-chip-input {
  width: 6rem;
  border: 1px solid var(--writing-accent);
  border-radius: 8px;
  background: var(--writing-control-bg);
  color: var(--writing-text);
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  outline: none;
}

/* Empty field muted text */
.sunny-writing-empty-muted {
  color: var(--writing-muted);
  font-size: 0.8125rem;
  font-style: italic;
  opacity: 0.55;
  padding: 0.35rem 0;
}
```

- [ ] **Step 5: Add dark mode chip styles**

In the dark mode section:

```css
html[data-theme="dark"] .sunny-writing-tag-chip {
  background: #1e293b;
  color: #cbd5e1;
}

html[data-theme="dark"] .sunny-writing-tag-chip-add {
  border-color: #334155;
  color: #64748b;
}

html[data-theme="dark"] .sunny-writing-tag-chip-add:hover {
  border-color: #60a5fa;
  color: #93c5fd;
}

html[data-theme="dark"] .sunny-writing-tag-chip-input {
  background: #0f172a;
  border-color: #3b82f6;
  color: #f8fafc;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/writing/WritingMetaPanel.tsx src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: chip-style tags input + empty value muted display in meta panel

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Final Rhythm & Width Adjustments (P1)

**Files:**
- Modify: `src/app/styles/sunny-dashboard-writing.css`

- [ ] **Step 1: Reduce meta panel width**

Update grid-template-columns (line 21):

```css
grid-template-columns: 280px minmax(0, 1fr) 280px;
```

Also update collapsed states (lines 1255-1265):

```css
.sunny-writing-workspace.is-library-collapsed {
  grid-template-columns: 0 minmax(0, 1fr) 280px;
}

.sunny-writing-workspace.is-inspector-collapsed {
  grid-template-columns: 280px minmax(0, 1fr) 0;
}
```

- [ ] **Step 2: Compact inspector section spacing**

Update `.sunny-writing-meta-panel` gap (line 49):

```css
gap: 0.5rem;
```

Update `.sunny-writing-inspector-section-body` gap (line 1633):

```css
gap: 0.5rem;
```

- [ ] **Step 3: Responsive grid adjustments**

In the `@media (max-width: 1180px)` block (line 1224), update:

```css
@media (max-width: 1180px) {
  .sunny-writing-workspace {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  /* ... */
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/styles/sunny-dashboard-writing.css
git commit -m "feat: final rhythm — panel width 280px, tighter section spacing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Implementation Order

```
Task 1 (icons) ──┐
                 ├── Task 2 (title row) ──┐
                 ├── Task 3 (summary row) ─┤
                 ├── Task 4 (toolbar) ────┤
                 ├── Task 5 (body) ────────┤
                 └── Task 6 (inspector) ──┤
                                          ├── Task 7 (topbar)
                                          ├── Task 8 (library)
                                          ├── Task 9 (chip tags)
                                          └── Task 10 (rhythm)
```

Tasks 2-6 can run in parallel after Task 1. Tasks 7-10 depend on the CSS file being in a consistent state (sequential is safest since all touch the same CSS file).

## Testing

After each task:
1. `npx tsc --noEmit` for type checking
2. Verify the dev server runs: `npm run dev` (navigate to `/dashboard` → writing section)
3. Visual check against spec requirements

After all tasks:
1. Full TypeScript check: `npx tsc --noEmit --project tsconfig.json`
2. Quick smoke: verify title input, summary input, toolbar buttons, AI menu, inspector fold/unfold, tag chip add/remove all work
3. Dark mode toggle: verify all new styles render correctly in dark mode
4. Responsive: narrow browser to <820px, verify title button wraps below
