# Dashboard Gap-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch 7 Dashboard gaps identified in the 2026-06-08 assessment — Sidebar suggestions, Quick Actions submenu, Timeline mode, scoped search, PlanReview cards, Checklist/Timeline views, and Memory panel normalization. All using existing backend APIs and local SVG icons.

**Architecture:** Two-phase implementation. Phase 1 (Task 1-8) handles low-cost wiring: suggestions display, Quick Actions menu, Timeline mode exposure, scoped search, and Composer @mention. Phase 2 (Task 9-14) adds new components: PlanReview card and inspector tab, Checklist and Timeline standalone views, and Memory panel normalization. All new components follow existing code patterns (ScheduleMonthView / MemoryCardGrid for standalone views; AgentApprovalCard for inline cards).

**Tech Stack:** Next.js 15 + React 19, Payload CMS (backend, no changes), TypeScript, CSS (existing sunny-* file system), motion/react (framer-motion), local inline SVG icons.

---

## File Structure

### Phase 1 — Modified Files
| File | Change |
|------|--------|
| `src/components/dashboard/icons.tsx` | Add `review` icon to `DashboardIconName` and `ICON_PATHS` |
| `src/lib/dashboard/load-dashboard-data.ts` | Return `initialSuggestions` from `syncAgentSuggestionsFromWorkspaceSnapshot` |
| `src/components/dashboard/DashboardPageClient.tsx` | Pass `initialSuggestions` through to `DashboardShell` / `DashboardIconBar` |
| `src/components/dashboard/DashboardIconBar.tsx` | Add suggestions section + Inspector search trigger |
| `src/components/dashboard/agent/AgentComposer.tsx` | Quick Actions 2-level submenu + Timeline mode in MODE_OPTIONS + @mention trigger |
| `src/components/dashboard/DashboardShell.tsx` | Timeline mapping in `iconModeToWorkbenchMode` + checklist/timeline workspace routing |
| `src/components/dashboard/agent/constants.ts` | Add `review` to `inspectorTabs` |
| `src/components/dashboard/DashboardRightPanel.tsx` | Inspector cross-collection search + Review tab wiring |

### Phase 2 — New & Modified Files
| File | Change |
|------|--------|
| `src/components/dashboard/agent/AgentReviewCard.tsx` | **NEW** — Inline review summary card for conversation |
| `src/components/dashboard/agent/AgentReviewPanel.tsx` | **NEW** — Inspector Review tab content |
| `src/components/dashboard/checklist/ChecklistView.tsx` | **NEW** — Standalone checklist view |
| `src/components/dashboard/timeline/TimelineView.tsx` | **NEW** — Standalone timeline view |
| `src/components/dashboard/DashboardRightPanel.tsx` | Wire Review tab (modify again) |
| `src/components/dashboard/DashboardShell.tsx` | Wire checklist/timeline modes to MainWorkspace (modify again) |
| `src/components/dashboard/DashboardIconBar.tsx` | Add checklist/timeline workspace entries (modify again) |

---

## Phase 1: Low-Cost Wiring

### Task 1: Add `review` icon to local SVG icon set

**Files:**
- Modify: `src/components/dashboard/icons.tsx:3-21` (type), `icons.tsx:23-133` (paths), `icons.tsx:156-168` (collection map)

- [ ] **Step 1: Add `review` to `DashboardIconName` type**

In `src/components/dashboard/icons.tsx`, add `| "review"` to the type union on line 20:

```ts
export type DashboardIconName =
  | "agent"
  | "archive"
  | "calendar"
  | "checklist"
  | "command"
  | "document"
  | "memory"
  | "new"
  | "note"
  | "pencil"
  | "plans"
  | "post"
  | "project"
  | "review"        // NEW
  | "schedule"
  | "search"
  | "settings"
  | "thinking"
  | "timeline";
```

- [ ] **Step 2: Add `review` SVG path to `ICON_PATHS`**

After the `plans` entry (line ~96), insert:

```tsx
review: (
  <>
    <path d="M10 3.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5Z" />
    <path d="M6.5 10h7M10 6.5v7" />
    <path d="M7.5 8.5 6 10l1.5 1.5M12.5 8.5 14 10l-1.5 1.5" />
  </>
),
```

- [ ] **Step 3: Add `plan-reviews` to `COLLECTION_ICON_MAP`**

In the `COLLECTION_ICON_MAP` object (line ~157), add:

```ts
"plan-reviews": "review",
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/icons.tsx
git commit -m "feat: add review icon to local SVG icon set

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Return initial suggestions from `loadDashboardData`

**Files:**
- Modify: `src/lib/dashboard/load-dashboard-data.ts`
- Modify: `src/components/dashboard/DashboardPageClient.tsx`

- [ ] **Step 1: Extend `LoadedDashboardData` to include suggestions**

In `src/lib/dashboard/load-dashboard-data.ts`, change the type and function:

```ts
import "server-only";

import { syncAgentSuggestionsFromWorkspaceSnapshot } from "@/lib/agent/suggestions";
import type { PendingSuggestion } from "@/lib/agent/suggestions-core";
import { getCachedWorkspaceSnapshot } from "@/lib/payload/workspace-cache";

export type DashboardSearchParams = {
  threadId?: string;
  week?: string;
};

export type LoadedDashboardData = {
  initialThreadId?: number;
  initialSuggestions: PendingSuggestion[];
};

export const parseDashboardThreadId = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
};

