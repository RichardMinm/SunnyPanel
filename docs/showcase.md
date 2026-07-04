# SunnyPanel Showcase

## One-line Description

SunnyPanel is an AI-native personal long-term workbench that turns natural-language goals into plans, checklists, schedules, timeline records, and public writing.

## Problem

Personal productivity tools often split work across blogs, notes, calendars, task lists, and admin panels. AI chat tools can generate advice, but they usually do not manage real workspace state safely.

SunnyPanel explores a different shape: an Agent-centered workspace where the assistant can help structure work, but every write is staged, confirmed, traceable, and rollback-aware.

## Core Features

- Public site for Blog, Notes, Updates, Timeline, Checklists, and custom pages.
- Dashboard Agent workbench for planning, scheduling, and tracking.
- Planning workflow with readiness checks and PlanDraft.
- Checklist workflow that turns plan stages into grouped task drafts.
- Schedule workflow with ScheduleDraft, local conflict checks, and optional suggestions.
- Safety workflow with dry-run, Policy Guard, pending confirmation, execute, receipt, and rollback.
- Agent Ops Center for recent runs, receipts, pending actions, failures, and timing.
- Shared writing/rendering layer for Admin, Dashboard, and public content.

## Highlights

- Drafts never write to the database.
- Confirmation is required before supported writes execute.
- AgentActionReceipt protects against duplicate confirmations.
- Rollback payloads make supported writes reversible or clearly report when compensation is indeterminate.
- Timeline and public checklists help transform work history into public narrative.
- Tests and release docs are treated as part of the product.

## Demo Path

1. Open the public homepage and explain the AI-native personal workbench positioning.
2. Show Blog, Notes, Updates, Timeline, and Checklists.
3. Enter Dashboard.
4. Ask the Agent to create a learning plan and break it into checklist and schedule.
5. Show PlanDraft, ChecklistDraft, and ScheduleDraft.
6. Prepare creation and show pending confirmation.
7. Confirm the write and show ActionResultCard with rollback availability.
8. Open Agent Ops Center to show recent runs and receipts.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Payload CMS 3
- PostgreSQL
- Tailwind CSS 4
- LangGraph-based Agent runtime
- Playwright for browser smoke where a test database is available

## Completed

- Agent Workflow v1 frozen.
- Planning, Checklist, Schedule, Timeline, Progress, Safety, Receipt, Rollback, and Ops flows implemented.
- Public site writing experience polished.
- Release engineering and CI baseline documented.
- Content and Agent test baselines passing.

## Current Limits

- No external Calendar integration.
- No recurrence.
- No automatic conflict rescheduling.
- No ChecklistDraft revise workflow yet.
- No high-risk external system writes.
- Public browser E2E requires a non-production Postgres-backed app environment.

## Future Direction

- Improve natural-language draft editing.
- Add ChecklistDraft revision flow.
- Explore read-only external calendar conflict awareness.
- Design recurrence with explicit confirmation and rollback semantics.
- Add more browser E2E coverage for full demo flows.
