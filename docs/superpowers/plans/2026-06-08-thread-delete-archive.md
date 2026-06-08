# Thread 删除与归档功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Agent 会话实现两步删除流程（活跃→归档→永久删除），并在侧边栏和 ThreadHeader 提供归档入口。

**Architecture:** 新增 DELETE API 端点实现级联删除（thread + 关联 agent-runs）；新增 ConfirmDialog 和 ThreadRowMenu 两个 UI 组件；将已有 `archiveThread` hook 暴露到 UI 层；新增 `deleteThread` hook 函数。

**Tech Stack:** React 19 (App Router), TypeScript, Payload CMS, CSS (sunny-dashboard-shell.css)

---

## File Map

```
新增 (3):
  src/app/api/agent/thread/delete/route.ts      DELETE 端点，级联删除 thread + runs
  src/components/dashboard/agent/ConfirmDialog.tsx  通用确认弹窗
  src/components/dashboard/agent/ThreadRowMenu.tsx  会话行 ⋮ 下拉菜单

修改 (10):
  src/components/dashboard/agent-chat/use-agent-thread.ts      +deleteThread
  src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts 暴露 archiveThread/deleteThread
  src/components/dashboard/agent/ThreadHeader.tsx              归档按钮
  src/components/dashboard/agent/AgentConversation.tsx         穿透 onArchiveThread
  src/components/dashboard/agent/AgentWorkbench.tsx            穿透 onArchiveThread
  src/components/dashboard/DashboardPageClient.tsx             接线所有回调
  src/components/dashboard/DashboardShell.tsx                  穿透 onArchiveThread/onDeleteThread
  src/components/dashboard/SidebarNav.tsx                      穿透 onArchiveThread/onDeleteThread
  src/components/dashboard/DashboardIconBar.tsx                ThreadRowMenu + 删除按钮
  src/app/styles/sunny-dashboard-shell.css                     菜单/弹窗/删除按钮样式
```

**Props 穿透链：**
```
DashboardPageClient
  → DashboardShell
    → SidebarNav → DashboardIconBar  (onArchiveThread, onDeleteThread)
    → AgentWorkbench → AgentConversation → ThreadHeader  (onArchiveThread)
```

---

### Task 1: DELETE API 端点

**Files:**
- Create: `src/app/api/agent/thread/delete/route.ts`

- [ ] **Step 1: 创建 DELETE 端点**

```typescript
import { type NextRequest, NextResponse } from "next/server";

import { getRelationId } from "@/lib/agent/run-access";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export async function DELETE(request: NextRequest) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: { id?: number };
  try {
    body = (await request.json()) as { id?: number };
  } catch {
    return NextResponse.json({ message: "请求格式错误" }, { status: 400 });
  }

  if (!body.id || typeof body.id !== "number") {
    return NextResponse.json({ message: "缺少 id" }, { status: 400 });
  }

  const payload = await getPayloadClient();

  // 校验 thread 存在且属于当前用户
  const thread = await payload.findByID({
    collection: "agent-threads",
    depth: 0,
    id: body.id,
    overrideAccess: true,
  }).catch(() => null);

  if (!thread || getRelationId(thread.user) !== authResult.user.id) {
    return NextResponse.json({ message: "Thread 不存在或无权限" }, { status: 404 });
  }

  // 级联查询并删除关联的 agent-runs
  const relatedRuns = await payload.find({
    collection: "agent-runs",
    depth: 0,
    limit: 0,
    overrideAccess: true,
    where: { thread: { equals: body.id } },
  });

  let deletedRuns = 0;
  for (const run of relatedRuns.docs) {
    try {
      await payload.delete({
        collection: "agent-runs",
        id: run.id,
        overrideAccess: true,
      });
      deletedRuns++;
    } catch {
      // 单个 run 删除失败不影响整体流程，记录日志
      console.error(`Failed to delete agent-run ${run.id} during thread ${body.id} cleanup`);
    }
  }

  // 删除 thread
  await payload.delete({
    collection: "agent-threads",
    id: body.id,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true, deletedRuns });
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/api/agent/thread/delete/route.ts
git commit -m "feat: add DELETE /api/agent/thread endpoint with cascade delete"
```

