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
2. Start PostgreSQL with Docker, or run the whole stack with Docker Compose
3. Install dependencies with `npm install`
4. Start the app with `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)
6. Open [http://localhost:3000/admin](http://localhost:3000/admin) to create the first admin user

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
