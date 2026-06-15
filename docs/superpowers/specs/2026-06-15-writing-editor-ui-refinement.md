# Writing Editor UI Refinement

> 把当前写作编辑区优化成更接近成熟内容产品的体验：标题自然、摘要自然、工具栏轻量、AI 内嵌、正文入口清晰、属性弱化、整体简洁优雅。

## Prerequisites

- `docs/superpowers/specs/2026-06-15-writing-dark-mode-redesign.md` — 暗色模式 token 体系（已完成）
- `docs/superpowers/specs/2026-06-15-writing-ux-enhancements.md` — 布局/交互增强（大部分已完成，本次在其基础上继续精炼）

## Problem Summary

当前写作编辑区存在 6 个主要问题：

1. 主编辑区顶部信息过多（标题 + 生成标题 + 摘要 + 自动生成摘要 + 工具栏），堆叠过高
2. "生成标题"和"自动生成摘要"太像表单控件
3. 工具栏混有写作格式工具和 AI 辅助动作，层级混乱
4. 正文入口不够自然，编辑器有"后台编辑器"感
5. 右侧属性栏偏重，像后台配置面板
6. 整体还不够克制，距离"简洁优雅"差一步

## Design Principles

1. **视觉层级**: 第一眼标题 → 第二眼正文 → 第三眼工具和属性
2. **标题正文为主角**: 标题 48px/700，正文最大宽度 780px 居中
3. **AI 不抢占主线**: 所有 AI 入口使用低透明度 ghost 样式，不形成大块表单
4. **像写作产品**: 不用过多边框、不堆叠表单控件、不让属性面板与正文竞争注意力

---

## Scope & Files

### Files to Modify

| File | Scope | Priority |
|------|-------|----------|
| `src/components/dashboard/icons.tsx` | 新增 `sparkle`、`chevronDown` 图标 | P0 |
| `src/components/dashboard/writing/WritingEditorPane.tsx` | 标题行/摘要行重组、顶栏按钮优化 | P0 |
| `src/components/content-editor/EditorToolbar.tsx` | AI 下拉菜单、布局重组 | P0 |
| `src/components/dashboard/writing/WritingMetaPanel.tsx` | 折叠默认状态、chip 标签、空值展示 | P0 |
| `src/components/dashboard/writing/WritingInspectorSection.tsx` | summary 样式 | P0 |
| `src/app/styles/sunny-dashboard-writing.css` | 大量样式调整 | P0/P1 |

### Files NOT Modified

- `WritingWorkspace.tsx` — 布局逻辑不变，仅 CSS 调整
- `WritingLibrary.tsx` — 列表结构不变，仅 CSS 调整
- `ContentEditor.tsx` — Tiptap 集成不变，仅 placeholder 颜色 CSS 调整
- `WritingDocumentRow.tsx` — 结构不变，仅 CSS 调整

---

## Detailed Design

### 0. Icons Extension (`icons.tsx`)

两个新图标，遵循现有风格（20x20 viewBox, 1.45px stroke, currentColor）：

**`sparkle`** — AI 辅助操作的视觉符号

```
path: 中心星形 + 四角光芒，约 14x14 范围内
M10 2.5c.3 1.5.6 2.5 1.8 3.7C13 7.4 14 7.7 15.5 8c-1.5.3-2.5.6-3.7 1.8C10.6 11 10.3 12 10 13.5c-.3-1.5-.6-2.5-1.8-3.7C7 8.6 6 8.3 4.5 8c1.5-.3 2.5-.6 3.7-1.8C9.4 5 9.7 4 10 2.5Z
```

**`chevronDown`** — 下拉箭头，展开/折叠指示

```
path: 向下 V 形
M5.5 7.5 10 13l4.5-5.5
```

使用方式: `<DashboardIcon name="sparkle" />` / `<DashboardIcon name="chevronDown" />`

**原则**: 全局不使用 emoji，所有图标均来自本地 SVG 库。

---

### 1. Title Row (P0)