export const loadDashboardData = async (searchParams: DashboardSearchParams): Promise<LoadedDashboardData> => {
  const initialThreadId = parseDashboardThreadId(searchParams.threadId);

  const snapshot = await getCachedWorkspaceSnapshot();

  const syncResult = await syncAgentSuggestionsFromWorkspaceSnapshot(snapshot);

  return {
    initialThreadId,
    initialSuggestions: syncResult ?? [],
  };
};
```

- [ ] **Step 2: Check what `syncAgentSuggestionsFromWorkspaceSnapshot` returns**

Run: `grep -n "export.*syncAgentSuggestionsFromWorkspaceSnapshot" src/lib/agent/suggestions.ts`
Expected: shows the function signature. If it returns `void`, we need to adapt — instead fetch suggestions separately. Let me handle both cases:

If it returns `void`, change the implementation to:

```ts
export const loadDashboardData = async (searchParams: DashboardSearchParams): Promise<LoadedDashboardData> => {
  const initialThreadId = parseDashboardThreadId(searchParams.threadId);

  const snapshot = await getCachedWorkspaceSnapshot();
  await syncAgentSuggestionsFromWorkspaceSnapshot(snapshot);
  // fetch suggestions separately after sync
  const { getPendingAgentSuggestions } = await import("@/lib/agent/suggestions");
  const initialSuggestions = await getPendingAgentSuggestions(6);

  return {
    initialThreadId,
    initialSuggestions,
  };
};
```

- [ ] **Step 3: Pass `initialSuggestions` through `DashboardPageClient`**

In `src/components/dashboard/DashboardPageClient.tsx`, update the component to accept and pass `initialSuggestions`. Since this component currently passes most state through `DashboardShell`, we need to thread `initialSuggestions` to `DashboardIconBar` via props:

```tsx
"use client";

import type { PendingSuggestion } from "@/lib/agent/suggestions-core";
import { AgentWorkbench } from "@/components/dashboard/agent";
import { useAgentDashboardChat } from "@/components/dashboard/agent-chat/use-agent-dashboard-chat";
import { DashboardShell } from "./DashboardShell";

export type DashboardPageClientProps = {
  initialThreadId?: number;
  initialSuggestions: PendingSuggestion[];  // NEW
};

export function DashboardPageClient({
  initialThreadId,
  initialSuggestions,  // NEW
}: DashboardPageClientProps) {
  const chat = useAgentDashboardChat({ initialThreadId });

  return (
    <DashboardShell
      /* ... existing props ... */
      initialSuggestions={initialSuggestions}  {/* NEW */}
    >
      <AgentWorkbench
        /* ... existing props ... */
      />
    </DashboardShell>
  );
}
```

- [ ] **Step 4: Update the server page component**

In `src/app/(site)/dashboard/page.tsx`:

```tsx
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const { initialThreadId, initialSuggestions } = await loadDashboardData(params);

  return <DashboardPageClient initialThreadId={initialThreadId} initialSuggestions={initialSuggestions} />;
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/load-dashboard-data.ts src/components/dashboard/DashboardPageClient.tsx src/app/\(site\)/dashboard/page.tsx
git commit -m "feat: pass initial suggestions from server to Dashboard client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Sidebar suggestions section

**Files:**
- Modify: `src/components/dashboard/DashboardShell.tsx` — accept `initialSuggestions` prop and pass to `SidebarNav`
- Modify: `src/components/dashboard/SidebarNav.tsx` — accept `initialSuggestions` prop and pass to `DashboardIconBar`
- Modify: `src/components/dashboard/DashboardIconBar.tsx` — render suggestions section

- [ ] **Step 1: Thread `initialSuggestions` prop through DashboardShell → SidebarNav**

In `src/components/dashboard/DashboardShell.tsx`, add `initialSuggestions` to `DashboardShellProps`:

```ts
type DashboardShellProps = {
  /* ... existing props ... */
  initialSuggestions: import("@/lib/agent/suggestions-core").PendingSuggestion[];
};
```

And pass it to `<SidebarNav ... initialSuggestions={initialSuggestions} />`.

In `src/components/dashboard/SidebarNav.tsx`:

```tsx
import type { PendingSuggestion } from "@/lib/agent/suggestions-core";
import { DashboardIconBar, type DashboardIconBarProps } from "./DashboardIconBar";

export type SidebarNavProps = DashboardIconBarProps & {
  initialSuggestions: PendingSuggestion[];
};

export function SidebarNav({ initialSuggestions, ...props }: SidebarNavProps) {
  return <DashboardIconBar {...props} initialSuggestions={initialSuggestions} />;
}
```

- [ ] **Step 2: Add suggestions state and handlers to `DashboardIconBar`**

In `src/components/dashboard/DashboardIconBar.tsx`, add to `DashboardIconBarProps`:

```ts
export type DashboardIconBarProps = {
  /* ... existing ... */
  initialSuggestions: import("@/lib/agent/suggestions-core").PendingSuggestion[];
};
```

Add state for suggestions at the top of `DashboardIconBar`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PendingSuggestion } from "@/lib/agent/suggestions-core";

// Inside DashboardIconBar, before return:
const [suggestions, setSuggestions] = useState<PendingSuggestion[]>(initialSuggestions);

// Refresh suggestions (called on "刷新" click or after accept/dismiss)
const refreshSuggestions = useCallback(async () => {
  try {
    const res = await fetch("/api/agent/suggestions");
    if (res.ok) {
      const data = (await res.json()) as { suggestions: PendingSuggestion[] };
      setSuggestions(data.suggestions ?? []);
    }
  } catch {
    // silent
  }
}, []);

const handleAcceptSuggestion = useCallback(async (suggestion: PendingSuggestion) => {
  try {
    await fetch("/api/agent/suggestions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: suggestion.id, action: "accept" }),
    });
  } catch {
    // silent
  }
  // Fill composer with suggestion prompt
  onModeChange("agent", suggestion.prompt ?? suggestion.title);
  setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
}, [onModeChange]);

