# Writing Studio Dark Mode Redesign

> **Goal:** Transform the writing page from a "light-mode-inverted" dark theme to a mature, editor-centric dark workspace — Linear/Notion Dark/VS Code aesthetic.

## Architecture

The writing page uses CSS custom properties (`--writing-*`) defined on `.sunny-writing-workspace`, with `html[data-theme="dark"]` overriding them. All components (`WritingWorkspace`, `WritingLibrary`, `WritingEditorPane`, `WritingMetaPanel`, `WritingPreviewPane`) consume these tokens. The approach is to **replace the current `color-mix()` derived dark tokens with explicit, hand-tuned values**, and add targeted dark overrides for hardcoded light-mode colors.

**Single file to modify:** `src/app/styles/sunny-dashboard-writing.css`

---

## Token System

### Light Mode (unchanged)
```css
.sunny-writing-workspace {
  --writing-page-bg: #f8fafc;
  --writing-card-bg: #ffffff;
  --writing-border: #e5e7eb;
  --writing-text: #0f172a;
  --writing-muted: #64748b;
  --writing-accent: #2563eb;
  --writing-active-bg: #eff6ff;
  --writing-rail-bg: #ffffff;
  --writing-panel-bg: #ffffff;
  --writing-control-bg: #ffffff;
  --writing-rule: var(--writing-border);
  --writing-hover: color-mix(in srgb, var(--writing-text) 5%, transparent);
  --writing-active: var(--writing-active-bg);
  --writing-active-text: var(--writing-accent);
  --writing-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
```

### Dark Mode (complete replacement)
```css
html[data-theme="dark"] .sunny-writing-workspace {
  --writing-page-bg: #0f172a;       /* app background */
  --writing-card-bg: #1e293b;       /* card / floating surfaces */
  --writing-border: #334155;        /* default border */
  --writing-text: #f8fafc;          /* primary text */
  --writing-muted: #64748b;         /* muted / secondary text */
  --writing-accent: #3b82f6;        /* accent blue */
  --writing-active-bg: rgba(59,130,246,0.14);  /* accent soft */
  --writing-rail-bg: #111827;       /* sidebar / library background */
  --writing-panel-bg: #111827;      /* right panel background */
  --writing-control-bg: #0f172a;    /* input / control background */
  --writing-rule: #1f2937;          /* subtle border */
  --writing-hover: #273449;         /* hover background */
  --writing-active: rgba(59,130,246,0.14);
  --writing-active-text: #93c5fd;
  --writing-shadow: 0 12px 30px rgba(0,0,0,0.25);
  background: #0f172a;
}
```

---

## Section-by-Section Design

### 1. Toolbar (`.sunny-writing-editor-topbar`)

**Current problem:** Pure white background in light mode, jarring in dark mode.

**Dark mode:**
```css
html[data-theme="dark"] .sunny-writing-editor-topbar {
  background: #1e293b;
  border-bottom: 1px solid #1f2937;
}
```

**Toolbar buttons** (BubbleMenu, SlashMenu, FloatingMenu):
```css
html[data-theme="dark"] .sunny-writing-workspace .sunny-rich-editor-floating-menu button,
html[data-theme="dark"] .sunny-writing-workspace .sunny-rich-editor-slash-menu button,
html[data-theme="dark"] .sunny-writing-workspace .sunny-rich-editor-image-action {
  background: #1e293b;
  border-color: #334155;
  color: #cbd5e1;
}
/* hover */
  background: #334155;
/* active/pressed */
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
```

Editor toolbar should be a floating pill: `border-radius: 16px`, `box-shadow: 0 12px 30px rgba(0,0,0,0.25)`.

### 2. Library Panel (`.sunny-writing-library`)

**Background:** `#111827`, border-right: `1px solid #1f2937`

**Search input:**
```css
html[data-theme="dark"] .sunny-writing-library-search input {
  background: #0f172a;
  border-color: #334155;
  color: #f8fafc;
}
```

**Filter buttons:**
```css
html[data-theme="dark"] .sunny-writing-filter {
  background: transparent;
  color: #94a3b8;
}
html[data-theme="dark"] .sunny-writing-filter.is-active {
  background: rgba(59,130,246,0.14);
  color: #93c5fd;
  border-color: rgba(96,165,250,0.3);
}
```

**Document rows:**
```css
html[data-theme="dark"] .sunny-writing-document-row {
  background: transparent;
}
html[data-theme="dark"] .sunny-writing-document-row:hover {
  background: #1e293b;
}
html[data-theme="dark"] .sunny-writing-document-row.is-active {
  background: #172554;
  border-color: rgba(96,165,250,0.5);
}
/* Titles: #f8fafc, meta: #94a3b8 */
```

### 3. Editor Pane (`.sunny-writing-editor-pane`)

**Background:** `#0b1120` (slightly darker than sidebar for depth)

**Content container:** max-width 780px, centered via `margin-inline: auto`

**Title input:**
```css
html[data-theme="dark"] .sunny-writing-title-input {
  color: #f8fafc;
  font-size: 2.5rem;
  font-weight: 700;
}
```

