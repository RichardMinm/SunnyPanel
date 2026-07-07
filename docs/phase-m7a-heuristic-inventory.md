# Phase M7-A: Agent Heuristics Audit & LLM-Driven Refactor Plan

> **Date:** 2026-07-06
> **Status:** Audit Complete. Phase LLM-1 (Clarification Composer) + LLM-2 (Schedule Slot Extractor) implemented.
> **Scope:** All heuristic, rule-based, keyword-matching, regex, and template patterns in SunnyPanel Agent

---

## 一、审计范围

| Directory / File | Files Scanned | Heuristic Patterns Found |
|---|---|---|
| `src/lib/agent/intent/heuristics/` | 12 files | 37 parser functions, 80+ keyword lists, 60+ regex patterns |
| `src/lib/agent/schedule/` | 7 files | intent-boundary (regex rules), readiness (slot extraction), draft (templates), query-summary (templates), conflict-awareness (policy parsing) |
| `src/lib/agent/planning/` | 3 files | readiness-gate (slot extraction, regex), readiness (template questions), draft (template stages) |
| `src/lib/agent/session/` | 1 file (rule-pre-check) | 6 rule functions, 100+ Set-based keywords, 30+ regex patterns |
| `src/lib/agent/activity/` | 1 file (build-activity-steps) | Phase→label mapping, message-content regex matching |
| `src/lib/agent/router/` | 4 files | capability-router (regex), follow-up-router (intent matching), llm-router-schema (schema validation) |
| `src/lib/agent/context-loading-policy.ts` | 1 file | Keyword detection, intent→preset mapping |
| `src/lib/agent/prompts.ts` | 1 file | System prompt template assembly (read only — not heuristic in same sense) |

**Search commands used:**
```bash
rg -n "heuristic|fallback|keyword|keywords|regex|RegExp|match\(|includes\(|score|confidence|rule|parse|extract|infer|intent|slot|readiness|clarify|AGENT_DISABLE_LLM" src/lib/agent --type ts
rg -n "查看|查询|创建|安排|日程|计划|清单|草案|冲突|明天|今天|本周|最近" src/lib/agent --type ts
```

---

## 二、Heuristic Inventory

### A. Intent Routing — Keyword/Regex Parsers

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Router-001 | `intent/heuristics/parse-heuristic-intent.ts` | `parseHeuristicIntent` | 25 parsers in priority chain, confidence threshold 0.3, Query-First Guard regex on write intents | Top-level intent resolution | **High** | Hybrid |
| H-Router-002 | `intent/heuristics/parse-heuristic-intent.ts` | `fallbackClarifyIntent` | `questionLikePattern` regex (`/[？?]$|什么是|是什么|如何|怎么|为什么|吗/`) → template clarify messages | Fallback when no parser matches | **Medium** | Yes (with fallback) |
| H-Router-003 | `intent/heuristics/parse-heuristic-intent.ts` | Query-First Guard | `queryPattern.test(message) && !writeVerbsPattern.test(message)` → demote write intent to query | Read/write boundary safety | **High** | Hybrid (keep guard, LLM can supplement) |
| H-Router-004 | `intent/heuristics/keywords.ts` | 80+ keyword arrays | `createPlanKeywords`, `composePlanKeywords`, `scheduleComposerKeywords`, `queryScheduleKeywords`, `capabilityKeywords`, etc. | Intent keyword matching | **Medium** | Yes (LLM classifier + keyword fallback) |

### B. Schedule Intent Boundary — Regex Rules

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Schedule-001 | `schedule/intent-boundary.ts` | `classifyScheduleIntentBoundary` | 7-step priority chain: query regex → draft revision regex → explicit create regex → router intent → LLM classifier → fallback | Schedule read/write boundary | **High** | Hybrid |
| H-Schedule-002 | `schedule/intent-boundary.ts` | `hasQuerySignal` | `/(查看|看看|查询|查一下|看一下|列出|展示|浏览)/` + temporal query patterns | Query detection | **High** | Hybrid |
| H-Schedule-003 | `schedule/intent-boundary.ts` | `hasExplicitCreateSignal` | `/(安排进日程|排进日程|排入日程|创建日程|保存到日程|写入日程|生成日程草案)/` + `把.+安排到.+` | Write intent detection | **High** | Hybrid |
| H-Schedule-004 | `schedule/intent-boundary.ts` | `hasDraftRevisionSignal` | `/(调整|修改|改到|改成|换到|移到|挪到|删除|移除|暂不安排|允许重叠|继续修改)/` | Draft revision detection | **Medium** | Yes |
| H-Schedule-005 | `schedule/intent-boundary.ts` | `WRITE_CONFIDENCE_THRESHOLD` | Hardcoded 0.75 threshold for LLM write classification | Safety gate | **High** | No (must stay deterministic) |

