# 全站前端风格统一 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以首页风格为标杆，统一全站前端视觉风格，包括重写 Admin 主题和逐页替换内联样式。

**Architecture:** 底层 token 共享于 `globals.css` → `admin-theme.css` 完全重写为引用这些 token → 各页面 TSX 中的内联 Tailwind 色值替换为语义化 CSS 类。纯 CSS/TSX 变更，不涉及后端逻辑。

**Tech Stack:** Tailwind CSS v4, CSS custom properties, Payload CMS admin theming

---

### Task 1: 重写 admin-theme.css — Token 与基础面板

**Files:**
- Modify: `src/app/(payload)/admin-theme.css` (完整重写)

- [ ] **Step 1: 写入新的 admin-theme.css**

将整个文件替换为以下内容：

```css
@layer payload {
  :root,
  html[data-theme="light"] {
    --theme-border-color: var(--border);
    --theme-input-bg: var(--surface);
    --theme-bg: transparent;
    --theme-text: var(--foreground);
    --theme-overlay: color-mix(in srgb, var(--foreground) 28%, transparent);
  }

  html[data-theme="dark"] {
    --theme-border-color: var(--border);
    --theme-input-bg: var(--surface);
    --theme-bg: transparent;
    --theme-text: var(--foreground);
    --theme-overlay: rgba(0, 0, 0, 0.55);
  }

  html {
    background:
      linear-gradient(135deg, rgba(45, 116, 109, 0.08), transparent 28%),
      linear-gradient(180deg, #f7f9f8 0%, #edf2f4 48%, #e8eeeb 100%);
  }

  html[data-theme="dark"] {
    background:
      linear-gradient(135deg, rgba(102, 185, 173, 0.1), transparent 28%),
      linear-gradient(180deg, #10161a 0%, #0d1317 46%, #090f12 100%);
  }

  body,
  #app {
    background: transparent;
  }

  body {
    color: var(--theme-text);
    font-family: var(--sunny-font-sans);
    font-feature-settings: "kern";
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  code,
  kbd,
  pre,
  samp {
    font-family: var(--sunny-font-mono);
  }

  .app-header,
  .doc-controls,
  .nav,
  .dashboard,
  .collection-list,
  .auth-fields,
  .collection-edit__auth,
  .render-fields,
  .popup__content,
  .drawer__content,
  .list-selection {
    border: 1px solid var(--theme-border-color);
    border-radius: 1rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(255, 252, 246, 0.52)),
      var(--surface);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.32),
      0 8px 24px rgba(64, 42, 16, 0.04);
    backdrop-filter: blur(18px);
  }

  html[data-theme="dark"] .app-header,
  html[data-theme="dark"] .doc-controls,
  html[data-theme="dark"] .nav,
  html[data-theme="dark"] .dashboard,
  html[data-theme="dark"] .collection-list,
  html[data-theme="dark"] .auth-fields,
  html[data-theme="dark"] .collection-edit__auth,
  html[data-theme="dark"] .render-fields,
  html[data-theme="dark"] .popup__content,
  html[data-theme="dark"] .drawer__content,
  html[data-theme="dark"] .list-selection {
    background:
      linear-gradient(180deg, rgba(30, 36, 43, 0.94), rgba(20, 25, 31, 0.98)),
      var(--surface);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 10px 24px rgba(0, 0, 0, 0.22);
  }

  .app-header {
    margin-bottom: 14px;
  }

  .app-header__step-nav-wrapper {
    margin-bottom: 6px;
    opacity: 0.58;
  }

  .app-header__step-nav .step-nav {
    gap: 0.35rem;
  }

  .app-header__step-nav .step-nav,
  .app-header__step-nav .step-nav a,
  .app-header__step-nav .step-nav button,
  .app-header__step-nav .step-nav span {
    font-size: 0.86rem;
    letter-spacing: 0.01em;
  }

  body:has(.collection-list) .app-header__step-nav-wrapper {
    display: none;
  }

  body:has(.collection-list) .app-header {
    margin-bottom: 8px;
  }

  .doc-controls {
    margin-bottom: 16px;
  }

  .collection-list {
    padding-top: 18px;
  }

  .collection-list .list-header {
    margin-top: 2px;
  }
}
```

- [ ] **Step 2: 验证 Admin 页面加载正常**

```bash
echo "Open http://localhost:3000/admin in browser and verify:"
echo "1. No broken styles"
echo "2. Background gradient matches public site"
echo "3. Text colors are readable"
echo "4. Panels have frosted glass effect"
```

- [ ] **Step 3: 提交**

