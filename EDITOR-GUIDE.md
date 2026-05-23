# SunnyPanel 写作编辑器改造指南（Vibe Coding）

> 本文档是 **Markdown 所见即所得写作体验** 的总体指导文件。目标是：在 Payload 后台实现接近 **Typora / Obsidian / Outline** 的舒适写作，并保证 **后台编辑、Live Preview、公开站点** 三者视觉与结构一致。
>
> **本文档适合作为 Vibe Coding 的上下文输入**——AI 编码助手应优先理解设计意图与阶段边界，再改代码；不要跳过迁移与渲染统一步骤。

---

## 1. 产品目标

### 1.1 要达成什么

| 目标 | 说明 |
|------|------|
| **单栏所见即所得** | 写作时直接看到标题、列表、引用、代码块、图片，而不是「左侧源码 + 右侧预览」 |
| **Markdown 习惯** | 支持 `#`、`**`、`-`、`>`、`` ` ``、粘贴 Markdown、快捷键；可选源码模式 |
| **写作 = 展示** | Admin 编辑区、Live Preview、博客/页面公开路由使用 **同一套渲染与 CSS** |
| **媒体一体** | 插图走 Payload `media`，不写死外链（除非用户主动粘贴 URL） |
| **迁移可接受** | 现有 Lexical JSON 可一次性转为 Markdown；不保留双格式长期并存 |

### 1.2 非目标（本阶段不做）

- Obsidian 双链 `[[wiki]]`、图谱、插件生态
- 多人协同编辑、评论、版本树 UI
- 全文搜索引擎替换（仍可后续接 Agent / 命令面板）
- 离线优先 / 本地 vault 同步（可另开项目）

### 1.3 对标产品 → 技术映射

| 产品 | 用户期望 | SunnyPanel 实现 |
|------|----------|-----------------|
| **Typora** | 输入即排版、无分屏 | MDXEditor 富文本模式 + `sunny-prose` 套在可编辑区 |
| **Obsidian** | Markdown 真相源、可粘贴 | 库字段存 **Markdown 字符串**；导入脚本支持 Lexical→MD |
| **Outline** | `/` 命令、块感、结构化 | MDXEditor 工具栏 + 标题/列表/引用块；可选 callout 语法 |

---

## 2. 架构选型（已定）

### 2.1 核心决策

```
存储：Markdown 纯文本（textarea 或 code 字段，推荐 textarea + maxLength 不设限）
编辑：@mdxeditor/editor（Payload 自定义 Field，仅 Admin 客户端）
展示：共享 MarkdownContent + sunny-prose（站点 + Preview + 可选 Admin 只读）
图片：MDXEditor imagePlugin → 上传到 Payload Media → 插入 ![](url) 或约定语法
迁移：convertLexicalToMarkdown（存量） + 更新 onboarding 种子为 .md
```

**不采用**「继续 Lexical 存库 + 仅加 Markdown 侧栏」作为主方案——你已明确不在意迁移成本；Markdown 存库 + 统一渲染器才是 **长期一致性与 Agent 可读性** 最优解。

### 2.2 与现有栈的关系

| 现状 | 改造后 |
|------|--------|
| `Post.content` / `Page.content` → `richText` (Lexical JSON) | `type: "textarea"` 或 `code` + `contentFormat: "markdown"` 元数据 |
| `RichTextContent` + `@payloadcms/richtext-lexical/react` | `MarkdownContent` + MDXEditor 只读 **或** `react-markdown`（必须与 Admin 共用 CSS token） |
| `extractLexicalPlainText` 估阅读时间 | `extractMarkdownPlainText`（去 MD 语法） |
| `buildEditorState` 种子 | 纯 Markdown 字符串种子 |
| `payload.config.ts` 全局 `lexicalEditor()` | 长文集合不再用 Lexical；短字段可保留默认或不用 |

### 2.3 一致性原则（违反即视为 Bug）

1. **单一 CSS 入口**：`SUNNY_PROSE_CLASS` 常量，Admin 与 `(site)` 必须引用同一字符串。
2. **单一渲染实现**：优先 **MDXEditor `readOnly`** 渲染已发布内容；若用 `react-markdown`，Admin 必须用同一组件做 Preview，禁止 Admin 一套、站点另一套。
3. **单一上传路径**：插图只通过 `uploadImage` 插件走 Media API，保证迁移后图片 ID 可解析。
4. **暗色模式**：`html[data-theme="dark"]` 下 prose 变量与 Admin 主题同步（复用 `admin-theme.css` / `SiteThemeProvider` 策略）。

---

## 3. 目标目录结构（实施后）

```text
src/
  components/
    editor/
      MarkdownEditorField.tsx      # Payload 自定义 Field（client）
      MarkdownContent.tsx          # 站点 / Preview 展示（可 server wrapper）
      editor-plugins.ts            # 工具栏、插件集合、upload 配置
      constants.ts                 # SUNNY_PROSE_CLASS、默认空文档
  lib/
    markdown/
      plain-text.ts                # 阅读时长、摘要提取
      migrate-lexical.ts           # Lexical JSON → MD（单篇 + 批量）
      media-upload.ts              # 供 imagePlugin 调用的上传
  app/
    styles/
      sunny-markdown.css           # 编辑区与展示共用（或合并进 sunny-ui.css）
  collections/
    Post.ts                        # content → markdown 字段
    Page.ts
    Note.ts                        # 可选：与 Post 同编辑器、精简工具栏
    Update.ts
  scripts/
    migrate-lexical-to-markdown.mjs