### C. Session Rule Pre-Check — Set/Regex Matching

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Session-001 | `session/rule-pre-check.ts` | `isPendingConfirmMessage` | `CONFIRM_MESSAGES` Set (28 items) + `/(可以|好的|是的|确认|没问题|行|对|开始|执行|做|搞|弄|干)/` regex, ≤6 char limit | Detect confirmation reply | **High** | No (deterministic safety) |
| H-Session-002 | `session/rule-pre-check.ts` | `isPendingCancelMessage` | `CANCEL_MESSAGES` Set (18 items) + `/(取消|算了|不用|不要|别|停止|放弃|不了|不搞|不做|先不)/` regex, ≤6 char limit | Detect cancellation reply | **High** | No (deterministic safety) |
| H-Session-003 | `session/rule-pre-check.ts` | `isDeepenMessage` | `DEEPEN_MESSAGES` Set (20 items) + `/(更详细|详细|展开|继续|多说|深入|讲细|具体|举例|例子|细说|补充|然后|接着)/` regex, ≤15 char | Detect follow-up/deepen signal | **Medium** | Yes |
| H-Session-004 | `session/rule-pre-check.ts` | `isScheduleQueryMessage` | `SCHEDULE_QUERY_MESSAGES` Set (18 items) + 8 regex patterns with create-verb exclusion | Detect schedule query | **High** | Hybrid |
| H-Session-005 | `session/rule-pre-check.ts` | `isScheduleCreateMessage` | `SCHEDULE_CREATE_MESSAGES` Set (4 items) + create-verb + time-ref regex combos | Detect schedule creation | **High** | Hybrid |
| H-Session-006 | `session/rule-pre-check.ts` | `isWritingRevisionMessage` | `WRITING_REVISION_MESSAGES` Set (19 items) + `/(改|修改|润色|扩写|缩短|精简|重写|续写|改写|调整|修饰)/` + `/(太啰嗦|太短|太长|更正式|更口语)/` | Detect writing revision in context | **Medium** | Yes |
| H-Session-007 | `session/rule-pre-check.ts` | `inferActionFromPendingIntent` | Regex on intent string (`/create|compose|add|save/` → create, `/update|modify|reschedule|append|complete/` → update) | Action type inference | **Low** | No (trivial mapping) |

### D. Slot Extraction — Schedule

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Slot-001 | `schedule/readiness.ts` | `extractScheduleSlotsFromMessage` | Composes 5 extractors: `inferPreferredTime`, `extractAvailableDays`, `extractTimeWindows`, `extractDailyCapacity`, `extractDeadline`, `extractConflictPolicy` | Extract schedule parameters from natural language | **Medium** | Yes (LLM slot extractor + schema validation) |
| H-Slot-002 | `schedule/readiness.ts` | `inferPreferredTime` | `/(晚上|今晚)/`→"晚上", `/(上午|早上|明早|今早)/`→"上午", `/(下午|午后)/`→"下午", `/(周末)/`→"周末" | Time-of-day preference | **Low** | Yes |
| H-Slot-003 | `schedule/readiness.ts` | `extractTimeWindows` | Chinese time range regex: `三点到五点`, numeric `09:00-17:00`, Chinese hour parsing (`parseHour` with `chineseHourMap`) | Time window extraction | **Medium** | Yes (LLM + regex fallback) |
| H-Slot-004 | `schedule/readiness.ts` | `parseHour` | `chineseHourMap` (一→1, 二→2...), "十二"→12, "十" prefix handling, compound "二十五"→25 parsing | Chinese hour numeral → number | **Low** | No (pure utility, no LLM needed) |
| H-Slot-005 | `schedule/readiness.ts` | `extractDailyCapacity` | `/(每天\s*\d+\.?\d*\s*(小时|分钟)|每周\s*\d+\s*天|周末半天)/` | Daily/weekly capacity | **Low** | Yes |
| H-Slot-006 | `schedule/readiness.ts` | `extractDeadline` | `/(\d{1,2}\s*月\s*\d{1,2}\s*(日|号)?前|本周内|下周前|月底前)/` | Deadline extraction | **Medium** | Yes |
| H-Slot-007 | `schedule/readiness.ts` | `extractConflictPolicy` | `/(冲突.*跳过|跳过.*冲突)/`→"skip", `/(可以重叠|允许重叠|允许冲突)/`→"allow-overlap", `/(冲突.*问我|有冲突就问)/`→"ask", `/(自动.*重新安排|冲突.*重新安排)/`→"reschedule" | Conflict policy parsing | **Medium** | Yes |
| H-Slot-008 | `schedule/readiness.ts` | `extractAvailableDays` | `/(每天)/`→"每天", `/(工作日)/`→"工作日", `/(周末)/`→"周末", `/周[一二三四五六日天]/g` matchAll | Available days extraction | **Low** | Yes |

### E. Slot Extraction — Planning

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-PlanSlot-001 | `planning/readiness-gate.ts` | `extractPlanSlotsFromMessage` | Deadline regex, SunnyPanel project detection (`/SunnyPanel.*(上线|发布|第一版|v1)/`), scope/progress/availableTime/successCriteria regex | Extract plan parameters | **Medium** | Yes |
| H-PlanSlot-002 | `planning/readiness-gate.ts` | `extractDeadlineFromMessage` | `/(\d{1,2}\s*月\s*\d{1,2}\s*(日|号)?|今天晚上|今天|今晚|明天|本周|下周|月底|年底|\d{1,2}\s*点\s*到\s*\d{1,2}\s*点)/` | Deadline parsing | **Medium** | Yes |
| H-PlanSlot-003 | `planning/readiness-gate.ts` | `hasPlanMaturityGateSignal` | `/(帮我计划|帮我规划|制定.*计划|上线|发布|第一版|v1|产品|项目|部署|考研|备考|复习|长期|多阶段|里程碑)/` | Large plan detection | **Medium** | Hybrid |
| H-PlanSlot-004 | `planning/readiness.ts` | `extractGoalFromMessage` | `计划：` marker, SunnyPanel detection, exam detection (`/考研|考试|雅思|托福|高考|考公/`), `完成X` pattern, project name regex | Goal extraction | **Medium** | Yes |