**Before:**
```
.sunny-writing-title-row (display: grid)
  <input class="sunny-writing-title-input" placeholder="输入标题..." />
  <button>生成标题</button>     ← 独占一行，像表单
```

**After:**
```
.sunny-writing-title-row (display: flex; align-items: center)
  [input: flex 1, 48px/700]    [button: ghost pill, opacity 0.55]
```

- 标题字号从 `clamp(2.25rem, 4vw, 2.75rem)` 提升到 `clamp(2.5rem, 4.5vw, 3rem)`，字重 700
- placeholder 颜色 `#475569`（暗色）
- "生成标题"按钮：
  - 纯文字 ghost pill，无图标（克制原则）
  - 默认 `opacity: 0.55`，标题行 hover 时 `opacity: 1`
  - 标题为空时 `opacity: 0.72`（稍微明显，引导生成）
  - hover 时出现极淡背景（`var(--writing-hover)`）
  - 圆角 pill（border-radius: 999px）
  - 无边框
- 窄屏（<820px）：按钮移到标题下方，`align-self: flex-end`

**CSS changes:**
```css
.sunny-writing-title-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}
.sunny-writing-title-input {
  flex: 1;
  font-size: clamp(2.5rem, 4.5vw, 3rem);
  font-weight: 700;
}
/* ghost pill for "生成标题" button */
.sunny-writing-title-ai-ghost {
  opacity: 0.55;
  transition: opacity 180ms ease, background 180ms ease;
}
.sunny-writing-title-row:hover .sunny-writing-title-ai-ghost,
.sunny-writing-title-ai-ghost:hover {
  opacity: 1;
}
/* more visible when title is empty */
.sunny-writing-title-ai-ghost[data-title-empty="true"] {
  opacity: 0.72;
}
```

---

### 2. Summary Row (P0)

**Before:**
```
.sunny-writing-summary-row (display: grid)
  <textarea placeholder="可选：写一句摘要..." />   ← 有底部边框
  <button>自动生成摘要</button>                      ← 独占一行
```

**After:**
```
.sunny-writing-summary-row (display: flex; align-items: center)
  [textarea: flex 1, no border]   [sparkle icon button: 24x24, opacity 0 on idle]
```

- textarea 去掉 `border-bottom`，改为完全透明背景
- 仅 hover/focus 时显示底部微妙底线（`border-bottom: 1px solid var(--writing-rule)`）
- 占位文案 "添加一句简短摘要..."，颜色 `#64748b`
- 右侧 AI 按钮：
  - 24x24px 圆形 ghost 按钮
  - 内含 `<DashboardIcon name="sparkle" />`（14px）
  - 默认 `opacity: 0`，摘要行 hover 时 `opacity: 0.5`
  - hover 按钮时 `opacity: 1` + 浅色背景
  - title="自动生成摘要"
- 摘要行整体比标题弱：字号 0.9375rem，颜色 `var(--writing-muted)`

**CSS changes:**
```css
.sunny-writing-summary-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 1.25rem;
}
.sunny-writing-summary-input {
  flex: 1;
  border: 0;
  background: transparent;
  /* no default border-bottom */
}
.sunny-writing-summary-input:hover,
.sunny-writing-summary-input:focus {
  border-bottom: 1px solid var(--writing-rule);
  outline: none;
}
```

---

### 3. Toolbar (P0)

**Before:** 所有按钮平铺，AI 按钮在右侧 `.sunny-rich-editor-ai-actions` 内联排列。

**After:** 三组格式工具 + 右侧 AI 下拉菜单

```
┌──────────────────────────────────────────────────────────────┐
│ [正文 ▾] H1 H2 H3  │  B I Link  │  列表 引用 +插入  │  AI ▾ │
└──────────────────────────────────────────────────────────────┘
```

**布局重组:**
- 组 1: 正文（select） / H1 / H2 / H3
- 分隔线: 1px × 1.25rem，`var(--writing-rule)`
- 组 2: B / I / Link
- 分隔线
- 组 3: 列表 / 引用 / +插入（dropdown）
- AI 按钮: 最右侧，`margin-left: auto`

