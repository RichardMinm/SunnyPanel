# Dashboard Content Studio Design

**Date:** 2026-06-11
**Status:** Ready for user review
**Scope:** Dashboard-owned editing for Posts, Notes, Updates, and Pages

---

## Goal

Build a complete Dashboard-native content studio that takes over day-to-day creation, editing, previewing, publishing, and organizing of `posts`, `notes`, `updates`, and `pages`.

The final experience should feel like an Outline-style writing surface on Mac: quiet, immersive, WYSIWYG, slash-command driven, image-paste friendly, and integrated with SunnyPanel's Agent context model. Payload remains the system of record, auth layer, media store, and advanced admin fallback, but Dashboard becomes the primary editorial workspace.

This is a full target design, not a reduced pilot. Implementation may be split into reviewable tasks, but final acceptance requires the complete system described here.

---

## Current State

The existing codebase already has pieces that support this direction:

- Payload Admin is branded and partially unified with Dashboard styling.
- `/admin` dashboard redirects to `/dashboard`.
- `posts`, `notes`, `updates`, and `pages` already use a shared Markdown field helper.
- The current editor is `@mdxeditor/editor`, storing Markdown strings in `content`.
- Dashboard has dedicated workspace views for schedule, memory, checklist, and timeline.
- Dashboard has a `writing` Agent mode, but no native content library or direct editor.
- Public pages render Markdown through shared markdown/prose components.

Important current files:

- `payload.config.ts`
- `src/components/admin/SunnyAdminDashboard.tsx`
- `src/lib/payload/markdown-fields.ts`
- `src/components/editor/MarkdownEditorField.tsx`
- `src/components/editor/MarkdownContent.tsx`
- `src/components/dashboard/DashboardShell.tsx`
- `src/components/dashboard/DashboardIconBar.tsx`
- `src/app/api/editor/upload-media/route.ts`

The gap: content editing still happens in Payload Admin collection pages. Dashboard is not yet the writing environment.

---

## Product Direction

Dashboard gets a first-class "Writing" workspace.

```text
Dashboard
  Left navigation
    Writing

Writing workspace
  Left column: content library
  Center: immersive Tiptap WYSIWYG editor
  Right column: metadata, outline, preview, publishing, Agent context
```

Payload Admin remains available through "Advanced Admin" links, but normal editing routes should point into Dashboard.

Daily workflow:

1. Open `/dashboard`.
2. Enter Writing.
3. Create or select a Post, Note, Update, or Page.
4. Write in an Outline-like editor.
5. Paste screenshots or drag images directly into the document.
6. Use `/` to insert rich blocks.
7. Use the right panel for metadata, outline, preview, and publishing.
8. Let Agent read clean derived fields instead of raw editor JSON.

---

## Technology Choice

Use Tiptap for the Dashboard editor.

Reasons:

- Open-source editor framework.
- ProseMirror-based rich document model.
- Strong fit for slash commands and block-like editing.
- Headless enough to match SunnyPanel's Dashboard design.
- Better aligned with Outline-style WYSIWYG than the current Markdown editor.

Recommended package family:

```text
@tiptap/react
@tiptap/starter-kit
@tiptap/extension-image
@tiptap/extension-link
@tiptap/extension-placeholder
@tiptap/extension-task-list
@tiptap/extension-task-item
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-cell
@tiptap/extension-table-header
@tiptap/extension-typography
@tiptap/suggestion
```

Custom SunnyPanel extensions:

- `Callout`
- `StableBlockId`
- `PasteImageUpload`
- `SlashCommand`
- `FloatingSelectionMenu`
- `ContentOutline`

The existing `@mdxeditor/editor` dependency can be removed after migration and renderer replacement are complete.

---

## Content Kinds

The editor serves four Payload collections through one Dashboard abstraction.

```ts
export type DashboardContentKind = "posts" | "notes" | "updates" | "pages";
```

Each kind has a profile.

```ts
export type DashboardContentProfile = {
  kind: DashboardContentKind;
  label: string;
  titleMode: "required" | "derived";
  summaryMode: "required" | "derived" | "none";
  supportsSlug: boolean;
  supportsCoverImage: boolean;
  supportsTags: boolean;
  supportsPinned: boolean;
  supportsMood: boolean;
  supportsUpdateType: boolean;
  supportsLink: boolean;
};
```