### F. Draft Generation — Templates

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Draft-001 | `planning/draft.ts` | `generatePlanDraft` | Template-based: 3 hardcoded stages ("范围收敛与功能收尾", "测试、部署与约束处理", "验收与上线确认"), `taskForScopeItem` maps scope items to tasks | Plan draft generation from slots | **Medium** | Yes (LLM Draft Enhancer) |
| H-Draft-002 | `planning/draft.ts` | `revisePlanDraft` | Regex-based revision: stage removal patterns, time strategy detection, success criteria extraction | Plan draft revision | **Medium** | Yes |
| H-Draft-003 | `schedule/draft.ts` | `generateScheduleDraft` | Template-based: `buildTitle` template, `buildAssumptions` template, `buildDraftItem` with hardcoded `conflictNote`, `nextActions` template array | Schedule draft generation from slots | **Medium** | Yes |
| H-Draft-004 | `planning/readiness-gate.ts` | `buildPlanDraftResponseMessage` | Template string concatenation with placeholder logic | Draft presentation to user | **Low** | Yes |
| H-Draft-005 | `schedule/readiness-gate.ts` | `buildScheduleDraftResponseMessage` | Template string concatenation with `formatDraftList` | Draft presentation to user | **Low** | Yes |

### G. Clarification Messages — Templates

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Clarify-001 | `planning/readiness-gate.ts` | `buildPlanReadinessClarificationMessage` | Template: "可以，我先帮你把这个计划拆出来。不过在生成完整计划前，我需要确认几个关键点：" + knownLines + missingLabels + questionLines | Clarification when plan readiness insufficient | **Low** | Yes |
| H-Clarify-002 | `schedule/readiness-gate.ts` | `buildClarificationMessage` | Template: "可以，我先不写入日程。要把这些任务排进日程前，我需要确认几个关键点：" + knownLines + missingLabels + questionLines | Clarification when schedule readiness insufficient | **Low** | Yes |
| H-Clarify-003 | `schedule/readiness.ts` | `buildSuggestedQuestions` | Template questions keyed by missing slots | Suggested follow-up questions | **Low** | Yes |
| H-Clarify-004 | `planning/readiness.ts` | `buildSuggestedQuestions` | Template questions keyed by missing slots + context-aware variants (isLaunch flag) | Suggested follow-up questions | **Low** | Yes |
| H-Clarify-005 | `intent/heuristics/parse-heuristic-intent.ts` | `defaultClarifyIntent` | Hardcoded string: "我现在可以帮你创建计划、补计划项、标记清单条目完成..." | Default clarify message | **Low** | Yes |

### H. Query Summary / Response Formatting — Templates

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Query-001 | `schedule/query-summary.ts` | `inferScheduleQueryRangeLabel` | `/(今天|today)/`→"今天", `/(明天|tomorrow)/`→"明天", `/(下周|next week)/`→"下周" | Query range label | **Low** | Yes |
| H-Query-002 | `schedule/query-summary.ts` | `formatScheduleQueryAssistantMessage` | Template string assembly: "这是X的日程摘要，共 N 个日程项" + grouped date lines + "这次只是查看日程，不会创建、修改或写入" | Schedule query response | **Low** | Yes |
| H-Query-003 | `schedule/query-summary.ts` | `formatEmptyScheduleMessage` | Hardcoded strings: "今天没有已安排的日程。", "明天没有已安排的日程。" | Empty result messages | **Low** | Yes |
| H-Query-004 | `intent/heuristics/knowledge.ts` | `buildDefinitionAnswer`, `buildExpandedDefinitionAnswer`, `buildLearningAdviceAnswer` | 200+ line hardcoded answer templates for known subjects (信息安全, CTF, generic) | Knowledge answer templates | **Low** | Yes |

### I. Activity / Trace Label Mapping — Hardcoded Maps

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Activity-001 | `activity/build-activity-steps.ts` | `titleForBackendUserActivity` | Phase→Chinese label map: `router`→"正在理解你的请求", `session`→"正在读取工作区上下文", `api_call`+schedule→"正在查询本地日程", `policy_guard`→"正在检查安全边界", etc. | User-facing activity labels | **Low** | Yes (with fallback) |
| H-Activity-002 | `activity/build-activity-steps.ts` | `backendTracePhaseToActivityKind` | Phase→kind mapping: `api_call`→`calling_api`, `draft`→`generating_draft`, `dry_run`→`dry_run` | Developer trace kind | **Low** | No (stable mapping) |
| H-Activity-003 | `activity/build-activity-steps.ts` | `isScheduleQueryMessage` | `/(日程|安排).*(范围|没有已安排|已安排的日程|未来\s*7\s*天)/` regex | Detect schedule query for activity | **Low** | Fallback only |
| H-Activity-004 | `activity/build-activity-steps.ts` | `isExecuteResultMessage` | `/(已创建\s*\d+\s*个日程项|已帮你创建计划|已创建完整计划|已创建清单|已把\s*「.+?」\s*标记完成)/` regex | Detect execute result for activity | **Low** | Fallback only |
| H-Activity-005 | `activity/build-activity-steps.ts` | `isRollbackMessage` | `/(撤销|回滚).*(完成|已执行|成功)/` regex | Detect rollback result for activity | **Low** | Fallback only |

### J. Context Loading Policy — Keyword Detection

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Context-001 | `context-loading-policy.ts` | `detectMessageHint` | 4 keyword arrays: `SCHEDULE_KW` (9 items), `PLANNING_KW` (9 items), `WRITING_KW` (9 items), `FULL_KW` (8 items), composite detection for schedule+planning | Decide which DB sections to load | **Medium** | Yes |
| H-Context-002 | `context-loading-policy.ts` | `detectDateRange` | `/(下周|next week)/`→next_week, `/(本周|this week|这周)/`→this_week, `/(明天|tomorrow)/`→tomorrow, `/(今天|today)/`→today, `/(最近|近期|upcoming|recent)/`→upcoming(7d) | Implied date range | **Low** | Yes |
| H-Context-003 | `context-loading-policy.ts` | `resolveSectionsFromIntent` | 5 hardcoded intent→preset Set mappings (`CHAT_INTENTS`, `SCHEDULE_INTENTS`, `PLANNING_INTENTS`, `WRITING_INTENTS`, `FULL_INTENTS`) | Intent→context sections | **Low** | No (stable mapping) |
| H-Context-004 | `context-loading-policy.ts` | `resolveLevelFromWorkbench` | `switch(mode)` mapping: today→full, plan/execute→planning, review→full, writing/timeline→writing, answer/ask→minimal | Workbench mode→context level | **Low** | No (stable mapping) |

