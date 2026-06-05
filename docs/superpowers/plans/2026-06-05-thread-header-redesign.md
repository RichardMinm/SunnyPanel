# Thread Header 改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical "Thread #13" header with a product-oriented ThreadHeader showing session topic, status badge, and metadata with inline title editing.

**Architecture:** Extract a new `ThreadHeader` component from `AgentConversation`, compute status badge from `isSubmitting` + `pendingAction` risk level, add `title` support to the PATCH thread API, thread title + rename through the existing component tree (hook → Workbench → Conversation → ThreadHeader).

**Tech Stack:** React + TypeScript, CSS (existing sunny-agent.css pattern), Next.js API routes, Payload CMS

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/dashboard/agent/ThreadHeader.tsx` | New header component with badge, inline edit, metadata |
| Modify | `src/components/dashboard/agent/AgentConversation.tsx` | Replace inline header HTML with `<ThreadHeader>`, add new props |
| Modify | `src/components/dashboard/agent/AgentWorkbench.tsx` | Pass `threadTitle`, `lastInteractionAt`, `onRenameThread` through |
| Modify | `src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts` | Add `threadTitle`/`lastInteractionAt` state, `renameThread` method |
| Modify | `src/app/api/agent/thread/route.ts` | Add `title` to PATCH body, add `lastInteractionAt` to GET selectedThread |
| Modify | `src/app/styles/sunny-agent.css` | Sticky header, badge variants, title editing, metadata row styles |

---

### Task 1: Add `lastInteractionAt` to GET thread API response + `title` to PATCH

**Files:**
- Modify: `src/app/api/agent/thread/route.ts`

- [ ] **Step 1: Add `lastInteractionAt` to the selectedThread response in GET**

Add `lastInteractionAt: ownedSelectedThread.lastInteractionAt` to the selectedThread response object.

Edit `src/app/api/agent/thread/route.ts`, find the `selectedThread:` block (around line 90-97):

```ts
selectedThread: ownedSelectedThread
  ? {
      id: ownedSelectedThread.id,
      lastInteractionAt: ownedSelectedThread.lastInteractionAt,
      messages: sanitizeChatMessages(ownedSelectedThread.messages ?? []),
      pendingAction: parsePendingAction(ownedSelectedThread.pendingAction),
      title: ownedSelectedThread.title,
    }
  : null,