**Summary input:**
```css
html[data-theme="dark"] .sunny-writing-summary-input {
  color: #e5e7eb;
  border-color: #1f2937;
}
html[data-theme="dark"] .sunny-writing-summary-input::placeholder {
  color: #64748b;
}
```

**Rich editor body:**
```css
html[data-theme="dark"] .sunny-writing-workspace .sunny-rich-editor-content {
  color: #e5e7eb;
  font-size: 16px;
  line-height: 1.7;
}
html[data-theme="dark"] .sunny-writing-workspace .sunny-rich-editor-content h1 { color: #f8fafc; }
html[data-theme="dark"] .sunny-writing-workspace .sunny-rich-editor-content h2 { color: #f1f5f9; }
html[data-theme="dark"] .sunny-writing-workspace .sunny-rich-editor-content h3 { color: #e2e8f0; }

/* Placeholder */
.ProseMirror p.is-editor-empty:first-child::before {
  color: #64748b;
  content: "开始写作，或输入 / 插入内容块";
}
```

### 4. Meta Panel (`.sunny-writing-meta-panel`)

**Background:** `#111827`, border-left: `1px solid #1f2937`

**Section headers:**
```css
html[data-theme="dark"] .sunny-writing-meta-head h3,
html[data-theme="dark"] .sunny-writing-side-section h3 {
  color: #e5e7eb;
  font-size: 13px;
  font-weight: 600;
}
```

**Inputs/selects:**
```css
html[data-theme="dark"] .sunny-writing-field input,
html[data-theme="dark"] .sunny-writing-field select,
html[data-theme="dark"] .sunny-writing-field textarea {
  background: #0f172a;
  border-color: #334155;
  color: #f8fafc;
}
html[data-theme="dark"] .sunny-writing-field input:focus,
html[data-theme="dark"] .sunny-writing-field select:focus,
html[data-theme="dark"] .sunny-writing-field textarea:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
```

**Section spacing:** 24px gap, light dividers (`border-bottom: 1px solid #1f2937`)

### 5. Topbar Actions

**Save state indicator:**
```css
html[data-theme="dark"] .sunny-writing-save-state[data-state="saved"] {
  color: #22c55e;
  font-size: 12px;
}
```

**Primary button (Publish):**
```css
html[data-theme="dark"] .sunny-writing-primary-button {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}
html[data-theme="dark"] .sunny-writing-primary-button:hover {
  background: #2563eb;
}
```

**Secondary buttons (Focus/Preview/Save):**
```css
html[data-theme="dark"] .sunny-writing-secondary-button {
  background: transparent;
  border-color: #334155;
  color: #cbd5e1;
}
html[data-theme="dark"] .sunny-writing-secondary-button:hover {
  background: #1e293b;
  border-color: #475569;
}
```

### 6. Border Reduction

Replace high-contrast borders with background layering:
- Library/Meta sidebars: `#111827` backgrounds vs Editor: `#0b1120` — the 4-shade difference creates natural separation
- Vertical dividers: `1px solid #1f2937` (subtle) instead of bright borders
- Card separation: use `gap` and negative space rather than visible borders where possible

### 7. Preview Pane

```css
html[data-theme="dark"] .sunny-writing-preview-pane {
  background: #0b1120;
}
html[data-theme="dark"] .sunny-writing-preview-article h1 { color: #f8fafc; }
html[data-theme="dark"] .sunny-writing-preview-rich { color: #e5e7eb; }
html[data-theme="dark"] .sunny-writing-preview-summary { color: #94a3b8; }
html[data-theme="dark"] .sunny-writing-preview-rich blockquote {
  border-left-color: #334155;
  color: #94a3b8;
}
```

### 8. Misc Dark Overrides

- `sunny-writing-empty`: color `#64748b`
- `sunny-writing-eyebrow`: color `#64748b`
- `sunny-writing-library-count`: bg `#1e293b`, border `#334155`
- `sunny-writing-admin-link`: bg `#1e293b`, border `#334155`, hover bg `#273449`
- `sunny-writing-outline-list a`: color `#94a3b8`, hover `#93c5fd`
- `sunny-writing-publish-head span`: use token backgrounds scaled for dark
- `sunny-writing-switch-actions`: bg `#1e293b`, text `#cbd5e1`
- Code blocks in editor: pre bg `#1e293b`, inline code `rgba(255,255,255,0.06)`
- Blockquote: left-border `#3b82f6`, text `#94a3b8`
- Tiptap placeholder: `color: #475569`

---

## Scope

| Area | Type |
|------|------|
| Dark theme tokens | Complete replacement of `--writing-*` vars |
| Toolbar (editor floating/bubble/slash menu) | Dark overrides |
| Library (sidebar, search, filters, document rows) | Dark overrides |
| Editor (title, summary, body, headings, placeholder) | Dark overrides |
| Meta panel (fields, sections, inputs) | Dark overrides |
| Topbar (save state, buttons, focus title) | Dark overrides |
| Preview pane | Dark overrides |
| Borders and separators | Soften throughout |
| Light mode | NO changes |

**What stays unchanged:** All JSX/component files. Light mode CSS. Responsive breakpoints. Grid layout structure.