### K. Capability Router — Regex

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Cap-001 | `router/capability-router.ts` | `routeCapabilityRouter` | `capabilityQuestionPattern` regex: `/(你能做什么|你可以做什么|支持什么|有哪些功能|能帮我做什么|可以删除|可以创建)/` + `parseCapabilityQueryIntent` | Route capability questions | **Low** | Yes |
| H-Cap-002 | `router/capability-router.ts` | inline regex | `/(创建|新建|安排|添加)/` (asksCreate), `/(日程|安排)/` (asksSchedule), `/(计划)/` (asksPlan) | Infer target from capability question | **Low** | Yes |

### L. Reply / Confirmation Detection — Keyword Matching

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Reply-001 | `intent/heuristics/replies.ts` | `isConfirmationReply` | `confirmationReplyKeywords` (11 items) exact/includes match | Detect user confirmation | **High** | No (safety-critical, must be deterministic) |
| H-Reply-002 | `intent/heuristics/replies.ts` | `isCancellationReply` | `cancellationReplyKeywords` (7 items) includes match | Detect user cancellation | **High** | No (safety-critical) |
| H-Reply-003 | `intent/heuristics/replies.ts` | `isNegativeReply` | `negativeReplyKeywords` (6 items) includes match | Detect negative reply | **Medium** | No (safety-critical) |
| H-Reply-004 | `intent/heuristics/replies.ts` | `isBatchConfirmationReply` | Delegates to `isExactConfirmationReply` (exact match only) | Batch confirmation safety | **High** | No (safety-critical) |

### M. Memory Type Inference — Regex

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Memory-001 | `intent/heuristics/memory.ts` | `inferMemoryType` | `/(风格|语气|口吻|写作|文案)/`→writing_style, `/(规则|流程|工作流|以后都|每次都|不要|必须|优先)/`→workflow_rule, etc. | Memory type classification | **Low** | Yes |

### N. Timeline Source Type — Regex

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Timeline-001 | `intent/heuristics/shared-text.ts` | `normalizeTimelineSourceType` | `/(posts|post|文章|博客)/`→post, `/(notes|note|笔记)/`→note, `/(updates|update|动态|更新)/`→update, etc. | Source type normalization | **Low** | Yes |

### O. Write Schema Validation — Deterministic

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Schema-001 | `write-schemas.ts` | `parseScheduleItemArgs`, etc. | `Date.parse` validation, enum validation, numeric range checks, `agentEngineValues` includes `"heuristic"` as valid engine | Schema validation | **High** | No (must stay deterministic) |

### P. Knowledge / Conversation — Template + Regex

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Knowledge-001 | `intent/heuristics/knowledge.ts` | `isGeneralConsultationQuestion` | `generalConsultationQuestionPattern` regex + `writeActionPattern` exclusion | Detect consultation questions | **Low** | Yes |
| H-Knowledge-002 | `intent/heuristics/knowledge.ts` | `isLearningAdviceQuestion` | `learningAdviceQuestionPattern` regex + `writeActionPattern` exclusion | Detect learning advice | **Low** | Yes |
| H-Knowledge-003 | `intent/heuristics/knowledge.ts` | `extractConsultationTopic` | Regex topic extraction from multiple patterns | Extract topic from consultation | **Low** | Yes |
| H-Knowledge-004 | `intent/heuristics/knowledge.ts` | `parseDefinitionQuestionIntent` | `definitionQuestionPattern` regex: `/^(?:什么是|什么叫|请问什么是)(.+?)[？?]?$|^(.+?)是什么[？?]?$/` | Detect definition questions | **Low** | Yes |
| H-Knowledge-005 | `intent/heuristics/knowledge.ts` | `knownSubjectAliases` | Hardcoded knowledge base: 4 subjects (线性代数, 高等数学, CTF, 信息安全) with aliases, focus areas, learning sequences | Hardcoded subject knowledge | **Low** | Yes (LLM can generate these dynamically) |

### Q. Follow-up Router — Intent String Matching

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-FollowUp-001 | `router/follow-up-router-output.ts` | `routeFollowUpRouter` | `switch` on `followUpIntent.intent` to map to LLM router action: expand_answer→rewrite, summarize_answer→rewrite | Follow-up intent routing | **Medium** | Yes |

### R. LLM Router — Fallback Path

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-LLMRouter-001 | `router/llm-router-schema.ts` | `parseLLMRouterOutput` | Schema validation with `VALID_ACTIONS`, `VALID_TARGETS`, `VALID_RISK` sets | LLM output schema guard | **High** | No (schema validation must stay) |
| H-LLMRouter-002 | `router/llm-router-schema.ts` | `parseLLMRouterOutputWithRetry` | JSON parse retry with fallback to `createClarifyRouterOutput` | LLM JSON parse error recovery | **Medium** | Fallback only |
| H-LLMRouter-003 | `router/llm-router-schema.ts` | `createClarifyRouterOutput` | Hardcoded fallback: "我需要再确认一下你的具体需求，能补充更多细节吗？" | LLM failure fallback | **Low** | Yes (but keep as fallback) |
| H-LLMRouter-004 | `router/llm-router-schema.ts` | `isLLMRouterV2Enabled` | `AGENT_LLM_ROUTER_V2 !== "0"` feature flag | LLM router toggle | N/A | N/A (feature flag) |