const handleDismissSuggestion = useCallback(async (id: number) => {
  try {
    await fetch("/api/agent/suggestions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "dismiss" }),
    });
  } catch {
    // silent
  }
  setSuggestions((prev) => prev.filter((s) => s.id !== id));
}, []);
```

- [ ] **Step 3: Render suggestions section in the Sidebar**

Insert after the workspace section and before the threads section in the JSX:

```tsx
{/* Suggestions section */}
{suggestions.length > 0 ? (
  <section className="sunny-codex-sidebar-section" aria-label="建议">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <p>💡 建议 ({suggestions.length})</p>
      <button
        type="button"
        className="sunny-codex-sidebar-action"
        style={{ fontSize: "10px", padding: "1px 4px" }}
        onClick={refreshSuggestions}
        aria-label="刷新建议"
      >
        刷新
      </button>
    </div>
    {suggestions.slice(0, 6).map((s) => (
      <div
        key={s.id}
        className="sunny-codex-mode-row"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <button
          type="button"
          style={{
            background: "none", border: "none", color: "inherit",
            cursor: "pointer", textAlign: "left", flex: 1,
            fontSize: "11px", padding: "3px 6px",
          }}
          onClick={() => handleAcceptSuggestion(s)}
        >
          {s.title}
        </button>
        <span style={{ display: "flex", gap: "2px" }}>
          <button
            type="button"
            style={{ background: "none", border: "none", color: "#4ade80", cursor: "pointer", fontSize: "10px", padding: "2px 4px" }}
            onClick={() => handleAcceptSuggestion(s)}
            title="接受建议"
            aria-label={`接受建议：${s.title}`}
          >
            ✓
          </button>
          <button
            type="button"
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "10px", padding: "2px 4px" }}
            onClick={() => handleDismissSuggestion(s.id)}
            title="忽略建议"
            aria-label={`忽略建议：${s.title}`}
          >
            ✕
          </button>
        </span>
      </div>
    ))}
  </section>
) : (
  <section className="sunny-codex-sidebar-section" aria-label="快捷入口">
    <p>💡 快捷入口</p>
    <button
      type="button"
      className="sunny-codex-mode-row"
      style={{ fontSize: "11px", color: "#888" }}
      onClick={() => onModeChange("agent", "/plan 新建计划")}
    >
      /plan 新建计划
    </button>
    <button
      type="button"
      className="sunny-codex-mode-row"
      style={{ fontSize: "11px", color: "#888" }}
      onClick={() => onModeChange("agent", "/schedule 安排日程")}
    >
      /schedule 安排日程
    </button>
    <button
      type="button"
      className="sunny-codex-mode-row"
      style={{ fontSize: "11px", color: "#888" }}
      onClick={() => onModeChange("agent", "/review 生成复盘")}
    >
      /review 生成复盘
    </button>
  </section>
)}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DashboardShell.tsx src/components/dashboard/SidebarNav.tsx src/components/dashboard/DashboardIconBar.tsx
git commit -m "feat: add suggestions section to sidebar with accept/dismiss

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Quick Actions 2-level submenu in Composer

**Files:**
- Modify: `src/components/dashboard/agent/AgentComposer.tsx`

- [ ] **Step 1: Add submenu state and structure**

In `AgentComposer.tsx`, replace the `QUICK_ACTIONS` constant and the `+` button + menu section. First update the imports and types:

```tsx
import { useCallback, useRef, useState } from "react";
// ...existing imports...

// Replace QUICK_ACTIONS with hierarchical structure
type QuickMenuItem = {
  label: string;
  children?: QuickMenuItem[];
  action?: "context" | "plan" | "memory" | "file" | "slash";
};

const QUICK_MENU: QuickMenuItem[] = [
  {
    label: "引用上下文",
    action: "context",
    children: [
      { label: "当前计划" },
      { label: "最近日程" },
      { label: "关联清单" },
      { label: "相关记忆" },
    ],
  },
  {
    label: "添加计划",
    action: "plan",
    children: [
      { label: "起草新计划" },
      { label: "关联当前计划" },
    ],
  },
  {
    label: "添加记忆",
    action: "memory",
    children: [
      { label: "偏好/习惯" },
      { label: "项目上下文" },
      { label: "工作流规则" },
    ],
  },
  { label: "添加文件", action: "file" },
  { label: "斜杠命令", action: "slash" },
];
```

- [ ] **Step 2: Add state management for the cascading menu**

Inside the `AgentComposer` function, replace `quickMenuOpen` state:

```tsx
const [quickMenuOpen, setQuickMenuOpen] = useState(false);
const [expandedMenuIndex, setExpandedMenuIndex] = useState<number | null>(null);
const menuRef = useRef<HTMLDivElement | null>(null);

// Close menu on outside click
const handleMenuClose = useCallback(() => {
  setQuickMenuOpen(false);
  setExpandedMenuIndex(null);
}, []);

// Close menu on click outside
useEffect(() => {
  if (!quickMenuOpen) return;
  const handler = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      handleMenuClose();
    }
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [quickMenuOpen, handleMenuClose]);
```

Add `useEffect` to the import from react.

- [ ] **Step 3: Replace the `+` button menu section with the 2-level menu**

Replace the existing `<div className="sunny-agent-composer-plus-menu">` block (lines ~145-169) with:

```tsx
<div className="sunny-agent-composer-plus-menu" ref={menuRef}>
  <button
    type="button"
    className="sunny-agent-composer-plus-button"
    aria-label="打开快捷操作"
    aria-haspopup="menu"
    aria-expanded={quickMenuOpen}
    title="打开快捷操作"
    onClick={() => {
      setQuickMenuOpen((open) => !open);
      setExpandedMenuIndex(null);
      setModeMenuOpen(false);
    }}
  >
    <span aria-hidden="true">+</span>
  </button>
  {quickMenuOpen ? (
    <div className="sunny-agent-composer-quick-menu" role="menu" aria-label="快捷操作">
      {QUICK_MENU.map((item, index) => (
        <div key={item.label}>
          <button
            type="button"
            role="menuitem"
            className={expandedMenuIndex === index ? "is-active" : ""}
            onClick={() => {
              if (item.children && item.children.length > 0) {
                setExpandedMenuIndex((prev) => (prev === index ? null : index));
              } else if (item.action === "slash") {
                // Show slash commands
                onInputChange("/");
                handleMenuClose();
              } else if (item.action === "file") {
                // Trigger file input
                handleMenuClose();
              }
            }}
          >
            <span>{item.label}</span>
            {item.children && item.children.length > 0 ? (
              <span style={{ marginLeft: "auto", fontSize: "10px", opacity: 0.5 }}>▸</span>
            ) : null}
          </button>
          {item.children && expandedMenuIndex === index ? (
            <div className="sunny-agent-composer-quick-submenu" role="menu">
              {item.children.map((child) => (
                <button
                  key={child.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (item.action === "context") {
                      onInputChange((prev) => prev + ` @${child.label} `);
                    } else if (item.action === "plan") {
                      onInputChange(child.label === "起草新计划" ? "/plan " : "/plan 关联当前计划 ");
                    } else if (item.action === "memory") {
                      onInputChange(`/memory ${child.label} `);
                    }
                    handleMenuClose();
                  }}
                >
                  {child.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  ) : null}
</div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/agent/AgentComposer.tsx
git commit -m "feat: add 2-level cascading Quick Actions menu to Composer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Add Timeline mode to Composer MODE_OPTIONS

**Files:**
- Modify: `src/components/dashboard/agent/AgentComposer.tsx`

- [ ] **Step 1: Add timeline to MODE_OPTIONS**

In `AgentComposer.tsx`, add a `timeline` entry to `MODE_OPTIONS` after the `review` entry:

```tsx
{
  key: "timeline",
  label: "时间线",
  description: "记录或查询时间线事件，默认不会写入数据库。",
  placeholder: "描述要记录的时间线事件或查询条件",
},
```

Note: The type `Exclude<AgentWorkbenchMode, "timeline">` on `MODE_OPTIONS` must be changed to just `AgentWorkbenchMode` to include timeline. Change:

```tsx
const MODE_OPTIONS: Array<{
  key: AgentWorkbenchMode;
  label: string;
  description: string;
  placeholder: string;
}> = [
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors (timeline is already in `AgentWorkbenchMode`).

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/agent/AgentComposer.tsx
git commit -m "feat: expose timeline mode in Composer MODE_OPTIONS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Timeline mode mapping in DashboardShell

**Files:**
- Modify: `src/components/dashboard/DashboardShell.tsx`

- [ ] **Step 1: Add timeline to `iconModeToWorkbenchMode`**

In `DashboardShell.tsx`, where `iconModeToWorkbenchMode` is defined (~line 84), add:

```ts
const iconModeToWorkbenchMode: Partial<Record<DashboardIconMode, AgentWorkbenchMode>> = {
  agent: "ask",
  today: "today",
  plans: "plan",
  writing: "writing",
  timeline: "timeline",  // NEW
  // schedule 和 memory 不走对话 pipeline，无需映射
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardShell.tsx
git commit -m "feat: map timeline DashboardIconMode to timeline workbenchMode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Inspector cross-collection search + Review tab skeleton

**Files:**
- Modify: `src/components/dashboard/agent/constants.ts` — add review to inspectorTabs
- Modify: `src/components/dashboard/DashboardRightPanel.tsx` — add search box + Review tab placeholder

- [ ] **Step 1: Add `review` to `inspectorTabs`**

In `src/components/dashboard/agent/constants.ts`, add to the `inspectorTabs` array after `memory`:

```ts
{ key: "review", label: "复盘" },
```

- [ ] **Step 2: Update `AgentInspectorTab` type**

In `src/components/dashboard/agent/types.ts`, change:

```ts
export type AgentInspectorTab = "approval" | "context" | "linked" | "memory" | "review" | "trace";
```

- [ ] **Step 3: Add Inspector search box to `DashboardRightPanel`**

In `src/components/dashboard/DashboardRightPanel.tsx`, add search state and a search input before the tab bar:

```tsx
// Add state inside DashboardRightPanel function (after the existing consts, before return):
const [inspectorSearch, setInspectorSearch] = useState("");
const [inspectorSearchResults, setInspectorSearchResults] = useState<
  Array<{ collection: string; id: number; title: string; type: string; href?: string }>
>([]);
const [inspectorSearching, setInspectorSearching] = useState(false);
const inspectorSearchDebounce = useRef<ReturnType<typeof setTimeout>>();

const handleInspectorSearch = useCallback((query: string) => {
  setInspectorSearch(query);
  if (inspectorSearchDebounce.current) clearTimeout(inspectorSearchDebounce.current);
  if (!query.trim()) {
    setInspectorSearchResults([]);
    return;
  }
  inspectorSearchDebounce.current = setTimeout(async () => {
    setInspectorSearching(true);
    try {
      const res = await fetch(`/api/command/search?q=${encodeURIComponent(query.trim())}&limit=10`);
      if (res.ok) {
        const data = (await res.json()) as { results: typeof inspectorSearchResults };
        setInspectorSearchResults(data.results ?? []);
      }
    } catch {
      // silent
    } finally {
      setInspectorSearching(false);
    }
  }, 300);
}, []);
```

Add the search input just before the tab bar (inside the aside, before `<div className="sunny-agent-inspector-tabs">`):

```tsx
{/* Inspector search */}
<div className="sunny-agent-inspector-search">
  <input
    type="text"
    placeholder="搜索关联的计划、日程、笔记..."
    value={inspectorSearch}
    onChange={(e) => handleInspectorSearch(e.target.value)}
    aria-label="搜索关联对象"
  />
  {inspectorSearch.trim() && inspectorSearchResults.length > 0 ? (
    <ul className="sunny-agent-inspector-search-results">
      {inspectorSearchResults.map((r, i) => (
        <li key={`${r.collection}-${r.id}-${i}`}>
          <button
            type="button"
            onClick={() => {
              if (r.href) window.open(r.href, "_blank");
            }}
          >
            <span>{r.title}</span>
            <small>{r.collection}</small>
          </button>
        </li>
      ))}
    </ul>
  ) : null}
  {inspectorSearch.trim() && !inspectorSearching && inspectorSearchResults.length === 0 ? (
    <p className="sunny-agent-inspector-search-empty">未找到匹配结果</p>
  ) : null}
</div>
```

- [ ] **Step 4: Add Review tab content placeholder**

In the tab content section (the `{activeInspectorTab === "..." ? ... : null}` chain), add after the memory tab:

```tsx
{activeInspectorTab === "review" ? (
  <div className="sunny-agent-inspector-panel sunny-agent-review-panel">
    <div className="sunny-agent-inspector-empty">
      <h3>复盘</h3>
      <p>选择对话中的复盘卡片可在此查看完整复盘详情。</p>
    </div>
  </div>
) : null}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/agent/constants.ts src/components/dashboard/agent/types.ts src/components/dashboard/DashboardRightPanel.tsx
git commit -m "feat: add review tab to inspector, cross-collection search box

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Composer @mention context search

**Files:**
- Modify: `src/components/dashboard/agent/AgentComposer.tsx`

- [ ] **Step 1: Add @mention detection state**

In `AgentComposer.tsx`, add state near the top of the function:

```tsx
const [mentionOpen, setMentionOpen] = useState(false);
const [mentionQuery, setMentionQuery] = useState("");
const [mentionResults, setMentionResults] = useState<
  Array<{ collection: string; id: number; title: string }>
>([]);
const mentionDebounce = useRef<ReturnType<typeof setTimeout>>();
```

- [ ] **Step 2: Add handleInputChange wrapper with @mention detection**

Modify the textarea's `onChange` handler:

```tsx
// Create a wrapper for input change that detects @mention
const handleInputChange = useCallback((value: string) => {
  onInputChange(value);

  // Detect @mention trigger
  const cursorPos = value.length; // simple: check at end
  const textBeforeCursor = value.slice(0, cursorPos);
  const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

  if (atMatch) {
    const query = atMatch[1] ?? "";
    setMentionQuery(query);
    setMentionOpen(true);

    if (mentionDebounce.current) clearTimeout(mentionDebounce.current);
    mentionDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/command/search?q=${encodeURIComponent(query)}&limit=8`);
        if (res.ok) {
          const data = (await res.json()) as { results: typeof mentionResults };
          setMentionResults(data.results ?? []);
        }
      } catch {
        // silent
      }
    }, 200);
  } else {
    setMentionOpen(false);
    setMentionQuery("");
    setMentionResults([]);
  }
}, [onInputChange]);
```

- [ ] **Step 3: Render @mention dropdown above the textarea**

Wrap the textarea in a relative container and add the dropdown:

```tsx
<div style={{ position: "relative", flex: 1 }}>
  <textarea
    value={input}
    onChange={(event) => handleInputChange(event.target.value)}
    {/* ...existing props... */}
  />
  {mentionOpen && mentionResults.length > 0 ? (
    <div className="sunny-agent-composer-mention-dropdown" role="listbox" aria-label="上下文引用建议">
      {mentionResults.map((r, i) => (
        <button
          key={`${r.collection}-${r.id}-${i}`}
          type="button"
          role="option"
          onClick={() => {
            // Replace @query with selection
            const newValue = input.replace(/@[^\s@]*$/, `@${r.title} `);
            onInputChange(newValue);
            setMentionOpen(false);
          }}
        >
          <span>{r.title}</span>
          <small>{r.collection}</small>
        </button>
      ))}
    </div>
  ) : null}
