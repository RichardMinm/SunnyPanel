# SunnyPanel Release Checklist

Use this checklist before cutting or deploying a SunnyPanel release.

## Scope Freeze

- Confirm no unfinished product work is mixed into the release branch.
- Confirm Agent Workflow v1 changes do not add unreviewed intents, schema changes, migrations, or direct write paths.
- Confirm `PAYLOAD_DB_PUSH=false` for release and production environments.
- Confirm production secrets are not committed or printed in logs.

## Local Verification

Run these commands from the repository root:

```bash
npm run typecheck
npm run lint
npm run test:agent
npm run test:agent:planning
npm run test:agent:schedule
git diff --check
```

For production build verification, use a non-production database that has migrations applied:

```bash
export PAYLOAD_DB_PUSH=false
export DATABASE_URL="<non-production database url>"
export PAYLOAD_SECRET="<non-production secret>"
npm run migrate
npm run agent:checkpoint:setup
npm run build
```

Do not point these checks at the production database.

## CI Baseline

GitHub Actions must pass:

- `npm run typecheck`
- `npm run lint`
- `npm run test:agent`
- `npm run test:agent:planning`
- `npm run test:agent:schedule`
- `npm run migrate` against the CI Postgres service
- `npm run build` against the CI Postgres service

CI intentionally does not run browser E2E or smoke tests that require production-like credentials.

## Agent Workflow Safety

Before release, verify that every write workflow still follows:

```text
readiness / draft
-> dry-run
-> Policy Guard
-> pending confirmation
-> execute
-> AgentActionReceipt
-> rollback payload
```

Required checks:

- Draft cards do not write to the database.
- Confirmation cards are the only UI path to confirmed execution.
- Executors do not bypass Policy Guard.
- Receipt replay prevents duplicate writes.
- Rollback payloads are available or clearly marked unavailable.

## Deployment Readiness

- Confirm migrations are reviewed.
- Confirm `npm run migrate` has been planned for the target environment.
- Confirm `npm run agent:checkpoint:setup` has been planned for the target environment.
- Confirm `npm run build` succeeds after migrations.
- Confirm rollback plan is documented for the release.
- Confirm Agent smoke test credentials are available outside CI.

## Post-Deploy Smoke

Run the smoke test against the deployed environment with dedicated non-personal credentials:

```bash
AGENT_SMOKE_EMAIL="<smoke user email>" \
AGENT_SMOKE_PASSWORD="<smoke user password>" \
npm run smoke:agent
```

Smoke should verify:

- Dashboard loads.
- Agent can answer a read-only prompt.
- Draft / confirmation boundaries are visible for write workflows.
- No unexpected production migration prompt appears.

## Sign-Off

Record:

- Release branch / commit SHA.
- CI run URL.
- Migration status.
- Checkpoint setup status.
- Build artifact or deployment id.
- Smoke test result.