### S. Checklist / Item Parsing — Regex + Keyword

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-Checklist-001 | `intent/heuristics/checklist.ts` | `parseCompleteItemIntent` | `completionKeywords` (5 items) keyword match + `parseChecklistMention` regex split | Complete checklist item | **Medium** | Yes |
| H-Checklist-002 | `intent/heuristics/checklist.ts` | `parseExplicitNoteIntent` | `noteKeywords` (6 items) keyword match + `parseChecklistMention` regex split | Add completion note | **Medium** | Yes |
| H-Checklist-003 | `intent/heuristics/shared-text.ts` | `parseChecklistMention` | Split by "的" into segments, filter stop words `/(今天|我|刚刚|已经|刚|把)/` | Parse checklist reference | **Low** | Yes |
| H-Checklist-004 | `intent/heuristics/shared-text.ts` | `parseChecklistGroupMention` | Split by "的", filter stop words `/(今天|我|刚刚|已经|刚|把|给|在|往|向)/` | Parse checklist group reference | **Low** | Yes |

### T. Delete/Update Record — Regex Patterns

| ID | File | Function | Heuristic Content | Purpose | Risk | LLM-Suitable |
|---|---|---|---|---|---|---|
| H-DelUpd-001 | `intent/heuristics/delete-update.ts` | `parseDeleteRecordIntent` | `DELETE_KEYWORDS` (5 items) + `extractDeleteTarget` with quoted name and entity type regex | Delete record intent | **Medium** | Yes |
| H-DelUpd-002 | `intent/heuristics/delete-update.ts` | `parseModifyRecordIntent` | `UPDATE_PATTERNS` (12 regex patterns): `把X的Y改成Z`, `把X改到Y`, etc. + update keyword detection | Modify record intent | **Medium** | Yes |
| H-DelUpd-003 | `intent/heuristics/delete-update.ts` | `extractUpdateTarget` | Quoted name extraction, "把X的" pattern, entity type regex detection | Extract update target | **Medium** | Yes |

---

## 三、分类总览

### A. 适合 LLM 驱动 (Yes) — 26 items

These can be replaced or enhanced with LLM without risk to safety invariants:

| Item | Priority |
|---|---|
| H-Clarify-001~005 (clarification messages) | **P0** |
| H-Draft-001~005 (draft response messages, draft generation) | **P1** |
| H-Query-001~003 (query summary, empty messages) | **P1** |
| H-Activity-001 (user-facing activity labels) | **P2** |
| H-Slot-001~008 (schedule slot extraction) | **P0** |
| H-PlanSlot-001~004 (planning slot extraction) | **P0** |
| H-Context-001~002 (message keyword detection for context loading) | **P1** |
| H-Memory-001 (memory type inference) | **P2** |
| H-Timeline-001 (timeline source type) | **P2** |
| H-Knowledge-001~005 (consultation/definition/learning advice, hardcoded subject knowledge) | **P1** |
| H-Cap-001~002 (capability router) | **P2** |
| H-Checklist-001~004 (checklist item parsing) | **P1** |
| H-DelUpd-001~003 (delete/update record parsing) | **P1** |

### B. 适合 Hybrid：LLM + Deterministic Guard — 15 items

These can use LLM but MUST retain deterministic safety gates:

| Item | Deterministic Guard Required |
|---|---|
| H-Router-001~003 (intent routing, query-first guard) | Write verb exclusion, confidence threshold, clarification fallback |
| H-Schedule-001~004 (schedule intent boundary) | Query-first rule MUST win; write classification requires high confidence; LLM failure → ambiguous |
| H-Session-004~005 (schedule query/create detection) | Query pattern MUST win before create; confirmation/cancellation MUST stay deterministic |
| H-PlanSlot-003 (large plan signal) | False positive on small tasks must not block |
| H-LLMRouter-002 (LLM JSON retry) | Invalid JSON → clarify, never execute |
| H-Knowledge-001~002 (consultation/learning advice question) | writeActionPattern exclusion MUST stay |
| H-Slot-003 (time window extraction) | Schema validation on LLM output |

### C. 不适合 LLM 驱动，必须 Deterministic — 15 items

These MUST remain code/state-machine driven:

| Item | Reason |
|---|---|
| H-Session-001~002 (confirm/cancel detection) | Safety-critical: bypassing confirmation is catastrophic |
| H-Reply-001~004 (all reply detection) | Safety-critical: confirmation/cancellation boundary |
| H-Schedule-005 (WRITE_CONFIDENCE_THRESHOLD) | Safety gate constant |
| H-LLMRouter-001 (LLM output schema validation) | Schema guard must be deterministic |
| H-Schema-001 (write schema validation) | Payload validation must be deterministic |
| H-Context-003~004 (intent→preset, workbench→level mappings) | Stable mapping, no LLM benefit |
| H-Activity-002 (phase→kind mapping) | Stable internal mapping |
| H-Slot-004 (parseHour) | Pure utility function |
| H-Session-007 (inferActionFromPendingIntent) | Simple mapping, no LLM needed |
| H-Router-004 (keyword arrays as fallback) | Must remain as AGENT_DISABLE_LLM fallback |

### D. Fallback Only — 7 items

These should remain as LLM-unavailable fallbacks:

| Item | Fallback for |
|---|---|
| H-Router-004 (all keyword arrays in `keywords.ts`) | LLM router failure |
| H-Activity-003~005 (message regex detection) | When backend trace events are missing |
| H-LLMRouter-003 (createClarifyRouterOutput with hardcoded question) | LLM API failure |
| H-LLMRouter-002 (JSON parse retry with clarify fallback) | LLM malformed output |
| H-Router-002 (fallbackClarifyIntent) | When no parser matches and LLM unavailable |

---