Profiles:

```text
Post
  title required
  summary required
  slug required
  cover image supported
  tags supported
  full editor profile

Page
  title required
  slug required
  cover image supported
  full editor profile

Note
  title derived from first meaningful block
  category supported
  mood supported
  pinned supported
  cover image supported
  compact editor profile with full slash menu available

Update
  title derived from first meaningful block
  update type supported
  link supported
  cover image supported
  compact editor profile with full slash menu available
```

Notes and Updates do not need heavy visible metadata while writing. Their right panel should stay collapsed by default unless required fields need attention.

---

## Data Model

Move primary content from Markdown strings to structured rich text JSON.

Each collection gets the same core content fields:

```ts
type RichContentDocument = {
  type: "doc";
  content?: RichContentBlock[];
};

type ContentOutlineItem = {
  id: string;
  text: string;
  level: 1 | 2 | 3;
  order: number;
};
```

Payload fields added to `posts`, `notes`, `updates`, and `pages`:

```text
contentRich          json, required
contentText          textarea/text, derived
contentExcerpt       text/textarea, derived
contentOutline       json, derived
contentVersion       text, default "tiptap-v1"
legacyContentMarkdown textarea, migration and rollback source
```

Existing `content` Markdown field should be retained during migration as a legacy source, then hidden from normal Admin editing. Dashboard writes `contentRich`.

Derived fields serve search, public cards, and Agent context:

```text
contentText
  Full normalized plain text.

contentExcerpt
  Short readable excerpt from first useful text block.

contentOutline
  Stable H1/H2/H3 outline with block ids.

contentVersion
  Explicit schema version for future migrations.
```

Every editable block should have a stable id:

```ts
type AgentEditableBlock = {
  id: string;
  type:
    | "paragraph"
    | "heading"
    | "blockquote"
    | "callout"
    | "listItem"
    | "taskItem"
    | "codeBlock";
  text: string;
  level?: number;
};
```

Stable ids enable future Agent operations:

- Rewrite selected block.
- Summarize a section.
- Expand a heading into draft content.
- Reorder sections from an outline.
- Convert Notes into a Post draft.

---

## Payload Changes

Create a shared content field helper, replacing the current Markdown-focused helper for these collections.

```ts
richContentField({
  label: "正文",
  profile: "full" | "compact",
});
```

Collection changes:

- `src/collections/Post.ts`
- `src/collections/Page.ts`
- `src/collections/Note.ts`
- `src/collections/Update.ts`
- `src/lib/payload/rich-content-fields.ts`
- `src/lib/payload/rich-content-hooks.ts`

Payload hooks:

```text
beforeValidate / beforeChange
  Ensure contentRich is a valid Tiptap document.
  Ensure every block has a stable id.
  Generate contentText.
  Generate contentExcerpt.
  Generate contentOutline.
  Preserve legacyContentMarkdown when migrating.
```

Payload Admin behavior:

- Admin still exposes collections for advanced management.
- Admin should not be the default writing path.
- The rich JSON field can be hidden or rendered read-only in Admin.
- Admin collection list rows should include links back to Dashboard editing.

---

## Dashboard Writing Workspace

Add a dedicated Dashboard view:

```text
src/components/dashboard/writing/
  WritingWorkspace.tsx
  WritingLibrary.tsx
  WritingEditorPane.tsx
  WritingMetaPanel.tsx
  WritingOutlinePanel.tsx
  WritingPreviewPanel.tsx
  WritingPublishControls.tsx
  WritingEmptyState.tsx
  writing-types.ts
```

Dashboard routing behavior:

- Add `writing` back to `DASHBOARD_MODES`.
- Selecting Writing renders `WritingWorkspace`.
- Command palette "New Post", "New Note", "New Update", and "New Page" open Dashboard Writing, not Payload Admin.
- Admin links remain under "Advanced Admin".

Content library:

```text
Filters
  All
  Posts
  Notes
  Updates
  Pages
  Drafts
  Published
  Private
  Recently edited

Rows
  title or derived excerpt
  content kind
  status
  visibility
  updated time
```

Creation actions:

```text
New Post
New Note
New Update
New Page
```

Mac desktop layout:

```text
Left library: 280-320px
Center editor: 720-860px readable width
Right panel: 320-380px
```

