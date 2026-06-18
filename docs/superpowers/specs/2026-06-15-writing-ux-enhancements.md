# Writing Studio UX Enhancements

> 13 areas, 3 priority tiers. User has provided exhaustive interaction specs.

## What Already Exists

| Feature | Status | Notes |
|---------|:------:|-------|
| Focus mode | ✅ partial | `useWritingLayout` manages state + localStorage, `WritingWorkspace` applies grid classes. Needs: Esc key, restore layout on exit |
| Library collapse | ✅ partial | Layout state exists. Needs: toggle button UI |
| Inspector collapse | ✅ partial | Layout state exists. Needs: edge hover peek, pin button |
| Slash Command menu | ✅ | `SlashCommandList` + `SlashCommandMenu` components exist, wired into Tiptap |
| AI Bubble menu | ✅ | `EditorBubbleMenu` with rewrite/polish/condense/expand actions |
| Floating format menu | ✅ | `FloatingFormatMenu` component |
| Editor toolbar | ✅ | `EditorToolbar` with table/callout insert + AI actions |
| localStorage persistence | ✅ | `useWritingLayout` persists to localStorage |
| Autosave (basic) | ✅ | `useWritingDocuments` has debounced save |
| Document rename/delete | ✅ | `WritingDocumentRow` has menu with rename/duplicate/delete |

## What Needs Building

### P0 — Layout & Focus (Priority: Immediate)

#### 1. Left Global Nav Auto-Collapse
**Files:** `DashboardIconBar.tsx`, `sunny-dashboard-shell.css`
- Add `isCollapsed` state + `isPinned` state
- Collapsed width: 56px (icons only), Expanded: 272px
- Hover to expand (200ms transition), mouseleave → 300ms delay → collapse
- Pin button in sidebar footer to lock expanded
- `title` attributes for tooltips in collapsed mode
- CSS: `transition: width 200ms ease` on sidebar column

#### 2. Library Collapse Toggle
**Files:** `WritingLibrary.tsx`, `sunny-dashboard-writing.css`
- Add collapse button (chevron icon) to `WritingLibraryHeader`
- Collapsed: 0px width (hidden) or 48px (icon strip)
- Expanding: grid column animates via existing `transition: grid-template-columns 200ms`
- Write `libraryOpen` to localStorage (already done, just needs toggle UI)

#### 3. Inspector Hover Peek + Pin
**Files:** `WritingMetaPanel.tsx`, `WritingWorkspace.tsx`, `sunny-dashboard-writing.css`
- Collapse button in meta panel header
- Edge trigger zone: 24px strip on right edge
- Hover zone → slide panel out (200ms), mouseleave + no pin → slide back
- Pin button to lock open
- Write `inspectorOpen` to localStorage (already done)

#### 4. Focus Mode Enhancements
**Files:** `WritingWorkspace.tsx`, `use-writing-layout.ts`
- Add Esc key handler → `toggleFocusMode()`
- Save pre-focus layout state before entering (libraryOpen, inspectorOpen)
- Restore layout on exit
- Focus mode: hide library toggle, hide inspector toggle, center editor
- CSS: `.is-focus-mode` class already exists in grid

#### 5. Autosave Unification
**Files:** `use-writing-documents.ts`, `WritingEditorPane.tsx`, `WritingMetaPanel.tsx`
- Single `saveState` for entire document (title + body + summary + metadata)
- 800ms debounce after last edit
- States: "saving..." | "saved" | "save failed (retry)" | "offline"
- `beforeunload` listener: `if (isDirty) e.preventDefault()`
- Remove per-field save, one atomic save operation

### P1 — Editor Interactions (Priority: High)