## 四、高风险模块清单

The following modules touch the write/safety boundary and require EXTREME caution:

| Module | Risk | Why |
|---|---|---|
| `session/rule-pre-check.ts` — confirm/cancel detection | **CRITICAL** | Bypassing confirmation allows unauthorized writes |
| `intent/heuristics/replies.ts` — all reply detection | **CRITICAL** | Same as above |
| `schedule/intent-boundary.ts` — read/write boundary | **CRITICAL** | Query misclassified as write = wrong workflow |
| `intent/heuristics/parse-heuristic-intent.ts` — Query-First Guard | **CRITICAL** | Write intent without write verbs = must block |
| `write-schemas.ts` — schema validation | **CRITICAL** | Invalid data written to DB |
| `router/llm-router-schema.ts` — LLM output schema guard | **CRITICAL** | Malformed LLM output must not execute |
| `schedule/readiness-gate.ts` — execute gate bypass | **HIGH** | confirmedActionId / batchExecute bypass must remain |

---

## 五、推荐 LLM 化路线图

### Phase LLM-1: LLM-assisted Clarification Composer (推荐先做)

**目标:** 让 schedule / planning clarification 由 LLM 生成自然回复。Readiness 仍 deterministic。LLM 失败 fallback 到模板。

**Modified files:**
- `src/lib/agent/planning/readiness-gate.ts` — `buildPlanReadinessClarificationMessage`
- `src/lib/agent/schedule/readiness-gate.ts` — `buildClarificationMessage`
- `src/lib/agent/schedule/readiness.ts` — `buildSuggestedQuestions`
- `src/lib/agent/planning/readiness.ts` — `buildSuggestedQuestions`
- `src/lib/agent/intent/heuristics/parse-heuristic-intent.ts` — `defaultClarifyIntent`, `fallbackClarifyIntent`

**New files:**
- `src/lib/agent/llm/clarification-composer.ts` — LLM composer with fallback
- `tests/agent/llm/clarification-composer.test.ts`

**MUST NOT modify:**
- readiness evaluation logic
- dry-run
- execute
- policy guard
- rollback
- confirmation flow

**Tests required:**
- LLM clarification output is natural and context-aware
- AGENT_DISABLE_LLM=1 falls back to template
- Readiness insufficient does not enter dry-run/execute
- Missing slots are still communicated to user
- No raw prompt/response leaked in output

**Feature flag:** `AGENT_LLM_CLARIFICATION_COMPOSER=0/1` (default 0)

---

### Phase LLM-2: LLM Slot Extractor

**目标:** 用 LLM 从用户输入提取 schedule / planning slots。输出结构化 JSON。Deterministic parser 作为 fallback。Validation 防止 hallucination。

**Modified files:**
- `src/lib/agent/schedule/readiness.ts` — `extractScheduleSlotsFromMessage` (+sub-extractors)
- `src/lib/agent/planning/readiness-gate.ts` — `extractPlanSlotsFromMessage`
- `src/lib/agent/planning/readiness.ts` — `inferSlotsFromMessage`

**New files:**
- `src/lib/agent/llm/slot-extractor.ts` — unified LLM slot extractor
- `src/lib/agent/llm/slot-extractor-schema.ts` — Zod schema for LLM output
- `tests/agent/llm/slot-extractor.test.ts`

**MUST NOT modify:**
- readiness decision (still deterministic)
- confirmation
- execute
- mergeScheduleSlots / mergePlanSlots logic

**Tests required:**
- Chinese time expressions (三点, 下午两点半, 晚上七点到九点)
- Available time (每天2小时, 每周3天)
- Deadline (6月30日前, 本周内)
- Conflict policy (冲突时跳过, 允许重叠)
- Invalid JSON → fallback to deterministic parser
- Low confidence → fallback
- LLM hallucinated fields → schema validation rejects

**Feature flag:** `AGENT_LLM_SLOT_EXTRACTOR=0/1` (default 0)

---

### Phase LLM-3: LLM Intent Classifier

**目标:** 用 LLM 辅助 Router 判断 intent。保留 read/write deterministic guard。低置信度不进入写入。

**Modified files:**
- `src/lib/agent/intent/heuristics/parse-heuristic-intent.ts` — add LLM classifier before/after heuristic chain
- Potentially consolidate `src/lib/agent/intent/heuristics/query.ts`, `plan-schedule.ts`, `delete-update.ts`

**New files:**
- `src/lib/agent/llm/intent-classifier.ts`
- `tests/agent/llm/intent-classifier.test.ts`

**MUST NOT modify:**
- Query-First Guard (deterministic)
- writeVerbsPattern exclusion
- confidence threshold gating
- clarification fallback for low confidence

**Tests required:**
- "查看最近日程" still → query_schedule (not creation)
- "安排进日程" → schedule_creation
- "帮我看看计划进展" → query_plan
- Ambiguous → clarification
- LLM low confidence → safe fallback (not execute)
- AGENT_DISABLE_LLM=1 → full heuristic path

**Feature flag:** `AGENT_LLM_INTENT_CLASSIFIER=0/1` (default 0)

---

### Phase LLM-4: LLM Draft Enhancer

**目标:** PlanDraft / ScheduleDraft 内容可由 LLM 增强。Draft 仍不写库。输出必须 schema validate。不合格 fallback deterministic draft。

**Modified files:**
- `src/lib/agent/planning/draft.ts` — `generatePlanDraft`
- `src/lib/agent/schedule/draft.ts` — `generateScheduleDraft`

**New files:**
- `src/lib/agent/llm/draft-enhancer.ts`
- `tests/agent/llm/draft-enhancer.test.ts`

**MUST NOT modify:**
- Draft write gating (draft still not written to DB)
- prepare / confirmation flow
- execute path