```

**Payload importMap**：`payload generate:importmap` 仅生成内置功能的条目，不包含自定义组件。自定义 Field 组件需**手动**在 `src/app/(payload)/admin/importMap.js` 中添加 import 语句与映射条目。

---

## 4. 数据模型变更

### 4.1 字段设计（推荐）

> **注意**：默认 `textarea` 在数据库中映射为 `text` 类型（约 65KB 上限）。若文章较长，可通过 `admin.maxLength` 显式控制或让 Payload 自动使用更大的列类型（具体取决于数据库适配器）。PostgreSQL 适配器中省略 `maxLength` 通常映射为 `text`（无界），但建议按实际情况验证。

```typescript
// Post.ts / Page.ts 示例
{
  name: "content",
  type: "textarea",
  label: "正文",
  required: true,
  admin: {
    description: "支持 Markdown。所见即所得编辑。",
    components: {
      Field: "@/components/editor/MarkdownEditorField#MarkdownEditorField",
    },
  },
},
{
  name: "contentFormat",
  type: "select",
  defaultValue: "markdown",
  options: [
    { label: "Markdown", value: "markdown" },
    { label: "Legacy Lexical", value: "lexical" }, // 迁移期只读，迁移完可删
  ],
  admin: {
    position: "sidebar",
    readOnly: true,
  },
},
```

### 4.2 受影响的集合

| 集合 | 字段 | 优先级 |
|------|------|--------|
| `posts` | `content` | P0 |
| `pages` | `content` | P0 |
| `notes` | `content` | P1（从 textarea 升级为同一编辑器，工具栏精简） |
| `updates` | `content` | P1 |
| `plan-reviews` 等 | 若有 richText | P2 按需 |

### 4.3 迁移标记

- 迁移脚本写入 `contentFormat: "markdown"`。
- 迁移失败条目保留 `lexical` 并打日志，禁止静默丢内容。

---

## 5. 分阶段实施（Vibe Coding 按序执行）

> **规则**：完成上一阶段验收清单前，不要启动下一阶段；每阶段结束运行 `npm run generate:types`、`npx tsc --noEmit`、`npm run build`。

### Phase 0 — 依赖与样式基线

**目标**：装上编辑器包，抽出共用 prose，不破坏现有页面。

**任务**：

1. 安装依赖：
   ```bash
   npm install @mdxeditor/editor
   ```
   **重要**：MDXEditor v3 官方仅声明 React 18 兼容。若当前项目已使用 React 19（`^3.83.0` 的 Payload 依赖 React 19 RC），安装后务必跑 `npm run build` 验证。若出现类型错误或运行时问题，可能需要：
   - 锁定兼容版本（如 `@mdxeditor/editor@^2`，其内部编辑器与 React 版本解耦更宽松）
   - 或切换到 `@uiw/react-md-editor` / Toast UI Editor 作为备选（仍保持 Markdown 存库架构不变）
2. 新增 `src/components/editor/constants.ts`：
   ```typescript
   export const SUNNY_PROSE_CLASS =
     "sunny-prose prose prose-zinc max-w-none prose-headings:font-semibold prose-a:text-accent-strong";
   ```
3. 新增 `src/app/styles/sunny-markdown.css`（或并入 `sunny-ui.css`）：编辑区 `.mdxeditor` 与 `.sunny-prose` 共用变量；对齐现有 `sunny-agent.css` 中 `.sunny-prose` 规则。
4. 在 `src/app/(payload)/layout.tsx` 或 admin 入口 **仅 client 侧** 引入 MDXEditor 默认样式 + `sunny-markdown.css`。

**验收**：

- [ ] 项目可 build
- [ ] 现有 `RichTextContent` 页面仍可访问（尚未切换集合）

---

### Phase 1 — 展示组件 `MarkdownContent`

**目标**：站点可先渲染 Markdown（用于新文章或 feature flag）。

**任务**：

1. 实现 `MarkdownContent.tsx`：
   - `markdown: string`
   - 使用 MDXEditor `readOnly` + `markdown` prop，或 `react-markdown` + `remark-gfm`
   - 根节点 `className={SUNNY_PROSE_CLASS}`
2. 实现 `src/lib/markdown/plain-text.ts`：`stripMarkdownForExcerpt`、`estimateReadingMinutes`。
3. 在 **一条测试路由** 或 Story 页验证 MD 样例（标题、列表、代码、图片、表格）。

**验收**：

- [ ] 同一份 MD 在浅色/深色下可读
- [ ] 与 `blog/[slug]` 布局并排对比，行宽、字号无明显漂移

---

### Phase 2 — Payload 自定义字段 `MarkdownEditorField`

**目标**：Admin 可舒适写作并保存 Markdown 字符串。

**任务**：

1. 实现 `MarkdownEditorField.tsx`（`"use client"`）：
   - 使用 Payload `useField` / `TextareaFieldClientComponent` 约定（见 Payload 3 自定义字段文档）
   - 绑定 `value` / `setValue`
   - MDXEditor 插件：`headings`、`lists`、`quote`、`thematicBreak`、`link`、`image`、`codeBlock`、`markdownShortcut`（若包内提供）
   - 可编辑区 `contentEditableClassName={SUNNY_PROSE_CLASS}`
   - 工具栏：简洁模式（Typora 风），避免过多按钮
2. 实现 `src/lib/markdown/media-upload.ts`：
   - `POST` 到现有 Media 上传或 Payload REST
   - 返回 URL 供 `imagePlugin` 插入
3. 运行 `npm run generate:importmap` 刷新内置条目，然后**手动**在 `importMap.js` 中添加 `MarkdownEditorField` 的 import 与映射条目（自定义组件不会自动生成）。
4. **仅** 新建测试 collection 或临时字段验证保存，先不改 Post/Page。

**验收**：

- [ ] 新建文档可保存 MD 字符串到 DB
- [ ] 刷新后内容不丢、不乱码
- [ ] 拖拽/粘贴图片进入 Media 且文中可见
- [ ] `# `、`**` 快捷键生效

