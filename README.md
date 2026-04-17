# SunnyPanel

SunnyPanel is a personal panel system built with Next.js, Payload CMS, and PostgreSQL.
It combines a public expression layer with a private management workspace.

## Stack

- Next.js App Router
- Payload CMS
- PostgreSQL
- Tailwind CSS
- Docker Compose

## Local Development

1. Copy `.env.example` to `.env`
2. Start PostgreSQL with `docker compose up -d postgres`
3. Install dependencies with `npm install`
4. Start the app with `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)
6. Open [http://localhost:3000/admin](http://localhost:3000/admin) to create the first admin user

`DATABASE_URL` in `.env` is for host-side development and should point to `127.0.0.1:${POSTGRES_PORT}`.
When you run the full stack with Docker Compose, the `app` service automatically switches to the internal `postgres:5432` address.

## Docker Compose

- Start only PostgreSQL: `docker compose up -d postgres`
- Start the full stack: `docker compose up --build`

## Useful Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run generate:types
npm run generate:importmap
```

## Git Workflow

- `main` is the stable branch
- Create short-lived feature branches for each task
- Keep commits small and single-purpose
- Prefer commit prefixes like `feat`, `fix`, `chore`, and `docs`

## Reference

- Planning document: `AgentDev.md`