**Tests required:**
- Draft does not write to DB
- Schema validation rejects malformed LLM draft
- Fallback to deterministic draft on LLM failure
- prepare / confirmation flow unaffected
- Draft item count limits respected

**Feature flag:** `AGENT_LLM_DRAFT_ENHANCER=0/1` (default 0)

---

### Phase LLM-5: LLM Response Composer

**目标:** 最终回复、结果总结、activity 文案更自然。不暴露 internal keys。不改业务行为。

**Modified files:**
- `src/lib/agent/activity/build-activity-steps.ts` — `titleForBackendUserActivity`
- `src/lib/agent/schedule/query-summary.ts` — `formatScheduleQueryAssistantMessage`
- Response composition in pipeline finalize step

**New files:**
- `src/lib/agent/llm/response-composer.ts`
- `tests/agent/llm/response-composer.test.ts`

**MUST NOT modify:**
- Execute result facts (what was created, IDs, counts)
- Rollback availability information
- Confirmation state
- Activity step structure (kinds, statuses)

**Tests required:**
- No raw enum/slot key in output
- No false promise of writes that didn't happen
- Result card rendering unaffected
- Activity state semantics preserved (running/success/waiting/failed/skipped)
- No Chain-of-Thought in user-facing output

**Feature flag:** `AGENT_LLM_RESPONSE_COMPOSER=0/1` (default 0)

---

## 六、风险矩阵

| 改造目标 | 用户体验收益 | 工程复杂度 | 安全风险 | 推荐优先级 | Feature Flag |
|---|---|---|---|---|---|
| Clarification Composer | **High** — 自然追问，减少机械感 | **Low** — 仅替换模板字符串 | **Low** — 不涉及写入 | **P0 (先做)** | `AGENT_LLM_CLARIFICATION_COMPOSER` |
| Slot Extractor | **High** — 更准确理解中文时间/约束表达 | **Medium** — 需要 schema + fallback | **Low-Medium** — 提取结果经 readiness 验证 | **P0** | `AGENT_LLM_SLOT_EXTRACTOR` |
| Intent Classifier | **Medium** — 减少误判，但当前规则已较准 | **Medium** — 需要与现有 Router 协调 | **Medium** — 涉及 read/write 边界 | **P1** | `AGENT_LLM_INTENT_CLASSIFIER` |
| Draft Enhancer | **Medium** — 更智能的阶段拆解和任务生成 | **Medium** — 需要 schema 约束 | **Low** — draft 不写库 | **P1** | `AGENT_LLM_DRAFT_ENHANCER` |
| Response Composer | **Medium** — 更自然的回复和总结 | **Low-Medium** — 替换模板 | **Low** — 不影响业务行为 | **P2** | `AGENT_LLM_RESPONSE_COMPOSER` |
| Activity Label Composer | **Low** — 文案更自然，但当前已可接受 | **Low** — 替换映射表 | **Low** — 纯展示 | **P2** | (included in Response Composer) |
| Query Range Parser | **Low** — 当前 regex 已覆盖主要场景 | **Low** — 简单替换 | **Low** — 纯展示 | **P2** | (included in Slot Extractor) |
| Conflict Policy Parser | **Low** — 当前 regex 已覆盖 | **Low** — 简单替换 | **Low** — 经 readiness 验证 | **P2** | (included in Slot Extractor) |

---

## 七、Feature Flag 建议

所有 LLM 化改造必须使用 feature flag，默认关闭或仅本地开启：

```
AGENT_LLM_CLARIFICATION_COMPOSER=0  # Phase LLM-1
AGENT_LLM_SLOT_EXTRACTOR=0          # Phase LLM-2
AGENT_LLM_INTENT_CLASSIFIER=0       # Phase LLM-3
AGENT_LLM_DRAFT_ENHANCER=0          # Phase LLM-4
AGENT_LLM_RESPONSE_COMPOSER=0       # Phase LLM-5
```

规则：
- `AGENT_DISABLE_LLM=1` 时全部禁用，fallback 到 deterministic path
- 每个 flag 独立控制一个能力
- Tests 必须覆盖 flag on/off 两种路径
- 默认值在 `.env.example` 中注明

已存在的 flag：
- `AGENT_LLM_ROUTER_V2=1` (已默认开启)
- `AGENT_CONTEXT_LOADING_POLICY` (0=off, shadow, 1=on)
- `AGENT_DISABLE_LLM=1` (全局禁用)

---

## 八、测试影响评估

### Protected Tests — MUST keep passing

These tests must pass regardless of which LLM phases are activated:

| Test Suite | Potentially Affected By |
|---|---|
| `root-router-contract` | LLM-3 Intent Classifier — verify query/write boundary unchanged |
| `schedule-intent-boundary` | LLM-3 — verify query_schedule still query, schedule_creation still creation |
| `schedule-query-flow` | LLM-2 Slot Extractor, LLM-3 — query flow must not enter write path |
| `schedule-readiness` | LLM-2 — slot extraction changes must not break readiness evaluation |
| `schedule-workflow-e2e` | LLM-1~4 — end-to-end schedule workflow must complete |
| `planning-full-workflow-e2e` | LLM-1~4 — end-to-end planning workflow must complete |
| `policy-guard` | LLM-3 — policy guard must still intercept |
| `action-receipts` | None directly (receipts are execute-time) |
| `rollback*` | None directly (rollback is execute-time) |
| `tool-dry-run` | LLM-3 — dry-run must still execute before writes |
| `execute-and-persist-step` | None directly (execute is after confirmation) |
| `create-checklist-*` | LLM-3 — checklist creation intent routing |
| `create-schedule-items-*` | LLM-3 — schedule creation intent routing |
| `timeline-event-*` | LLM-3 — timeline intent routing |
| `agent-backend-trace` | LLM-2~4 — trace events must still be emitted |
| `agent-activity-builder` | LLM-5 — activity steps must still be built correctly |
| `agent-activity-ui` | LLM-5 — activity UI must still render correctly |

