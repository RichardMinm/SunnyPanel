# Route Map

## 1. Public Routes

```txt
/                    Home
/blog                Blog list
/blog/[slug]         Blog detail
/notes               Notes list
/notes/[slug]        Note detail
/timeline            Timeline
/about               About / Now
/tags/[slug]         Tag browsing
/categories/[slug]   Category browsing
```

Rules:

- Public navigation only includes Home / Blog / Notes / Timeline / About
- `/tags/[slug]` and `/categories/[slug]` can be accessed through content metadata
- Public routes only render published + public content

Removed from public navigation:

```txt
/updates
/checklists
/schedule
/planning
/agent
/trace
```

Handling:

- `/updates` can redirect to `/notes` or `/timeline`
- `/checklists` should not be public navigation
- Do not delete Dashboard checklist workflow
- Do not delete Agent checklist tests

---

## 2. Dashboard Routes

Recommended scope:

```txt
/dashboard
/dashboard/writing
/dashboard/planning
/dashboard/planning/[id]
/dashboard/checklists
/dashboard/schedule
/dashboard/timeline
/dashboard/agent
/dashboard/agent/trace
```

Rules:

- Dashboard routes may show private data
- Dashboard routes may show pending confirmation
- Dashboard routes may show receipt / rollback
- Dashboard routes must not expose raw hidden reasoning

---

## 3. Route Rules

- Route trimming must not imply schema deletion
- Public nav trimming must not delete Dashboard workflows
- Redirects should be used before destructive route removal
- Public route metadata tests must reflect current route scope