---

### Phase 3 — 切换 Post / Page + Live Preview

**目标**：长文生产路径完全切换；Preview 与公开页一致。

**任务**：

1. 修改 `Post.ts`、`Page.ts`：`content` 为自定义 Markdown 字段；加 `contentFormat`。
2. 替换 `blog/[slug]/page.tsx`、`[slug]/page.tsx`：`RichTextContent` → `MarkdownContent`。
3. 更新 `DocumentLivePreview.tsx`：按 `contentFormat` 分支，markdown 用 `MarkdownContent`。
4. 将 `src/lib/richtext.ts` 中的 `extractLexicalPlainText` 替换为 `src/lib/markdown/plain-text.ts` 中的 `stripMarkdownForExcerpt`，并更新所有调用方（`estimateReadingMinutes` 可保留但入参改为 Markdown 字符串）。
5. 从 `payload.config.ts` 移除全局 `editor: lexicalEditor()` **或** 仅保留给仍用 richText 的集合。

**验收**：

- [ ] 新建文章 → Preview → 发布页三者一致
- [ ] `generate:types` 后 `Post["content"]` 为 `string`
- [ ] 阅读时长、SEO `description` 仍正常

---

### Phase 4 — 存量迁移与种子

**目标**：历史 Lexical 内容全部转 MD；新站 onboarding 用 MD。

**任务**：

