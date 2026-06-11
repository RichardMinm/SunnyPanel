# Dashboard Content Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Dashboard-native content studio that owns creation, editing, preview, publishing, and organization for Posts, Notes, Updates, and Pages.

**Architecture:** Payload remains the auth, persistence, media, and advanced-admin layer. Dashboard gains a Writing workspace backed by a shared Tiptap WYSIWYG editor, a unified `/api/dashboard/content` API, rich-content JSON fields, derived Agent-friendly text/outline fields, a shared public renderer, and migrated command/Agent entry points.

**Tech Stack:** Next.js 16 App Router, React 19, Payload 3, PostgreSQL, Tiptap, TypeScript, node:test, Playwright.

---

## File Map

### Dependencies And Scripts

| File | Responsibility |
|---|---|
| `package.json` | Add Tiptap packages, content migration script, and test scripts. |
| `package-lock.json` | Lock Tiptap dependency versions after `npm install`. |

### Rich Content Core

| File | Responsibility |
|---|---|
| `src/lib/rich-content/types.ts` | Shared rich document, outline, and Dashboard content kind types. |
| `src/lib/rich-content/defaults.ts` | Empty document factory and content kind profiles. |
| `src/lib/rich-content/derive.ts` | Generate plain text, excerpt, outline, and reading time from rich JSON. |
| `src/lib/rich-content/ids.ts` | Ensure stable block ids throughout content JSON. |
| `src/lib/rich-content/validate.ts` | Validate and normalize rich JSON documents. |
| `src/lib/rich-content/markdown-to-rich.ts` | Convert legacy Markdown into the supported rich JSON schema. |
| `tests/content/rich-content.test.ts` | Contract tests for rich content utilities. |

### Payload Model

| File | Responsibility |
|---|---|
| `src/lib/payload/rich-content-fields.ts` | Payload fields for `contentRich`, derived fields, version, and legacy Markdown. |
| `src/lib/payload/rich-content-hooks.ts` | Payload hooks that validate rich content and derive text/excerpt/outline. |
| `src/collections/Post.ts` | Switch Post content model to rich content while preserving legacy Markdown. |
| `src/collections/Page.ts` | Switch Page content model to rich content while preserving legacy Markdown. |
| `src/collections/Note.ts` | Switch Note content model to rich content while preserving legacy Markdown. |
| `src/collections/Update.ts` | Switch Update content model to rich content while preserving legacy Markdown. |
| `src/payload-types.ts` | Regenerated Payload types. |

### Dashboard Content API

| File | Responsibility |
|---|---|
| `src/lib/dashboard/content/config.ts` | Allowed collections, labels, profile metadata, and public URL builders. |
| `src/lib/dashboard/content/normalize.ts` | Convert Payload docs into Dashboard list/detail DTOs. |
| `src/lib/dashboard/content/validation.ts` | Validate create, patch, publish, and unpublish payloads. |
| `src/app/api/dashboard/content/route.ts` | List and create content documents. |
| `src/app/api/dashboard/content/[collection]/[id]/route.ts` | Read, patch, and delete one document. |
| `src/app/api/dashboard/content/[collection]/[id]/publish/route.ts` | Publish one document. |
| `src/app/api/dashboard/content/[collection]/[id]/unpublish/route.ts` | Unpublish one document. |
| `tests/content/dashboard-content-api.test.ts` | Static and utility tests for API contracts. |

### Tiptap Editor

| File | Responsibility |
|---|---|
| `src/components/content-editor/ContentEditor.tsx` | Shared Dashboard Tiptap editor shell. |
| `src/components/content-editor/SlashCommandMenu.tsx` | `/` block insertion menu. |
| `src/components/content-editor/FloatingFormatMenu.tsx` | Selection format controls. |
| `src/components/content-editor/ImageUploadNodeView.tsx` | Image upload, failed state, alt text editing. |
| `src/components/content-editor/extensions/callout.ts` | Callout node extension. |
| `src/components/content-editor/extensions/image-upload.ts` | Paste/drop upload handling. |
| `src/components/content-editor/extensions/stable-block-id.ts` | Client-side block id extension. |
| `src/lib/editor/upload-dashboard-image.ts` | Client upload helper using `/api/editor/upload-media`. |
| `tests/content/editor-contract.test.ts` | Static tests for editor wiring and menu actions. |

### Dashboard Writing Workspace

| File | Responsibility |
|---|---|
| `src/components/dashboard/writing/writing-types.ts` | Workspace DTO and local UI state types. |
| `src/components/dashboard/writing/use-writing-documents.ts` | Fetch, create, save, publish, and unpublish hooks. |
| `src/components/dashboard/writing/WritingWorkspace.tsx` | Three-pane Mac-first workspace. |
| `src/components/dashboard/writing/WritingLibrary.tsx` | Content library, filters, search, create actions. |
| `src/components/dashboard/writing/WritingEditorPane.tsx` | Editor pane, save status, keyboard save. |
| `src/components/dashboard/writing/WritingMetaPanel.tsx` | Metadata forms for all four content kinds. |
| `src/components/dashboard/writing/WritingOutlinePanel.tsx` | H1/H2/H3 outline navigation. |
| `src/components/dashboard/writing/WritingPreviewPanel.tsx` | Embedded rich renderer preview and links. |
| `src/components/dashboard/writing/WritingPublishControls.tsx` | Save draft, publish, unpublish, preview, public URL, Admin URL. |
| `src/components/dashboard/DashboardIconBar.tsx` | Restore Writing workspace entry. |
| `src/components/dashboard/DashboardShell.tsx` | Render `WritingWorkspace` for `activeMode === "writing"`. |
| `src/components/dashboard/icons.tsx` | Reuse existing `pencil` or `post` icon for Writing. |
| `src/app/styles/sunny-dashboard-writing.css` | Mac-first Writing workspace styles. |
| `src/app/globals.css` | Import writing and rich content CSS. |
| `tests/content/writing-workspace.test.ts` | Static Dashboard wiring tests. |

### Public Rendering

| File | Responsibility |
|---|---|
| `src/components/content/RichContentRenderer.tsx` | Render rich JSON for public pages and previews. |
| `src/components/content/rich-content-renderers.tsx` | Per-node renderer functions. |
| `src/app/styles/sunny-rich-content.css` | Shared public/editor rich content styling. |
| `src/components/public/ContentRenderer.tsx` | Route unknown content to rich renderer or legacy Markdown fallback. |
| `src/components/public/DocumentLivePreview.tsx` | Render `contentRich` in live preview. |
| `src/app/(site)/blog/[slug]/page.tsx` | Use `contentRich` and rich reading time. |
| `src/app/(site)/[slug]/page.tsx` | Use `contentRich`. |
| `src/app/(site)/notes/page.tsx` | Use `contentRich` and derived excerpt. |
| `src/app/(site)/updates/page.tsx` | Use `contentRich`. |

### Migration, Agent, And Navigation

| File | Responsibility |
|---|---|
| `scripts/migrate-markdown-to-rich-content.ts` | Repeatable migration from Markdown `content` into `contentRich`. |
| `src/lib/payload/public.ts` | Ensure public fetches expose rich fields. |
| `src/lib/payload/workspace.ts` | Agent workspace summaries use `contentExcerpt` and Dashboard edit URLs. |
| `src/lib/agent/context-builder.ts` | Include `contentText` and `contentOutline` in Agent content context. |
| `src/lib/agent/prompts.ts` | Prefer rich-content derived fields in content prompts. |
| `src/app/api/command/search/route.ts` | Dashboard edit URLs for private/draft content and derived excerpts. |
| `src/lib/command/palette.ts` | Static "new content" actions point to Dashboard Writing. |
| `tests/content/agent-content-context.test.ts` | Tests for Agent and command palette content contracts. |
| `tests/e2e/dashboard-writing.spec.ts` | End-to-end Writing workspace workflow. |

---

## Task 1: Install Tiptap And Add Content Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/content/rich-content.test.ts`

- [ ] **Step 1: Add failing test harness for content tests**

