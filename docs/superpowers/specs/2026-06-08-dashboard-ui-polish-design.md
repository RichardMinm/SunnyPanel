# Dashboard UI Polish: Dynamic Dropdown, Pill Menu, Enter-to-Send

## Context

Three UX refinements for the Dashboard:

1. **ThreadRowMenu dynamic flip** — the `⋮` dropdown per thread row opens downward via `top: 100%`. When the row is near the bottom of the viewport, the menu overflows. It should flip upward.
2. **Composer mode menu restyle** — the workbench mode selector dropdown needs a pill-shaped (large border-radius) frame and scrollable content (max 5–6 visible items).
3. **Enter to send** — pressing Enter in the Composer textarea should submit the form. Shift+Enter inserts a newline.

## Design

### 1. ThreadRowMenu Dynamic Flip

**File:** `src/components/dashboard/agent/ThreadRowMenu.tsx`

When the ⋮ trigger is clicked, use `getBoundingClientRect()` to measure the trigger element's distance to the viewport bottom. Compare against an estimated menu height (~6rem / 96px). Set a `dropUp` state:

```tsx
const [dropUp, setDropUp] = useState(false);

// In click handler:
const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
const menuEstimateHeight = 96; // ~6rem
setDropUp(window.innerHeight - rect.bottom < menuEstimateHeight);
```

Pass `dropUp` to the dropdown div via a CSS class or inline style.

**File:** `src/app/styles/sunny-dashboard-shell.css`

Add a modifier class for the upward variant:

```css
.sunny-thread-row-menu-dropdown.is-drop-up {
  top: auto;
  bottom: 100%;
}
```

### 2. Composer Mode Menu: Pill Shape + Scroll

**File:** `src/app/styles/sunny-agent.css`

Changes to `.sunny-agent-composer-mode-menu`:

| Property | Before | After |
|---|---|---|
| `border-radius` | `0.9rem` | `1.2rem` |
| `max-height` | (none) | `calc(5.5 * 2.4rem)` (~13.2rem, ~5.5 items) |
| `overflow-y` | (none) | `auto` |

Also add scrollbar styling:

```css
.sunny-agent-composer-mode-menu {
  /* ... existing ... */
  border-radius: 1.2rem;
  max-height: calc(5.5 * 2.4rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--muted) 28%, transparent) transparent;
}
```

Inner button items keep `border-radius: 0.7rem`. The active/hover state uses `border-radius: 0.7rem` to match the pill theme.

### 3. Enter to Send

**File:** `src/components/dashboard/agent/AgentComposer.tsx`

Add `onKeyDown` handler to the `<textarea>` element:

```tsx
onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!disabled && input.trim().length > 0) {
      onSubmit();
    }
  }
}}
```

Behavior:
- **Enter** (no Shift) → prevent default newline, submit form (if not disabled and input non-empty)
- **Shift+Enter** → default behavior, inserts newline
- Disabled state or empty input → no action

### Files Changed Summary

| File | Change | Type |
|---|---|---|
| `src/components/dashboard/agent/ThreadRowMenu.tsx` | Add `dropUp` state + `getBoundingClientRect` logic | JS logic |
| `src/app/styles/sunny-dashboard-shell.css` | Add `.is-drop-up` modifier class | CSS |
| `src/app/styles/sunny-agent.css` | Change mode menu border-radius, add max-height + overflow | CSS |
| `src/components/dashboard/agent/AgentComposer.tsx` | Add `onKeyDown` handler on textarea | JS logic |

### What Does NOT Change

- Quick menu (`+` button) — unaffected
- Mention dropdown — unaffected
- Confirm dialog — unaffected
- Mode trigger button — unaffected
- Composer layout/structure — unaffected

## Verification

- ThreadRowMenu near viewport bottom opens upward
- ThreadRowMenu near viewport top opens downward (current behavior)
- Composer mode menu has visibly larger, pill-like border-radius
- Composer mode menu scrolls when all 8 modes exceed the visible area
- Pressing Enter in textarea with content submits the form
- Pressing Shift+Enter inserts a newline
- Pressing Enter with empty input does nothing
- Pressing Enter while disabled does nothing
- TypeScript compilation passes