Large screens should keep all three panes visible. Narrow screens can collapse the library and right panel, but Mac desktop is the primary target.

---

## Editor Experience

The editor should feel like a focused writing document, not a CMS form.

Visible chrome:

- Minimal top status row.
- No permanent heavy toolbar.
- Floating selection menu for inline marks.
- Slash menu for block insertion.
- Subtle block handle on hover.
- Save status in the top row.

Supported inline marks:

```text
Bold
Italic
Strike
Inline code
Link
```

Supported blocks:

```text
Paragraph
Heading 1
Heading 2
Heading 3
Bullet list
Ordered list
Task list
Blockquote
Code block
Horizontal rule
Image
Table
Callout
```

Slash menu:

```text
/text
/h1
/h2
/h3
/bullet
/numbered
/task
/quote
/code
/divider
/image
/table
/callout
```

Markdown shortcuts:

```text
# heading
## heading
### heading
- bullet
1. numbered
[] task
> quote
``` code
```

Mac shortcuts:

```text
Cmd+S             Save now
Cmd+K             Link
Cmd+B             Bold
Cmd+I             Italic
Cmd+Option+1      Heading 1
Cmd+Option+2      Heading 2
Cmd+Option+3      Heading 3
Cmd+Shift+7       Ordered list
Cmd+Shift+8       Bullet list
Cmd+/             Open command hint
Esc               Close floating UI
Enter             New paragraph
Shift+Enter       Soft break
```

Autosave:

```text
Input changes
  debounce save after 1.5s
  show Saving...
  show Saved when server confirms
  show Save failed with retry action

Cmd+S
  flush pending debounce
  save immediately
```

Conflict handling:

```text
PATCH sends lastKnownUpdatedAt.
Server returns 409 if the document changed elsewhere.
Dashboard shows refresh and overwrite actions.
```

---

## Image Paste And Drag Upload

Image paste and drag are first-class writing features.

Paste behavior:

```text
Cmd+V with image file
  insert temporary uploading image block
  upload to Payload Media
  replace temporary block with final image URL
  keep cursor near inserted image

Cmd+V with remote image URL
  insert remote image or transfer to Media based on implementation support

Cmd+V with rich web content
  preserve headings, lists, links, and plain images where possible
  sanitize unsupported styles
```

Drag behavior:

```text
Drag image from Finder
  upload to Payload Media
  insert at drop cursor
```

Failure behavior:

```text
Upload fails
  image block shows failed state
  actions: Retry, Remove
```

Media API:

- Continue using `src/app/api/editor/upload-media/route.ts`.
- Extend the API contract as needed for Dashboard editor upload metadata.
- Uploaded media remains in Payload Media.

Image metadata:

- Alt text is editable from image block controls.
- Caption is not part of the required first rich-content schema; this keeps image blocks focused on writing, upload, accessibility, and rendering reliability.

---

## Metadata, Outline, Preview, Publish

Right panel tabs:

```text
Metadata
Outline
Preview
Agent
```

Metadata tab:

```text
Post
  title
  slug
  summary
  tags
  cover image
  status
  visibility
  publishedAt

Page
  title
  slug
  cover image
  status
  visibility

Note
  category
  mood
  pinned
  cover image
  status
  visibility

Update
  type
  link
  cover image
  status
  visibility