**AI 下拉菜单:**
- 按钮文案 "AI"，附带 `<DashboardIcon name="chevronDown" />`（10px，展开时旋转 180deg）
- ghost 暗色样式（与工具栏按钮一致）
- 下拉菜单内容（使用现有 `.sunny-rich-editor-insert-menu` 样式）：
  - 续写
  - 提取标签
  - 生成大纲
  - 生成摘要
  - 润色选中
- 下拉菜单使用 click 切换（与 +插入 逻辑一致）

**工具栏整体:**
- 保持 `border-radius: 12px`
- 保持暗色浮层感
- 按钮间距从 `gap: 0.25rem` 缩小到 `gap: 0.15rem`
- 按钮 `min-height: 1.75rem`（从 2rem 减小）
- 分隔线: `width: 1px; height: 1.25rem; background: var(--writing-rule); margin-inline: 0.15rem`

**组件改动 (`EditorToolbar.tsx`):**
- 移除 `onAiAction` prop 中的单独 action 类型
- 新增 `aiMenuOpen` state + 下拉菜单渲染
- "插入" dropdown 保持不变
- AI dropdown 复用同样的 dropdown 模式

---

### 4. Body Entry (P0)

**Changes:**

- Placeholder 颜色覆盖: `#64748b`（在 CSS 中用 `::placeholder` 和 ProseMirror placeholder selector）
- 正文内容最大宽度: `min(100%, 780px)`，居中
- 垂直间距节奏（editor canvas 内）：
  - 标题 → 摘要: 0.75rem
  - 摘要 → 工具栏: 1.25rem
  - 工具栏 → 正文: 1rem
  - 正文段落: 保持 1.05rem
- Canvas 顶部 padding: 从 `clamp(2rem, 5vh, 3.4rem)` 调整为 `clamp(1.5rem, 4vh, 2.8rem)`
- Content width: 从 `clamp(720px, 80%, 860px)` 调整为 `min(100%, 780px)`

**CSS changes:**
```css
/* placeholder color */
.sunny-writing-workspace .ProseMirror p.is-editor-empty:first-child::before {
  color: #64748b;
}
/* content max-width */
.sunny-writing-editor-canvas > ... {
  width: min(100%, 780px);
}
/* spacing adjustments */
.sunny-writing-title-row { margin-bottom: 0.75rem; }
.sunny-writing-summary-row { margin-bottom: 1.25rem; }
.sunny-writing-tiptap-editor { margin-top: 1rem; }
```

---

### 5. Right Inspector Panel (P0/P1)

**Fold States (P0):**

| Section | `defaultOpen` |
|---------|:---:|
| 基本信息 | `true` |
| 发布设置 | `true` |
| 内容结构 | `false` |
| 高级设置 | `false` (already `false`) |

**Summary Style Optimization (P0):**
- `list-style: none` 去掉浏览器默认三角
- 自定义折叠指示器: `<DashboardIcon name="chevronDown" />` 12px，展开时 0deg，折叠时 -90deg（CSS transform）
- 增加 hover 背景 `border-radius: 4px; padding: 2px 4px`
- 字号 0.8125rem，字重 600

**Component change (`WritingInspectorSection.tsx`):**
```tsx
<details className="..." open={defaultOpen}>
  <summary>
    <DashboardIcon name="chevronDown" />
    <span>{title}</span>
  </summary>
  ...
</details>
```

**Chip-style Tags (P1):**

标签字段（`posts` collection）从 `<input>` 改为 chip 列表：
- 解析 `draft.metadata.tags` 字符串（逗号分隔）
- 显示为 flex-wrap chip 列表
- 每个 chip: `var(--writing-hover)` 背景，圆角 8px，padding 0.15rem 0.5rem，字号 0.75rem
- 末尾 "+" 按钮，点击弹出 inline input 添加新 tag
- 点击 chip 上的 × 可删除