```

- [ ] **Step 2: Add `title` to the PATCH body type and update logic**

Find the PATCH handler body type (around line 118-122) and add `title`:

```ts
const body = (await request.json()) as {
  archived?: boolean;
  id?: number;
  tags?: string[];
  title?: string;
};
```

Then in the update data logic (around line 141-153), add title handling after the tags block:

```ts
if (typeof body.title === "string" && body.title.trim().length > 0 && body.title.trim().length <= 200) {
  updateData.title = body.title.trim();
}
```

- [ ] **Step 3: Update `useAgentThreadList` fetchThread to capture the new field**

Edit `src/components/dashboard/agent-chat/use-agent-thread.ts`, find the `fetchThread` callback. Update the response type (around line 31-34):

```ts
const data = (await response.json()) as {
  selectedThread?: (LoadedThread & { lastInteractionAt?: null | string }) | null;
  recentRuns?: AgentRunSummary[];
  threads?: AgentThreadSummary[];
};
```

And return `lastInteractionAt` alongside the thread. The simplest approach: augment the return. But since `fetchThread` returns `selectedThread` (a `LoadedThread`), we need to capture `lastInteractionAt` separately. The hook should expose it.

Actually, the cleanest way: the `useAgentDashboardChat` hook directly calls `fetchThread` and gets the full response. Let's return `lastInteractionAt` from `fetchThread` as part of the return value.

Better approach: change the `fetchThread` return to include metadata. But that would change existing callers.

Simplest approach: have `fetchThread` set additional state. Let's add `lastInteractionAt` state to `useAgentThreadList`:

In the return of `fetchThread` (after line 42-46):
```ts
if (data.selectedThread) {
  setThreadId(data.selectedThread.id);
  setLastInteractionAt(data.selectedThread.lastInteractionAt ?? null);
}
```

And add the state:
```ts
const [lastInteractionAt, setLastInteractionAt] = useState<null | string>(null);
```

Add `lastInteractionAt` and `setThreads` to the hook's return:

```ts
return {
  archiveThread,
  clearRunDetail,
  fetchThread,
  fetchRunDetail,
  lastInteractionAt,
  recentRuns,
  runDetailError,
  searchThreads,
  selectedRunDetail,
  setThreadId,
  setThreads,
  threadId,
  threads,
};
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agent/thread/route.ts src/components/dashboard/agent-chat/use-agent-thread.ts
git commit -m "feat(api): add lastInteractionAt to thread GET, title to thread PATCH"
```

---

### Task 2: Add `threadTitle` state and `renameThread` method to hook

**Files:**
- Modify: `src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts`

- [ ] **Step 1: Add `threadTitle` state**

Add the state declaration near the other state variables (around line 70):

```ts
const [threadTitle, setThreadTitle] = useState("");
```

- [ ] **Step 2: Set `threadTitle` in `loadThread`**

In the `loadThread` callback, after the selected thread is loaded successfully (around line 107-128), add `setThreadTitle`:

After the line that reads `setPendingAction(selectedThread.pendingAction);` (around line 108), add:

```ts
setThreadTitle(selectedThread.title || "");
```

And in the reset/new-thread branch (around line 86-104), reset the title:

```ts
setThreadTitle("");
```

- [ ] **Step 3: Add `renameThread` method**

Add the method after `archiveThread` (around line 250):

```ts
const renameThread = useCallback(async (title: string) => {
  if (!threadId) return false;

  const response = await fetch("/api/agent/thread", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: threadId, title: title.trim().slice(0, 200) }),
  });

  if (!response.ok) return false;

  setThreadTitle(title.trim().slice(0, 200));
  // Also update the local threads list
  setThreads((current) =>
    current.map((t) => (t.id === threadId ? { ...t, title: title.trim().slice(0, 200) } : t)),
  );
  return true;
}, [threadId]);