### New Tests Required Per Phase

| Phase | New Test Files |
|---|---|
| LLM-1 | `tests/agent/llm/clarification-composer.test.ts` |
| LLM-2 | `tests/agent/llm/slot-extractor.test.ts` |
| LLM-3 | `tests/agent/llm/intent-classifier.test.ts` |
| LLM-4 | `tests/agent/llm/draft-enhancer.test.ts` |
| LLM-5 | `tests/agent/llm/response-composer.test.ts` |

Each new test file must cover:
1. Happy path (LLM produces valid output)
2. AGENT_DISABLE_LLM=1 fallback
3. LLM invalid JSON / malformed output
4. LLM low confidence
5. LLM timeout
6. LLM output violates schema
7. LLM output contains internal fields / raw prompt
8. LLM output falsely claims execute/write

---

## 九、绝对不能 LLM 驱动的地方

The following are **invariant** and must never be LLM-driven:

1. **Execute decision** — only code decides to execute
2. **Database writes** — only code writes to DB
3. **Confirmation bypass** — only code validates confirmation
4. **Policy Guard** — only code evaluates guard rules
5. **Receipt idempotency** — only code manages AgentActionReceipts
6. **Rollback execution** — only code executes rollback
7. **Payload schema validation** — only code validates against schema
8. **Permission / capability gate** — only code checks permissions
9. **Thread event persistence** — only code writes to AgentThreadEvents
10. **Checkpoint resume** — only code manages LangGraph checkpoint
11. **Confirmation/cancellation reply detection** — only code (rule-pre-check) detects these
12. **Any SQL / Payload query construction** — only code builds queries

---

## 十、不确定项与需要人工确认的问题

1. **LLM Router V2 当前使用情况:** `isLLMRouterV2Enabled()` 默认开启。在引入 LLM-3 Intent Classifier 前，需要确认: 是替换还是补充现有 LLM Router V2？两套 LLM 分类器如何协调？
2. **AGENT_DISABLE_LLM 的完整语义:** 当前 `AGENT_DISABLE_LLM=1` 是否应该禁用所有 LLM 调用（包括 clarification composer, slot extractor 等），还是仅禁用 Router LLM？
3. **LLM 调用成本预算:** 每次 clarification composer 调用约消耗多少 token？是否需要设置每日/每会话 LLM 调用上限？
4. **模型选择:** 各 Phase 应该用什么模型？Clarification Composer 可能用小模型（如 Haiku），Intent Classifier 可能需要更强的模型。
5. **`knownSubjectAliases` 硬编码知识库:** 当前 `intent/heuristics/knowledge.ts` 中的学科知识是硬编码的。LLM 化后是让 LLM 动态生成，还是保留硬编码作为 fallback？硬编码知识的维护负担如何？
6. **Activity label 的 LLM 化时机:** Activity labels 当前是 hardcoded 映射，用户体验影响较小。是否值得独立做一个 Phase，还是归入 Response Composer？
7. **现有 Keyword Arrays 的去留:** 引入 LLM 分类器后，80+ 个 keyword arrays 是全部保留作为 fallback，还是可以逐步删除？建议全部保留直至 LLM 路径稳定运行 3+ 个月。

---

## 十一、建议先做 LLM-assisted Clarification Composer

基于审计结果，**强烈建议 Phase LLM-1 (Clarification Composer) 作为第一步**，原因：

1. **风险最低:** Clarification 只影响展示给用户的追问文案，不涉及任何安全边界
2. **收益明显:** 当前 clarification 模板机械生硬（"可以，我先不写入日程。要把这些任务排进日程前，我需要确认几个关键点："），LLM 可以生成更自然、更个性化的追问
3. **改动范围小:** 仅需修改 ~5 个 template 函数，新增 1 个 LLM composer 文件
4. **验证 LLM 调用链:** 作为第一个 LLM 化改造，可以验证 feature flag、fallback、error handling、streaming 等基础设施
5. **不影响 protected tests:** clarification 不进入 execute path，不改动任何 protected test 覆盖的逻辑
6. **可快速回滚:** 关掉 feature flag 即回到当前模板

**修改文件清单（Phase LLM-1）:**
- `src/lib/agent/planning/readiness-gate.ts` — `buildPlanReadinessClarificationMessage` + `buildPlanDraftReadyMessage`
- `src/lib/agent/schedule/readiness-gate.ts` — `buildClarificationMessage`
- `src/lib/agent/schedule/readiness.ts` — `buildSuggestedQuestions`
- `src/lib/agent/planning/readiness.ts` — `buildSuggestedQuestions`
- `src/lib/agent/intent/heuristics/parse-heuristic-intent.ts` — `defaultClarifyIntent`, `fallbackClarifyIntent`

**禁止修改文件（Phase LLM-1）:**
- `src/lib/agent/schedule/readiness.ts` — `evaluateScheduleReadiness` logic
- `src/lib/agent/planning/readiness.ts` — `evaluatePlanReadiness` logic
- `src/lib/agent/schedule/intent-boundary.ts` — entire file
- `src/lib/agent/session/rule-pre-check.ts` — entire file
- `src/lib/agent/chat-pipeline/*` — all pipeline steps
- `src/lib/agent/executor.ts`
- `src/lib/agent/policy/*`
- `src/lib/agent/rollback.ts`
- `src/lib/agent/action-receipts.ts`
- `src/lib/agent/write-schemas.ts`
- All test files

---

**Phase M7-A audit complete. Ready for Phase LLM-1 implementation upon approval.**