**Empty Value Display (P1):**
- 空字段显示弱文本而非空白: "暂无所属层级"、"未设置"
- 颜色 `var(--writing-muted)`，opacity 0.55，font-style: italic

**Panel Width (P1):**
- 从 300px 缩小到 280px（grid-template-columns 调整）
- 分组间距更紧凑: gap: 0.5rem

---

### 6. Top Operations Bar (P1)

**Before:** 5 个元素平铺: 已保存 | 专注 | 预览 | 保存 | 发布

**After:** 精简层级

```
[breadcrumb]          已保存    预览  专注    [发布]
                       ^muted    ^ghost       ^primary CTA
```

- "发布": 唯一强 CTA，保持 `sunny-writing-primary-button`
- "预览" / "专注": `sunny-writing-secondary-button`（透明 bg + border）
- "已保存": 纯文本，颜色 `var(--writing-muted)`，font-size 0.75rem
- "保存"按钮: 仅在 `isDirty` 时显示（`saveState !== 'saved'`），其他时候隐藏（因为有自动保存）
- 按钮间距: `gap: 0.5rem`

**Component change (`WritingEditorPane.tsx`):**
```tsx
{saveState === 'saved' && !isDirty ? null : (
  <button className="sunny-writing-secondary-button" ...>保存</button>
)}
```

---

### 7. Left Library List (P1)

**CSS-only changes (no component changes needed):**

- 当前选中文档卡片背景: 从 `var(--writing-active-bg)` 改为更轻的 `color-mix(in srgb, var(--writing-accent) 6%, transparent)`
- 暗色下: `rgba(59, 130, 246, 0.08)`（比当前的 0.14 轻很多）
- 文档标题: `font-weight: 650`（当前未指定，继承加粗），颜色更深
- 类型标签 "文章/动态": font-size 从 0.75rem 缩小到 0.6875rem
- 状态 "草稿": 同上
- 列表项 padding: 从 `0.58rem 0.62rem` 缩小到 `0.45rem 0.55rem`
- 列表 gap: 从 `0.32rem` 缩小到 `0.2rem`
- 卡片 border-radius: 从 12px 缩小到 10px

---

### 8. Vertical Rhythm Summary

从上到下间距：

```
Canvas top padding:     clamp(1.5rem, 4vh, 2.8rem)
Title
   ↓ 0.75rem
Summary
   ↓ 1.25rem
Toolbar
   ↓ 1rem
Body (placeholder "开始写作，或输入 / 插入内容块")
   ↓ (paragraph gap 1.05rem)
...
Stats
   ↓ padding-bottom 2rem
Canvas bottom
```

---

## Visual Reference

**目标美学:**
- 暗色沉浸（`#0b1120` 编辑器背景）
- 标题 48px/700 成为绝对视觉中心
- AI 功能用低透明度 ghost 样式内嵌，不抢占注意力
- 右侧面板 280px，视觉弱于主编辑区
- 左侧列表更紧凑轻量
- 整体 fewer borders, more breathing room

**禁止:**
- Emoji 图标 → 全部替换为 `<DashboardIcon>`
- 表单堆叠感 → AI 按钮全部改为 ghost / inline
- 过重边框 → 摘要去边框、分隔线替代实线

---

## Priority Summary

### P0 (This Pass)
1. 标题行改为 flex + ghost pill 按钮
2. 摘要行改为 flex + hover 出现 sparkle 图标按钮
3. 工具栏 AI 动作收纳到 AI 下拉菜单
4. 正文 placeholder 颜色 + 间距优化
5. 右侧"内容结构""高级设置"默认折叠 + summary 样式优化

### P1 (This Pass)
6. 标题/摘要/正文垂直间距节奏
7. 左侧列表卡片轻量化（仅 CSS）
8. 顶部按钮主次优化
9. 标签输入改为 chip 风格
10. 属性栏宽度缩减到 280px + 空值展示

### Out of Scope
- 全局导航折叠（已在 UX enhancements spec）
- 新的 Slash Command 功能
- 编辑器核心行为变更
