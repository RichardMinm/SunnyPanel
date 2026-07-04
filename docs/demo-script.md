# SunnyPanel Demo Script

This document gives two talk tracks for demonstrating SunnyPanel. It is written so the presenter can read it directly, then adapt details to the actual demo data.

## 3-Minute Demo

### Audience

Interviewers, classmates, and people who do not need deep implementation detail.

### Script

Hi, this is SunnyPanel. In one sentence, it is an AI-native personal long-term workbench: it helps me turn goals into plans, checklists, schedules, timeline updates, and public writing.

I will start from the public site. The homepage explains the product position: this is not only a blog and not only an admin dashboard. It is a personal workspace with an AI workflow behind it. From here I can show recent writing, updates, timeline highlights, and public checklists.

The Blog is for longer thinking. Notes are shorter ideas. Updates are closer to a public activity feed. Timeline is the long-term memory layer, so important progress can become a narrative over time. Checklists show active progress instead of looking like a private backend table.

Now I will enter the Dashboard. This is where the Agent workflow lives. I can ask:

> 帮我制定一个学习计划，并拆成清单和日程。

The important thing is that the Agent does not immediately write to the database. It first checks whether the request has enough context. If it needs more information, it asks. If it has enough, it creates a PlanDraft.

Here is the PlanDraft. It is still a draft, so I can continue adjusting it. When I am ready, I can prepare creation. Then SunnyPanel can turn the plan into a ChecklistDraft, which makes the abstract plan into grouped tasks.

Next, I can turn those tasks into a ScheduleDraft. This step also keeps the same rule: draft first, write later. If there are local schedule conflicts, SunnyPanel shows suggestions, but those suggestions only update the draft. They do not write anything automatically.

When I choose to create the real records, SunnyPanel enters pending confirmation. This is the boundary where the system says: here is what will be written, here is the risk, and here is the rollback status. Only after I confirm does it execute.

After execution, I get a result card. It shows what was created, how many items were created, the date range, and whether rollback is available.

Finally, the Agent Ops Center shows recent runs, receipts, pending confirmations, failures, and timing information. This makes the workflow observable instead of being a black box.

So the summary is: SunnyPanel is a safe, auditable, rollback-aware Agent workflow system for a personal long-term workspace.

## 10-Minute Technical Talk

### Audience

Technical interviewers, backend engineers, AI Agent engineers, and security-minded reviewers.

### Script

SunnyPanel started from a simple question: if an AI Agent can understand my goals, how do I let it help with real work without letting it write uncontrolled data into the system?

The product shape is a personal long-term workbench. The public side has Blog, Notes, Updates, Timeline, Checklists, and regular pages like About or Now. The private side is a Dashboard where the Agent can help plan, schedule, and track work.

The main engineering idea is that a normal chat agent is not enough. If the Agent hears "help me plan this project by June 30", it should not invent a full plan and immediately write it. Understanding intent is not execution. Drafting is not persistence. User approval of a draft is still not final execution.

Agent Workflow v1 uses a staged pipeline. A user message goes through session coordination, routing, readiness gates, draft or clarification, prepare creation, dry-run, Policy Guard, pending confirmation, execute, receipt, rollback payload, and finally a result card.

The Planning Workflow is the clearest example. For large plans, SunnyPanel evaluates whether it has enough slots: goal, deadline, scope, current progress, available time, success criteria, priority, deliverables, and constraints. If the request only has a goal and deadline, it asks follow-up questions. If enough context exists, it creates a PlanDraft. That draft can be revised, then prepared for creation. Only after dry-run and confirmation does the system create the real Plan record.

The Checklist Workflow builds on that. A PlanDraft can produce a ChecklistDraft. This converts high-level stages into grouped tasks. Again, it is not written until the user prepares creation and confirms it. If a checklist comes from an already-created plan, the system links the new checklist back into `Plan.linkedContent`.

The Schedule Workflow follows the same product model. A ScheduleDraft can be generated from plan or checklist tasks. Before pending confirmation, SunnyPanel checks local schedule conflicts. It can suggest moving an item, allowing overlap, removing an item, or manually adjusting. But suggestions only update the draft. They do not write schedule-items.

The Safety Workflow is the core. Dry-run builds a proposed action and preview. Policy Guard checks whether the tool and risk level are allowed. Pending confirmation is the user boundary. Execute is the only place that writes. AgentActionReceipt makes execution idempotent, so repeated confirmation does not duplicate records.

Rollback is designed as a practical compensation layer. For created documents, rollback can delete the created documents. For changed documents, it can restore recorded snapshots. Some operations may be indeterminate if compensation fails; SunnyPanel should report that instead of pretending everything is fine.

Observability is also part of the product. Agent Ops Center shows recent AgentRun records, AgentActionReceipts, pending confirmations, failures, action ids, thread ids, model, tokens, and latency. This matters because Agent systems are hard to trust if they cannot be inspected after the fact.

On the public side, SunnyPanel is not just a management tool. The Timeline and public checklists let work become a long-term narrative. Blog, Notes, and Updates share a content rendering layer, so the same writing system powers Admin, Dashboard, and the public site.

The test and release baseline is intentionally heavy for a personal project. There are focused Agent tests for planning and scheduling, content contract tests, typecheck, lint, diff checks, release docs, and CI. Public browser E2E is separated because it needs a real non-production Postgres-backed app server.

The current v1 boundary is also explicit. It does not support external Calendar integration, recurrence, automatic rescheduling, or high-risk external writes. I would rather keep the write model safe and observable before adding more automation.

The key engineering takeaway is that Agent productization is less about "can the model generate a plan" and more about state boundaries, confirmations, receipts, rollback, and auditability.
