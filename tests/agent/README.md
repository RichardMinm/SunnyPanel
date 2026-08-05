# SunnyPanel Agent tests

Agent tests are split by product boundary instead of migration phase.

## Commands

```bash
# Complete deterministic baseline: no Provider and no database
npm test

# Core Agent, runtime, safety, Ops, and Dashboard contracts
npm run test:agent

# LangChain protocol, orchestration, chat-pipeline, and session contracts
npm run test:agent:contracts

# Domain workflows
npm run test:agent:planning
npm run test:agent:schedule

# PostgreSQL-backed LangGraph checkpoint integration
npm run test:agent:checkpoint
```

Live Provider evaluations and browser E2E are explicit commands. They are not
part of the deterministic baseline and must use their own disclosed fixtures,
budgets, credentials, and disposable/non-production data.

## Test quality requirements

Every retained test must satisfy all applicable requirements:

- Exercise a production function, schema, rendered component, API boundary, or
  executable integration path.
- Assert an observable result, state transition, safety invariant, or typed
  failure. `assert.ok(true)`, empty stubs, and "any result is acceptable" do not
  count as coverage.
- Use fake models for deterministic tests and never call a real Provider.
- Keep database tests in `tests/integration` or E2E and make the requirement
  explicit.
- Do not write generated reports into the tracked test tree.
- Do not retain raw prompts, raw Provider responses, secrets, or hidden
  reasoning.
- Prefer behavior assertions. Source inspection is limited to narrow
  architecture/security guards that cannot be expressed through a public
  runtime boundary.

Fixture files are inputs to executable tests. A fixture is not a test merely
because its expected fields are internally consistent.
