# Domain Model

## 1. Content

### ContentItem

Fields:

- id
- title
- slug
- summary
- content
- contentFormat
- editorJson?
- type: `blog | note`
- status: `draft | published | archived`
- visibility: `private | public`
- categoryId?
- tagIds?
- coverImage?
- publishedAt?
- createdAt
- updatedAt

Rules:

- Markdown / MDX-like text preferred as canonical content
- rendered HTML not the only source of truth
- Public Site only reads `published + public`

### Category

Fields:

- id
- name
- slug

v1 Rules:

- managed through Writing metadata
- no independent manager
- no hierarchy
- no slug migration flow

### Tag

Fields:

- id
- name
- slug

v1 Rules:

- managed through Writing metadata
- no independent manager
- no merge flow
- no bulk cleanup

---

## 2. Planning

### Plan

Fields:

- id
- title
- description
- goal
- status
- startDate?
- targetDate?
- progress?
- createdAt
- updatedAt

Relations:

- has many Checklist
- has many ChecklistItem through Checklist
- has many ScheduleItem
- has many receipts

### Checklist

Fields:

- id
- planId?
- title
- status
- createdAt
- updatedAt

Relations:

- belongs to Plan optional
- has many ChecklistItem

### ChecklistItem

Fields:

- id
- checklistId
- planId?
- title
- description?
- status: `todo | doing | done`
- priority?
- estimateMinutes?
- completedAt?
- createdAt
- updatedAt

Relations:

- belongs to Checklist
- belongs to Plan optional
- has many ScheduleItem optional

### ScheduleItem

Fields:

- id
- planId?
- checklistItemId?
- title
- description?
- startAt
- endAt
- status
- conflictStatus?
- createdAt
- updatedAt

Relations:

- belongs to Plan optional
- belongs to ChecklistItem optional

### TimelineEvent

Fields:

- id
- title
- description?
- occurredAt
- visibility: `private | public`
- relatedPlanId?
- relatedContentId?
- createdAt
- updatedAt

---

## 3. Agent

### AgentActionDraft

Fields:

- id
- actionType
- targetCollection
- proposedPayload
- createdAt

Rules:

- not persisted as final business entity
- no database write effect

### PendingConfirmation

Fields:

- id
- actionType
- draftId
- dryRunResult
- policyResult
- status
- expiresAt?
- createdAt

Rules:

- execute requires active confirmation
- expired confirmation cannot execute

### AgentActionReceipt

Fields:

- id
- actionType
- status
- targetCollection
- targetId?
- rollbackSupported
- rollbackId?
- errorSummary?
- createdAt

Rules:

- created after execute
- no secrets
- no raw prompt
- no hidden reasoning

### RollbackEntry

Fields:

- id
- receiptId
- actionType
- targetCollection
- targetId
- status
- strategy
- createdAt
- executedAt?

Rules:

- only for supported local actions
- no external rollback promise
