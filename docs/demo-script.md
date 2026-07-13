# Demo Script

Executable local demonstration for the guarded Query runtime and existing SunnyPanel workflows. It is evidence-oriented: do not show secrets, raw Provider content, private workspace data, or fabricated UI states.

## 0. Query Runtime v1 Preparation

1. Use a local or dedicated demonstration environment, never production data.
2. Confirm the repository tests pass and the service starts with server-side Payload authentication.
3. Select an existing visible plan with a positive integer ID. Keep that ID only in a local shell variable such as `DEMO_PLAN_ID`; do not add it to Git, screenshots, or this document.
4. Do not create a temporary plan or other business resource solely for the demo.
5. Keep the Provider API key only in the local environment. Never display `.env`, request authorization, cookies, raw prompts, or raw responses.
6. Start and finish with:

```text
AGENT_QUERY_RUNTIME=legacy
AGENT_QUERY_ADOPTION=off
```

7. The manual Provider evaluation is not default CI and may read existing local Payload data. Use only an approved evaluation database.

### Scene Q1: Default Legacy

Run the service with the default values and send an aggregate progress question through the authenticated Agent chat UI, for example “查看当前计划和清单进展”.

Expected evidence:

- effective runtime is `legacy`;
- effective adoption is `off`;
- the guarded LangChain Query facts loader and Query Provider are not called;
- Legacy remains the default safe path.

If the Primary does not resolve the exact `query_progress` intent during a live presentation, use the deterministic gate test below instead of claiming a UI adoption result:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG node --import tsx --test tests/agent/query-admin-adoption.test.ts
```

### Scene Q2: Admin Limited Aggregate Adoption

Restart or run the service process with explicit local settings:

```text
AGENT_QUERY_RUNTIME=langchain
AGENT_QUERY_ADOPTION=admin
```

Use a real server-authenticated admin request for an aggregate progress question. The UI can demonstrate the final canonical-first answer when the Primary resolves an exact eligible intent. Use sanitized developer observation output—not raw prompts or responses—to show:

- reason `adopted_admin_query`;
- facts-loader count `1`;
- canonical-ready latency;
- Provider call count `0` or `1` (`1` in the accepted live-evaluation sample);
- commentary status `accepted` or `omitted`;
- final latency.

The final answer must start with deterministic facts. Commentary, when present, follows those facts and contains no exact numbers or resource identifiers.

### Scene Q3: Plan Progress by Positive ID

The current UI cannot be relied upon to produce a specific positive `planId` argument from a natural-language title. Do not present this as a guaranteed UI flow. Demonstrate it using the authenticated Chat API integration or the existing live evaluation harness with an ID selected from the demonstration database.

Before the live harness, verify its explicit opt-in and sanitized report contract:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG node --import tsx --test tests/agent/query-admin-adoption-evaluation.test.ts
```

For a separately approved real Provider run, use the documented manual command in `tests/TEST_MAP.md`. Do not paste a real plan ID into source or terminal capture. Expected evidence:

- exact eligibility requires one positive integer `planId`;
- one deterministic plan facts load;
- canonical plan facts remain authoritative;
- commentary is optional;
- business mutation is zero.

### Scene Q4: Negative Control

Use one of these safe variants:

- `answer_question`;
- title-only `query_plan_progress`;
- `query_progress` with `checklistTitle`;
- `query_schedule`.

Run the deterministic gate matrix:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG node --import tsx --test tests/agent/query-admin-adoption.test.ts
```

Expected evidence:

```text
Gate rejected
→ Existing path
→ guarded facts-loader call = 0
→ Query Provider call = 0
```

Gate rejection is compatibility behavior, not a Provider error.

### Scene Q5: Provider Commentary Omitted

Use deterministic fake-model coverage rather than waiting for a real Provider failure:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG node --import tsx --test tests/agent/query-qualitative-projection.test.ts
```

Point to the timeout/validation omission cases. Expected evidence:

```text
canonical answer complete
commentary omitted
normal persistence
normal done
no partial user output
no user-visible Provider error
no Legacy second run
```

### Scene Q6: Dual Kill Switch and Restore

With runtime otherwise enabled, set:

```text
AGENT_QUERY_ADOPTION=off
```

Verify the next request follows Legacy with no guarded facts or Provider call. Then set:

```text
AGENT_QUERY_RUNTIME=legacy
```

Verify the same result. End the demo by restoring both defaults:

```text
AGENT_QUERY_RUNTIME=legacy
AGENT_QUERY_ADOPTION=off
```

Do not leave the local service running with admin adoption enabled.

### Query Demo Prohibitions

Do not display API keys, authorization headers, cookies, raw Provider prompts or responses, workspace dumps, real user content, hidden reasoning, chain-of-thought, database credentials, or unsanitized internal identifiers. Do not imply that the admin gate is RBAC, that all Query intents are migrated, or that observed latency is an SLA.

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