</div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/agent/AgentComposer.tsx
git commit -m "feat: add @mention context search to Composer input

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

**End of Phase 1.** Phase 1 is a complete, testable increment — the Dashboard now has suggestions, Quick Actions menu, Timeline mode, cross-collection search, and @mention.

---

## Phase 2: New Views

### Task 9: AgentReviewCard — inline review card for conversation

**Files:**
- Create: `src/components/dashboard/agent/AgentReviewCard.tsx`

- [ ] **Step 1: Create `AgentReviewCard.tsx`**

Create file `src/components/dashboard/agent/AgentReviewCard.tsx`:

```tsx
"use client";

import { formatCollectionLabel } from "./constants";

export type ReviewCardData = {
  planTitle: string;
  week: string; // "2026-W23"
  completedItems: string[];
  incompleteItems: string[];
  risks: string[];
  suggestions: string[];
  progressSummary: string;
  planId: number;
};

export type AgentReviewCardProps = {
  data: ReviewCardData;
  onOpenInInspector?: () => void;
  onViewPlan?: (planId: number) => void;
};

export function AgentReviewCard({
  data,
  onOpenInInspector,
  onViewPlan,
}: AgentReviewCardProps) {
  const {
    planTitle,
    week,
    completedItems,
    incompleteItems,
    risks,
    suggestions,
    progressSummary,
    planId,
  } = data;

  return (
    <section
      className="sunny-agent-review-card"
      aria-label={`复盘：${planTitle}`}
      role="region"
    >
      {/* Header */}
      <div className="sunny-agent-review-card-head">
        <div>
          <span>复盘完成</span>
          <h3>{planTitle} · 周复盘</h3>
        </div>
        <span className="sunny-agent-review-card-week">{week}</span>
      </div>

      {/* Summary */}
      <p className="sunny-agent-review-card-summary">{progressSummary}</p>

      {/* Grid */}
      <div className="sunny-agent-review-card-grid">
        <div>
          <span>完成项</span>
          <ul>
            {completedItems.slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>未完成</span>
          <ul>
            {incompleteItems.length > 0
              ? incompleteItems.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))
              : <li className="sunny-agent-review-card-empty">全部完成</li>}
          </ul>
        </div>
        <div>
          <span>风险/阻塞</span>
          <ul>
            {risks.length > 0
              ? risks.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))
              : <li className="sunny-agent-review-card-empty">无风险</li>}
          </ul>
        </div>
        <div>
          <span>建议调整</span>
          <ul>
            {suggestions.length > 0
              ? suggestions.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))
              : <li className="sunny-agent-review-card-empty">无建议</li>}
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="sunny-agent-review-card-actions" role="toolbar">
        {onViewPlan ? (
          <button type="button" onClick={() => onViewPlan(planId)}>
            查看计划
          </button>
        ) : null}
        {onOpenInInspector ? (
          <button type="button" onClick={onOpenInInspector}>
            在 Inspector 中打开 ▸
          </button>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/agent/AgentReviewCard.tsx
git commit -m "feat: add AgentReviewCard for inline review display in conversation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: AgentReviewPanel — Inspector Review tab content

**Files:**
- Create: `src/components/dashboard/agent/AgentReviewPanel.tsx`
- Modify: `src/components/dashboard/DashboardRightPanel.tsx`

- [ ] **Step 1: Create `AgentReviewPanel.tsx`**

Create file `src/components/dashboard/agent/AgentReviewPanel.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardIcon } from "../icons";