1. 实现 `src/lib/markdown/migrate-lexical.ts`：
   - 使用 `@payloadcms/richtext-lexical` 的 `convertLexicalToMarkdown` + `editorConfigFactory`
   - 图片节点转为 `![media:<id>]()` 或上传 URL（与 Payload 文档一致）
2. 脚本 `scripts/migrate-lexical-to-markdown.mjs`：
   - 遍历 `posts`、`pages`（`contentFormat != markdown`）
   - 输出迁移报告 JSON（成功/失败 id）
3. 改 `src/lib/payload/onboarding.ts`：种子改为 Markdown 字符串（删除 `buildEditorState` 依赖）。
4. 一次性执行迁移（开发环境验证后再生产）。

**验收**：

- [ ] 抽样 3 篇旧文对比迁移前后段落、链接、图片
- [ ] 无 `content` 为空的文档（除非原本为空）
- [ ] `npm run build` 通过

---

### Phase 5 — Note / Update + Agent 上下文（体验抛光）

**目标**：短札/动态同体验；Agent 能读 Markdown 正文。

**任务**：

1. `Note.ts`、`Update.ts` 接入同一 `MarkdownEditorField`（可 `toolbarMode: "minimal"` prop）。
2. 公开 `notes`/`updates` 列表与详情改用 `MarkdownContent`。
3. Agent `context-builder` / 公开内容摘要：对 `content` 字符串直接截取，不再走 Lexical 遍历。
4. 可选：**专注写作** Admin CSS——字段全宽、隐藏次要 sidebar 项（仅样式）。
5. 可选：导出 `.md` 按钮（`afterRead` hook 或 Admin 自定义按钮）。

**验收**：

- [ ] Agent 引用文章摘要不含 JSON 垃圾
- [ ] Note 写作体验与 Post 一致（工具栏可更短）

---

## 6. 关键实现片段（供 AI 复制时对齐）

### 6.1 `MarkdownEditorField` 骨架

```tsx
"use client";

import type { TextareaFieldClientProps } from "payload";
import { useField } from "@payloadcms/ui";
import { MDXEditor, headingsPlugin, listsPlugin, linkPlugin, imagePlugin, quotePlugin, codeBlockPlugin, thematicBreakPlugin, markdownShortcutPlugin } from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

import { SUNNY_PROSE_CLASS } from "./constants";
import { uploadMarkdownImage } from "@/lib/markdown/media-upload";

export function MarkdownEditorField({ field, path }: TextareaFieldClientProps) {
  const { value, setValue } = useField<string>({ path });

  return (
    <div className="sunny-markdown-editor-root">
      <MDXEditor
        markdown={value ?? ""}
        onChange={setValue}
        contentEditableClassName={SUNNY_PROSE_CLASS}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          linkPlugin(),
          quotePlugin(),
          codeBlockPlugin(),
          thematicBreakPlugin(),
          imagePlugin({ imageUploadHandler: uploadMarkdownImage }),
          markdownShortcutPlugin(),
        ]}
      />
    </div>
  );
}
```

> 实际插件列表以 `@mdxeditor/editor` 当前导出为准；安装后先读类型定义再填。

### 6.2 Lexical → Markdown 迁移核心

```typescript
import { convertLexicalToMarkdown, editorConfigFactory } from "@payloadcms/richtext-lexical";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import type { SanitizedConfig } from "payload";

export async function lexicalContentToMarkdown(
  data: SerializedEditorState,
  payloadConfig: SanitizedConfig,
) {
  const editorConfig = await editorConfigFactory.default({
    config: payloadConfig,
    parentIsLocalized: false,
  });
  return convertLexicalToMarkdown({ data, editorConfig });
}
```

### 6.3 阅读时长（替换 Lexical 提取）