```

Outline tab:

- Reads headings from editor state and saved `contentOutline`.
- Shows H1/H2/H3 hierarchy.
- Click jumps to block.
- Highlights current section.
- Supports collapsing outline levels.

Preview tab:

- Renders saved or current rich content with `RichContentRenderer`.
- Provides link to `/preview/[collection]/[id]`.
- Provides public URL when published and public.

Publish controls:

```text
Save Draft
Publish
Unpublish
Open Preview
Open Public Page
Advanced Admin
```

Publish validation:

- Posts require title, summary, slug, and content.
- Pages require title, slug, and content.
- Notes require content and category.
- Updates require content and type.
- Missing fields are shown in the right panel with direct focus actions.

---

## API Design

Create Dashboard content API routes:

```text
GET    /api/dashboard/content
POST   /api/dashboard/content
GET    /api/dashboard/content/[collection]/[id]
PATCH  /api/dashboard/content/[collection]/[id]
DELETE /api/dashboard/content/[collection]/[id]
POST   /api/dashboard/content/[collection]/[id]/publish
POST   /api/dashboard/content/[collection]/[id]/unpublish
```

Allowed collections:

```ts
const dashboardContentCollections = [
  "posts",
  "notes",
  "updates",
  "pages",
] as const;
```

Authentication:

- Use existing `getPayloadAuthResult()`.
- Reject unauthenticated users with 401.
- Use Payload local API.
- Keep Payload as the permission authority.

List response:

```ts
type DashboardContentListItem = {
  id: number;
  collection: DashboardContentKind;
  title: string;
  excerpt: string;
  status: "draft" | "published";
  visibility: "private" | "public";
  updatedAt: string;
  publishedAt?: string | null;
};
```

Document response:

```ts
type DashboardContentDocument = {
  id: number;
  collection: DashboardContentKind;
  title?: string;
  slug?: string;
  summary?: string;
  contentRich: RichContentDocument;
  contentText: string;
  contentExcerpt: string;
  contentOutline: ContentOutlineItem[];
  metadata: Record<string, unknown>;
  status: "draft" | "published";
  visibility: "private" | "public";
  updatedAt: string;
  publishedAt?: string | null;
};
```

---

## Public Rendering

Replace Markdown rendering for the four collections with a shared rich renderer.

```text
src/components/content/RichContentRenderer.tsx
src/components/content/rich-content-types.ts
src/app/styles/sunny-rich-content.css
```

Renderer responsibilities:

- Render Tiptap JSON safely.
- Match editor typography tokens.
- Support all first-class blocks.
- Render dark and light themes.
- Keep code blocks, tables, images, and callouts readable.

Routes to update:

- `src/app/(site)/blog/[slug]/page.tsx`
- `src/app/(site)/[slug]/page.tsx`
- `src/app/(site)/notes/page.tsx`
- `src/app/(site)/updates/page.tsx`
- `src/app/(site)/preview/[collection]/[id]/page.tsx`
- Public cards that currently read Markdown-derived text.

WYSIWYG rule:

The editor and public renderer do not need identical chrome, but content layout, typography, block spacing, image sizing, callout style, table treatment, and code block style should be close enough that writing in Dashboard accurately predicts the published result.

---

## Migration

Write a repeatable migration script:

```text
scripts/migrate-markdown-to-rich-content.ts
```

Migration behavior:

1. Find `posts`, `notes`, `updates`, and `pages` with Markdown `content`.
2. Copy old Markdown into `legacyContentMarkdown` if not already present.
3. Convert Markdown into Tiptap JSON.
4. Ensure stable block ids.
5. Generate `contentText`, `contentExcerpt`, and `contentOutline`.
6. Save `contentRich` and `contentVersion`.
7. Print a summary by collection.

Migration must be safe to rerun:

- Do not overwrite `legacyContentMarkdown` once set unless a force flag is explicitly used.
- Skip documents already migrated to the current `contentVersion` unless a force flag is explicitly used.
- Report conversion warnings.

The old Markdown field remains available as rollback source during the transition.

---

## Agent Integration

Agent should primarily consume derived fields, not raw Tiptap JSON.

Update Agent content context to read:

```text
title
summary or contentExcerpt
contentText
contentOutline
collection
id
status
visibility
updatedAt
```

Files likely affected:

- `src/lib/payload/workspace.ts`
- `src/lib/agent/context-builder.ts`
- `src/lib/agent/prompts.ts`
- `src/lib/agent/prompts/content.ts`
- `src/lib/agent/tools.ts`
- `src/lib/agent/tool-shared.ts`
- `src/app/api/command/search/route.ts`

Agent writing behavior:

- Agent may still draft content as Markdown internally.
- Server converts Agent draft Markdown to `contentRich` before saving.
- Agent-created drafts appear in Dashboard Writing.
- Agent result cards link to Dashboard edit URLs.

Block-level Agent work is enabled by stable block ids:

- Rewrite selected block.
- Expand selected heading.
- Turn Notes into a Post.
- Generate an outline before writing.
- Summarize sections from `contentOutline`.

---

## Command Palette And Navigation

Update command palette static actions:

```text
New Post    -> /dashboard?mode=writing&new=posts
New Note    -> /dashboard?mode=writing&new=notes
New Update  -> /dashboard?mode=writing&new=updates
New Page    -> /dashboard?mode=writing&new=pages
Admin       -> /admin/collections/posts or advanced admin landing
```

Dynamic command results:

- Draft/private content opens Dashboard editor.
- Public content can still open public page when selected from public scope.
- Authenticated private scope shows Dashboard edit targets.

Dashboard sidebar:

- Restore or add Writing as a workspace item.
- Keep Agent Composer writing mode for Agent-assisted drafting.
- Distinguish "Writing workspace" from "Writing Agent mode" through labels and UI location.

---

## Mac-First UX Requirements

Primary platform:

- Mac desktop browsers.
- MacBook Air/Pro 13-16 inch.
- External displays.

Layout requirements:

- Three-pane layout should be the default on Mac widths.
- Editor readable width should stay around 720-860px.
- No viewport-scaled font sizes.
- No UI text overlap.
- Stable dimensions for sidebars, toolbar/status row, icon buttons, and metadata controls.

Input requirements:

- Mac shortcuts must work.
- Trackpad scrolling should feel natural.
- Image paste from screenshots must work.
- Drag from Finder must work.
- Keyboard-first writing must be smooth.

Mobile:

- Mobile must not break.
- Full mobile writing parity is not required for this design.
- Library and right panel can collapse into drawers on small screens.

---

## Styling

Use the existing Dashboard visual language:

- Quiet, work-focused, Codex-like workspace.
- No marketing hero.
- No decorative gradient orbs.
- No card-inside-card layouts.
- Avoid oversized type inside compact panels.
- Keep controls icon-based where appropriate.
- Use existing Dashboard icon system or local icons.

New CSS:

```text
src/app/styles/sunny-dashboard-writing.css
src/app/styles/sunny-rich-content.css
```

Reuse:

- `sunny-tokens.css`
- `sunny-ui.css`
- `sunny-dashboard-shell.css`
- `sunny-prose.css` where compatible

The editor should read as a document, not a form. Metadata belongs in the right panel, not above every paragraph.

---

## Testing And Verification

Unit and integration coverage:

- Rich content validation.
- Markdown to rich content conversion.
- Derived `contentText`, `contentExcerpt`, and `contentOutline`.
- API auth and collection allowlist.
- Publish validation.
- Command palette URL changes.
- Agent context reads derived fields.

E2E coverage:

- Open Dashboard Writing.
- Create Post.
- Create Note.
- Create Update.
- Create Page.
- Type rich content.
- Use slash menu to insert heading, list, callout, image, table, code block.
- Paste image and verify upload completes.
- Save draft and reload.
- Publish content.
- Open preview.
- Open public page for published public content.
- Confirm private/draft content does not appear publicly.

Visual verification:

- Mac desktop viewport around 1440px.
- Large desktop viewport around 1920px.
- Narrow viewport with collapsed panels.
- Light and dark themes.
- Editor and public renderer comparison for the same document.

Core commands:

```text
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run generate:types
```

---

## Acceptance Criteria

The work is complete when all of the following are true:

- Dashboard has a first-class Writing workspace.
- Posts, Notes, Updates, and Pages can be created in Dashboard.
- Posts, Notes, Updates, and Pages can be edited in Dashboard.
- The shared Tiptap editor is WYSIWYG and slash-command driven.
- The editor supports paste and drag image upload to Payload Media.
- The editor supports the required rich blocks.
- Autosave and Cmd+S save work.
- Publish and unpublish work from Dashboard.
- The right panel manages metadata, outline, preview, and publishing.
- Existing Markdown content is migrated to rich JSON.
- Legacy Markdown is preserved for rollback.
- Public routes render `contentRich`.
- Preview routes render `contentRich`.
- Agent context uses `contentText` and `contentOutline`.
- Command palette content creation routes into Dashboard.
- Payload Admin remains available for advanced management.
- Mac desktop experience is the primary polished target.

---

## Open Decisions Resolved

- Dashboard should own all four content types: resolved yes.
- Markdown string should become structured rich text JSON: resolved yes.
- WYSIWYG is required: resolved yes.
- Open-source editor preference: resolved with Tiptap.
- Payload may be rewritten: resolved yes.
- One complete design target rather than a cautious partial scope: resolved yes.
- Mac desktop is the primary UX target: resolved yes.
