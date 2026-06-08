# Move "Today", "Plans", "Writing" from Sidebar to Composer Mode Selector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "今日" (today), "计划" (plans), "写作" (writing) entries from the left sidebar and add them to the Composer's workbench mode selector dropdown.

**Architecture:** Three-file change — remove 3 entries from `DASHBOARD_MODES` in `DashboardIconBar.tsx`, add 2 new entries to `MODE_OPTIONS` in `AgentComposer.tsx` (plan already exists as "规划"), clean up the stale `iconModeToWorkbenchMode` mappings in `DashboardShell.tsx`. No type changes, no data flow changes — the existing `AgentWorkbenchMode` type already includes `"today"` and `"writing"`.

**Tech Stack:** React/Next.js, TypeScript

---

## File Map

| File | Role | Action |
|---|---|---|
| `src/components/dashboard/DashboardIconBar.tsx` | Sidebar mode list | Remove 3 entries from `DASHBOARD_MODES` |
| `src/components/dashboard/agent/AgentComposer.tsx` | Composer mode selector | Add 2 entries to `MODE_OPTIONS` |
| `src/components/dashboard/DashboardShell.tsx` | Mode routing/mapping | Remove 3 entries from `iconModeToWorkbenchMode` |

---

### Task 1: Remove today/plans/writing from sidebar DASHBOARD_MODES

**Files:**
- Modify: `src/components/dashboard/DashboardIconBar.tsx:17-31`

- [ ] **Step 1: Remove the three entries from DASHBOARD_MODES**

Open `src/components/dashboard/DashboardIconBar.tsx`. Find the `DASHBOARD_MODES` array (lines 17-31) and remove the `today`, `plans`, and `writing` entries:

```tsx
export const DASHBOARD_MODES: Array<{
  key: DashboardIconMode;
  label: string;
  icon: DashboardIconName;
  prompt: string;
}> = [
  { key: "agent", label: "工作台", icon: "agent", prompt: "" },
  // REMOVED: { key: "today", label: "今日", icon: "calendar", prompt: "帮我整理今天最应该推进的工作" },
  // REMOVED: { key: "plans", label: "计划", icon: "plans", prompt: "帮我检查所有进行中计划的进度" },
  { key: "schedule", label: "日程", icon: "schedule", prompt: "帮我查看最近的日程安排" },
  // REMOVED: { key: "writing", label: "写作", icon: "pencil", prompt: "帮我整理最近的写作素材" },
  { key: "memory", label: "记忆库", icon: "memory", prompt: "" },
  { key: "checklist", label: "清单", icon: "checklist", prompt: "" },
  { key: "timeline", label: "时间线", icon: "timeline", prompt: "" },
];
```

Final array should be 5 entries: agent, schedule, memory, checklist, timeline.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardIconBar.tsx
git commit -m "refactor: remove today/plans/writing from sidebar DASHBOARD_MODES

These modes belong in the Composer's workbench mode selector, not the sidebar.
They all route to the same agent workbench view, just with different workbenchMode presets.
Removing them reduces sidebar clutter from 8 to 5 entries."
```

---

### Task 2: Add today and writing to Composer MODE_OPTIONS

**Files:**
- Modify: `src/components/dashboard/agent/AgentComposer.tsx:46-88`

- [ ] **Step 1: Add today and writing entries to MODE_OPTIONS**

Open `src/components/dashboard/agent/AgentComposer.tsx`. Find the `MODE_OPTIONS` array (lines 46-88) and add the two new entries after the existing `timeline` entry:

```tsx
  {
    key: "timeline",
    label: "时间线",
    description: "记录或查询时间线事件，默认不会写入数据库。",
    placeholder: "描述要记录的时间线事件或查询条件",
  },
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
];
```

Note: `plan` (label "规划") already exists in `MODE_OPTIONS` — it covers the "计划" use case, so no additional entry is needed for plans.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors — `AgentWorkbenchMode` type in `src/lib/agent/workbench-mode.ts` already includes `"today"` and `"writing"`, so the new entries are type-safe.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/agent/AgentComposer.tsx
git commit -m "feat: add today and writing modes to Composer MODE_OPTIONS

'today' and 'writing' are valid AgentWorkbenchMode values. Adding them to the
Composer's mode selector dropdown makes them accessible alongside the existing
ask/answer/plan/execute/review/timeline options. The 'plan' mode already exists
as '规划' and covers the sidebar's former '计划' entry."
```

---

### Task 3: Clean up stale iconModeToWorkbenchMode mappings

**Files:**
- Modify: `src/components/dashboard/DashboardShell.tsx:93-103`

- [ ] **Step 1: Remove today/plans/writing from the mapping**

Open `src/components/dashboard/DashboardShell.tsx`. Find the `iconModeToWorkbenchMode` object (lines 93-103) and remove `today`, `plans`, and `writing` entries:

```tsx
const iconModeToWorkbenchMode = useMemo<Partial<Record<DashboardIconMode, AgentWorkbenchMode>>>(
  () => ({
    agent: "ask",
    // REMOVED: today: "today",
    // REMOVED: plans: "plan",
    timeline: "timeline",
    // REMOVED: writing: "writing",
    // schedule 和 memory 不走对话 pipeline，无需映射
  }),
  [],
);
```

- [ ] **Step 2: Verify the DashboardIconMode import is still needed**

Check that `DashboardIconMode` type import on line 10 is still used (it is — `activeMode` state and `handleModeChange` parameter both use it):

```tsx
import type { DashboardIconMode } from "./DashboardIconBar";
```

This import is still needed. No change required.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardShell.tsx
git commit -m "refactor: remove stale iconModeToWorkbenchMode mappings

The today/plans/writing sidebar entries have been removed, so their
DashboardIconMode→AgentWorkbenchMode mappings are no longer reachable.
Cleaning them up keeps the mapping table accurate."
```

---

### Task 4: Final verification

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

- [ ] **Step 2: Verify no dangling references**

Run: `grep -rn "today\|plans\|writing" src/components/dashboard/DashboardIconBar.tsx | grep -v "// REMOVED\|timeline"`
Expected: No output (the only remaining references should be in the kept `timeline` entry, which is filtered out)

- [ ] **Step 3: Verify the Composer MODE_OPTIONS has all expected entries**

Run: `grep -c "key:" src/components/dashboard/agent/AgentComposer.tsx`
Expected: 22 (11 `key:` occurrences in type definitions + MODE_OPTIONS entries — the exact count may vary; visually confirm MODE_OPTIONS has 8 entries: ask, answer, plan, execute, review, timeline, today, writing)

- [ ] **Step 4: Commit (if any remaining changes)**

```bash
git status
# Should show clean working tree with 3 commits
```
