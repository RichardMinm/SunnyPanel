# Agent Observability

Agent observability in SunnyPanel v1 is a lightweight product layer for showing what the Agent is doing across a turn. It is designed to help users understand state transitions without exposing hidden model reasoning or sensitive runtime data.

## Agent Activity

Agent Activity is a structured list of steps attached to an Agent response. It can describe stages such as:

- understanding a request
- classifying intent
- reading schedule data
- checking readiness
- generating a draft
- running dry-run
- passing Policy Guard
- waiting for confirmation
- executing a confirmed write
- recording a receipt
- rolling back a previous write

Activity steps are product-facing status records. They are not Chain-of-Thought.

M6-A introduced the Activity model and UI. M6-B adds backend trace instrumentation that can feed the same UI as developer-visible steps.

M6-C streams the same sanitized backend trace events while a turn is still running. The chat SSE stream emits `activity` events that carry `AgentTraceEventPayload`; the main conversation converts them into user-visible product steps such as "正在理解你的请求" or "正在查询本地日程" and appends them to the current assistant placeholder. When the final `done` response arrives, the UI reconciles against `AgentChatResponse.backendTraceEvents` so missed or late events still appear through the M6-B response-time fallback.

Realtime activity streaming is best-effort. If the stream sink fails, the Agent turn continues and the final response still carries `backendTraceEvents`.

## Backend Trace Instrumentation

Backend trace events are structured debug records emitted by the Agent pipeline and trusted rollback API. They use `AgentTraceEventPayload` and carry:

- phase and status
- intent and tool name when available
- action id / run id when available
- latency when available
- sanitized input and output previews
- sanitized error summaries

Supported phases include user message receipt, router, session/context loading, readiness, draft, dry-run, Policy Guard, pending confirmation, execute, tool/API calls, receipt, rollback, finalize, and error.

Trace events are stored on `AgentChatResponse.backendTraceEvents`. Existing terminal `AgentThreadEvent` payloads already persist the full response, so M6-B does not add a collection, field, or migration. If a future sink is added, `appendAgentTraceEvent()` must remain non-blocking: trace persistence failures cannot interrupt the Agent turn.

Backend trace is debug observability. It is not an enterprise compliance audit log and does not replace `AgentRun` or `AgentActionReceipt`.

## Chain-of-Thought Boundary

SunnyPanel must not show hidden reasoning, raw prompts, raw LLM responses, API keys, cookies, Authorization headers, or unredacted large payloads in activity UI.

Allowed fields include:

- intent
- route or phase label
- tool name
- sanitized summary
- latency
- action id
- run id
- dry-run / policy / confirmation state
- redacted details

The main conversation uses `AgentActivityTimeline`, which shows only user-visible activity. It must not show LangGraph labels, raw phase names, raw JSON, tool args, raw prompts, raw model responses, or policy objects. The right inspector uses the trace view for deeper developer-oriented details.

## User Activity vs Developer Trace

`AgentActivityStep.visibility` separates audience:

- `user`: concise, understandable status shown below Agent messages.
- `developer`: detailed trace shown in the right inspector, with redacted details and optional metadata.

User-visible steps should explain the workflow state, for example "草案尚未写入数据库" or "等待你确认". Developer-visible steps can include sanitized detail from legacy trace steps, tool names, intent, and latency.

M6-C1 keeps the two audiences separate:

- The main conversation maps backend phases to product language. Router and user-message phases become "正在理解你的请求"; schedule API calls become "正在查询本地日程"; Policy Guard becomes "正在检查安全边界" or "已通过安全检查"; pending confirmation becomes "等待你确认"; execute and receipt become "正在执行写入" and "已记录操作凭证".
- The right Trace panel can still show `LangGraph`, `router`, `toolName`, `latency`, sanitized details, and raw phase names for debugging.

M6-C2 reinforces the boundary by removing independent loading text from the main conversation:

- The standalone "正在生成回复..." loading text is suppressed when the `AgentActivityTimeline` is already showing user-visible activity steps. This avoids duplicating status indicators in the main chat area.
- When **no** user-visible activity steps exist, the loading fallback remains as a minimal indicator that the Agent is still processing.
- The main conversation must not display LangGraph, tool_call, api_call, policy_guard, raw JSON / JSON.stringify trace payloads, token, secret, or cookie values — this is verified by contract tests.
- Developer trace details remain exclusive to the right `AgentTracePanel`.
- Activity is not Chain-of-Thought. The right Trace panel must also apply sanitization.

## Activity UI States

`AgentActivityTimeline` is the primary real-time status carrier in the main conversation, not a large log card. Empty activity does not render an empty block. Long activity lists show the latest steps first and can expand to reveal the full flow. The independent "正在生成回复..." loading text only appears as a fallback when no `AgentActivityTimeline` user-visible steps are available.

State semantics:

- `running`: animated dot, active highlight, and "正在..." language.
- `success`: check marker and quieter completed styling.
- `waiting`: waiting marker and "等待确认" language.
- `failed`: error marker and explicit failed styling.
- `skipped`: muted marker and quieter skipped styling.

New activity steps can fade in subtly. `prefers-reduced-motion: reduce` disables the reveal and pulse animation. Status is always expressed with text and icon-like markers, not color alone.

## Supported Kinds

The current model supports:

- `received`
- `understanding`
- `classifying_intent`
- `routing`
- `checking_read_write_boundary`
- `loading_context`
- `reading_workspace`
- `reading_memory`
- `reading_schedule`
- `reading_plans`
- `reading_checklists`
- `checking_readiness`
- `planning`
- `decomposing_goal`
- `generating_draft`
- `revising_draft`
- `calling_tool`
- `calling_api`
- `querying_database`
- `checking_conflicts`
- `finding_free_slots`
- `dry_run`
- `policy_guard`
- `awaiting_confirmation`
- `executing`
- `writing_database`
- `recording_receipt`
- `rollback`
- `summarizing`
- `completed`
- `failed`

Statuses are `idle`, `queued`, `running`, `success`, `warning`, `waiting`, `failed`, and `skipped`.

## Sanitization

Activity details pass through a sanitizer before rendering. It redacts sensitive keys such as:

- `token`
- `password`
- `secret`
- `Authorization`
- `Cookie`
- API key variants

It also truncates long strings, long arrays, large objects, and overly deep nested structures. This keeps the UI useful without turning it into a raw JSON log.

Backend trace uses a stricter sanitizer before events reach the response:

- redacts Authorization, Cookie, Bearer tokens, token, password, secret, apiKey, and session-like fields
- redacts raw prompt / raw response style fields
- truncates long strings, large arrays, large objects, and deeply nested data
- records message length or safe summaries instead of raw user prompts

The frontend applies a second activity-detail sanitizer before rendering developer trace details.

## Relationship To Agent Records

Activity UI is a display layer over existing workflow data:

- `AgentThreadEvent` remains the event stream for turn reconstruction.
- `AgentRun` remains the execution/audit record.
- `AgentActionReceipt` remains the idempotency and replay record for execute and rollback.
- pending confirmation still lives in the thread pending action state.
- `backendTraceEvents` are response metadata persisted through the existing terminal AgentThreadEvent payload.

Activity steps do not replace receipts, rollback payloads, or Policy Guard. They only explain the state to the user.

## Streaming Contract

The Agent chat SSE contract includes a structured `activity` event:

```text
event: activity
data: AgentTraceEventPayload
```

The event must be sanitized before it leaves the server. It must not include raw prompts, raw model responses, hidden reasoning, credentials, cookies, Authorization headers, or API keys.

The live event is observational only:

- it does not execute tools
- it does not bypass dry-run or Policy Guard
- it does not create or confirm pending actions
- it does not modify rollback behavior
- it can be dropped without changing the Agent result

## Current Limits

This is not a full compliance audit system.

This is not raw trace storage.

This does not expose hidden reasoning.

This does not record sensitive headers or secrets.

This does not guarantee enterprise-grade forensic retention.

Future work can connect persisted AgentRun summaries to richer, searchable activity history, but writes must continue to follow draft -> dry-run -> confirmation -> execute -> receipt -> rollback.
