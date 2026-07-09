# Demo Script

Demo flow for showcasing SunnyPanel's core capabilities.

---

## 1. Public Site

Goal: Show the public-facing content layer.

Steps:

1. Visit `/` — Home page with latest posts, notes, and timeline highlights.
2. Visit `/blog` — Blog list. Click a post → Blog detail with reading layout.
3. Visit `/notes` — Notes stream.
4. Visit `/timeline` — Timeline with featured milestones and year archive.
5. Visit `/about` — About / Now page.
6. Visit `/tags/ai` — Posts filtered by tag. Show that only published + public
   posts appear.
7. Visit `/categories/writing` — Posts filtered by WritingCategory.

Key points to mention:

- Public site only shows status=published AND visibility=public.
- Drafts and private content never leak.
- No admin controls or agent UI on public pages.

---

## 2. Writing Dashboard

Goal: Show content creation and lifecycle.

Steps:

1. Navigate to Dashboard → Writing.
2. Create a new Post draft.
3. Edit content, set title, summary, cover image.
4. Set visibility (private → public).
5. Publish → status changes to "published".
6. Visit the public page via "View Public Page" link.
7. Return, unpublish → status returns to "draft".
8. Archive → status becomes "archived" (not shown in public site).

Key points to mention:

- Content lifecycle: draft → published → archived.
- Publish/unpublish requires explicit user action.
- Agent cannot auto-publish.

---

## 3. Agent Workbench — Planning Flow

Goal: Show the full Agent write workflow with safety stages.

Steps:

1. Open Agent Workbench in Dashboard.
2. Type: "帮我制定SunnyPanel第一版上线计划，包括登录页、Agent对话、部署检查"
3. Agent shows activity: reading context, classifying intent.
4. Agent generates a Plan draft with stages and tasks.
5. User reviews draft.
6. Agent generates a Checklist draft from the plan.
7. Agent shows dry-run preview: which checklist items will be created.
8. Policy Guard passes → Pending Confirmation appears.
9. User clicks "Confirm" → Execute creates the checklist.
10. Receipt appears in Agent Artifacts panel.
11. User types: "把上线任务安排进下周的日程"
12. Agent creates ScheduleItems (with time conflict check if needed).
13. Dry-run → Policy Guard → Confirm → Execute → Receipt.

Key points to mention:

- Read intent does NOT enter write flow.
- Draft does NOT write to database.
- Dry-run previews the impact before execution.
- Policy Guard blocks unsafe actions.
- User must explicitly confirm before execute.
- Every execute generates a receipt.
- Rollback is available for supported writes.

---

## 4. Planning Execution Lifecycle

Goal: Show data linkage and progress auto-sync.

Steps:

1. Navigate to a Plan that has linked checklists and schedule items.
2. Show that Checklist.planId points back to the Plan.
3. Show that ScheduleItems appear in Plan.linkedContent.
4. Mark a checklist item as completed.
5. Show that Plan.progress auto-updates (e.g., 25% → 50%).
6. Complete all items → Plan.progress reaches 100%.
7. Show that completing an item creates a TimelineEvent.
8. Demonstrate rollback: undo a checklist/schedule creation.
9. Show that rollback cleans Plan.linkedContent (no dangling references).

Key points to mention:

- Plan → Checklist → ScheduleItem → Progress forms a complete chain.
- Progress is computed deterministically from checklist completion rate.
- Rollback removes the created entities AND cleans cross-references.

---

## 5. Safety & Rollback

Goal: Show safety boundaries.

Steps:

1. Ask a read-only query: "查看最近的日程安排."
   → Agent queries schedule without entering write flow.
2. Ask a write request: "创建一个清单：上线任务."
   → Must go through draft → dry-run → confirm → execute.
3. Show rollback in action:
   - Click rollback on a recently created checklist.
   - Checklist is deleted, receipt is recorded.
4. Show schedule rollback:
   - Rollback created schedule items.
   - Plan.linkedContent schedule-item links are cleaned up.

Key points to mention:

- Query intent never writes.
- Write intent always requires confirmation.
- Rollback is deterministic and explicit.
- Not an enterprise audit system — local-only rollback for Payload writes.

---

## Known Limits (honest disclosure)

- Single-user / admin model. No multi-user permissions.
- No external Calendar integration or rollback.
- No auto-rescheduling.
- Checklist items are embedded (not independent collection).
- TimelineEvent.relatedPlan not yet implemented.
- Legacy data not backfilled with planId.