#### 6. Slash Command Dark Mode Polish
**Files:** `SlashCommandMenu.tsx`, `sunny-dashboard-writing.css`
- Already functional — verify dark mode CSS matches spec (#1e293b bg, #334155 border, #e5e7eb text)
- Verify keyboard nav (↑↓ Enter Esc)
- Add search filter (type "/图" → filter to image-related)

#### 7. AI Float Menu Dark Mode Polish
**Files:** `EditorBubbleMenu.tsx`, `FloatingFormatMenu.tsx`, `sunny-dashboard-writing.css`
- Already functional — verify dark mode styling
- Verify: menu doesn't overlap selected text
- Verify: AI preview panel has replace/insert/copy/cancel

#### 8. Document Quick Actions
**Files:** `WritingDocumentRow.tsx`
- Already has: rename, duplicate, delete (via ⋯ menu)
- Add to menu: "复制链接" (copy share URL to clipboard)
- Add right-click context menu (same items)
- Menu already has dark styling — verify consistent

#### 9. Meta Panel Section Collapse
**Files:** `WritingMetaPanel.tsx`, `sunny-dashboard-writing.css`
- Each section gets a summary/details or collapsible header
- Section titles: 基本信息, 发布设置, 内容结构, 高级设置
- Chevron rotation indicator (▲/▼)
- Persist collapsed state per-section to localStorage keyed by section name
- Default: 基本信息 expanded, 发布设置 expanded, 高级设置 collapsed

### P2 — Polish (Priority: Medium)

#### 10. Writing Stats
**Files:** New component `WritingStats.tsx`, `sunny-dashboard-writing.css`
- Word count: count CJK chars + space-delimited words
- Reading time: chars / 400 (Chinese reading speed)
- Last edit: formatted time, updates on save
- Position: bottom of editor canvas, subtle (#64748b)

#### 11. Keyboard Shortcuts
**Files:** `WritingWorkspace.tsx` (or new hook `use-writing-keyboard.ts`)
- Cmd/Ctrl+S → flushSave()
- Cmd/Ctrl+P → togglePreviewMode()
- Cmd/Ctrl+Shift+F → toggleFocusMode()
- Esc → exit focus mode / close menus
- `/` → opens slash menu (already handled by Tiptap)
- Add to button tooltips: e.g., title="保存 (⌘S)"

#### 12. Preview Mode Polish
**Files:** `WritingPreviewPane.tsx`, `sunny-dashboard-writing.css`
- Already works — verify dark mode styling consistent with editor
- Add "返回编辑" button is more prominent

## Architecture

```
WritingLayoutProvider (context)
├── layout: { focusMode, libraryOpen, inspectorOpen, previewMode }
├── persist to localStorage
├── Esc key handler
└── pre-focus state save/restore

WritingWorkspace
├── DashboardIconBar (global nav) ← auto-collapse
├── WritingLibrary ← toggle button
├── WritingEditorPane (editor + toolbar + bubble + slash)
│   ├── EditorToolbar (sticky, auto-hide)
│   ├── SlashCommandMenu (already built)
│   ├── EditorBubbleMenu (already built)
│   ├── FloatingFormatMenu (already built)
│   └── WritingStats (new)
├── WritingMetaPanel ← hover peek + pin + section collapse
└── useKeyboardShortcuts (new hook)
```

## File Changes Summary

| File | Action | Area |
|------|--------|------|
| `DashboardIconBar.tsx` | Modify | P0.1 auto-collapse |
| `sunny-dashboard-shell.css` | Modify | P0.1 collapse styles |
| `WritingLibraryHeader.tsx` | Modify | P0.2 collapse toggle |
| `WritingLibrary.tsx` | Modify | P0.2 collapsed state |
| `WritingMetaPanel.tsx` | Modify | P0.3 peek/pin + P1.9 sections |
| `WritingWorkspace.tsx` | Modify | P0.3 peek trigger + P0.4 Esc + P2.11 keys |
| `use-writing-layout.ts` | Modify | P0.4 focus restore + pre-focus state |
| `use-writing-documents.ts` | Modify | P0.5 unified autosave |
| `WritingEditorPane.tsx` | Modify | P0.5 saveState + P2.10 stats |
| `SlashCommandMenu.tsx` | Verify/Polish | P1.6 dark mode + search |
| `EditorBubbleMenu.tsx` | Verify/Polish | P1.7 dark mode |
| `WritingDocumentRow.tsx` | Modify | P1.8 right-click + copy-link |
| `WritingStats.tsx` | **New** | P2.10 word count |
| `sunny-dashboard-writing.css` | Modify | P0.3 peek + P1.6/P1.7 dark + P2.10 stats |

## Verification

1. Open writing page → left nav should be collapsed (icons only), move mouse over → expands
2. Click library collapse button → library hides, editor expands
3. Hover right edge → inspector slides out, move away → slides back, pin → stays
4. Click "专注" → everything collapses, Esc → restores layout
5. Edit text → wait 800ms → "已保存" appears in topbar
6. Type "/" in editor → slash menu appears with dark styling
7. Select text → AI bubble appears, click "润色" → preview panel
8. Right-click document → context menu with copy-link
9. Word count visible at editor bottom, updates on save
10. Cmd+S → immediate save, Cmd+Shift+F → focus mode
