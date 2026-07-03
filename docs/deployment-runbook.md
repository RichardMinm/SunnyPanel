# SunnyPanel Deployment Runbook

This runbook describes the release deployment path for SunnyPanel. It is intentionally conservative: no production database connection should be used from local development or CI.

## Required Environment

Set these variables in the deployment environment:

```bash
PAYLOAD_DB_PUSH=false
DATABASE_URL="<production database url>"
PAYLOAD_SECRET="<production payload secret>"
```

Additional app, auth, storage, and provider secrets should be supplied through the deployment platform secret manager. Do not commit them to the repository.

## CI vs Production

CI uses a disposable Postgres service and dummy secrets.

Production deployment must use the production database only inside the controlled deployment environment. Do not run local verification commands against production.

CI does not run:

- Playwright E2E requiring live app credentials.
- Agent smoke tests requiring deployed environment credentials.
- Any external Calendar integration.
- Any production data migration outside `npm run migrate`.

## Deployment Steps

1. Confirm the release branch is frozen.

   ```bash
   git status --short
   ```

2. Confirm CI baseline is green.

   Required CI commands:

   ```bash
   npm run typecheck
   npm run lint
   npm run test:agent
   npm run test:agent:planning
   npm run test:agent:schedule
   npm run migrate
   npm run build
   ```

3. Set production environment variables.

   Required:

   ```bash
   PAYLOAD_DB_PUSH=false
   DATABASE_URL="<production database url>"
   PAYLOAD_SECRET="<production payload secret>"
   ```

4. Run database migrations in the deployment environment.

   ```bash
   npm run migrate
   ```

   Do not use `PAYLOAD_DB_PUSH=true` to mutate production schema.

5. Prepare LangGraph / Agent checkpoint infrastructure.

   ```bash
   npm run agent:checkpoint:setup
   ```

6. Build the application.

   ```bash
   npm run build
   ```

   The build runs `scripts/ensure-migrations-for-build.mjs` before `next build`; pending migrations must be resolved before the build can complete.

7. Deploy the built artifact with the platform-specific deployment command.

8. Run the Agent smoke test after deployment.

   ```bash
   AGENT_SMOKE_EMAIL="<smoke user email>" \
   AGENT_SMOKE_PASSWORD="<smoke user password>" \
   npm run smoke:agent
   ```

## Agent Workflow v1 Release Checks

After deployment, verify the following manually or through smoke coverage:

- Read-only Agent prompt works without write confirmation.
- Planning workflow clarifies insufficient large plans.
- Draft cards do not write data.
- Prepare actions create pending confirmations.
- Confirmed writes execute once.
- Action receipts prevent duplicate confirmation writes.
- Rollback remains available for supported actions.

## Rollback Plan

Application rollback:

- Redeploy the previous known-good commit or artifact.
- Keep `PAYLOAD_DB_PUSH=false`.

Database rollback:

- Prefer forward fixes for schema changes.
- If a migration must be reverted, prepare and review a reverse migration before touching production.
- Do not manually edit production schema from local development.

Agent data rollback:

- Use recorded rollback payloads and AgentActionReceipts where supported.
- For indeterminate rollback states, inspect AgentRun, AgentActionReceipt, and related collection records before retrying.

## Manual Steps That Remain

- Approving production deployment.
- Supplying production secrets.
- Running `npm run migrate` in the deployment environment.
- Running `npm run agent:checkpoint:setup` in the deployment environment.
- Running post-deploy Agent smoke tests with deployed credentials.
- Recording release sign-off.