// Need access to setThreads from useAgentThreadList
```

- [ ] **Step 4: Expose new values in the return**

Add to the returned object:

```ts
renameThread,
threadTitle,
```

Also expose `lastInteractionAt` from the thread list hook (already added in Task 1). Destructure it from `useAgentThreadList`:

Update the destructuring from `useAgentThreadList()` (around line 39-51) to include `lastInteractionAt` and `setThreads`:

```ts
const {
  archiveThread: archiveThreadRequest,
  clearRunDetail,
  fetchThread,
  fetchRunDetail,
  lastInteractionAt,
  recentRuns,
  runDetailError,
  searchThreads,
  selectedRunDetail,
  setThreadId,
  setThreads,
  threadId,
  threads,
} = useAgentThreadList();
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts
git commit -m "feat(hook): add threadTitle state and renameThread method"
```

---

### Task 3: Create the `ThreadHeader` component

**Files:**
- Create: `src/components/dashboard/agent/ThreadHeader.tsx`

- [ ] **Step 1: Create the component file**

Write the full component:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";

import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentTokenUsage } from "@/lib/agent/schemas";

type ThreadHeaderProps = {
  displayTitle: string;
  isSubmitting: boolean;
  lastInteractionAt: null | string;
  onRenameThread: (title: string) => Promise<boolean>;
  pendingAction: null | PendingAction;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
};

type BadgeVariant = "ready" | "risky" | "running" | "waiting";

const BADGE_LABEL: Record<BadgeVariant, string> = {
  ready: "已就绪",
  risky: "有风险",
  running: "执行中",
  waiting: "等待确认",
};

const HIGH_RISK_INTENTS = [
  "add_completion_note",
  "append_plan_item",
  "cancel_schedule_item",
  "complete_plan_item",
  "compose_plan",
  "compose_schedule_item",
  "compose_timeline_event",
  "create_plan",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
];

function isRiskyAction(pa: PendingAction): boolean {
  if (pa.type === "await_confirmation") {
    return pa.action.riskLevel === "high";
  }
  if (pa.type === "await_batch_confirmation") {
    return pa.actions.some((a) => a.riskLevel === "high");
  }
  if ("intent" in pa && typeof pa.intent === "string") {
    return HIGH_RISK_INTENTS.includes(pa.intent);
  }
  return pa.type === "await_completion_note";
}

function deriveBadgeVariant(
  isSubmitting: boolean,
  pendingAction: null | PendingAction,
): BadgeVariant {
  if (isSubmitting) return "running";
  if (!pendingAction) return "ready";
  return isRiskyAction(pendingAction) ? "risky" : "waiting";
}

function formatRelativeTime(iso: null | string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function formatTokenCount(usage: AgentTokenUsage): string {
  const total = usage.totalTokens;
  if (total <= 0) return "";
  const k = Math.round(total / 100) / 10;
  return `${k}k tokens`;
}

export function ThreadHeader({
  displayTitle,
  isSubmitting,
  lastInteractionAt,
  onRenameThread,
  pendingAction,
  threadId,
  tokenUsage,
}: ThreadHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(displayTitle);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const variant = deriveBadgeVariant(isSubmitting, pendingAction);
  const metaParts = [
    threadId ? `Thread #${threadId}` : null,
    formatRelativeTime(lastInteractionAt),
    formatTokenCount(tokenUsage),
  ].filter(Boolean);

  const startEditing = useCallback(() => {
    setDraftTitle(displayTitle);
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [displayTitle]);

  const saveTitle = useCallback(async () => {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === displayTitle) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onRenameThread(trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  }, [draftTitle, displayTitle, onRenameThread]);

  const cancelEditing = useCallback(() => {
    setDraftTitle(displayTitle);
    setEditing(false);
  }, [displayTitle]);

  return (
    <div className="sunny-agent-thread-header">
      <div className="sunny-agent-thread-header-top">
        <p>AGENT 会话</p>
        <span className={`sunny-agent-badge sunny-agent-badge-${variant}`}>
          {BADGE_LABEL[variant]}
        </span>
      </div>
      <div className="sunny-agent-thread-header-title">
        {editing ? (
          <input
            ref={inputRef}
            className="sunny-agent-thread-header-title-input"
            disabled={saving}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") cancelEditing();
            }}
          />
        ) : (
          <button
            type="button"
            className="sunny-agent-thread-header-title-text"
            onClick={startEditing}
            title="点击重命名会话"
          >
            {displayTitle || "新会话"}
          </button>
        )}
      </div>
      {metaParts.length > 0 ? (
        <p className="sunny-agent-thread-header-meta">
          {metaParts.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/agent/ThreadHeader.tsx
git commit -m "feat: add ThreadHeader component with status badge and inline editing"
```

---

### Task 4: Update `AgentConversation` to use ThreadHeader

**Files:**
- Modify: `src/components/dashboard/agent/AgentConversation.tsx`

- [ ] **Step 1: Add new imports and props**

Add the import at the top:

```tsx
import { ThreadHeader } from "./ThreadHeader";
import type { AgentTokenUsage } from "@/lib/agent/schemas";
```

Add new props to the type (line 16-26):

```tsx
type AgentConversationProps = {
  displayTitle: string;
  errorMessage: null | string;
  isSubmitting: boolean;
  isThinking: boolean;
  lastInteractionAt: null | string;
  messages: AgentChatMessage[];
  onRenameThread: (title: string) => Promise<boolean>;
  pendingAction: null | PendingAction;   // need to import PendingAction
  statusLabel: string;
  thinkingContent: string;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};
```

Note: `pendingAction` and `tokenUsage` are already available — just need to add the type import for `PendingAction`.

The `PendingAction` type needs to be imported. Add to the import from `@/lib/agent/schemas`:

```tsx
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
```

- [ ] **Step 2: Destructure new props and replace inline header**

Update the function signature destructuring (line 28-38):

```tsx
export function AgentConversation({
  displayTitle,
  errorMessage,
  isSubmitting,
  isThinking,
  lastInteractionAt,
  messages,
  onRenameThread,
  pendingAction,
  statusLabel,
  thinkingContent,
  threadId,
  tokenUsage,
  traceSteps,
  transcriptRef,
}: AgentConversationProps) {
```

Replace the inline header block (lines 66-72):

```tsx
// OLD:
// <div className="sunny-agent-run-surface-head">
//   <div>
//     <p>Agent 会话</p>
//     <h2>{threadId ? `Thread #${threadId}` : "新会话"}</h2>
//   </div>
//   <span>{isSubmitting ? "运行中" : "已就绪"}</span>
// </div>

// NEW:
<ThreadHeader
  displayTitle={displayTitle}
  isSubmitting={isSubmitting}
  lastInteractionAt={lastInteractionAt}
  onRenameThread={onRenameThread}
  pendingAction={pendingAction}
  threadId={threadId}
  tokenUsage={tokenUsage}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/agent/AgentConversation.tsx
git commit -m "refactor: replace inline header with ThreadHeader component"
```

---

### Task 5: Update `AgentWorkbench` to pass new props through

**Files:**
- Modify: `src/components/dashboard/agent/AgentWorkbench.tsx`

- [ ] **Step 1: Add new props to `AgentWorkbenchProps`**

Add after `inputTokenEstimate` (line 32):

```tsx
lastInteractionAt: null | string;
```

Add after `onEditApproval` (line 38):

```tsx
onRenameThread: (title: string) => Promise<boolean>;
```

Add after `threadId` (line 54):

```tsx
threadTitle: string;
```

- [ ] **Step 2: Destructure in the component body**

Add to the destructuring (after `isThinking`):

```tsx
lastInteractionAt,
```

After `onEditApproval`:
```tsx
onRenameThread,
```

After `threadId`:
```tsx
threadTitle,
```

- [ ] **Step 3: Compute `displayTitle` from `threadTitle` and `messages`**

Add before the return statement (after `latestAssistantMessage`, around line 99-100):

```tsx
const displayTitle = useMemo(() => {
  if (threadTitle && threadTitle !== "Agent Thread") return threadTitle;
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (firstUserMsg?.content) {
    const trimmed = firstUserMsg.content.trim().replace(/\s+/g, " ");
    return trimmed.length > 30 ? `${trimmed.slice(0, 30).trimEnd()}...` : trimmed;
  }
  return "新会话";
}, [threadTitle, messages]);
```

Add `useMemo` to the React import on line 1 (if not already present — check the current import).

Current line 1: `import type { RefObject } from "react";` — need to change to `import { type RefObject, useMemo } from "react";`

- [ ] **Step 4: Pass new props to `AgentConversation`**

Update the `<AgentConversation>` JSX (lines 196-207):

```tsx
<AgentConversation
  displayTitle={displayTitle}
  errorMessage={errorMessage}
  isSubmitting={isSubmitting}
  isThinking={isThinking}
  lastInteractionAt={lastInteractionAt}
  messages={messages}
  onRenameThread={onRenameThread}
  pendingAction={pendingAction}
  statusLabel={statusLabel}
  thinkingContent={thinkingContent}
  threadId={threadId}
  tokenUsage={tokenUsage}
  traceSteps={traceSteps}
  transcriptRef={transcriptRef}
/>
```

Also update the `<MemoryWorkspace>` JSX (line 194) — it may not need the new props since it has its own header.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/agent/AgentWorkbench.tsx
git commit -m "feat: thread new props through AgentWorkbench to AgentConversation"
```

---

### Task 6: Update `DashboardPageClient` or parent to pass new props to `AgentWorkbench`

**Files:**
- Modify: `src/components/dashboard/DashboardPageClient.tsx`

- [ ] **Step 1: Find the `AgentWorkbench` usage and pass new props**

Read the file to find the `<AgentWorkbench>` JSX rendering. Pass the new props:

```tsx
lastInteractionAt={controller.lastInteractionAt}
onRenameThread={controller.renameThread}
threadTitle={controller.threadTitle}
```

These come from the `controller` (which is `AgentDashboardChatController`). The controller type needs to be updated since the hook now returns these fields.

Note: `AgentDashboardChatController` is `ReturnType<typeof useAgentDashboardChat>`, so it auto-includes the new fields once the hook is updated.

- [ ] **Step 2: Verify all props are wired, then commit**

```bash
git add src/components/dashboard/DashboardPageClient.tsx
git commit -m "feat: wire new thread header props from controller to AgentWorkbench"
```

---

### Task 7: Add CSS styles for ThreadHeader

**Files:**
- Modify: `src/app/styles/sunny-agent.css`

- [ ] **Step 1: Add ThreadHeader container and badge styles**

Append to the end of `src/app/styles/sunny-agent.css`:

```css
/* ── Thread Header ── */

.sunny-agent-thread-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 0.15rem 0 0.5rem;
  margin: -0.15rem -0.85rem 0;
  padding-left: 0.85rem;
  padding-right: 0.85rem;
  background: var(--agent-panel-bg);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}

.sunny-agent-thread-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.sunny-agent-thread-header-top > p {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-kicker);
  letter-spacing: var(--kicker-tracking);
  text-transform: uppercase;
  margin: 0;
}

/* ── Badge ── */

.sunny-agent-badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: var(--font-weight-ui);
  line-height: 1.5;
}

.sunny-agent-badge-ready {
  background: color-mix(in srgb, var(--color-green-500, #22c55e) 15%, transparent);
  color: var(--color-green-600, #16a34a);
}

.sunny-agent-badge-running {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent-strong, var(--accent));
}

.sunny-agent-badge-waiting {
  background: color-mix(in srgb, var(--color-amber-500, #f59e0b) 15%, transparent);
  color: var(--color-amber-600, #d97706);
}

.sunny-agent-badge-risky {
  background: color-mix(in srgb, var(--color-red-500, #ef4444) 15%, transparent);
  color: var(--color-red-600, #dc2626);
}

/* ── Title ── */

.sunny-agent-thread-header-title {
  margin-top: 0.35rem;
}

.sunny-agent-thread-header-title-text {
  display: block;
  width: 100%;
  text-align: left;
  font-size: var(--text-lg);
  font-weight: var(--font-weight-kicker);
  color: var(--foreground);
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  line-height: 1.4;
  border-radius: 0.25rem;
  outline: none;
}

.sunny-agent-thread-header-title-text:hover {
  background: var(--agent-control-bg);
}

.sunny-agent-thread-header-title-input {
  width: 100%;
  font-size: var(--text-lg);
  font-weight: var(--font-weight-kicker);
  color: var(--foreground);
  background: var(--agent-input-bg);
  border: 1px solid var(--accent-ring-strong);
  border-radius: 0.35rem;
  padding: 0.15rem 0.35rem;
  outline: none;
  line-height: 1.4;
}

/* ── Metadata ── */

.sunny-agent-thread-header-meta {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: var(--text-xs);
  line-height: 1.5;
}
```

- [ ] **Step 2: Keep old `.sunny-agent-run-surface-head` styles for backward compatibility**

The existing `.sunny-agent-run-surface-head` styles are still used by other components (inspector head, dock head). Leave them as-is. The conversation surface's header is now handled by `.sunny-agent-thread-header`.

- [ ] **Step 3: Commit**

```bash
git add src/app/styles/sunny-agent.css
git commit -m "style: add ThreadHeader sticky header, badge, and title editing styles"
```

---

### Task 8: Final integration check and clean up

**Files:**
- Review: all modified files

- [ ] **Step 1: Verify the TypeScript compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -60
```

Fix any type errors that surface.

- [ ] **Step 2: Run the dev server and verify the header renders**

Start the dev server and navigate to the dashboard agent page to verify:
- Header shows "新会话" when no thread is loaded
- Header shows custom title or first-message-derived title when thread is loaded
- Status badge changes color based on state
- Clicking the title enters edit mode
- Enter/Escape/Blur works correctly
- Header stays fixed when scrolling messages

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A && git commit -m "chore: final integration fixes for ThreadHeader"
```