```typescript
export function stripMarkdownForExcerpt(md: string, maxLength = 120) {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*]\([^)]+\)/g, " ")
    // 按字符剥离 Markdown 语法残留；对 plain text 中的 >、*、` 等标点有轻微误伤，不影响阅读时长估算精度
    .replace(/[#>*_~`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= maxLength ? plain : `${plain.slice(0, maxLength).trimEnd()}...`;
}
```

---

## 7. 与其它系统的集成点

| 系统 | 改动 |
|------|------|
| **Live Preview** | `DocumentLivePreview` 仅走 `MarkdownContent` |
| **Agent** | `extractLexicalPlainText` → `stripMarkdownForExcerpt`；工具若生成文章应输出 MD |
| **命令面板** | 新建文章仍跳转 Admin，无改路由 |
| **RSS / OG** | 摘要字段仍用 `summary`；正文 MD 不直接进 meta |
| **搜索** | 若未来全文搜索，Markdown 纯文本更友好 |

---

## 8. 测试清单（每阶段回归）

### 手动测试

1. 新建 Post：H1–H3、粗斜体、链接、有序/无序列表、任务列表、引用、代码块、分割线、图片。
2. 从 Obsidian 复制一篇含图片的 MD 粘贴，检查格式。
3. 切换浅色/深色主题，检查编辑区与公开页。
4. Live Preview 与 `/blog/[slug]` 并排对比。
5. 迁移一篇旧 Lexical 文章，检查标题与图片。

### 自动化（建议 Phase 3 后）

- `tests/markdown/plain-text.test.ts`：摘录与阅读时长
- `tests/markdown/migrate-lexical.test.ts`：固定 JSON fixture → 期望 MD 快照

---

## 9. Vibe Coding 行为约束（给 AI）

1. **先读本文档 + 目标阶段**，不要擅自改 Agent 管道或 Dashboard 性能相关文件。
2. **禁止** 长期保留 Lexical 与 Markdown 双写（除非迁移脚本临时字段）。
3. **禁止** Admin 与站点使用不同 CSS 类名渲染正文。
4. 新增或修改自定义 Field 组件后，**必须**运行 `generate:importmap`，然后**手动**在 `importMap.js` 中补充该组件的 import 与映射条目（`generate:importmap` 不会自动注册自定义组件）。
5. 改动集合字段后 **必须** `npm run generate:types`。
6. 迁移脚本必须 **幂等**（已 `contentFormat === 'markdown'` 的跳过）。
7. 遇 React 19 / RSC 边界问题：编辑器组件 **仅 client**；展示组件可用 server wrapper + client 子组件。
8. 完成阶段后更新本文档底部 **实施状态** 表。

---

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| MDXEditor 与 React 19 不兼容 | 锁定兼容版本；不行则降级 React 18 LTS 或改 Toast UI Editor（仍 Markdown 存库） |
| 迁移丢图 | 先迁移 Media，再用 `![media:<id>]()`；脚本输出失败列表 |
| SSR  hydration 报错 | 展示组件 `dynamic(..., { ssr: false })` 仅包裹 MDXEditor；或用 `react-markdown` 做 SSR |
| 表格/公式 Obsidian 扩展语法 | P2 用 `remark-gfm`；公式用 `remark-math` + KaTeX（可选） |
| Payload 全局 Lexical 移除后 Admin 其它处报错 | 检查是否还有 `richText` 字段；无则删 `editor: lexicalEditor()` |

---

## 11. 实施状态（随开发更新）

| 阶段 | 状态 | 备注 |
|------|------|------|
| Phase 0 依赖与样式 | 已完成 | `@mdxeditor/editor`、`sunny-markdown.css`、Admin `EditorStyles` |
| Phase 1 MarkdownContent | 已完成 | `MarkdownContent`、`plain-text.ts`、`ContentRenderer` |
| Phase 2 Admin Field | 已完成 | `MarkdownEditorField`、`media-upload`、手动 `importMap` |
| Phase 3 Post/Page 切换 | 已完成 | 集合字段、公开页、Live Preview、阅读时长 |
| Phase 4 迁移与种子 | 已完成 | `migrate-lexical.ts`、`npm run migrate:lexical-to-markdown`、onboarding MD |
| Phase 5 Note/Update + Agent | 已完成 | Note/Update 编辑器、公开 notes 渲染、摘要 strip MD |

---

## 12. 参考链接

- [Payload — Converting Markdown](https://payloadcms.com/docs/rich-text/converting-markdown)（迁移 Lexical 存量）
- [Payload — Custom Fields](https://payloadcms.com/docs/fields/overview#custom-components)
- [MDXEditor 文档](https://mdxeditor.dev/)
- 现有样式：`src/app/styles/sunny-agent.css`（`.sunny-prose`）、`src/components/public/RichTextContent.tsx`（迁移前参考）

---

**给 AI 的一句话**：把 SunnyPanel 长文从 Lexical JSON 迁到 **Markdown 存库**，用 **MDXEditor** 写、用 **同一 `sunny-prose` + 同一渲染组件** 展示；按 Phase 0→5 顺序做，每阶段验收后再继续。
