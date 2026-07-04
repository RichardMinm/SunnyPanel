# SunnyPanel Agent Safety Model

SunnyPanel lets an Agent help with real workspace data. That makes safety a product requirement, not a nice-to-have implementation detail.

This document explains the v1 safety model. It does not claim full security automation. It describes the boundaries currently implemented and the areas intentionally left out of scope.

## 1. Why the Agent Cannot Directly Write

LLM output can be useful, but it is not a trustworthy database command by itself.

The Agent may misunderstand a vague request, infer missing scope, over-complete a plan, or treat a brainstorming phrase as an instruction. If that output writes directly to Plans, Checklists, ScheduleItems, TimelineEvents, or other collections, the system loses user control and auditability.

SunnyPanel therefore separates:

- intent understanding
- draft generation
- dry-run proposal
- confirmation
- execution
- rollback

The Agent can help prepare work, but the write boundary is explicit.

## 2. Dry-run

Dry-run converts an intent into a proposed action without performing the write.

It should answer:

- What operation would happen?
- Which collection or records are affected?
- What data is proposed?
- What risk level is involved?
- Is rollback expected to be available?

Dry-run is also where previews can be built for confirmation cards. The preview is not proof that the operation has executed.

## 3. Policy Guard

Policy Guard is the authorization and risk boundary between a proposed action and pending confirmation.

It checks whether the resolved intent is allowed to use the relevant write capability. It also keeps read-only turns from accidentally entering write paths.

Policy Guard does not replace user confirmation. It decides whether a proposed write is allowed to be proposed. The user still decides whether to execute it.

## 4. Pending Confirmation

Pending confirmation is the user-facing pause before execution.

It should show:

- the action
- the risk level
- the records or data that will be affected
- rollback availability
- any relevant impact notes

Medium and high risk writes must not execute before pending confirmation is confirmed.

Draft cards and suggestion buttons must not bypass this state.

## 5. Execute

Execute is the only stage that performs the write.

The executor receives confirmed, structured args. It should not depend on free-form prompt text as the final business payload. It should validate required fields, write through the existing Payload access model, and produce a result that can be shown to the user.

Execution results should include enough metadata for audit and rollback, such as created ids, affected counts, action id, and rollback payload.

## 6. AgentActionReceipt

AgentActionReceipt protects against duplicate execution.

If the user clicks confirm twice, the network retries, or a resume path replays a confirmed action, the system should not create duplicate Plans, Checklists, ScheduleItems, or TimelineEvents.

The receipt records:

- thread
- action id
- operation type, such as `execute` or `rollback`
- terminal status
- result metadata

When a terminal receipt exists, later attempts should replay the recorded result instead of executing again.

## 7. Rollback Boundaries

Rollback is practical compensation, not time travel.

Supported rollback patterns include:

- deleting documents created by the confirmed action
- restoring before-snapshots for updated records
- removing linkedContent entries added by a specific action
- deleting newly created Timeline events
- restoring a previous Timeline snapshot

Rollback must target only documents affected by the recorded action. It should not delete unrelated records or trust arbitrary client-provided payloads.

If rollback cannot fully compensate, the system should report an indeterminate state.

## 8. Why Raw Prompt Text Is Not Business Data

`sourceText`, prompts, and raw model responses can be stored for trace or debugging where appropriate, but they should not become final business records without structured transformation and validation.

Reasons:

- prompts may contain irrelevant context
- raw model output may include assumptions
- user language may be ambiguous
- traces can contain sensitive or noisy content
- final records need stable fields, not chat transcripts

The safer pattern is:

```text
free-form request
-> structured intent
-> readiness or draft
-> validated args
-> dry-run preview
-> confirmed execute
```

## 9. Rollback vs Compensation

Some operations can be rolled back exactly. Others are best-effort compensation.

Good rollback candidates:

- created checklist can be deleted
- created schedule items can be deleted
- checklist groups can be restored from a snapshot
- Plan linkedContent can remove the link created by one action

Compensation or indeterminate cases:

- partial failures after some writes succeed
- rollback deletion failure
- external systems not owned by SunnyPanel
- operations whose original external state cannot be reconstructed

v1 reports these states instead of pretending every write is perfectly reversible.

## 10. Current Non-goals

SunnyPanel v1 does not implement:

- multi-user fine-grained permissions beyond the existing app access model
- external calendar rollback
- recurrence rollback
- automatic rescheduling
- high-risk external system writes
- generalized arbitrary database rollback
- cryptographic audit trails

These are valid future topics, but v1 focuses on safe local workspace writes.

## 11. Design Trade-off

The model is intentionally conservative. It adds friction before writes, but that friction is the product feature: the user can see what will happen before it happens, and the system can explain what happened afterward.

For Agent systems that touch real data, this is more important than making every prompt feel instant.
