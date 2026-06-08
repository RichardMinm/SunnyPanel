# Thread 删除与归档功能设计

**日期**: 2026-06-08  
**状态**: 已确认  
**分支**: `refactor/dashboard-orphan-cleanup`

## 概述

为 Agent 会话（Thread）开发**删除**功能，并**明确归档**功能的完整交互路径。采用两步流程：活跃会话先归档，归档区提供永久删除。

## 当前状态

| 层面 | 现状 |
|------|------|
| 数据模型 | `agent-threads` 有 `archived`（checkbox）和 `status`（active/closed）字段 |
| API | `PATCH /api/agent/thread` 支持归档/恢复，**无 DELETE 端点** |
| Hook | `useAgentThreadList` 有 `archiveThread()` 但未暴露给 UI |
| UI | 侧边栏活跃会话无可归档入口；归档区有恢复按钮但无删除按钮 |

## 设计决策

- **删除方式**: 两步流程 — 活跃会话先归档，归档区再永久删除
- **归档入口**: 侧边栏会话行 `⋮` 菜单 + ThreadHeader 归档按钮，两者都有
- **删除范围**: 级联删除 — 删除 thread 时同时删除关联的 `agent-runs`
- **确认机制**: 所有破坏性操作（归档/删除）均需确认弹窗

---

## 组件架构

```
新增 (3):
├── ThreadRowMenu.tsx           ⋮ 下拉菜单组件
├── ConfirmDialog.tsx           通用确认弹窗
└── delete/route.ts             DELETE /api/agent/thread

修改 (8):
├── DashboardIconBar.tsx        会话行菜单 + 归档区删除按钮
├── ThreadHeader.tsx            归档按钮
├── use-agent-thread.ts         + deleteThread, 暴露 archiveThread
├── use-agent-dashboard-chat.ts 暴露 archiveThread / deleteThread
├── DashboardShell.tsx          新增 props 传递
├── DashboardPageClient.tsx     接线
├── icons.tsx                   确认 archive 图标存在
├── sunny-dashboard-shell.css   菜单 + 弹窗 + 删除按钮样式
```

**数据流**:
```
用户点击 → ThreadRowMenu / ThreadHeader
         → ConfirmDialog（确认）
         → useAgentThreadList.archiveThread / deleteThread
         → fetch PATCH/DELETE /api/agent/thread
         → 本地 state 乐观更新 → UI 重渲染
```

---

## API 设计

### 新增 DELETE 端点

```
DELETE /api/agent/thread
Content-Type: application/json

请求: { "id": 42 }
```

| 场景 | 状态码 | 响应 |
|------|--------|------|
| 成功（级联删除 thread + runs） | 200 | `{ "ok": true, "deletedRuns": 3 }` |
| 未登录 | 401 | `{ "message": "未登录" }` |
| 缺少 id | 400 | `{ "message": "缺少 id" }` |
| Thread 不存在或无权限 | 404 | `{ "message": "Thread 不存在或无权限" }` |

**服务端逻辑**：
1. `getPayloadAuthResult()` 验证登录 → 401
2. 校验 `body.id` 类型为 number → 400
3. `payload.findByID` 查询 thread，`getRelationId` 校验 ownership → 404
4. `payload.find` 查询关联 `agent-runs`（where: `{ thread: { equals: id } }`）
5. 逐个 `payload.delete` agent-runs
6. `payload.delete` agent-thread
7. 返回 `{ ok: true, deletedRuns: count }`

### 现有 PATCH（不变）

```
PATCH /api/agent/thread
{ "id": 42, "archived": true }   → 归档
{ "id": 42, "archived": false }  → 恢复
```

---

## UI 设计

### ThreadRowMenu（⋮ 下拉菜单）

侧边栏活跃会话行右侧，hover 时显示 `⋮` 按钮，点击弹出菜单：

- **归档**: 弹出 ConfirmDialog，确认后调用 `archiveThread(id, true)`

交互：点击外部或 Escape 关闭菜单。

注：侧边栏菜单不提供"重命名"——ThreadHeader 已有行内点击重命名功能，从侧边栏触发需要穿透 4 层 props，投入产出比低。

### ThreadHeader 归档按钮

在 ThreadHeader 操作区（调试按钮右侧）增加归档图标按钮：

- 仅在 `threadId !== null` 时渲染
- 点击 → ConfirmDialog → 归档成功后 `onNewThread()`
- 复用已有 `DashboardIcon name="archive"`

### 归档区删除按钮

归档区每行在"恢复"按钮旁增加"删除"按钮：

- 点击 → ConfirmDialog（`variant: "danger"`）
- 文案："确定永久删除会话「{title}」？此操作不可撤销。"
- 确认后调用 DELETE API，成功后从 `archiveThreads` 本地移除

### ConfirmDialog

通用确认弹窗组件：

```ts
type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: "warning" | "danger";  // 决定按钮色调
  busy?: boolean;                  // API 请求中
  onConfirm: () => void;
  onCancel: () => void;
};
```

---

## 错误处理

### 归档

| 场景 | 处理 |
|------|------|
| API 失败 | 静默失败，菜单关闭，状态不变 |
| 网络异常 | catch 忽略 |
| 当前活跃会话被归档 | 归档成功后自动 `onNewThread()` |

### 删除

| 场景 | 处理 |
|------|------|
| API 404 | "会话已被删除" — 从本地列表移除 |
| API 401 | "登录已过期" |
| 网络异常 | 弹窗内显示错误，允许重试，不关闭弹窗 |
| runs 删除失败 | thread 删除成功后即返回 ok，runs 删除失败记录日志 |

### 状态一致性

- **归档**: 从 `threads` 移除，`archiveThreads` 不自动刷新（下次展开时重载）
- **恢复**: 从 `archiveThreads` 移除，活跃列表不自动刷新
- **删除**: 从 `archiveThreads` 移除

---

## 测试策略

### 单元测试

| 文件 | 覆盖 |
|------|------|
| `tests/agent/thread-actions.test.ts` | archiveThread / deleteThread hook 逻辑 |
| `tests/agent/thread-api.test.ts` | DELETE 端点鉴权、参数校验、404 |

### E2E 测试

`tests/e2e/dashboard-thread-actions.spec.ts`:

1. 侧边栏菜单归档 → 确认弹窗 → 会话从列表消失
2. ThreadHeader 归档 → 确认 → 切换到新会话
3. 归档区删除 → 确认弹窗 → 会话从归档列表消失
4. 确认弹窗取消 → 无变化
5. 归档区为空时显示空提示

---

## 文件变更清单

```
新增 (3):
├── src/components/dashboard/agent/ThreadRowMenu.tsx
├── src/components/dashboard/agent/ConfirmDialog.tsx
└── src/app/api/agent/thread/delete/route.ts

修改 (8):
├── src/components/dashboard/DashboardIconBar.tsx
├── src/components/dashboard/agent/ThreadHeader.tsx
├── src/components/dashboard/agent-chat/use-agent-thread.ts
├── src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts
├── src/components/dashboard/DashboardShell.tsx
├── src/components/dashboard/DashboardPageClient.tsx
├── src/components/dashboard/icons.tsx
└── src/app/styles/sunny-dashboard-shell.css
```