Create `tests/content/rich-content.test.ts` with this first contract:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createEmptyRichDocument } from "../../src/lib/rich-content/defaults";

describe("rich content defaults", () => {
  test("createEmptyRichDocument returns a stable Tiptap doc", () => {
    assert.deepEqual(createEmptyRichDocument(), {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            id: "root-paragraph",
          },
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --import tsx --test tests/content/rich-content.test.ts
```

Expected: fail with `Cannot find module '../../src/lib/rich-content/defaults'`.

- [ ] **Step 3: Install Tiptap dependencies**

Run:

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-typography @tiptap/suggestion prosemirror-state prosemirror-view
```

Expected: `package.json` and `package-lock.json` include the new dependencies.

- [ ] **Step 4: Add content test script**

Update `package.json` scripts to include:

```json
{
  "test:content": "node --import tsx --test tests/content/*.test.ts",
  "migrate:markdown-to-rich": "node --import tsx scripts/migrate-markdown-to-rich-content.ts"
}
```

Keep existing scripts intact.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json tests/content/rich-content.test.ts
git commit -m "test: add rich content test harness"
```

---

## Task 2: Build Rich Content Core Utilities

**Files:**
- Create: `src/lib/rich-content/types.ts`
- Create: `src/lib/rich-content/defaults.ts`
- Create: `src/lib/rich-content/ids.ts`
- Create: `src/lib/rich-content/derive.ts`
- Create: `src/lib/rich-content/validate.ts`
- Create: `src/lib/rich-content/markdown-to-rich.ts`
- Modify: `tests/content/rich-content.test.ts`

- [ ] **Step 1: Replace rich content tests with full utility contracts**

Replace `tests/content/rich-content.test.ts` with:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createEmptyRichDocument, getDashboardContentProfile } from "../../src/lib/rich-content/defaults";
import { deriveRichContentFields } from "../../src/lib/rich-content/derive";
import { ensureRichContentBlockIds } from "../../src/lib/rich-content/ids";
import { markdownToRichContent } from "../../src/lib/rich-content/markdown-to-rich";
import { normalizeRichContentDocument } from "../../src/lib/rich-content/validate";
import type { RichContentDocument } from "../../src/lib/rich-content/types";

describe("rich content utilities", () => {
  test("createEmptyRichDocument returns a stable Tiptap doc", () => {
    assert.deepEqual(createEmptyRichDocument(), {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            id: "root-paragraph",
          },
        },
      ],
    });
  });

  test("profiles describe all Dashboard-owned content kinds", () => {
    assert.equal(getDashboardContentProfile("posts").summaryMode, "required");
    assert.equal(getDashboardContentProfile("pages").supportsSlug, true);
    assert.equal(getDashboardContentProfile("notes").titleMode, "derived");
    assert.equal(getDashboardContentProfile("updates").supportsUpdateType, true);
  });

  test("ensureRichContentBlockIds adds deterministic ids to block nodes", () => {
    const doc: RichContentDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hello" }] },
        { type: "paragraph", content: [{ type: "text", text: "World" }] },
      ],
    };

    const withIds = ensureRichContentBlockIds(doc);

    assert.equal(withIds.content?.[0]?.attrs?.id, "heading-1");
    assert.equal(withIds.content?.[1]?.attrs?.id, "paragraph-2");
  });

  test("deriveRichContentFields generates text, excerpt, outline, and reading time", () => {
    const derived = deriveRichContentFields({
      type: "doc",
      content: [
        { type: "heading", attrs: { id: "intro", level: 1 }, content: [{ type: "text", text: "Intro" }] },
        { type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "A clear opening paragraph." }] },
      ],
    });

    assert.equal(derived.contentText, "Intro\nA clear opening paragraph.");
    assert.equal(derived.contentExcerpt, "Intro A clear opening paragraph.");
    assert.deepEqual(derived.contentOutline, [{ id: "intro", level: 1, order: 0, text: "Intro" }]);
    assert.equal(derived.readingMinutes, 1);
  });

  test("normalizeRichContentDocument returns empty doc for invalid input", () => {
    assert.deepEqual(normalizeRichContentDocument(null), createEmptyRichDocument());
    assert.deepEqual(normalizeRichContentDocument({ type: "doc", content: [] }), {
      type: "doc",
      content: [],
    });
  });

  test("markdownToRichContent converts common Markdown blocks", () => {
    const doc = markdownToRichContent("# Title\n\nParagraph text\n\n- First\n- Second\n\n> Quote");

    assert.equal(doc.type, "doc");
    assert.equal(doc.content?.[0]?.type, "heading");
    assert.equal(doc.content?.[0]?.attrs?.level, 1);
    assert.equal(doc.content?.[1]?.type, "paragraph");
    assert.equal(doc.content?.[2]?.type, "bulletList");
    assert.equal(doc.content?.[3]?.type, "blockquote");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because rich content utility modules do not exist.

- [ ] **Step 3: Implement shared types**

Create `src/lib/rich-content/types.ts`:

```ts
export type DashboardContentKind = "notes" | "pages" | "posts" | "updates";

export type RichContentNode = {
  attrs?: Record<string, unknown>;
  content?: RichContentNode[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type: string;
};

export type RichContentBlock = RichContentNode;

export type RichContentDocument = {
  content?: RichContentBlock[];
  type: "doc";
};

export type ContentOutlineItem = {
  id: string;
  level: 1 | 2 | 3;
  order: number;
  text: string;
};

export type DerivedRichContentFields = {
  contentExcerpt: string;
  contentOutline: ContentOutlineItem[];
  contentText: string;
  readingMinutes: number;
};

export type DashboardContentProfile = {
  kind: DashboardContentKind;
  label: string;
  summaryMode: "derived" | "none" | "required";
  supportsCoverImage: boolean;
  supportsLink: boolean;
  supportsMood: boolean;
  supportsPinned: boolean;
  supportsSlug: boolean;
  supportsTags: boolean;
  supportsUpdateType: boolean;
  titleMode: "derived" | "required";
};
```

- [ ] **Step 4: Implement defaults and profiles**

Create `src/lib/rich-content/defaults.ts`:

```ts
import type { DashboardContentKind, DashboardContentProfile, RichContentDocument } from "./types";

export const RICH_CONTENT_VERSION = "tiptap-v1";

export const createEmptyRichDocument = (): RichContentDocument => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: {
        id: "root-paragraph",
      },
    },
  ],
});

export const dashboardContentProfiles: Record<DashboardContentKind, DashboardContentProfile> = {
  notes: {
    kind: "notes",
    label: "短札",
    summaryMode: "derived",
    supportsCoverImage: true,
    supportsLink: false,
    supportsMood: true,
    supportsPinned: true,
    supportsSlug: false,
    supportsTags: false,
    supportsUpdateType: false,
    titleMode: "derived",
  },
  pages: {
    kind: "pages",
    label: "页面",
    summaryMode: "none",
    supportsCoverImage: true,
    supportsLink: false,
    supportsMood: false,
    supportsPinned: false,
    supportsSlug: true,
    supportsTags: false,
    supportsUpdateType: false,
    titleMode: "required",
  },
  posts: {
    kind: "posts",
    label: "文章",
    summaryMode: "required",
    supportsCoverImage: true,
    supportsLink: false,
    supportsMood: false,
    supportsPinned: false,
    supportsSlug: true,
    supportsTags: true,
    supportsUpdateType: false,
    titleMode: "required",
  },
  updates: {
    kind: "updates",
    label: "动态",
    summaryMode: "derived",
    supportsCoverImage: true,
    supportsLink: true,
    supportsMood: false,
    supportsPinned: false,
    supportsSlug: false,
    supportsTags: false,
    supportsUpdateType: true,
    titleMode: "derived",
  },
};

export const getDashboardContentProfile = (kind: DashboardContentKind) => dashboardContentProfiles[kind];
```

- [ ] **Step 5: Implement ids, derive, validate, and Markdown conversion**

Create the remaining files with these exported functions:

```ts
// src/lib/rich-content/ids.ts
import type { RichContentDocument, RichContentNode } from "./types";

const blockTypes = new Set(["blockquote", "bulletList", "callout", "codeBlock", "heading", "image", "orderedList", "paragraph", "table", "taskList"]);

const cloneNodeWithIds = (node: RichContentNode, counter: { value: number }): RichContentNode => {
  const next: RichContentNode = { ...node };
  if (node.attrs) next.attrs = { ...node.attrs };

  if (blockTypes.has(node.type)) {
    counter.value += 1;
    next.attrs = {
      ...(next.attrs ?? {}),
      id: typeof next.attrs?.id === "string" && next.attrs.id ? next.attrs.id : `${node.type}-${counter.value}`,
    };
  }

  if (node.content) {
    next.content = node.content.map((child) => cloneNodeWithIds(child, counter));
  }

  return next;
};

export const ensureRichContentBlockIds = (document: RichContentDocument): RichContentDocument => {
  const counter = { value: 0 };
  return {
    type: "doc",
    content: document.content?.map((node) => cloneNodeWithIds(node, counter)) ?? [],
  };
};
```

```ts
// src/lib/rich-content/derive.ts
import type { ContentOutlineItem, DerivedRichContentFields, RichContentDocument, RichContentNode } from "./types";

const textFromNode = (node: RichContentNode): string => {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(textFromNode).filter(Boolean).join(node.type === "paragraph" ? "" : " ");
};

const flattenText = (document: RichContentDocument) =>
  (document.content ?? [])
    .map(textFromNode)
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");

const excerptFromText = (text: string, maxLength = 160) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trimEnd()}...`;
};

const outlineFromDocument = (document: RichContentDocument): ContentOutlineItem[] =>
  (document.content ?? []).flatMap((node, index) => {
    if (node.type !== "heading") return [];
    const level = node.attrs?.level;
    if (level !== 1 && level !== 2 && level !== 3) return [];
    const text = textFromNode(node).trim();
    if (!text) return [];
    const id = typeof node.attrs?.id === "string" && node.attrs.id ? node.attrs.id : `heading-${index + 1}`;
    return [{ id, level, order: index, text }];
  });

const estimateReadingMinutes = (text: string, wordsPerMinute = 220) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
};

export const deriveRichContentFields = (document: RichContentDocument): DerivedRichContentFields => {
  const contentText = flattenText(document);
  return {
    contentExcerpt: excerptFromText(contentText),
    contentOutline: outlineFromDocument(document),
    contentText,
    readingMinutes: estimateReadingMinutes(contentText),
  };
};
```

```ts
// src/lib/rich-content/validate.ts
import { createEmptyRichDocument } from "./defaults";
import { ensureRichContentBlockIds } from "./ids";
import type { RichContentDocument } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isRichContentDocument = (value: unknown): value is RichContentDocument =>
  isRecord(value) && value.type === "doc" && (value.content === undefined || Array.isArray(value.content));

export const normalizeRichContentDocument = (value: unknown): RichContentDocument => {
  if (!isRichContentDocument(value)) {
    return createEmptyRichDocument();
  }

  return ensureRichContentBlockIds({
    type: "doc",
    content: value.content ?? [],
  });
};
```

```ts
// src/lib/rich-content/markdown-to-rich.ts
import { ensureRichContentBlockIds } from "./ids";
import type { RichContentBlock, RichContentDocument } from "./types";

const textNode = (text: string) => ({ type: "text", text });

const paragraph = (text: string): RichContentBlock => ({
  type: "paragraph",
  content: [textNode(text)],
});

export const markdownToRichContent = (markdown: string): RichContentDocument => {
  const blocks: RichContentBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: [textNode(heading[2].trim())],
      });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: RichContentBlock[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]?.trimEnd() ?? "")) {
        items.push({
          type: "listItem",
          content: [paragraph((lines[index] ?? "").replace(/^[-*]\s+/, "").trim())],
        });
        index += 1;
      }
      blocks.push({ type: "bulletList", content: items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: RichContentBlock[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index]?.trimEnd() ?? "")) {
        items.push({
          type: "listItem",
          content: [paragraph((lines[index] ?? "").replace(/^\d+\.\s+/, "").trim())],
        });
        index += 1;
      }
      blocks.push({ type: "orderedList", attrs: { start: 1 }, content: items });
      continue;
    }

    if (/^>\s?/.test(line)) {
      blocks.push({
        type: "blockquote",
        content: [paragraph(line.replace(/^>\s?/, "").trim())],
      });
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: "codeBlock",
        attrs: { language: "text" },
        content: [textNode(codeLines.join("\n"))],
      });
      continue;
    }

    blocks.push(paragraph(line.trim()));
    index += 1;
  }

  return ensureRichContentBlockIds({ type: "doc", content: blocks });
};
```

- [ ] **Step 6: Verify content tests pass**

Run:

```bash
npm run test:content
```

Expected: all tests in `tests/content/rich-content.test.ts` pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/rich-content tests/content/rich-content.test.ts package.json
git commit -m "feat: add rich content core utilities"
```

---

## Task 3: Add Payload Rich Content Fields And Collection Model

**Files:**
- Create: `src/lib/payload/rich-content-fields.ts`
- Create: `src/lib/payload/rich-content-hooks.ts`
- Modify: `src/collections/Post.ts`
- Modify: `src/collections/Page.ts`
- Modify: `src/collections/Note.ts`
- Modify: `src/collections/Update.ts`
- Modify: `tests/content/rich-content.test.ts`
- Modify: `src/payload-types.ts`

- [ ] **Step 1: Add tests for Payload field contracts**

Append this test to `tests/content/rich-content.test.ts`:

```ts
import { richContentFields } from "../../src/lib/payload/rich-content-fields";

test("richContentFields includes rich, derived, version, and legacy fields", () => {
  const fields = richContentFields({ label: "正文", legacyLabel: "旧 Markdown" });
  const names = fields.map((field) => "name" in field ? field.name : "");

  assert.deepEqual(names, [
    "contentRich",
    "contentText",
    "contentExcerpt",
    "contentOutline",
    "contentVersion",
    "legacyContentMarkdown",
  ]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because `src/lib/payload/rich-content-fields.ts` does not exist.

- [ ] **Step 3: Implement rich content Payload fields**

Create `src/lib/payload/rich-content-fields.ts`:

```ts
import type { Field } from "payload";

import { RICH_CONTENT_VERSION } from "@/lib/rich-content/defaults";
import { deriveRichContentBeforeChange } from "@/lib/payload/rich-content-hooks";

export const richContentFields = ({
  label,
  legacyLabel = "旧 Markdown 内容",
}: {
  label: string;
  legacyLabel?: string;
}): Field[] => [
  {
    name: "contentRich",
    type: "json",
    label,
    required: true,
    hooks: {
      beforeChange: [deriveRichContentBeforeChange],
    },
    admin: {
      description: "Dashboard Writing 使用的结构化富文本内容。",
    },
  },
  {
    name: "contentText",
    type: "textarea",
    label: "纯文本内容",
    admin: {
      readOnly: true,
      position: "sidebar",
    },
  },
  {
    name: "contentExcerpt",
    type: "textarea",
    label: "内容摘要",
    admin: {
      readOnly: true,
      position: "sidebar",
    },
  },
  {
    name: "contentOutline",
    type: "json",
    label: "内容大纲",
    admin: {
      readOnly: true,
      position: "sidebar",
    },
  },
  {
    name: "contentVersion",
    type: "text",
    label: "内容版本",
    defaultValue: RICH_CONTENT_VERSION,
    admin: {
      readOnly: true,
      position: "sidebar",
    },
  },
  {
    name: "legacyContentMarkdown",
    type: "textarea",
    label: legacyLabel,
    admin: {
      description: "迁移和回滚来源；Dashboard 不写入这个字段。",
      position: "sidebar",
    },
  },
];
```

Create `src/lib/payload/rich-content-hooks.ts`:

```ts
import type { FieldHook } from "payload";

import { RICH_CONTENT_VERSION } from "@/lib/rich-content/defaults";
import { deriveRichContentFields } from "@/lib/rich-content/derive";
import { normalizeRichContentDocument } from "@/lib/rich-content/validate";

export const deriveRichContentBeforeChange: FieldHook = ({ data, value }) => {
  const normalized = normalizeRichContentDocument(value);
  const derived = deriveRichContentFields(normalized);

  if (data && typeof data === "object") {
    data.contentText = derived.contentText;
    data.contentExcerpt = derived.contentExcerpt;
    data.contentOutline = derived.contentOutline;
    data.contentVersion = RICH_CONTENT_VERSION;
  }

  return normalized;
};
```

- [ ] **Step 4: Update collections**

In `src/collections/Post.ts`, replace `markdownContentField(...)` with:

```ts
...richContentFields({
  label: "正文",
  legacyLabel: "旧 Markdown 正文",
}),
```

Add import:

```ts
import { richContentFields } from "../lib/payload/rich-content-fields.ts";
```

Remove:

```ts
import { markdownContentField } from "../lib/payload/markdown-fields.ts";
```

Apply the same change to:

- `src/collections/Page.ts` with `label: "页面内容"`.
- `src/collections/Note.ts` with `label: "内容"`.
- `src/collections/Update.ts` with `label: "内容"`.

- [ ] **Step 5: Preserve legacy Markdown during migration window**

Do not delete `src/lib/payload/markdown-fields.ts` or editor components in this task. They remain available until the migration and public renderer tasks complete.

- [ ] **Step 6: Generate types**

Run:

```bash
npm run generate:types
```

Expected: `src/payload-types.ts` includes `contentRich`, `contentText`, `contentExcerpt`, `contentOutline`, `contentVersion`, and `legacyContentMarkdown` on `Post`, `Note`, `Update`, and `Page`.

- [ ] **Step 7: Verify**

Run:

```bash
npm run test:content
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/payload/rich-content-fields.ts src/lib/payload/rich-content-hooks.ts src/collections/Post.ts src/collections/Page.ts src/collections/Note.ts src/collections/Update.ts src/payload-types.ts tests/content/rich-content.test.ts
git commit -m "feat: add Payload rich content model"
```

---

## Task 4: Implement Dashboard Content API

**Files:**
- Create: `src/lib/dashboard/content/config.ts`
- Create: `src/lib/dashboard/content/normalize.ts`
- Create: `src/lib/dashboard/content/validation.ts`
- Create: `src/app/api/dashboard/content/route.ts`
- Create: `src/app/api/dashboard/content/[collection]/[id]/route.ts`
- Create: `src/app/api/dashboard/content/[collection]/[id]/publish/route.ts`
- Create: `src/app/api/dashboard/content/[collection]/[id]/unpublish/route.ts`
- Create: `tests/content/dashboard-content-api.test.ts`

- [ ] **Step 1: Write API contract tests**

Create `tests/content/dashboard-content-api.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { dashboardContentCollections, getDashboardEditHref } from "../../src/lib/dashboard/content/config";
import { validateDashboardContentCollection } from "../../src/lib/dashboard/content/validation";

const read = (path: string) => readFileSync(path, "utf8");

describe("dashboard content API contracts", () => {
  test("only the four writing collections are allowed", () => {
    assert.deepEqual(dashboardContentCollections, ["posts", "notes", "updates", "pages"]);
    assert.equal(validateDashboardContentCollection("posts"), "posts");
    assert.equal(validateDashboardContentCollection("timeline-events"), null);
  });

  test("Dashboard edit href encodes collection and id", () => {
    assert.equal(getDashboardEditHref("posts", 12), "/dashboard?mode=writing&collection=posts&id=12");
  });

  test("API routes use Payload auth and local API", () => {
    const route = read("src/app/api/dashboard/content/route.ts");
    const detailRoute = read("src/app/api/dashboard/content/[collection]/[id]/route.ts");

    assert.match(route, /getPayloadAuthResult/);
    assert.match(route, /getPayloadClient/);
    assert.match(detailRoute, /lastKnownUpdatedAt/);
    assert.match(detailRoute, /status: 409/);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because Dashboard content modules and routes do not exist.

- [ ] **Step 3: Implement config and validation**

Create `src/lib/dashboard/content/config.ts`:

```ts
import type { DashboardContentKind } from "@/lib/rich-content/types";

export const dashboardContentCollections = ["posts", "notes", "updates", "pages"] as const;

export type DashboardContentCollection = (typeof dashboardContentCollections)[number];

export const dashboardContentLabels: Record<DashboardContentCollection, string> = {
  notes: "短札",
  pages: "页面",
  posts: "文章",
  updates: "动态",
};

export const getDashboardEditHref = (collection: DashboardContentKind, id: number) =>
  `/dashboard?mode=writing&collection=${collection}&id=${id}`;

export const getAdvancedAdminHref = (collection: DashboardContentKind, id?: number) =>
  id ? `/admin/collections/${collection}/${id}` : `/admin/collections/${collection}`;

export const getPublicContentHref = ({
  collection,
  slug,
}: {
  collection: DashboardContentKind;
  slug?: null | string;
}) => {
  if (collection === "posts" && slug) return `/blog/${slug}`;
  if (collection === "pages" && slug) return `/${slug}`;
  if (collection === "notes") return "/notes";
  if (collection === "updates") return "/updates";
  return null;
};
```

Create `src/lib/dashboard/content/validation.ts`:

```ts
import { dashboardContentCollections, type DashboardContentCollection } from "./config";

export const validateDashboardContentCollection = (value: string): DashboardContentCollection | null =>
  (dashboardContentCollections as readonly string[]).includes(value)
    ? (value as DashboardContentCollection)
    : null;

export const parseDashboardContentId = (value: string) => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export const parseDashboardContentBody = async (request: Request) => {
  const body = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
};
```

- [ ] **Step 4: Implement DTO normalizer**

Create `src/lib/dashboard/content/normalize.ts`:

```ts
import type { Note, Page, Post, Update } from "@/payload-types";
import { getAdvancedAdminHref, getDashboardEditHref, getPublicContentHref, type DashboardContentCollection } from "./config";

type DashboardDoc = Note | Page | Post | Update;

const fallbackTitle = (collection: DashboardContentCollection, doc: DashboardDoc) => {
  if ("title" in doc && typeof doc.title === "string" && doc.title.trim()) return doc.title;
  if ("contentExcerpt" in doc && typeof doc.contentExcerpt === "string" && doc.contentExcerpt.trim()) return doc.contentExcerpt;
  return `${collection} #${doc.id}`;
};

export const normalizeDashboardContentListItem = (collection: DashboardContentCollection, doc: DashboardDoc) => {
  const slug = "slug" in doc && typeof doc.slug === "string" ? doc.slug : null;
  return {
    advancedAdminHref: getAdvancedAdminHref(collection, doc.id),
    collection,
    editHref: getDashboardEditHref(collection, doc.id),
    excerpt: "contentExcerpt" in doc && typeof doc.contentExcerpt === "string" ? doc.contentExcerpt : "",
    id: doc.id,
    publicHref: getPublicContentHref({ collection, slug }),
    status: doc.status,
    title: fallbackTitle(collection, doc),
    updatedAt: doc.updatedAt,
    visibility: doc.visibility,
  };
};

export const normalizeDashboardContentDocument = (collection: DashboardContentCollection, doc: DashboardDoc) => ({
  ...normalizeDashboardContentListItem(collection, doc),
  contentExcerpt: "contentExcerpt" in doc ? doc.contentExcerpt ?? "" : "",
  contentOutline: "contentOutline" in doc ? doc.contentOutline ?? [] : [],
  contentRich: "contentRich" in doc ? doc.contentRich : null,
  contentText: "contentText" in doc ? doc.contentText ?? "" : "",
  metadata: doc,
  publishedAt: "publishedAt" in doc ? doc.publishedAt ?? null : null,
});
```

- [ ] **Step 5: Implement API routes**

Create `src/app/api/dashboard/content/route.ts`:

```ts
import { NextResponse } from "next/server";

import { dashboardContentCollections, type DashboardContentCollection } from "@/lib/dashboard/content/config";
import { normalizeDashboardContentListItem } from "@/lib/dashboard/content/normalize";
import { parseDashboardContentBody, validateDashboardContentCollection } from "@/lib/dashboard/content/validation";
import { createEmptyRichDocument } from "@/lib/rich-content/defaults";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const url = new URL(request.url);
  const requestedCollection = url.searchParams.get("collection");
  const collections = requestedCollection
    ? [validateDashboardContentCollection(requestedCollection)].filter(Boolean)
    : dashboardContentCollections;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 80);
  const payload = await getPayloadClient();

  const results = await Promise.all(
    collections.map(async (collection) => {
      const result = await payload.find({
        collection: collection as DashboardContentCollection,
        depth: 1,
        limit,
        overrideAccess: false,
        sort: "-updatedAt",
        user: authResult.user,
      });
      return result.docs.map((doc) => normalizeDashboardContentListItem(collection as DashboardContentCollection, doc as never));
    }),
  );

  return NextResponse.json({ documents: results.flat().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) });
}

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const body = await parseDashboardContentBody(request);
  const collection = validateDashboardContentCollection(String(body.collection ?? ""));
  if (!collection) return NextResponse.json({ message: "不支持的内容类型" }, { status: 400 });

  const payload = await getPayloadClient();
  const data: Record<string, unknown> = {
    contentRich: createEmptyRichDocument(),
    status: "draft",
    visibility: "private",
  };

  if (collection === "posts") {
    data.title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "未命名文章";
    data.summary = "";
    data.slug = `draft-post-${Date.now()}`;
  }
  if (collection === "pages") {
    data.title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "未命名页面";
    data.slug = `draft-page-${Date.now()}`;
  }
  if (collection === "notes") {
    data.category = "note";
    data.pinned = false;
  }
  if (collection === "updates") {
    data.type = "life";
  }

  const doc = await payload.create({
    collection,
    data,
    overrideAccess: false,
    user: authResult.user,
  });

  return NextResponse.json({ document: normalizeDashboardContentDocument(collection, doc as never) }, { status: 201 });
}
```

Create detail, publish, and unpublish routes using the same auth pattern. Detail `PATCH` must:

```ts
const lastKnownUpdatedAt = typeof body.lastKnownUpdatedAt === "string" ? body.lastKnownUpdatedAt : null;
if (lastKnownUpdatedAt && existing.updatedAt !== lastKnownUpdatedAt) {
  return NextResponse.json({ message: "内容已在其他位置更新" }, { status: 409 });
}
```

Publish route must set:

```ts
{
  status: "published",
  publishedAt: existing.publishedAt ?? new Date().toISOString()
}
```

Unpublish route must set:

```ts
{
  status: "draft"
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:content
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/dashboard/content src/app/api/dashboard/content tests/content/dashboard-content-api.test.ts
git commit -m "feat: add Dashboard content API"
```

---

## Task 5: Build Shared Tiptap Editor

**Files:**
- Create: `src/components/content-editor/ContentEditor.tsx`
- Create: `src/components/content-editor/SlashCommandMenu.tsx`
- Create: `src/components/content-editor/FloatingFormatMenu.tsx`
- Create: `src/components/content-editor/ImageUploadNodeView.tsx`
- Create: `src/components/content-editor/extensions/callout.ts`
- Create: `src/components/content-editor/extensions/image-upload.ts`
- Create: `src/components/content-editor/extensions/stable-block-id.ts`
- Create: `src/lib/editor/upload-dashboard-image.ts`
- Create: `tests/content/editor-contract.test.ts`

- [ ] **Step 1: Write editor contract tests**

Create `tests/content/editor-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("content editor contracts", () => {
  test("ContentEditor uses Tiptap and wires paste/drop upload", () => {
    const editor = read("src/components/content-editor/ContentEditor.tsx");
    assert.match(editor, /useEditor/);
    assert.match(editor, /SlashCommandMenu/);
    assert.match(editor, /FloatingFormatMenu/);
    assert.match(editor, /PasteImageUpload/);
  });

  test("slash menu includes required blocks", () => {
    const slash = read("src/components/content-editor/SlashCommandMenu.tsx");
    for (const label of ["文本", "标题 1", "标题 2", "标题 3", "项目列表", "有序列表", "任务列表", "引用", "代码块", "分割线", "图片", "表格", "Callout"]) {
      assert.match(slash, new RegExp(label));
    }
  });

  test("image upload helper posts to editor media API", () => {
    const helper = read("src/lib/editor/upload-dashboard-image.ts");
    assert.match(helper, /\\/api\\/editor\\/upload-media/);
    assert.match(helper, /FormData/);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because editor files do not exist.

- [ ] **Step 3: Implement upload helper**

Create `src/lib/editor/upload-dashboard-image.ts`:

```ts
export type DashboardImageUploadResult = {
  id: number;
  url: string;
};

export async function uploadDashboardImage(file: File, alt?: string): Promise<DashboardImageUploadResult> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("alt", alt?.trim() || file.name.replace(/\.[^.]+$/, "") || "image");

  const response = await fetch("/api/editor/upload-media", {
    body: formData,
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("图片上传失败");
  }

  return (await response.json()) as DashboardImageUploadResult;
}
```

- [ ] **Step 4: Implement editor shell**

Create `src/components/content-editor/ContentEditor.tsx` with:

```tsx
"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Typography from "@tiptap/extension-typography";
import type { JSONContent } from "@tiptap/react";

import type { RichContentDocument } from "@/lib/rich-content/types";
import { Callout } from "./extensions/callout";
import { PasteImageUpload } from "./extensions/image-upload";
import { StableBlockId } from "./extensions/stable-block-id";
import { FloatingFormatMenu } from "./FloatingFormatMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";

type ContentEditorProps = {
  autoFocus?: boolean;
  className?: string;
  content: RichContentDocument;
  disabled?: boolean;
  onChange: (content: RichContentDocument) => void;
};

export function ContentEditor({ autoFocus, className, content, disabled, onChange }: ContentEditorProps) {
  const editor = useEditor({
    autofocus: autoFocus ? "end" : false,
    content: content as JSONContent,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "sunny-rich-editor-content sunny-rich-content",
      },
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({ openOnClick: false }),
      Image.configure({ allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Typography,
      Callout,
      StableBlockId,
      PasteImageUpload,
    ],
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getJSON() as RichContentDocument);
    },
  });

  return (
    <div className={["sunny-content-editor", className].filter(Boolean).join(" ")}>
      <FloatingFormatMenu editor={editor} />
      <SlashCommandMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 5: Implement menu and extensions**

Use these required exported names:

```ts
export const Callout = Node.create({ name: "callout", ... });
export const StableBlockId = Extension.create({ name: "stableBlockId", ... });
export const PasteImageUpload = Extension.create({ name: "pasteImageUpload", ... });
```

`PasteImageUpload` must inspect `event.clipboardData.files` and `event.dataTransfer.files`, upload `image/*` files through `uploadDashboardImage`, and insert an image node with the returned URL.

`SlashCommandMenu` must include the exact labels from the test and call Tiptap commands for headings, lists, quote, code block, horizontal rule, image, table, and callout.

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:content
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/content-editor src/lib/editor/upload-dashboard-image.ts tests/content/editor-contract.test.ts
git commit -m "feat: add Tiptap content editor"
```

---

## Task 6: Add Dashboard Writing Workspace

**Files:**
- Create: `src/components/dashboard/writing/writing-types.ts`
- Create: `src/components/dashboard/writing/use-writing-documents.ts`
- Create: `src/components/dashboard/writing/WritingWorkspace.tsx`
- Create: `src/components/dashboard/writing/WritingLibrary.tsx`
- Create: `src/components/dashboard/writing/WritingEditorPane.tsx`
- Create: `src/components/dashboard/writing/WritingMetaPanel.tsx`
- Create: `src/components/dashboard/writing/WritingOutlinePanel.tsx`
- Create: `src/components/dashboard/writing/WritingPreviewPanel.tsx`
- Create: `src/components/dashboard/writing/WritingPublishControls.tsx`
- Modify: `src/components/dashboard/DashboardIconBar.tsx`
- Modify: `src/components/dashboard/DashboardShell.tsx`
- Create: `tests/content/writing-workspace.test.ts`

- [ ] **Step 1: Write workspace wiring tests**

Create `tests/content/writing-workspace.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Dashboard Writing workspace", () => {
  test("sidebar exposes Writing workspace", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(sidebar, /key: "writing"/);
    assert.match(sidebar, /label: "写作"/);
  });

  test("DashboardShell renders WritingWorkspace", () => {
    const shell = read("src/components/dashboard/DashboardShell.tsx");
    assert.match(shell, /WritingWorkspace/);
    assert.match(shell, /activeMode === "writing"/);
  });

  test("WritingWorkspace contains library, editor, and metadata panel", () => {
    const workspace = read("src/components/dashboard/writing/WritingWorkspace.tsx");
    assert.match(workspace, /WritingLibrary/);
    assert.match(workspace, /WritingEditorPane/);
    assert.match(workspace, /WritingMetaPanel/);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because Writing workspace files and wiring do not exist.

- [ ] **Step 3: Implement writing types**

Create `src/components/dashboard/writing/writing-types.ts`:

```ts
import type { DashboardContentKind, RichContentDocument, ContentOutlineItem } from "@/lib/rich-content/types";

export type WritingDocumentListItem = {
  advancedAdminHref: string;
  collection: DashboardContentKind;
  editHref: string;
  excerpt: string;
  id: number;
  publicHref: null | string;
  status: "draft" | "published";
  title: string;
  updatedAt: string;
  visibility: "private" | "public";
};

export type WritingDocument = WritingDocumentListItem & {
  contentExcerpt: string;
  contentOutline: ContentOutlineItem[];
  contentRich: RichContentDocument;
  contentText: string;
  metadata: Record<string, unknown>;
  publishedAt?: null | string;
};

export type WritingSaveState = "dirty" | "error" | "idle" | "saving" | "saved";
```

- [ ] **Step 4: Implement data hook**

Create `src/components/dashboard/writing/use-writing-documents.ts` with fetchers for:

```ts
loadDocuments(collection?: DashboardContentKind): Promise<void>
createDocument(collection: DashboardContentKind): Promise<WritingDocument>
loadDocument(collection: DashboardContentKind, id: number): Promise<WritingDocument>
saveDocument(document: WritingDocument, patch: Record<string, unknown>): Promise<WritingDocument>
publishDocument(document: WritingDocument): Promise<WritingDocument>
unpublishDocument(document: WritingDocument): Promise<WritingDocument>
```

Every write request must send `lastKnownUpdatedAt: document.updatedAt`.

- [ ] **Step 5: Implement three-pane workspace**

Create `WritingWorkspace.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import type { DashboardContentKind } from "@/lib/rich-content/types";
import { WritingEditorPane } from "./WritingEditorPane";
import { WritingLibrary } from "./WritingLibrary";
import { WritingMetaPanel } from "./WritingMetaPanel";
import { useWritingDocuments } from "./use-writing-documents";

export function WritingWorkspace() {
  const {
    createDocument,
    documents,
    loadDocument,
    loadDocuments,
    publishDocument,
    saveDocument,
    selectedDocument,
    setSelectedDocument,
    unpublishDocument,
  } = useWritingDocuments();
  const [filter, setFilter] = useState<DashboardContentKind | "all">("all");

  useEffect(() => {
    void loadDocuments(filter === "all" ? undefined : filter);
  }, [filter, loadDocuments]);

  const handleCreate = useCallback(
    async (collection: DashboardContentKind) => {
      const created = await createDocument(collection);
      setSelectedDocument(created);
    },
    [createDocument, setSelectedDocument],
  );

  return (
    <section className="sunny-writing-workspace" aria-label="写作工作区">
      <WritingLibrary
        documents={documents}
        filter={filter}
        onCreate={handleCreate}
        onFilterChange={setFilter}
        onSelect={(item) => void loadDocument(item.collection, item.id)}
        selectedId={selectedDocument?.id ?? null}
      />
      <WritingEditorPane document={selectedDocument} onSave={saveDocument} />
      <WritingMetaPanel
        document={selectedDocument}
        onPublish={publishDocument}
        onSave={saveDocument}
        onUnpublish={unpublishDocument}
      />
    </section>
  );
}
```

Implement the remaining components with stable class names:

```text
sunny-writing-library
sunny-writing-editor-pane
sunny-writing-meta-panel
sunny-writing-outline-panel
sunny-writing-preview-panel
sunny-writing-publish-controls
```

- [ ] **Step 6: Wire Dashboard navigation**

In `src/components/dashboard/DashboardIconBar.tsx`, add Writing to `DASHBOARD_MODES`:

```ts
{ key: "writing", label: "写作", icon: "pencil", prompt: "" },
```

In `src/components/dashboard/DashboardShell.tsx`, import and render:

```tsx
import { WritingWorkspace } from "./writing/WritingWorkspace";
```

```tsx
) : activeMode === "writing" ? (
  <WritingWorkspace />
) : (
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run test:content
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/components/dashboard/writing src/components/dashboard/DashboardIconBar.tsx src/components/dashboard/DashboardShell.tsx tests/content/writing-workspace.test.ts
git commit -m "feat: add Dashboard Writing workspace"
```

---

## Task 7: Add Mac-First Writing And Rich Content Styles

**Files:**
- Create: `src/app/styles/sunny-dashboard-writing.css`
- Create: `src/app/styles/sunny-rich-content.css`
- Modify: `src/app/globals.css`
- Modify: `tests/content/writing-workspace.test.ts`

- [ ] **Step 1: Add style contract test**

Append this test to `tests/content/writing-workspace.test.ts`:

```ts
test("Writing styles define Mac-first three-pane layout", () => {
  const css = read("src/app/styles/sunny-dashboard-writing.css");
  assert.match(css, /grid-template-columns:\s*minmax\(280px,\s*320px\)\s+minmax\(0,\s*1fr\)\s+minmax\(320px,\s*380px\)/);
  assert.match(css, /sunny-writing-editor-canvas/);
  assert.match(css, /max-width:\s*860px/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because the CSS file does not exist.

- [ ] **Step 3: Add Writing workspace CSS**

Create `src/app/styles/sunny-dashboard-writing.css`:

```css
.sunny-writing-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr) minmax(320px, 380px);
  min-height: 100%;
  gap: 1px;
  background: var(--border);
}

.sunny-writing-library,
.sunny-writing-editor-pane,
.sunny-writing-meta-panel {
  min-width: 0;
  background: var(--surface);
}

.sunny-writing-library {
  overflow: auto;
  padding: 0.85rem;
}

.sunny-writing-editor-pane {
  display: flex;
  justify-content: center;
  overflow: auto;
  padding: 1.25rem 1.75rem 2rem;
}

.sunny-writing-editor-canvas {
  width: 100%;
  max-width: 860px;
}

.sunny-writing-meta-panel {
  overflow: auto;
  padding: 0.9rem;
}

.sunny-content-editor {
  min-height: calc(100vh - 9rem);
}

.sunny-rich-editor-content {
  outline: none;
}

@media (max-width: 1180px) {
  .sunny-writing-workspace {
    grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
  }

  .sunny-writing-meta-panel {
    display: none;
  }
}

@media (max-width: 860px) {
  .sunny-writing-workspace {
    grid-template-columns: 1fr;
  }

  .sunny-writing-library {
    display: none;
  }
}
```

Create `src/app/styles/sunny-rich-content.css` with block styles for headings, paragraphs, lists, task lists, blockquotes, callouts, code blocks, images, tables, and horizontal rules using existing tokens.

- [ ] **Step 4: Import styles**

Add to `src/app/globals.css` after Dashboard imports:

```css
@import "./styles/sunny-dashboard-writing.css";
@import "./styles/sunny-rich-content.css";
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test:content
npm run lint
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app/styles/sunny-dashboard-writing.css src/app/styles/sunny-rich-content.css src/app/globals.css tests/content/writing-workspace.test.ts
git commit -m "style: add Dashboard Writing workspace styles"
```

---

## Task 8: Replace Public Markdown Rendering With Rich Renderer

**Files:**
- Create: `src/components/content/RichContentRenderer.tsx`
- Create: `src/components/content/rich-content-renderers.tsx`
- Modify: `src/components/public/ContentRenderer.tsx`
- Modify: `src/components/public/DocumentLivePreview.tsx`
- Modify: `src/app/(site)/blog/[slug]/page.tsx`
- Modify: `src/app/(site)/[slug]/page.tsx`
- Modify: `src/app/(site)/notes/page.tsx`
- Modify: `src/app/(site)/updates/page.tsx`
- Modify: `src/lib/markdown/reading-time.ts`
- Create: `tests/content/rich-renderer.test.ts`

- [ ] **Step 1: Write renderer tests**

Create `tests/content/rich-renderer.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("rich content renderer wiring", () => {
  test("ContentRenderer accepts contentRich before legacy Markdown", () => {
    const renderer = read("src/components/public/ContentRenderer.tsx");
    assert.match(renderer, /RichContentRenderer/);
    assert.match(renderer, /contentRich/);
  });

  test("public post page reads rich content and rich reading time", () => {
    const page = read("src/app/(site)/blog/[slug]/page.tsx");
    assert.match(page, /post\.contentRich/);
    assert.match(page, /getReadingMinutesFromRichContent/);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because renderer files and route changes do not exist.

- [ ] **Step 3: Implement RichContentRenderer**

Create `src/components/content/RichContentRenderer.tsx`:

```tsx
import type { RichContentDocument, RichContentNode } from "@/lib/rich-content/types";
import { isRichContentDocument } from "@/lib/rich-content/validate";
import { renderRichContentNode } from "./rich-content-renderers";

type RichContentRendererProps = {
  className?: string;
  content: unknown;
};

export function RichContentRenderer({ className, content }: RichContentRendererProps) {
  if (!isRichContentDocument(content)) {
    return null;
  }

  const document = content as RichContentDocument;

  return (
    <div className={["sunny-rich-content", className].filter(Boolean).join(" ")}>
      {(document.content ?? []).map((node: RichContentNode, index) => renderRichContentNode(node, `${node.type}-${index}`))}
    </div>
  );
}
```

Create `src/components/content/rich-content-renderers.tsx` with explicit renderers for paragraph, heading, text marks, lists, task lists, blockquote, codeBlock, horizontalRule, image, table, and callout.

- [ ] **Step 4: Update public renderer entry**

Modify `src/components/public/ContentRenderer.tsx` to prefer rich content:

```tsx
import { RichContentRenderer } from "@/components/content/RichContentRenderer";
import { isRichContentDocument } from "@/lib/rich-content/validate";
import { MarkdownContent } from "@/components/editor/MarkdownContent";

type ContentRendererProps = {
  className?: string;
  content?: unknown;
  contentRich?: unknown;
};

export function ContentRenderer({ className, content, contentRich }: ContentRendererProps) {
  if (isRichContentDocument(contentRich)) {
    return <RichContentRenderer className={className} content={contentRich} />;
  }

  if (typeof content !== "string" || !content.trim()) {
    return null;
  }

  return <MarkdownContent className={className} markdown={content} />;
}
```

- [ ] **Step 5: Update public routes**

Replace:

```tsx
<ContentRenderer content={post.content} />
```

with:

```tsx
<ContentRenderer content={post.legacyContentMarkdown ?? post.content} contentRich={post.contentRich} />
```

Apply equivalent changes for pages, notes, updates, and live preview.

Update reading time in `src/lib/markdown/reading-time.ts`:

```ts
import { deriveRichContentFields } from "@/lib/rich-content/derive";
import { isRichContentDocument } from "@/lib/rich-content/validate";

export const getReadingMinutesFromRichContent = (content: unknown) =>
  isRichContentDocument(content) ? deriveRichContentFields(content).readingMinutes : 0;
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:content
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/content src/components/public/ContentRenderer.tsx src/components/public/DocumentLivePreview.tsx src/app/'(site)'/blog/'[slug]'/page.tsx src/app/'(site)'/'[slug]'/page.tsx src/app/'(site)'/notes/page.tsx src/app/'(site)'/updates/page.tsx src/lib/markdown/reading-time.ts tests/content/rich-renderer.test.ts
git commit -m "feat: render rich content publicly"
```

---

## Task 9: Add Repeatable Markdown Migration

**Files:**
- Create: `scripts/migrate-markdown-to-rich-content.ts`
- Modify: `package.json`
- Create: `tests/content/migration-contract.test.ts`

- [ ] **Step 1: Write migration contract test**

Create `tests/content/migration-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Markdown to rich content migration", () => {
  test("script migrates all four content collections and is repeatable", () => {
    const script = read("scripts/migrate-markdown-to-rich-content.ts");
    for (const collection of ["posts", "notes", "updates", "pages"]) {
      assert.match(script, new RegExp(collection));
    }
    assert.match(script, /legacyContentMarkdown/);
    assert.match(script, /contentVersion/);
    assert.match(script, /force/);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because migration script does not exist.

- [ ] **Step 3: Implement migration script**

Create `scripts/migrate-markdown-to-rich-content.ts`:

```ts
import "dotenv/config";

import { getPayload } from "payload";
import config from "../payload.config";
import { RICH_CONTENT_VERSION } from "../src/lib/rich-content/defaults";
import { deriveRichContentFields } from "../src/lib/rich-content/derive";
import { markdownToRichContent } from "../src/lib/rich-content/markdown-to-rich";

const collections = ["posts", "notes", "updates", "pages"] as const;
const force = process.argv.includes("--force");

const run = async () => {
  const payload = await getPayload({ config });

  for (const collection of collections) {
    const result = await payload.find({
      collection,
      depth: 0,
      limit: 500,
      overrideAccess: true,
      pagination: false,
    });

    let migrated = 0;
    let skipped = 0;

    for (const doc of result.docs as Array<Record<string, unknown> & { id: number }>) {
      if (!force && doc.contentVersion === RICH_CONTENT_VERSION && doc.contentRich) {
        skipped += 1;
        continue;
      }

      const markdown = typeof doc.legacyContentMarkdown === "string" && doc.legacyContentMarkdown.trim()
        ? doc.legacyContentMarkdown
        : typeof doc.content === "string"
          ? doc.content
          : "";
      const contentRich = markdownToRichContent(markdown);
      const derived = deriveRichContentFields(contentRich);

      await payload.update({
        collection,
        id: doc.id,
        data: {
          contentRich,
          contentText: derived.contentText,
          contentExcerpt: derived.contentExcerpt,
          contentOutline: derived.contentOutline,
          contentVersion: RICH_CONTENT_VERSION,
          legacyContentMarkdown: typeof doc.legacyContentMarkdown === "string" && doc.legacyContentMarkdown ? doc.legacyContentMarkdown : markdown,
        },
        overrideAccess: true,
      });

      migrated += 1;
    }

    console.log(`${collection}: migrated=${migrated} skipped=${skipped}`);
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Verify migration contract**

Run:

```bash
npm run test:content
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add scripts/migrate-markdown-to-rich-content.ts package.json tests/content/migration-contract.test.ts
git commit -m "feat: add rich content migration script"
```

---

## Task 10: Adapt Agent Context And Command Palette

**Files:**
- Modify: `src/lib/payload/workspace.ts`
- Modify: `src/lib/agent/context-builder.ts`
- Modify: `src/lib/agent/prompts.ts`
- Modify: `src/lib/agent/prompts/content.ts`
- Modify: `src/app/api/command/search/route.ts`
- Modify: `src/lib/command/palette.ts`
- Create: `tests/content/agent-content-context.test.ts`

- [ ] **Step 1: Write Agent and command tests**

Create `tests/content/agent-content-context.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Agent content context", () => {
  test("workspace summaries prefer derived rich content fields", () => {
    const workspace = read("src/lib/payload/workspace.ts");
    assert.match(workspace, /contentExcerpt/);
    assert.match(workspace, /contentOutline/);
    assert.match(workspace, /contentText/);
    assert.match(workspace, /getDashboardEditHref/);
  });

  test("command palette new content actions open Dashboard Writing", () => {
    const palette = read("src/lib/command/palette.ts");
    assert.match(palette, /\\/dashboard\\?mode=writing&new=posts/);
    assert.match(palette, /\\/dashboard\\?mode=writing&new=notes/);
    assert.match(palette, /\\/dashboard\\?mode=writing&new=updates/);
    assert.match(palette, /\\/dashboard\\?mode=writing&new=pages/);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:content
```

Expected: fail because Agent and command modules still prefer Markdown/Admin URLs.

- [ ] **Step 3: Update workspace summaries**

In `src/lib/payload/workspace.ts`:

- Import `getDashboardEditHref`.
- For `posts`, `notes`, `updates`, and `pages`, set `href` to Dashboard edit URLs.
- Use `contentExcerpt` before legacy Markdown for note/update titles.
- Include `contentText` and `contentOutline` in `AgentContextContentItem` if its type supports extension.

Use this title helper:

```ts
const getContentDerivedTitle = (doc: { contentExcerpt?: null | string; contentText?: null | string }, fallback: string) =>
  summarizeText(doc.contentExcerpt || doc.contentText || "", fallback);
```

- [ ] **Step 4: Update command palette**

In `src/lib/command/palette.ts`, replace static Admin create URLs:

```ts
href: "/dashboard?mode=writing&new=posts"
href: "/dashboard?mode=writing&new=notes"
href: "/dashboard?mode=writing&new=updates"
href: "/dashboard?mode=writing&new=pages"
```

In `src/app/api/command/search/route.ts`, private/draft content should use:

```ts
getDashboardEditHref("posts", post.id)
```

Use `contentExcerpt` for subtitles where available.

- [ ] **Step 5: Update Agent prompts**

In `src/lib/agent/prompts.ts` and `src/lib/agent/prompts/content.ts`, describe content summaries as:

```text
Use contentText for body-level understanding.
Use contentOutline for section-level structure.
Use Dashboard edit links for drafts and private content.
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:content
npm run test
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/payload/workspace.ts src/lib/agent/context-builder.ts src/lib/agent/prompts.ts src/lib/agent/prompts/content.ts src/app/api/command/search/route.ts src/lib/command/palette.ts tests/content/agent-content-context.test.ts
git commit -m "feat: route Agent content context through rich fields"
```

---

## Task 11: Add E2E Coverage For Complete Writing Flow

**Files:**
- Create: `tests/e2e/dashboard-writing.spec.ts`
- Modify: `tests/e2e/helpers/dashboard-shell.ts`

- [ ] **Step 1: Add Playwright test**

Create `tests/e2e/dashboard-writing.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { getDashboardShell } from "./helpers/dashboard-shell";

test.describe("Dashboard Writing workspace", () => {
  test("creates, edits, saves, previews, and publishes a post", async ({ page }) => {
    const shell = await getDashboardShell(page);

    await shell.getByRole("button", { name: /写作/ }).click();
    await expect(page.getByRole("region", { name: "写作工作区" })).toBeVisible();

    await page.getByRole("button", { name: "新建文章" }).click();
    await page.getByLabel("标题").fill("Dashboard Writing E2E");
    await page.getByLabel("摘要").fill("A rich content post created from Dashboard.");

    const editor = page.locator(".sunny-rich-editor-content");
    await editor.click();
    await page.keyboard.type("Hello from the new content studio.");
    await page.keyboard.press("Meta+S");

    await expect(page.getByText(/已保存/)).toBeVisible();

    await page.getByRole("button", { name: "发布" }).click();
    await expect(page.getByText(/已发布/)).toBeVisible();
    await expect(page.getByRole("link", { name: /打开预览/ })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E and verify failure before implementation is complete**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-writing.spec.ts
```

Expected: fail until the Writing workspace and authenticated test setup are wired.

- [ ] **Step 3: Make helper support authenticated Dashboard**

Update `tests/e2e/helpers/dashboard-shell.ts` only as needed so the test opens an authenticated Dashboard in the same manner as existing Dashboard E2E tests.

- [ ] **Step 4: Verify E2E after implementation**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-writing.spec.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/e2e/dashboard-writing.spec.ts tests/e2e/helpers/dashboard-shell.ts
git commit -m "test: cover Dashboard Writing workflow"
```

---

## Task 12: Final Cleanup And Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete or retain only if still referenced: `src/components/editor/MarkdownEditorField.tsx`
- Delete or retain only if still referenced: `src/components/editor/MarkdownContent.tsx`
- Delete or retain only if still referenced: `src/lib/payload/markdown-fields.ts`
- Modify: `src/app/(payload)/admin/importMap.js`
- Modify: `EDITOR-GUIDE.md`

- [ ] **Step 1: Check for remaining MDXEditor references**

Run:

```bash
rg -n "MDXEditor|@mdxeditor/editor|MarkdownEditorField|markdownContentField|MarkdownContent" src tests package.json EDITOR-GUIDE.md
```

Expected: references remain only in legacy docs or compatibility files that are intentionally retained.

- [ ] **Step 2: Remove unused MDX editor dependency when no runtime references remain**

If runtime references are gone, run:

```bash
npm uninstall @mdxeditor/editor
```

Expected: `package.json` and `package-lock.json` remove `@mdxeditor/editor`.

- [ ] **Step 3: Refresh Payload import map**

Run:

```bash
npm run generate:importmap
```

Expected: `src/app/(payload)/admin/importMap.js` contains no stale custom Markdown field mapping if the old field is removed.

- [ ] **Step 4: Run complete verification**

Run:

```bash
npm run test:content
npm run test
npm run typecheck
npm run lint
npm run generate:types
npm run test:e2e -- tests/e2e/dashboard-writing.spec.ts
```

Expected: all commands pass.

- [ ] **Step 5: Final commit**

Run:

```bash
git add package.json package-lock.json src tests scripts EDITOR-GUIDE.md
git commit -m "feat: complete Dashboard content studio"
```

---

## Implementation Notes

- Do not revert unrelated user changes already present in the working tree.
- Keep Payload Admin available as an advanced fallback.
- Keep legacy Markdown data until migration and public rendering are verified.
- Preserve Mac desktop polish as the primary UX target.
- Every task should leave the app closer to the complete content studio, not a separate reduced product.

## Final Acceptance Checklist

- [ ] Dashboard has a visible Writing workspace entry.
- [ ] Dashboard can create Posts, Notes, Updates, and Pages.
- [ ] Dashboard can edit rich content for all four collections.
- [ ] Tiptap WYSIWYG editor supports slash menu, floating menu, lists, tasks, image, table, code, quote, divider, and callout.
- [ ] Paste and drag image upload stores images in Payload Media.
- [ ] Autosave and Cmd+S work.
- [ ] Publish and unpublish work.
- [ ] Right panel shows metadata, outline, preview, publish controls, and advanced Admin links.
- [ ] Payload rich fields exist on all four collections.
- [ ] Markdown migration is repeatable and preserves legacy Markdown.
- [ ] Public pages and preview render rich content.
- [ ] Agent context uses `contentText`, `contentExcerpt`, and `contentOutline`.
- [ ] Command palette creates content through Dashboard Writing.
- [ ] Typecheck, lint, unit tests, content tests, and Writing E2E pass.