```bash
git add src/app/\(payload\)/admin-theme.css
git commit -m "feat: rewrite admin theme tokens and base panel styles

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Admin 导航样式

**Files:**
- Modify: `src/app/(payload)/admin-theme.css` (追加导航规则)

- [ ] **Step 1: 在 admin-theme.css 的 `@layer payload` 块末尾（`}` 之前）追加导航样式**

```css
  .nav-group {
    border-radius: 0.75rem;
    margin-bottom: 10px;
  }

  .nav-group__toggle {
    border-radius: 0.6rem;
    color: var(--theme-text);
    font-weight: 750;
  }

  .nav-group__label {
    letter-spacing: 0.04em;
  }

  .nav-group__content {
    padding-block: 2px 8px;
  }

  .nav-group__content a {
    border-radius: 0.6rem;
    margin-inline: 4px;
  }

  .nav-group__content a:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .nav a,
  .nav button {
    border-radius: 0.6rem;
  }
```

- [ ] **Step 2: 提交**

```bash
git add src/app/\(payload\)/admin-theme.css
git commit -m "feat: style admin navigation with accent hover and rounded groups

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Admin 按钮和表单样式

**Files:**
- Modify: `src/app/(payload)/admin-theme.css` (追加按钮和表单规则)

- [ ] **Step 1: 在 admin-theme.css 的 `@layer payload` 块末尾追加按钮和表单样式**

```css
  .btn {
    border-radius: 999px;
    font-weight: 600;
  }

  .btn--style-primary {
    border: 0;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
    box-shadow: 0 10px 24px rgba(19, 77, 72, 0.16);
    color: white;
  }

  .btn--style-primary:hover,
  .btn--style-primary:focus-visible {
    box-shadow: 0 14px 30px rgba(19, 77, 72, 0.2);
    transform: translateY(-1px);
  }

  .btn--style-secondary,
  .btn--style-subtle,
  .btn--style-pill,
  .btn--style-dashed {
    border-radius: 999px;
  }

  .btn--style-secondary {
    border: 1px solid var(--theme-border-color);
    background: rgba(255, 255, 255, 0.56);
    color: var(--theme-text);
  }

  html[data-theme="dark"] .btn--style-secondary {
    background: rgba(29, 35, 42, 0.94);
  }

  .btn--style-secondary:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.82);
  }

  html[data-theme="dark"] .btn--style-secondary:hover {
    background: rgba(39, 46, 54, 0.98);
  }

  .field-type input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  .field-type textarea,
  .field-type select,
  .toolbar-input,
  .live-preview-toolbar-controls__size {
    border-radius: 0.75rem;
    border-color: var(--theme-border-color);
    background: var(--theme-input-bg);
    box-shadow: none;
  }

  .field-type input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus,
  .field-type textarea:focus,
  .field-type select:focus {
    border-color: color-mix(in srgb, var(--accent) 48%, var(--theme-border-color));
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent);
    outline: none;
  }

  .render-fields,
  .collection-edit__auth {
    gap: 22px;
    padding-inline: 14px;
    padding-top: 14px;
  }

  .render-fields .field-type,
  .collection-edit__auth .field-type {
    padding-top: 4px;
    margin-bottom: 22px;
  }

  .render-fields .row-field,
  .collection-edit__auth .row-field {
    margin-bottom: 22px;
  }

  .render-fields .field-label,
  .collection-edit__auth .field-label {
    display: block;
    margin-bottom: 12px;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .render-fields .field-label + *,
  .collection-edit__auth .field-label + * {
    margin-top: 2px;
  }

  .render-fields .field-description,
  .collection-edit__auth .field-description {
    margin-top: 8px;
    font-size: 0.86rem;
    line-height: 1.65;
    color: var(--muted);
  }

  .render-fields textarea,
  .collection-edit__auth textarea {
    min-height: 132px;
  }

  .collection-edit .collection-edit__edit-main,
  .collection-edit .collection-edit__sidebar-wrap {
    padding-top: 8px;
  }

  .render-fields > .field-type:first-child,
  .render-fields > .row-field:first-child,
  .collection-edit__auth > .field-type:first-child,
  .collection-edit__auth > .row-field:first-child {
    margin-top: 6px;
  }
```

- [ ] **Step 2: 提交**

