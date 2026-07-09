# Showcase

SunnyPanel is an AI-native personal workspace that combines writing, planning,
checklist, schedule, and timeline into a single panel, with an Agent workflow
that prioritizes safety: confirmation before write, receipt after execute,
and local rollback when supported.

---

## Project Scope

SunnyPanel is a single-user personal workspace, not a team collaboration
platform or enterprise CMS.

Three layers:

- **Public Site** — published blog, notes, timeline, tags/categories browsing.
  No admin controls, no agent UI, no private content.
- **Dashboard** — writing studio, agent workbench, planning/schedule/checklist
  management, inspector, receipts, rollback.
- **Agent Workflow** — natural language input → intent routing →
  draft → dry-run → policy guard → pending confirmation → execute →
  receipt → rollback.

---

## Implemented Capabilities

### Content
- Blog and Notes with full editor (TipTap)
- Content lifecycle: draft / published / archived
- Visibility: private / public
- Tags (Post), WritingCategory (Post/Note)
- Public Site rendering: Home, Blog, Notes, Timeline, About
- Tags browsing (`/tags/[slug]`), category browsing (`/categories/[slug]`)

### Planning Execution Lifecycle
- Plan → Checklist.planId (bidirectional)
- Checklist completion → TimelineEvent + Plan.progress auto-sync
- ScheduleItem → Plan.linkedContent
- Rollback with linkedContent cleanup
- Deterministic conflict detection for schedule items
- Receipt and Rollback for all write operations

### Agent
- Read / Write boundary (query never enters write flow)
- Intent router (LLM + deterministic guards)
- Readiness gate (context completeness check)
- Draft generation (deterministic template, optional LLM enhancement)
- Dry-run preview (no database write)
- Policy Guard (risk assessment, action blocking)
- Pending Confirmation (user must explicitly confirm)
- Execute (writes to Payload / PostgreSQL)
- Receipt (AgentRun + AgentActionReceipt)
- Rollback (delete_created_document, restore_plan_links, etc.)

### UI
- Dashboard shell with sidebar, agent workbench, inspector
- Agent Activity timeline (structured states, no raw chain-of-thought)
- Developer Trace panel (sanitized, no secrets)
- Motion system with reduced-motion support
- Design tokens for color, spacing, typography

---

## Safety Model

### Write Safety
1. Understanding user intent != execution
2. Generating draft != writing to database
3. User accepting draft != final execution
4. Confirmation required before execute
5. Query intent never enters write flow

### Data Safety
- Public Site only shows `status=published AND visibility=public`
- Agent Activity never shows raw chain-of-thought, raw prompt, or raw LLM response
- Trace panel never exposes secrets, tokens, or cookies
- Receipt never records secrets

### Rollback
- Local Payload-backed writes support rollback
- Delete strategy: removes created documents
- Restore strategy: restores Plan.linkedContent to pre-write state
- Not an enterprise audit or compliance system
- No external system rollback promise

---

## Testing Baseline

### Test Layers
| Layer | Count | Focus |
|-------|-------|-------|
| Planning tests | 270 | Plan ↔ Checklist ↔ Progress full workflow |
| Schedule tests | 268 | Readiness → Draft → Conflict → Execute → Rollback |
| Agent core tests | ~580 | Intent routing, Policy Guard, Receipt, Rollback, LangGraph |
| Content tests | 173 | Public site, prose, tokens, taxonomy matching |
| E2E smoke | 6 specs | Public routes, Dashboard, Writing, Schedule |

### Protected Tests
- Policy Guard, action receipts, rollback, tool dry-run
- execute-and-persist, create-checklist, create-schedule-items
- planning-full-workflow-e2e, schedule-workflow-e2e
- schedule-query read-only boundary

---

## Known Limits

- Single-user / admin model. No multi-user permissions or RBAC.
- No external Calendar integration or rollback.
- No auto-rescheduling.
- Checklist items are embedded (not independent collection).
- No TimelineEvent.relatedPlan (deferred D2-A3b).
- Legacy data not backfilled with planId.
