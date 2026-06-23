# SunnyPanel UI Architecture

SunnyPanel serves three UI surfaces from two Next.js route groups:

| Surface | Route group | CSS entry | Components |
|---------|-------------|-----------|------------|
| Public site | `(site)` | `globals.css` | `src/components/public/` |
| Dashboard | `(site)/dashboard` | `globals.css` + `sunny-dashboard.css` | `src/components/dashboard/` |
| Payload Admin | `(payload)` | `admin-globals.css` | `src/components/admin/` |

## CSS layers

```
Tailwind @theme (globals / admin-globals)
  └── sunny-core.css       tokens, typography, base, primitives, settings
        ├── sunny-site.css     public chrome, ui, prose, markdown, categories
        ├── sunny-dashboard.css agent + dashboard layout (dashboard layout only)
        └── sunny-admin.css      payload bridge + admin shell (admin-globals only)
```

**Rules when adding styles**

- Shared tokens → `sunny-tokens.css` / `sunny-palettes.css` (included via core)
- Cross-surface primitives → `sunny-primitives.css`
- Public-only → `sunny-site.css` or `sunny-ui.css`
- Dashboard-only → `sunny-dashboard.css` or a `sunny-dashboard-*.css` shard imported there
- Admin / Payload overrides → `sunny-admin.css`, `admin-theme.css`, `@layer payload`

## Component layers

```
primitives/   AppButton, AppDialog, AppTabs — no business logic
shared/       SunnyAppProviders, PreferencesPanel, SettingsPopover
public/       site chrome, homepage modules, RichContentRenderer
dashboard/    AppShell, DashboardShell, agent, writing, schedule, …
admin/          Payload nav, header, providers
```

Prefer `AppButton` / `AppIconButton` over raw `<button className="sunny-agent-*">`.

## Theming

- **Light/dark**: `next-themes` via `SunnyAppProviders`, attribute `data-theme`
- **Palette**: `html[data-palette]` from SSR cookie on site; Admin uses `AdminPaletteBootstrap` + `SitePaletteSync`
- Settings UI: `PreferencesPanel` (locale, theme, palette) shared across site and dashboard

## Inspector pattern

- **Agent mode**: `DashboardRightPanel` + `ContextInspector` (tabs for context, trace, approval, …)
- **Writing mode**: `WritingMetaPanel` with peek/pin — separate implementation, same UX role

## Naming

| Prefix | Use |
|--------|-----|
| `app-*` | Primitive components |
| `sunny-*` | Shared semantic utility classes |
| `sunny-dashboard-*` | Dashboard layout / sidebar (legacy `sunny-codex-*` kept as CSS aliases) |
| `sunny-surface-*` | Card/title utilities shared with public pages |

## Tests

- `tests/content/css-bundle-split.test.ts` — layout import chains
- `tests/content/color-tokens.test.ts` — token discipline
- `tests/content/dashboard-admin-affordances.test.ts` — admin/dashboard integration
- `tests/content/ui-primitives.test.ts` — primitive exports and CSS
