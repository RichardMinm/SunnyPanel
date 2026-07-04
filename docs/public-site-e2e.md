# Public Site E2E Smoke

`tests/e2e/public-site-smoke.spec.ts` verifies that the public routes render in a real browser.

## What It Requires

- A Next.js server for SunnyPanel.
- A non-production Postgres database reachable through `DATABASE_URL`.
- `PAYLOAD_SECRET` set to a non-production value.
- `PAYLOAD_DB_PUSH=false`.
- Migrations applied with `npm run migrate`.

The public pages read Payload collections during server rendering, so this smoke test is not a static-only test. If Postgres is not running, failures such as `ECONNREFUSED 127.0.0.1:5432` are environment setup failures, not public UI regressions.

## Recommended Local Setup

Use a dedicated local or disposable database. Do not point this test at production.

```bash
export PAYLOAD_DB_PUSH=false
export DATABASE_URL="postgresql://<user>:<password>@127.0.0.1:5432/sunnypanel_test"
export PAYLOAD_SECRET="sunnypanel-public-e2e-local-secret"
npm run migrate
npm run test:e2e:public
```

`npm run test:e2e:public` uses the Playwright `webServer` config and starts `npm run dev` when no reusable server is available.

If a SunnyPanel dev server is already running, reuse it:

```bash
export PLAYWRIGHT_BASE_URL="http://127.0.0.1:3000"
export PLAYWRIGHT_SKIP_WEBSERVER=1
npm run test:e2e:public:local
```

## Sandbox Notes

Some restricted environments cannot bind a local port for the Next.js dev server. In that case, start the server outside the sandbox and run the local command with `PLAYWRIGHT_SKIP_WEBSERVER=1`.

## CI Notes

The default CI baseline does not run browser E2E tests. Add this smoke only in a CI job that provisions a disposable Postgres service, applies migrations, and provides non-production secrets.