---

### Task 2: use-agent-thread hook 改造

**Files:**
- Modify: `src/components/dashboard/agent-chat/use-agent-thread.ts`

- [ ] **Step 1: 新增 deleteThread 函数**

在 `useAgentThreadList` 的 `archiveThread` 之后（第 92 行 `}, []);` 之后）插入 `deleteThread`：

```typescript
  const deleteThread = useCallback(async (deleteThreadId: number) => {
    const response = await fetch("/api/agent/thread", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteThreadId }),
    });

    if (!response.ok) {
      return false;
    }

    return true;
  }, []);
```

- [ ] **Step 2: 在 return 语句中暴露 deleteThread**

修改 return 对象（第 121-135 行），添加 `deleteThread`：

```typescript
  return {
    archiveThread,
    clearRunDetail,
    deleteThread,
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

- [ ] **Step 3: 提交**

```bash
git add src/components/dashboard/agent-chat/use-agent-thread.ts
git commit -m "feat: add deleteThread to useAgentThreadList hook"
```

---

### Task 3: ConfirmDialog 组件

**Files:**
- Create: `src/components/dashboard/agent/ConfirmDialog.tsx`

- [ ] **Step 1: 创建 ConfirmDialog 组件**

```typescript
"use client";

import { useEffect, useRef } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: "warning" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  variant,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      // 弹窗打开时聚焦取消按钮，防止误操作
      requestAnimationFrame(() => cancelRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass = variant === "danger"
    ? "sunny-confirm-btn-danger"
    : "sunny-confirm-btn-warning";

  return (
    <div className="sunny-confirm-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sunny-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="sunny-confirm-title">{title}</p>
        <p className="sunny-confirm-message">{message}</p>
        <div className="sunny-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="sunny-confirm-btn-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={confirmClass}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "处理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/dashboard/agent/ConfirmDialog.tsx
git commit -m "feat: add ConfirmDialog component for destructive actions"
```

---

### Task 4: ThreadRowMenu 组件

**Files:**
- Create: `src/components/dashboard/agent/ThreadRowMenu.tsx`

- [ ] **Step 1: 创建 ThreadRowMenu 组件**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ThreadRowMenuProps = {
  threadId: number;
  threadTitle: string;
  onArchive: (id: number) => void;
};

export function ThreadRowMenu({ threadId, threadTitle, onArchive }: ThreadRowMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, closeMenu]);

  const handleArchiveClick = useCallback(() => {
    setMenuOpen(false);
    setConfirmOpen(true);
  }, []);

  const handleConfirmArchive = useCallback(() => {
    setConfirmOpen(false);
    onArchive(threadId);
  }, [onArchive, threadId]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  return (
    <>
      <div className="sunny-thread-row-menu" ref={menuRef}>
        <button
          type="button"
          className="sunny-thread-row-menu-trigger"
          aria-label={`会话「${threadTitle}」操作`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          ⋮
        </button>
        {menuOpen && (
          <div className="sunny-thread-row-menu-dropdown" role="menu">
            <button
              type="button"
              className="sunny-thread-row-menu-item"
              role="menuitem"
              onClick={handleArchiveClick}
            >
              归档
            </button>
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className="sunny-confirm-overlay" onClick={handleCancelConfirm} role="dialog" aria-modal="true" aria-label="确认归档">
          <div className="sunny-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="sunny-confirm-title">确认归档</p>
            <p className="sunny-confirm-message">
              归档后可在「已归档」区找回。确定归档会话「{threadTitle}」？
            </p>
            <div className="sunny-confirm-actions">
              <button type="button" className="sunny-confirm-btn-cancel" onClick={handleCancelConfirm}>
                取消
              </button>
              <button type="button" className="sunny-confirm-btn-warning" onClick={handleConfirmArchive}>
                确认归档
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

> **设计说明**：ThreadRowMenu 内联了归档确认弹窗（不依赖 ConfirmDialog 组件），因为确认逻辑与菜单状态耦合（关闭菜单 → 打开确认），且避免额外 prop 传递。删除确认在 DashboardIconBar 中直接使用 ConfirmDialog（通过 state 管理），因为删除按钮不在菜单内。

- [ ] **Step 2: 提交**

```bash
git add src/components/dashboard/agent/ThreadRowMenu.tsx
git commit -m "feat: add ThreadRowMenu component with archive action"
```

---

### Task 5: ThreadHeader 归档按钮

**Files:**
- Modify: `src/components/dashboard/agent/ThreadHeader.tsx`

- [ ] **Step 1: 添加 onArchiveThread prop 和归档按钮**

修改 `ThreadHeaderProps`（第 11-21 行），在 `onRenameThread` 之后添加 `onArchiveThread`：

```typescript
type ThreadHeaderProps = {
  debugMode: boolean;
  displayTitle: string;
  isSubmitting: boolean;
  onArchiveThread?: () => void;
  onDebugModeChange: (next: boolean) => void;
  onRenameThread: (title: string) => Promise<boolean>;
  pendingAction: null | PendingAction;
  statusLabel: string;
  threadId: null | number;
  workbenchMode: AgentWorkbenchMode;
};
```

修改函数签名解构（第 44-53 行）：

```typescript
export function ThreadHeader({
  debugMode,
  displayTitle,
  isSubmitting,
  onArchiveThread,
  onDebugModeChange,
  onRenameThread,
  pendingAction,
  statusLabel,
  threadId,
  workbenchMode,
}: ThreadHeaderProps) {
```

新增 `confirmOpen` state（在现有 `useState` 之后）：

```typescript
  const [confirmOpen, setConfirmOpen] = useState(false);
```

在操作区添加归档按钮（第 96-106 行，"调试"按钮之后，`</div>` 之前）：

```typescript
          <button
            type="button"
            className={`sunny-agent-thread-header-icon-button${debugMode ? " is-active" : ""}`}
            aria-pressed={debugMode}
            aria-label="调试"
            title={debugMode ? "关闭调试" : "开启调试"}
            onClick={() => onDebugModeChange(!debugMode)}
          >
            <DashboardIcon name="debug" />
          </button>
          {onArchiveThread && threadId !== null ? (
            <button
              type="button"
              className="sunny-agent-thread-header-icon-button"
              aria-label="归档会话"
              title="归档会话"
              onClick={() => setConfirmOpen(true)}
            >
              <DashboardIcon name="archive" />
            </button>
          ) : null}
```

在操作区 `</div>`（第 108 行）之后，标题区之前，添加确认弹窗：

```typescript
      {confirmOpen && (
        <div className="sunny-confirm-overlay" onClick={() => setConfirmOpen(false)} role="dialog" aria-modal="true" aria-label="确认归档">
          <div className="sunny-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="sunny-confirm-title">确认归档</p>
            <p className="sunny-confirm-message">
              归档后可在「已归档」区找回。确定归档会话「{displayTitle}」？
            </p>
            <div className="sunny-confirm-actions">
              <button type="button" className="sunny-confirm-btn-cancel" onClick={() => setConfirmOpen(false)}>
                取消
              </button>
              <button type="button" className="sunny-confirm-btn-warning" onClick={() => { setConfirmOpen(false); onArchiveThread?.(); }}>
                确认归档
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/dashboard/agent/ThreadHeader.tsx
git commit -m "feat: add archive button to ThreadHeader"
```

---

### Task 6: AgentWorkbench + AgentConversation 穿透 onArchiveThread

**Files:**
- Modify: `src/components/dashboard/agent/AgentWorkbench.tsx`
- Modify: `src/components/dashboard/agent/AgentConversation.tsx`

- [ ] **Step 1: AgentWorkbench 添加 prop 和透传**

在 `AgentWorkbenchProps` 第 32 行之后添加：

```typescript
  onArchiveThread?: () => void;
```

在解构第 60 行之后添加：

```typescript
    onArchiveThread,
```

在 `AgentConversation` JSX（第 99-121 行）中添加 prop：

```typescript
            <AgentConversation
              displayTitle={displayTitle}
              errorMessage={errorMessage}
              isThinking={isThinking}
              isSubmitting={isSubmitting}
              messages={messages}
              onArchiveThread={onArchiveThread}
              onCancelApproval={onCancelApproval}
              ...
```

- [ ] **Step 2: AgentConversation 添加 prop 和透传**

在 `AgentConversation` 的 props 中添加（第 104 行 `onRenameThread` 之前）：

```typescript
  onArchiveThread?: () => void;
```

在 ThreadHeader JSX（第 190-200 行）中添加 prop：

```typescript
      <ThreadHeader
        displayTitle={displayTitle}
        debugMode={debugMode}
        isSubmitting={isSubmitting}
        onArchiveThread={onArchiveThread}
        onDebugModeChange={onDebugModeChange}
        ...
```

- [ ] **Step 3: 提交**

```bash
git add src/components/dashboard/agent/AgentWorkbench.tsx src/components/dashboard/agent/AgentConversation.tsx
git commit -m "feat: thread onArchiveThread prop through AgentWorkbench → AgentConversation → ThreadHeader"
```

---

### Task 7: SidebarNav + DashboardShell 穿透新 props

**Files:**
- Modify: `src/components/dashboard/SidebarNav.tsx`
- Modify: `src/components/dashboard/DashboardShell.tsx`

- [ ] **Step 1: SidebarNav 添加新 props**

修改 `SidebarNavProps`（第 6-8 行）：

```typescript
export type SidebarNavProps = DashboardIconBarProps & {
  initialSuggestions: AgentInboxSuggestion[];
};
```

添加 `onArchiveThread` 和 `onDeleteThread` 到函数体（第 10-12 行）：

```typescript
export function SidebarNav({ initialSuggestions, ...props }: SidebarNavProps) {
  return <DashboardIconBar {...props} initialSuggestions={initialSuggestions} />;
}
```

> SidebarNav 已经使用 `...props` 展开 `DashboardIconBarProps`，所以只要 `DashboardIconBarProps` 已包含新 prop，这里无需改动。确认 DashboardIconBar 的 props 包含后即可。

- [ ] **Step 2: DashboardShell 添加新 props**

在 `DashboardShellProps` 第 43-44 行 `onLoadThread` / `onNewThread` 之后添加：

```typescript
  onArchiveThread: (id: number) => Promise<boolean>;
  onDeleteThread: (id: number) => Promise<boolean>;
```

在解构（第 69-71 行 `onLoadThread` / `onNewThread` 之后）添加：

```typescript
    onArchiveThread,
    onDeleteThread,
```

在 `SidebarNav` JSX（第 261-268 行）中添加新 props：

```typescript
      <SidebarNav
        activeMode={activeMode}
        initialSuggestions={initialSuggestions}
        onArchiveThread={onArchiveThread}
        onDeleteThread={onDeleteThread}
        onLoadThread={onLoadThread}
        onModeChange={handleModeChange}
        onNewThread={handleNewThread}
        threadId={threadId}
        threads={threads}
      />
```

- [ ] **Step 3: 提交**

```bash
git add src/components/dashboard/SidebarNav.tsx src/components/dashboard/DashboardShell.tsx
git commit -m "feat: thread onArchiveThread/onDeleteThread through DashboardShell → SidebarNav → DashboardIconBar"
```

---

### Task 8: DashboardIconBar 改造

**Files:**
- Modify: `src/components/dashboard/DashboardIconBar.tsx`

- [ ] **Step 1: 更新 props 和导入**

在现有 imports（第 11 行之后）添加：

```typescript
import { ThreadRowMenu } from "@/components/dashboard/agent/ThreadRowMenu";
import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";
```

修改 `DashboardIconBarProps`（第 38-46 行），添加新 props：

```typescript
export type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  initialSuggestions: AgentInboxSuggestion[];
  onArchiveThread: (id: number) => Promise<boolean>;
  onDeleteThread: (id: number) => Promise<boolean>;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  threadId: null | number;
  threads: AgentThreadSummary[];
};
```

更新函数签名解构（第 48-56 行）：

```typescript
export function DashboardIconBar({
  activeMode,
  initialSuggestions,
  onArchiveThread,
  onDeleteThread,
  onModeChange,
  onLoadThread,
  onNewThread,
  threadId,
  threads,
}: DashboardIconBarProps) {
```

- [ ] **Step 2: 新增 delete 相关 state**

在现有 state 声明之后（第 65 行之后）添加：

```typescript
  const [deleteTarget, setDeleteTarget] = useState<AgentThreadSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
```

- [ ] **Step 3: 新增 handleArchive 和 handleDelete 回调**

在 `restoreThread` 之后（第 168 行之后）添加：

```typescript
  const handleArchive = useCallback(
    async (id: number) => {
      const ok = await onArchiveThread(id);
      if (ok && id === threadId) {
        onNewThread();
      }
    },
    [onArchiveThread, onNewThread, threadId],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);

    try {
      const ok = await onDeleteThread(deleteTarget.id);
      if (ok) {
        setArchiveThreads((prev) => prev.filter((t) => t.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setDeleteError("删除失败，请稍后重试");
      }
    } catch {
      setDeleteError("网络错误，请重试");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, onDeleteThread]);
```

- [ ] **Step 4: 修改活跃会话行的 thread row，添加 ThreadRowMenu**

修改会话列表渲染（第 323-334 行），在 `<button>` 内部添加菜单。将原来的单个 `<button>` 改为 `<div>` + `<button>` + `<ThreadRowMenu>`：

```typescript
              {filteredThreads.length > 0 ? (
                filteredThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className={`sunny-codex-thread-row${thread.id === threadId ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="sunny-codex-thread-row-btn"
                      onClick={() => onLoadThread(thread.id)}
                    >
                      <span>{thread.title || `会话 #${thread.id}`}</span>
                      <small>{formatThreadMeta(thread)}</small>
                    </button>
                    <ThreadRowMenu
                      threadId={thread.id}
                      threadTitle={thread.title || `会话 #${thread.id}`}
                      onArchive={handleArchive}
                    />
                  </div>
                ))
              ) : (
```

- [ ] **Step 5: 在归档区添加删除按钮**

修改归档区渲染（第 358-368 行），在"恢复"按钮旁添加"删除"按钮：

```typescript
                {archiveThreads.map((thread) => (
                  <div key={thread.id} className="sunny-codex-archive-thread" role="listitem">
                    <span className="sunny-codex-sidebar-label">{thread.title || `会话 #${thread.id}`}</span>
                    <div className="sunny-codex-archive-actions">
                      <button
                        type="button"
                        className="sunny-codex-archive-restore-btn"
                        onClick={(e) => { e.stopPropagation(); void restoreThread(thread.id); }}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        className="sunny-codex-archive-delete-btn"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(thread); }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
```

- [ ] **Step 6: 在 return 末尾（`</nav>` 之前）添加 ConfirmDialog**

```typescript
      <ConfirmDialog
        open={deleteTarget !== null}
        title="确认删除"
        message={
          deleteTarget
            ? `确定永久删除会话「${deleteTarget.title || `#${deleteTarget.id}`}」？此操作不可撤销。`
            : ""
        }
        confirmLabel="确认删除"
        variant="danger"
        busy={deleteBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
      />
```

- [ ] **Step 7: 提交**

```bash
git add src/components/dashboard/DashboardIconBar.tsx
git commit -m "feat: add ThreadRowMenu and delete button to DashboardIconBar"
```

---

### Task 9: use-agent-dashboard-chat 暴露新函数

**Files:**
- Modify: `src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts`

- [ ] **Step 1: 暴露 archiveThread 和 deleteThread**

在 `useAgentThreadList()` 解构（第 42-52 行）中添加 `archiveThread` 和 `deleteThread`：

```typescript
  const {
    archiveThread,
    clearRunDetail,
    deleteThread,
    fetchThread,
    fetchRunDetail,
    lastInteractionAt,
    runDetailError,
    selectedRunDetail,
    setThreadId,
    setThreads,
    threadId,
    threads,
  } = useAgentThreadList();
```

在 return 对象（第 347-395 行）中添加：

```typescript
    archiveThread,
    deleteThread,
```

位置：在 `activeInspectorTab` 之后，`artifactsRollbackBusy` 之前。

- [ ] **Step 2: 提交**

```bash
git add src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts
git commit -m "feat: expose archiveThread and deleteThread from useAgentDashboardChat"
```

---

### Task 10: DashboardPageClient 接线

**Files:**
- Modify: `src/components/dashboard/DashboardPageClient.tsx`

- [ ] **Step 1: 添加 onArchiveThread 和 onDeleteThread 回调**

在 `DashboardPageClient` 函数体中，`onNewThread` 回调之后添加：

```typescript
  const handleArchiveThread = useCallback(
    async (id: number) => {
      return chat.archiveThread(id, true);
    },
    [chat],
  );

  const handleDeleteThread = useCallback(
    async (id: number) => {
      return chat.deleteThread(id);
    },
    [chat],
  );

  const handleArchiveCurrentThread = useCallback(() => {
    const currentId = chat.threadId;
    if (currentId === null) return;
    void chat.archiveThread(currentId, true).then((ok) => {
      if (ok) {
        chat.clearRunDetail();
        chat.resetThread();
      }
    });
  }, [chat]);
```

- [ ] **Step 2: 将新 props 传递给 DashboardShell 和 AgentWorkbench**

在 `DashboardShell` JSX 中添加新 props：

```typescript
    <DashboardShell
      ...
      onArchiveThread={handleArchiveThread}
      onDeleteThread={handleDeleteThread}
      onLoadThread={...}
      ...
    >
```

在 `AgentWorkbench` JSX 中添加 `onArchiveThread`：

```typescript
      <AgentWorkbench
        ...
        onArchiveThread={handleArchiveCurrentThread}
        ...
      />
```

- [ ] **Step 3: 提交**

```bash
git add src/components/dashboard/DashboardPageClient.tsx
git commit -m "feat: wire archiveThread/deleteThread in DashboardPageClient"
```

---

### Task 11: CSS 样式

**Files:**
- Modify: `src/app/styles/sunny-dashboard-shell.css`

- [ ] **Step 1: 添加菜单、弹窗、删除按钮、会话行布局样式**

在文件末尾追加：

```css
/* ThreadRowMenu */
.sunny-codex-thread-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
}

.sunny-codex-thread-row-btn {
  flex: 1;
  display: grid;
  gap: 0.06rem;
  min-width: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
  font: inherit;
}

.sunny-codex-thread-row-btn span {
  font-size: var(--text-xs);
  font-weight: 560;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sunny-codex-thread-row-btn small {
  color: var(--muted);
  font-size: var(--text-2xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sunny-thread-row-menu {
  position: relative;
  flex-shrink: 0;
}

.sunny-thread-row-menu-trigger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
}

.sunny-codex-thread-row:hover .sunny-thread-row-menu-trigger,
.sunny-codex-thread-row:focus-within .sunny-thread-row-menu-trigger {
  display: flex;
}

.sunny-thread-row-menu-trigger:hover {
  background: color-mix(in srgb, var(--muted) 12%, transparent);
  color: var(--foreground);
}

.sunny-thread-row-menu-dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 50;
  min-width: 7rem;
  padding: 0.25rem;
  border-radius: 0.5rem;
  background: var(--background);
  border: 1px solid color-mix(in srgb, var(--muted) 20%, transparent);
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
}

.sunny-thread-row-menu-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.35rem 0.6rem;
  border: none;
  border-radius: 0.35rem;
  background: none;
  color: var(--foreground);
  font-size: var(--text-xs);
  cursor: pointer;
  text-align: left;
}

.sunny-thread-row-menu-item:hover {
  background: color-mix(in srgb, var(--muted) 12%, transparent);
}

/* ConfirmDialog */
.sunny-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 30%);
}

.sunny-confirm-dialog {
  min-width: 18rem;
  max-width: 24rem;
  padding: 1.25rem;
  border-radius: 0.75rem;
  background: var(--background);
  border: 1px solid color-mix(in srgb, var(--muted) 20%, transparent);
  box-shadow: 0 8px 30px rgb(0 0 0 / 15%);
}

.sunny-confirm-title {
  font-size: var(--text-sm);
  font-weight: 600;
  margin: 0 0 0.5rem;
}

.sunny-confirm-message {
  font-size: var(--text-xs);
  color: var(--muted);
  margin: 0 0 1rem;
  line-height: 1.5;
}

.sunny-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.sunny-confirm-btn-cancel {
  padding: 0.4rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--muted) 25%, transparent);
  border-radius: 0.4rem;
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-xs);
  cursor: pointer;
}

.sunny-confirm-btn-cancel:hover {
  background: color-mix(in srgb, var(--muted) 8%, transparent);
}

.sunny-confirm-btn-warning {
  padding: 0.4rem 0.9rem;
  border: none;
  border-radius: 0.4rem;
  background: #f59e0b;
  color: #fff;
  font-size: var(--text-xs);
  font-weight: 560;
  cursor: pointer;
}

.sunny-confirm-btn-warning:hover {
  background: #d97706;
}

.sunny-confirm-btn-danger {
  padding: 0.4rem 0.9rem;
  border: none;
  border-radius: 0.4rem;
  background: #ef4444;
  color: #fff;
  font-size: var(--text-xs);
  font-weight: 560;
  cursor: pointer;
}

.sunny-confirm-btn-danger:hover {
  background: #dc2626;
}

/* Archive section */
.sunny-codex-archive-thread {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem;
}

.sunny-codex-archive-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.sunny-codex-archive-delete-btn {
  padding: 0.15rem 0.45rem;
  border: none;
  border-radius: 0.3rem;
  background: transparent;
  color: var(--muted);
  font-size: var(--text-2xs);
  cursor: pointer;
}

.sunny-codex-archive-delete-btn:hover {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #ef4444;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/styles/sunny-dashboard-shell.css
git commit -m "style: add ThreadRowMenu, ConfirmDialog, and archive delete button styles"
```

---

### Task 12: E2E 测试

**Files:**
- Create: `tests/e2e/dashboard-thread-actions.spec.ts`

- [ ] **Step 1: 创建 E2E 测试**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Thread archive & delete", () => {
  test("archive from sidebar menu → confirm → thread disappears from list", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector(".sunny-codex-thread-row");

    const initialCount = await page.locator(".sunny-codex-thread-row").count();
    expect(initialCount).toBeGreaterThan(0);

    // hover first thread row, click ⋮ menu trigger
    const firstRow = page.locator(".sunny-codex-thread-row").first();
    await firstRow.hover();
    await firstRow.locator(".sunny-thread-row-menu-trigger").click();

    // click archive menu item
    await page.locator(".sunny-thread-row-menu-item").first().click();

    // confirm dialog appears
    await expect(page.locator(".sunny-confirm-dialog")).toBeVisible();

    // click confirm
    await page.locator(".sunny-confirm-btn-warning").click();

    // thread count decreased
    await expect(page.locator(".sunny-codex-thread-row")).toHaveCount(initialCount - 1);
  });

  test("archive from sidebar menu → cancel → no change", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector(".sunny-codex-thread-row");

    const initialCount = await page.locator(".sunny-codex-thread-row").count();

    const firstRow = page.locator(".sunny-codex-thread-row").first();
    await firstRow.hover();
    await firstRow.locator(".sunny-thread-row-menu-trigger").click();
    await page.locator(".sunny-thread-row-menu-item").first().click();

    await expect(page.locator(".sunny-confirm-dialog")).toBeVisible();

    // click cancel
    await page.locator(".sunny-confirm-btn-cancel").click();

    // dialog closed, no change
    await expect(page.locator(".sunny-confirm-dialog")).not.toBeVisible();
    await expect(page.locator(".sunny-codex-thread-row")).toHaveCount(initialCount);
  });

  test("delete from archive section → confirm → thread disappears", async ({ page }) => {
    await page.goto("/dashboard");

    // open archive section
    const archiveToggle = page.locator(".sunny-codex-archive-section button").first();
    await archiveToggle.click();

    await page.waitForSelector(".sunny-codex-archive-thread");

    const initialCount = await page.locator(".sunny-codex-archive-thread").count();
    if (initialCount === 0) {
      test.skip(true, "No archived threads to delete");
      return;
    }

    // click delete on first archived thread
    await page.locator(".sunny-codex-archive-delete-btn").first().click();

    // confirm dialog
    await expect(page.locator(".sunny-confirm-dialog")).toBeVisible();
    await page.locator(".sunny-confirm-btn-danger").click();

    // thread removed from archive
    await expect(page.locator(".sunny-codex-archive-thread")).toHaveCount(initialCount - 1);
  });

  test("archive current thread from ThreadHeader → switches to new thread", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector(".sunny-agent-thread-header");

    // click archive button in ThreadHeader
    const archiveBtn = page.locator(".sunny-agent-thread-header-actions button[aria-label='归档会话']");
    if (await archiveBtn.isVisible()) {
      await archiveBtn.click();

      // confirm
      await expect(page.locator(".sunny-confirm-dialog")).toBeVisible();
      await page.locator(".sunny-confirm-btn-warning").click();

      // should show "Agent 会话" still (new thread state)
      await expect(page.locator(".sunny-agent-thread-header p").first()).toContainText("AGENT 会话");
    }
  });
});
```

- [ ] **Step 2: 运行 E2E 测试验证**

```bash
npx playwright test tests/e2e/dashboard-thread-actions.spec.ts
```

- [ ] **Step 3: 提交**

```bash
git add tests/e2e/dashboard-thread-actions.spec.ts
git commit -m "test: add E2E tests for thread archive and delete"
```

---

### Task 13: 最终验证与 lint

- [ ] **Step 1: 运行 ESLint 检查**

```bash
npx eslint src/components/dashboard/agent/ThreadRowMenu.tsx src/components/dashboard/agent/ConfirmDialog.tsx src/components/dashboard/DashboardIconBar.tsx src/components/dashboard/agent/ThreadHeader.tsx
```
Expected: 0 errors, 0 warnings

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx tsc --noEmit
```
Expected: 无新增类型错误

- [ ] **Step 3: 运行全部 agent 相关测试**

```bash
npx playwright test tests/e2e/dashboard-agent.spec.ts tests/e2e/dashboard-thread-actions.spec.ts
```

- [ ] **Step 4: 提交**

```bash
git commit -m "chore: final lint and type check pass"
```
