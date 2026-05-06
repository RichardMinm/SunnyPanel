# SunnyPanel Agent Eval Tests

Run the Agent eval suite with:

```bash
npm run test:agent
```

`npm test` runs the same suite. The tests compile a tiny TypeScript test build into `.agent-test-dist/` and execute it with Node's built-in test runner.

## Adding Intent Cases

Add readable cases to `tests/agent/fixtures/intents.json`:

```json
{
  "name": "query one checklist progress",
  "message": "查一下高等数学的进度",
  "expectedIntent": "query_progress",
  "expectedArgs": {
    "checklistTitle": "高等数学",
    "scope": "all"
  }
}
```

`expectedArgs` is a partial match. Include only the fields that matter for the behavior being protected.

## Adding Safety Cases

Use `tests/agent/safety.test.ts` for confirmation and risk rules:

- low-risk intents should not produce a proposed action
- create or append writes should produce medium-risk confirmation proposals
- completion and completion-note writes should produce high-risk confirmation proposals
- destructive or unsupported requests should clarify/reject and never become write actions

All model behavior is mocked through `resolveAgentIntent({ modelResolver })`. These tests must not call external model APIs or Payload.