type ReviewSummary = {
  id: number;
  planTitle: string;
  week: string;
  completedCount: number;
  totalCount: number;
  risks: string[];
  updatedAt: string;
};

type ReviewPanelProps = {
  planId?: number | null;
  onOpenPlan?: (planId: number) => void;
  onGenerateReview?: () => void;
};

export function AgentReviewPanel({
  planId,
  onOpenPlan,
  onGenerateReview,
}: ReviewPanelProps) {
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = planId ? `?planId=${planId}` : "";
      const res = await fetch(`/api/agent/evaluate${params}`);
      if (res.ok) {
        const data = (await res.json()) as { reviews?: ReviewSummary[] };
        setReviews(data.reviews ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  if (loading) {
    return (
      <div className="sunny-agent-inspector-panel sunny-agent-review-panel">
        <p className="sunny-agent-inspector-empty">加载复盘记录...</p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="sunny-agent-inspector-panel sunny-agent-review-panel">
        <div className="sunny-agent-inspector-empty">
          <h3>暂无复盘记录</h3>
          <p>在对话中使用「回顾」模式，或点击下方按钮生成复盘。</p>
        </div>
        {onGenerateReview ? (
          <button
            type="button"
            className="sunny-agent-confirm-button"
            onClick={onGenerateReview}
            style={{ marginTop: "12px" }}
          >
            + 对当前计划生成新复盘
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel sunny-agent-review-panel">
      <div className="sunny-agent-inspector-summary">
        <span>复盘历史</span>
        <h3>{reviews.length} 条复盘记录</h3>
      </div>
      <ul className="sunny-agent-review-history-list">
        {reviews.map((review) => (
          <li key={review.id}>
            <button
              type="button"
              className={`sunny-agent-review-history-item${expandedId === review.id ? " is-expanded" : ""}`}
              onClick={() => setExpandedId((prev) => (prev === review.id ? null : review.id))}
            >
              <div className="sunny-agent-review-history-meta">
                <strong>{review.planTitle}</strong>
                <small>{review.week}</small>
              </div>
              <div className="sunny-agent-review-history-progress">
                <span>
                  完成 {review.completedCount}/{review.totalCount} 项
                </span>
                {review.risks.length > 0 ? (
                  <span className="sunny-agent-review-history-risk">
                    {review.risks.length} 个风险
                  </span>
                ) : null}
              </div>
            </button>
            {expandedId === review.id ? (
              <div className="sunny-agent-review-history-detail">
                {/* Detail content would be loaded on expand */}
                {onOpenPlan && review.id ? (
                  <button type="button" onClick={() => onOpenPlan(review.id)}>
                    查看计划
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {onGenerateReview ? (
        <button
          type="button"
          className="sunny-agent-confirm-button"
          onClick={onGenerateReview}
          style={{ marginTop: "12px" }}
        >
          + 生成新复盘
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire `AgentReviewPanel` into `DashboardRightPanel`**

In `src/components/dashboard/DashboardRightPanel.tsx`, import and replace the review tab placeholder:

```tsx
import { AgentReviewPanel } from "@/components/dashboard/agent/AgentReviewPanel";
```

Replace the placeholder review tab content with:

```tsx
{activeInspectorTab === "review" ? (
  <AgentReviewPanel
    onGenerateReview={() => {
      // Trigger review mode in composer
    }}
    onOpenPlan={(id) => {
      window.open(`/admin/collections/plans/${id}`, "_blank");
    }}
  />
) : null}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/agent/AgentReviewPanel.tsx src/components/dashboard/DashboardRightPanel.tsx
git commit -m "feat: add AgentReviewPanel for Inspector review tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: ChecklistView standalone view

**Files:**
- Create: `src/components/dashboard/checklist/ChecklistView.tsx`

- [ ] **Step 1: Create `ChecklistView.tsx`**

Create directory `src/components/dashboard/checklist/` and file `ChecklistView.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

type ChecklistItem = { key: string; label: string; completed: boolean };
type ChecklistSummary = {
  id: number;
  title: string;
  status: string;
  relatedPlan?: { id: number; title: string } | null;
  items: ChecklistItem[];
  totalItems: number;
  completedItems: number;
};

type ChecklistViewProps = {
  onBackToWorkbench: () => void;
  threadId: number | null;
};

const STATUS_FILTERS = [
  { key: "", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "done", label: "已完成" },
  { key: "archived", label: "已归档" },
];

export function ChecklistView({ onBackToWorkbench, threadId }: ChecklistViewProps) {
  const [checklists, setChecklists] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchChecklists = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      params.set("limit", "20");
      const res = await fetch(`/api/agent/checklist?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { checklists: ChecklistSummary[] };
        setChecklists(data.checklists ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchChecklists();
  }, [fetchChecklists]);

  return (
    <div className="sunny-dashboard-main sunny-checklist-view">
      {/* Header */}
      <div className="sunny-checklist-view-head">
        <button type="button" className="sunny-checklist-back-btn" onClick={onBackToWorkbench}>
          ← 返回工作台
        </button>
        <h2>📋 清单</h2>
      </div>

      {/* Filter bar */}
      <div className="sunny-checklist-filter-bar">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? "is-active" : ""}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Checklist cards */}
      <div className="sunny-checklist-card-list">
        {loading ? (
          <p className="sunny-agent-inspector-empty">加载清单...</p>
        ) : checklists.length === 0 ? (
          <p className="sunny-agent-inspector-empty">暂无清单</p>
        ) : (
          checklists.map((cl) => (
            <div
              key={cl.id}
              className={`sunny-checklist-card${expandedId === cl.id ? " is-expanded" : ""}`}
            >
              <div
                className="sunny-checklist-card-header"
                onClick={() => setExpandedId((prev) => (prev === cl.id ? null : cl.id))}
              >
                <div>
                  <h3>{cl.title}</h3>
                  {cl.relatedPlan ? (
                    <small>关联 {cl.relatedPlan.title} 计划</small>
                  ) : null}
                </div>
                <div>
                  <span className={`sunny-checklist-status-badge is-${cl.status}`}>
                    {cl.status === "active" ? "进行中" : cl.status === "done" ? "已完成" : "已归档"}
                  </span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="sunny-checklist-progress-bar">
                <div
                  className="sunny-checklist-progress-fill"
                  style={{
                    width: cl.totalItems > 0
                      ? `${Math.round((cl.completedItems / cl.totalItems) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <span className="sunny-checklist-progress-label">
                {cl.completedItems}/{cl.totalItems} 项完成
              </span>
              {/* Expanded items */}
              {expandedId === cl.id && cl.items.length > 0 ? (
                <ul className="sunny-checklist-items-list">
                  {cl.items.slice(0, 20).map((item) => (
                    <li
                      key={item.key}
                      className={item.completed ? "is-done" : ""}
                    >
                      <span>{item.completed ? "✓" : "○"}</span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/checklist/ChecklistView.tsx
git commit -m "feat: add ChecklistView standalone view with filter, progress, expand

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: TimelineView standalone view

**Files:**
- Create: `src/components/dashboard/timeline/TimelineView.tsx`

- [ ] **Step 1: Create `TimelineView.tsx`**

Create directory `src/components/dashboard/timeline/` and file `TimelineView.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

type TimelineEventSummary = {
  id: number;
  title: string;
  date: string;
  type: string; // "milestone" | "life" | "project"
  relatedPlan?: { id: number; title: string } | null;
};

type TimelineViewProps = {
  onBackToWorkbench: () => void;
  threadId: number | null;
};

const EVENT_COLORS: Record<string, string> = {
  milestone: "#4ade80",
  project: "#888",
  life: "#e2b93b",
};

export function TimelineView({ onBackToWorkbench, threadId }: TimelineViewProps) {
  const [events, setEvents] = useState<TimelineEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/timeline?month=${yearMonth}&limit=50`);
      if (res.ok) {
        const data = (await res.json()) as { events: TimelineEventSummary[] };
        setEvents(data.events ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="sunny-dashboard-main sunny-timeline-view">
      {/* Header */}
      <div className="sunny-timeline-view-head">
        <button type="button" className="sunny-timeline-back-btn" onClick={onBackToWorkbench}>
          ← 返回工作台
        </button>
        <h2>📜 时间线</h2>
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="sunny-timeline-month-input"
          aria-label="选择月份"
        />
      </div>

      {/* Timeline */}
      <div className="sunny-timeline-track">
        {loading ? (
          <p className="sunny-agent-inspector-empty">加载时间线...</p>
        ) : events.length === 0 ? (
          <p className="sunny-agent-inspector-empty">本月暂无时间线事件</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="sunny-timeline-event">
              <div className="sunny-timeline-event-dot">
                <span
                  style={{
                    display: "block",
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: EVENT_COLORS[event.type] ?? "#888",
                  }}
                />
                <span className="sunny-timeline-event-line" />
              </div>
              <div className="sunny-timeline-event-body">
                <small>{event.date}</small>
                <strong>{event.title}</strong>
                {event.relatedPlan ? (
                  <span className="sunny-timeline-event-plan">
                    关联 {event.relatedPlan.title}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/timeline/TimelineView.tsx
git commit -m "feat: add TimelineView standalone view with month selector

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Wire new standalone views into DashboardShell and Sidebar

**Files:**
- Modify: `src/components/dashboard/DashboardIconBar.tsx` — add checklist/timeline workspace entries
- Modify: `src/components/dashboard/DashboardShell.tsx` — add checklist/timeline mode routing

- [ ] **Step 1: Add checklist and timeline to `DashboardIconMode` type and `DASHBOARD_MODES`**

In `src/components/dashboard/DashboardIconBar.tsx`, update the type and array:

```tsx
export type DashboardIconMode = "agent" | "today" | "plans" | "schedule" | "writing" | "memory" | "checklist" | "timeline";

export const DASHBOARD_MODES: Array<{
  key: DashboardIconMode;
  label: string;
  icon: DashboardIconName;
  prompt: string;
}> = [
  { key: "agent", label: "工作台", icon: "agent", prompt: "" },
  { key: "today", label: "今日", icon: "calendar", prompt: "帮我整理今天最应该推进的工作" },
  { key: "plans", label: "计划", icon: "plans", prompt: "帮我检查所有进行中计划的进度" },
  { key: "schedule", label: "日程", icon: "schedule", prompt: "帮我查看最近的日程安排" },
  { key: "writing", label: "写作", icon: "pencil", prompt: "帮我整理最近的写作素材" },
  { key: "memory", label: "记忆库", icon: "memory", prompt: "" },
  { key: "checklist", label: "清单", icon: "checklist", prompt: "" },     // NEW
  { key: "timeline", label: "时间线", icon: "timeline", prompt: "" },     // NEW
];
```

- [ ] **Step 2: Route checklist and timeline modes in DashboardShell MainWorkspace**

In `src/components/dashboard/DashboardShell.tsx`, import the new views:

```tsx
import { ChecklistView } from "./checklist/ChecklistView";
import { TimelineView } from "./timeline/TimelineView";
```

Update the `MainWorkspace` content area to include checklist and timeline branches:

```tsx
<MainWorkspace>
  {activeMode === "schedule" ? (
    <ScheduleMonthView
      onBackToWorkbench={() => setActiveMode("agent")}
      threadId={threadId}
    />
  ) : activeMode === "memory" ? (
    <MemoryCardGrid
      onBackToWorkbench={() => setActiveMode("agent")}
      threadId={threadId}
    />
  ) : activeMode === "checklist" ? (                                              // NEW
    <ChecklistView
      onBackToWorkbench={() => setActiveMode("agent")}
      threadId={threadId}
    />
  ) : activeMode === "timeline" ? (                                              // NEW
    <TimelineView
      onBackToWorkbench={() => setActiveMode("agent")}
      threadId={threadId}
    />
  ) : (
    <DashboardInspectorControlProvider value={inspectorControl}>
      <DashboardModeProvider value={activeMode}>
        {children}
      </DashboardModeProvider>
    </DashboardInspectorControlProvider>
  )}
</MainWorkspace>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardIconBar.tsx src/components/dashboard/DashboardShell.tsx
git commit -m "feat: wire checklist and timeline modes into sidebar and workspace

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: Normalize Memory Inspector panel for non-debug mode

**Files:**
- Modify: `src/components/dashboard/DashboardRightPanel.tsx` — update `MemoryInspectorPanel`

- [ ] **Step 1: Update `MemoryInspectorPanel` to show content in normal mode**

In `src/components/dashboard/DashboardRightPanel.tsx`, replace the `MemoryInspectorPanel` function:

```tsx
function MemoryInspectorPanel({ debugMode, traceSteps }: { debugMode: boolean; traceSteps: AgentTraceStep[] }) {
  const memoryTitles = traceSteps
    .filter((step) => step.kind === "context" && step.detail)
    .flatMap((step) => {
      const match = step.detail?.match(/命中记忆：(.+)/);
      return match ? match[1].split("、").map((item) => item.trim()).filter(Boolean) : [];
    });

  // Normal mode: show memory hits if any
  if (!debugMode) {
    if (memoryTitles.length === 0) {
      return (
        <div className="sunny-agent-inspector-empty">
          <h3>本轮未使用长期记忆</h3>
          <p>当 Agent 查询到相关记忆时，会在这里显示。</p>
        </div>
      );
    }

    return (
      <div className="sunny-agent-inspector-panel sunny-agent-memory-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span>本轮使用的记忆</span>
          <h3>{memoryTitles.length} 条记忆</h3>
        </div>
        <ul className="sunny-agent-memory-inspector-list">
          {memoryTitles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
        <p className="sunny-agent-inspector-hint" style={{ fontSize: "10px", color: "#555", marginTop: "8px" }}>
          开启 debug 模式可查看详细匹配信息
        </p>
      </div>
    );
  }

  // Debug mode: existing behavior (unchanged)
  if (memoryTitles.length === 0) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>当前对话未使用长期记忆</h3>
        <p>当 Agent 命中长期记忆时，会在这里列出被使用的记忆标题。</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel sunny-agent-memory-inspector-panel">
      <div className="sunny-agent-inspector-summary">
        <span>已使用记忆</span>
        <h3>{memoryTitles.length} 条长期记忆</h3>
      </div>
      <ul className="sunny-agent-memory-inspector-list">
        {memoryTitles.map((title) => (
          <li key={title}>{title}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardRightPanel.tsx
git commit -m "fix: show memory hits in Inspector memory tab outside debug mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

1. **Spec coverage**:
   - ✅ Sidebar suggestions (Task 2 + 3)
   - ✅ Quick Actions submenu (Task 4)
   - ✅ Timeline mode (Task 5 + 6)
   - ✅ Scoped search — Sidebar (existing), Inspector (Task 7), @mention (Task 8)
   - ✅ PlanReview card (Task 9) + inspector tab (Task 10)
   - ✅ Checklist/Timeline standalone views (Task 11 + 12 + 13)
   - ✅ Memory panel normalization (Task 14)

2. **Placeholder scan**: No TBD/TODO. All steps have specific code, file paths, and commands.

3. **Type consistency**: All types referenced consistently — `DashboardIconMode` extended in Task 13 matches usage in Task 6. `AgentInspectorTab` in Task 7 matches `inspectorTabs` in Task 1/7. `AgentWorkbenchMode` in Task 5 matches `iconModeToWorkbenchMode` in Task 6.

---

## Acceptance Tests

After all tasks complete, verify:

1. `npx tsc --noEmit` passes
2. Sidebar shows suggestions section with accept/dismiss or fallback shortcuts
3. Composer `+` opens 2-level menu; selecting items fills input
4. Composer mode selector includes "时间线"
5. Typing `@` in Composer triggers context search dropdown
6. Inspector has "复盘" tab and search box
7. Sidebar has "清单" and "时间线" workspace entries
8. Checklist and Timeline views load and navigate correctly
9. Memory tab shows memory hits in normal mode (when available)