```bash
git add src/app/\(payload\)/admin-theme.css
git commit -m "feat: style admin buttons and form fields with unified tokens

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Admin 表格、弹窗和深色模式

**Files:**
- Modify: `src/app/(payload)/admin-theme.css` (追加表格、弹窗规则)

- [ ] **Step 1: 在 admin-theme.css 的 `@layer payload` 块末尾追加剩余样式**

```css
  .table-wrap table,
  .table-wrap thead,
  .table-wrap tbody,
  .table-wrap tr {
    background: transparent;
  }

  .table-wrap th {
    color: var(--muted);
    font-weight: 700;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .table-wrap td,
  .table-wrap th {
    border-color: var(--theme-border-color);
  }

  .table-wrap tbody tr:hover {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .popup__content,
  .drawer__content {
    border-radius: 1rem;
  }

  .popup__header,
  .drawer__header {
    border-bottom: 1px solid var(--theme-border-color);
    font-weight: 700;
  }

  .list-selection {
    border-radius: 0.85rem;
  }

  .dashboard__label {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  ::selection {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
```

- [ ] **Step 2: 提交**

```bash
git add src/app/\(payload\)/admin-theme.css
git commit -m "feat: style admin tables, modals, and selection with unified tokens

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Timeline 页面 — 替换内联样式

**Files:**
- Modify: `src/app/(site)/timeline/page.tsx`

- [ ] **Step 1: 替换 TimelineEventCard 的内联卡片样式**

将第 157-161 行的：
```tsx
    <article
      className={`relative rounded-[1rem] border border-border px-4 py-4 md:px-5 md:py-5 ${
        event.isFeatured ? "bg-white/68 shadow-[inset_3px_0_0_var(--accent)]" : "bg-white/42"
      }`}
    >
```

替换为（`.sunny-card` 已包含 `position:relative`、`border`、`rounded`、`background`、`backdrop-filter`、`box-shadow`）：
```tsx
    <article
      className={`sunny-card px-4 py-4 md:px-5 md:py-5 ${
        event.isFeatured ? "sunny-card-strong shadow-[inset_3px_0_0_var(--accent)]" : ""
      }`}
    >
```

- [ ] **Step 2: 移除 SurfaceCard 上的自定义圆角**

第 226 行的：
```tsx
<SurfaceCard as="section" className="rounded-[1.1rem] md:rounded-[1.25rem]" variant="subtle">
```

替换为（使用 subtle 变体的默认圆角 `rounded-[1.15rem]`）：
```tsx
<SurfaceCard as="section" variant="subtle">
```

- [ ] **Step 3: 提交**

```bash
git add src/app/\(site\)/timeline/page.tsx
git commit -m "feat: replace timeline inline styles with sunny-card semantic classes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Notes 页面 — 清理内联样式

**Files:**
- Modify: `src/app/(site)/notes/page.tsx`

- [ ] **Step 1: 替换 pinned 标签的内联样式**

第 55-57 行的：
```tsx
                      <span className="rounded-full bg-white/70 px-2 py-1 text-accent-strong">
                        {copy.common.pinned}
                      </span>
```

替换为：
```tsx
                      <span className="sunny-badge sunny-badge-accent">
                        {copy.common.pinned}
                      </span>
```

- [ ] **Step 2: 提交**

```bash
git add src/app/\(site\)/notes/page.tsx
git commit -m "feat: replace notes page inline badge with sunny-badge class

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Updates + LivePreview 页面 — 清理内联样式

**Files:**
- Modify: `src/app/(site)/updates/page.tsx`
- Modify: `src/components/public/DocumentLivePreview.tsx`

- [ ] **Step 1: 检查 Updates 页面**

`updates/page.tsx` 第 36 行已使用 `sunny-card`，无需修改。跳过此文件。

- [ ] **Step 2: 检查 LivePreview 页面**

`DocumentLivePreview.tsx` 已使用 `sunny-panel`、`sunny-card`、`sunny-card-strong`、`sunny-badge`、`sunny-display`、`sunny-kicker`、`sunny-button-secondary`。无需修改。

- [ ] **Step 3: 提交（空提交跳过）**

两个文件均已使用语义类，无需修改，跳过提交。

---

### Task 8: Dashboard 微调

**Files:**
- Modify: `src/app/(site)/dashboard/page.tsx`

- [ ] **Step 1: 检查 Dashboard 页面**

Dashboard 已使用 `sunny-agent-*` 系列类，引用了 `globals.css` 中的所有 token。当前代码已是目标状态。Agent workspace 的 rail 侧栏和 topbar 的透明度层次已在 `globals.css` 的 `--surface` 变量中定义，无需额外调整。

- [ ] **Step 2: 跳过提交**

无修改。

---

### Task 9: 深色模式验证

**Files:**
- 验证所有已修改文件

- [ ] **Step 1: 逐文件检查深色模式覆盖**

确认以下选择器在修改后仍有对应的 `html[data-theme="dark"]` 覆盖：

- `admin-theme.css` — 每个 light 面板规则都已配 dark 覆盖 ✓ (Task 1 中已写入)
- `timeline/page.tsx` — `.sunny-card` 的 dark 覆盖在 `globals.css:207-211` 已有 ✓
- `notes/page.tsx` — `.sunny-badge-accent` 的 dark 覆盖在 `globals.css:1754-1756` 已有 ✓

- [ ] **Step 2: 视觉验证（手动）**

```bash
echo "在浏览器中执行以下检查："
echo "1. Admin 面板 — 切换到深色模式，确认磨砂玻璃层次"
echo "2. Timeline 页面 — 深色模式下卡片边框和阴影"
echo "3. Notes 页面 — 深色模式下标签颜色"
echo "4. Dashboard — 深色模式下 agent workspace 面板"
```

- [ ] **Step 3: 提交（如有修正则提交，否则跳过）**

```bash
# 如果验证通过无修改，跳过此步骤
```
```

