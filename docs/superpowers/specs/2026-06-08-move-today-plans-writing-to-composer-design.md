# Move "Today", "Plans", "Writing" from Sidebar to Composer Mode Selector

## Context

The left sidebar currently lists 8 mode buttons under "工作区": 工作台, 今日, 计划, 日程, 写作, 记忆库, 清单, 时间线. Among these, "今日" (today), "计划" (plans), and "写作" (writing) are not separate views — they route to the same Agent workbench as "工作台", just with a different `AgentWorkbenchMode` preset. Their only distinguishing behavior is auto-filling a prompt when clicked (e.g., "帮我整理今天最应该推进的工作").

The Composer already has a mode selector dropdown (`.sunny-agent-composer-mode-control`) with 6 options: 自动, 只回答, 规划, 执行, 回顾, 时间线. There is overlap: the sidebar's "计划" (plans) maps to the same `AgentWorkbenchMode = "plan"` already exposed in the Composer as "规划".

Moving these 3 entries to the Composer mode selector:
- Reduces sidebar clutter (8→5 entries)
- Consolidates mode switching into a single, discoverable control
- Eliminates the auto-prompt-send side effect from the sidebar

## Design

### Files Changed

| File | Change |
|---|---|
| `src/components/dashboard/DashboardIconBar.tsx` | Remove `today`, `plans`, `writing` from `DASHBOARD_MODES` |
| `src/components/dashboard/agent/AgentComposer.tsx` | Add `today` and `writing` to `MODE_OPTIONS` (`plan` already exists as "规划") |
| `src/components/dashboard/DashboardShell.tsx` | Remove `today`, `plans`, `writing` from `iconModeToWorkbenchMode` mapping |

### DashboardIconBar Changes

Remove three entries from `DASHBOARD_MODES`:

```tsx
// REMOVED:
{ key: "today", label: "今日", icon: "calendar", prompt: "帮我整理今天最应该推进的工作" },
{ key: "plans", label: "计划", icon: "plans", prompt: "帮我检查所有进行中计划的进度" },
{ key: "writing", label: "写作", icon: "pencil", prompt: "帮我整理最近的写作素材" },
```

Left sidebar "工作区" section becomes: 工作台, 日程, 记忆库, 清单, 时间线 (5 entries).

### AgentComposer Changes

Add two entries to `MODE_OPTIONS`. The existing `plan` entry (label "规划") already covers the "计划" use case, so only `today` and `writing` are new:

```tsx
{
  key: "today",
  label: "今日",
  description: "整理今天最应该推进的工作，默认不写入数据库。",
  placeholder: "输入要关注的重点或日期范围",
},
{
  key: "writing",
  label: "写作",
  description: "整理写作素材或起草内容，默认不写入数据库。",
  placeholder: "描述写作主题或素材类型",
},
```

The `AgentWorkbenchMode` type already includes `"today"` and `"writing"`, so no type changes needed.

### DashboardShell Changes

Remove the three entries from `iconModeToWorkbenchMode`:

```tsx
// REMOVED:
today: "today",
plans: "plan",
writing: "writing",
```

Resulting mapping:
```tsx
const iconModeToWorkbenchMode = {
  agent: "ask",
  timeline: "timeline",
};
```

### Data Flow

**Before:**
```
Sidebar click "今日"
  → handleModeChange("today", prompt)
    → setActiveMode("today")
    → onWorkbenchModeChange("today")
    → onRunPrompt(prompt)  // auto-sends preset prompt
```

**After:**
```
Composer mode selector select "今日"
  → onWorkbenchModeChange("today")
    → chat.setWorkbenchMode("today")
    → placeholder updates in textarea
    → user types and submits manually
```

### What Does NOT Change

- `AgentWorkbenchMode` type — `"today"` and `"writing"` already exist
- `useAgentDashboardChat` — `setWorkbenchMode` already handles all mode values
- `DashboardPageClient` — no changes needed, passes workbenchMode through unchanged
- `DashboardShell` routing — `activeMode` stays "agent" when today/writing/plan are selected from Composer, which correctly renders the agent workbench children
- `DashboardModeContext` — only consumer is `AgentWorkbench` checking `dashboardMode === "memory"`, unaffected
- `AgentWorkbench` — no changes needed

### Composer Mode Selector Final State

After changes, `MODE_OPTIONS` has 8 entries:

| Mode | Label | Notes |
|---|---|---|
| ask | 自动 | existing |
| answer | 只回答 | existing |
| plan | 规划 | existing, covers "计划" |
| execute | 执行 | existing |
| review | 回顾 | existing |
| timeline | 时间线 | existing |
| today | 今日 | **new** |
| writing | 写作 | **new** |

### Sidebar Final State

"DASHBOARD_MODES" has 8→5 entries:

| Mode | Label | Notes |
|---|---|---|
| agent | 工作台 | kept |
| schedule | 日程 | kept, renders ScheduleMonthView |
| memory | 记忆库 | kept, renders MemoryCardGrid |
| checklist | 清单 | kept, renders ChecklistView |
| timeline | 时间线 | kept, renders TimelineView |

## Verification

- Left sidebar no longer shows "今日", "计划", "写作"
- Composer mode dropdown shows "今日" and "写作" as new options
- Selecting "今日" changes placeholder text accordingly
- Selecting "写作" changes placeholder text accordingly
- Selecting "规划" (existing) still works as before
- schedule/memory/checklist/timeline sidebar entries continue routing to their dedicated views
- TypeScript compilation passes with no errors
