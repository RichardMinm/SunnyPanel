# Dashboard UI Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three UX refinements: ThreadRowMenu flips upward when near viewport bottom, Composer mode menu gets pill-shaped border-radius + scroll, and Enter key sends from Composer textarea.

**Architecture:** Three independent changes across 4 files. No shared state or dependencies between tasks — each can be implemented and verified in isolation.

**Tech Stack:** React/Next.js, TypeScript, CSS

---

## File Map

| File | Role | Task |
|---|---|---|
| `src/components/dashboard/agent/ThreadRowMenu.tsx` | ⋮ dropdown per thread row | Task 1 (JS logic) |
| `src/app/styles/sunny-dashboard-shell.css` | Sidebar & dropdown styles | Task 1 (CSS modifier) |
| `src/app/styles/sunny-agent.css` | Agent/Chat panel styles | Task 2 (CSS only) |
| `src/components/dashboard/agent/AgentComposer.tsx` | Composer input + mode selector | Task 3 (JS logic) |

---

### Task 1: ThreadRowMenu dynamic flip upward

**Files:**
- Modify: `src/components/dashboard/agent/ThreadRowMenu.tsx`
- Modify: `src/app/styles/sunny-dashboard-shell.css`

- [ ] **Step 1: Add dropUp state and detection logic to ThreadRowMenu**

Open `src/components/dashboard/agent/ThreadRowMenu.tsx`. Add a `dropUp` state and compute it in the trigger's click handler using `getBoundingClientRect()`.

Current trigger button (lines 56-66):
```tsx
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
```

Change to:
```tsx
<button
  type="button"
  className="sunny-thread-row-menu-trigger"
  aria-label={`会话「${threadTitle}」操作`}
  onClick={(e) => {
    e.stopPropagation();
    const nextOpen = !menuOpen;
    setMenuOpen(nextOpen);
    if (nextOpen) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const menuEstimateHeight = 96; // ~6rem, generous for current single-item menu
      setDropUp(window.innerHeight - rect.bottom < menuEstimateHeight);
    }
  }}
>
  ⋮
</button>
```

Also add the state declaration after the `confirmOpen` state (after line 13):
```tsx
const [dropUp, setDropUp] = useState(false);
```

- [ ] **Step 2: Apply dropUp to the dropdown className**

The dropdown div (line 68):
```tsx
<div className="sunny-thread-row-menu-dropdown" role="menu">
```

Change to conditionally add the modifier class:
```tsx
<div
  className={`sunny-thread-row-menu-dropdown${dropUp ? " is-drop-up" : ""}`}
  role="menu"
>
```

- [ ] **Step 3: Add CSS modifier for upward variant**

Open `src/app/styles/sunny-dashboard-shell.css`. After the `.sunny-thread-row-menu-dropdown` block (lines 707-718), add:

```css
.sunny-thread-row-menu-dropdown.is-drop-up {
  top: auto;
  bottom: 100%;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/agent/ThreadRowMenu.tsx src/app/styles/sunny-dashboard-shell.css
git commit -m "feat: add dynamic flip-up to ThreadRowMenu dropdown

When the thread row ⋮ menu is near the bottom of the viewport, the dropdown
now opens upward (bottom: 100%) instead of overflowing below the fold.
Uses getBoundingClientRect() to measure available space on click."
```

---

### Task 2: Composer mode menu pill shape + scroll

**Files:**
- Modify: `src/app/styles/sunny-agent.css:3502-3527`

- [ ] **Step 1: Read current mode menu CSS to verify line numbers**

Read `src/app/styles/sunny-agent.css` around lines 3502-3527 to confirm the current state before editing.

- [ ] **Step 2: Update .sunny-agent-composer-mode-menu styles**

Open `src/app/styles/sunny-agent.css`. Find the `.sunny-agent-composer-mode-menu` block (around line 3502):

Current:
```css
.sunny-agent-composer-mode-menu {
  left: 0;
  width: min(19rem, calc(100vw - 2rem));
}
```

Replace with:
```css
.sunny-agent-composer-mode-menu {
  left: 0;
  width: min(19rem, calc(100vw - 2rem));
  border-radius: 1.2rem;
  max-height: calc(5.5 * 2.4rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--muted) 28%, transparent) transparent;
}
```

- [ ] **Step 3: Update shared menu container border-radius**

The shared `.sunny-agent-composer-mode-menu, .sunny-agent-composer-quick-menu` block (lines 3488-3500) has `border-radius: 0.9rem`. Change it to `1.2rem`:

Current:
```css
.sunny-agent-composer-mode-menu,
.sunny-agent-composer-quick-menu {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  z-index: 40;
  display: grid;
  gap: 0.2rem;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 0.9rem;
  background: var(--surface);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14);
  padding: 0.35rem;
}
```

Change `border-radius: 0.9rem` to `border-radius: 1.2rem`.

- [ ] **Step 4: Verify the CSS compiles (no build errors)**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors (CSS changes don't affect TypeScript)

- [ ] **Step 5: Commit**

```bash
git add src/app/styles/sunny-agent.css
git commit -m "feat: add pill border-radius and scroll to Composer mode menu

- border-radius increased from 0.9rem to 1.2rem for capsule/pill appearance
- max-height limits visible items to ~5.5, with overflow-y: auto for scrolling
- scrollbar styling via scrollbar-width/scrollbar-color for visual consistency"
```

---

### Task 3: Enter to send from Composer textarea

**Files:**
- Modify: `src/components/dashboard/agent/AgentComposer.tsx`

- [ ] **Step 1: Add onKeyDown handler to the textarea**

Open `src/components/dashboard/agent/AgentComposer.tsx`. Find the `<textarea>` element (around lines 221-243). Add an `onKeyDown` prop:

Current:
```tsx
<textarea
  value={input}
  onChange={(event) => handleInputChange(event.target.value)}
  rows={1}
  aria-label={...}
  placeholder={...}
  className="sunny-agent-composer-input"
/>
```

Add `onKeyDown` between `onChange` and `rows`:
```tsx
<textarea
  value={input}
  onChange={(event) => handleInputChange(event.target.value)}
  onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && input.trim().length > 0) {
        onSubmit();
      }
    }
  }}
  rows={1}
  aria-label={...}
  placeholder={...}
  className="sunny-agent-composer-input"
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/agent/AgentComposer.tsx
git commit -m "feat: add Enter-to-send in Composer textarea

Pressing Enter (without Shift) now submits the form when the input is
non-empty and not disabled. Shift+Enter still inserts a newline.
This matches common chat/agent UX patterns."
```

---

### Task 4: Final verification

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

- [ ] **Step 2: Verify all changes are committed**

Run: `git log --oneline -4`
Expected: 4 commits (3 implementation + plan/spec commits)

- [ ] **Step 3: Quick visual check of changed sections**

Run:
```bash
echo "=== ThreadRowMenu dropUp ===" && grep -A2 "dropUp" src/components/dashboard/agent/ThreadRowMenu.tsx
echo "=== Mode menu border-radius ===" && grep "border-radius.*1\.2" src/app/styles/sunny-agent.css
echo "=== Mode menu max-height ===" && grep "max-height" src/app/styles/sunny-agent.css
echo "=== Enter onKeyDown ===" && grep -A4 "onKeyDown" src/components/dashboard/agent/AgentComposer.tsx
```
