# Feature: Agent Workbench

## Scope

- natural language input
- intent classification
- read intent response
- write draft generation
- dry-run result
- policy result
- pending confirmation
- execute after confirmation
- receipt display
- rollback availability

## Rules

- read intent 不进入 write flow
- write intent 不直接 execute
- draft 不写数据库
- dry-run 不写数据库
- confirmation 前不 execute
- execute 后生成 receipt
- 不展示 hidden reasoning
- 不展示 raw prompt
- 不展示 raw LLM response
- 不展示 secret

## UI States

- understanding
- reading_context
- classifying_intent
- drafting
- dry_running
- policy_checking
- pending_confirmation
- executing
- receipt_recorded
- rollback_available
- failed

## Protected Areas

- Agent pipeline
- Executor
- Policy Guard
- Rollback
- AgentActionReceipt
- protected tests
