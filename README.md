# SunnyPanel

SunnyPanel is a single-user panel system built with Next.js, Payload CMS, and PostgreSQL.
It combines a public expression layer with a private workspace for planning, publishing, and long-term personal review.

## Project Direction

SunnyPanel is designed around two surfaces:

- Public surface: blog posts, notes, updates, and a timeline-based narrative layer
- Private surface: admin operations, planning, editorial backlog, and content workflow shortcuts

The project intentionally starts as a focused personal system instead of a multi-user platform.

## Current Status

The project already includes:

- Payload CMS wired into the Next.js App Router
- Auth-enabled `Users` collection and centralized `Media` collection
- Core content collections: `Post`, `Note`, `Update`, `TimelineEvent`, `Plan`, and `Page`
- Public routes for `/blog`, `/notes`, `/updates`, and `/timeline`
- A homepage that reads live content from Payload
- A private `/dashboard` route that is login-aware and redirects to Payload Admin login when needed
- Docker Compose for local PostgreSQL and optional full-stack local orchestration

## Stack

- Next.js 16 App Router
- Payload CMS 3
- PostgreSQL
- Tailwind CSS 4
- Docker Compose
- TypeScript

## Content Model

- `Users`: single-admin auth collection
- `Media`: shared uploads and images
- `Post`: long-form writing with slug, summary, rich text content, tags, cover image, status, and visibility
- `Note`: short fragments with category, mood, pinned flag, status, and visibility
- `Update`: lightweight activity log for life, work, and project progress
- `TimelineEvent`: milestone-oriented records that can optionally connect to posts and updates
- `Plan`: private planning items with priority, status, and due dates
- `Page`: standalone rich-text pages for future custom site sections

## Routes

Public routes:

- `/`
- `/blog`
- `/blog/[slug]`
- `/notes`
- `/updates`
- `/timeline`

Private and admin routes:

- `/dashboard`
- `/admin`
- `/api/[...slug]`
- `/graphql`
- `/graphql-playground`

## Local Development

1. Copy `.env.example` to `.env`
2. Start PostgreSQL with `docker compose up -d postgres`
3. Install dependencies with `npm install`
4. Start the app with `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)
6. Open [http://localhost:3000/admin](http://localhost:3000/admin)
7. If no user exists yet, create the first admin account from the Payload flow

Notes:

- `DATABASE_URL` in `.env` is for host-side development and should point to `127.0.0.1:${POSTGRES_PORT}`
- When the full stack runs through Docker Compose, the `app` service automatically overrides `DATABASE_URL` to use the internal `postgres:5432` hostname

## Docker Compose

- Start PostgreSQL only:

```bash
docker compose up -d postgres
```

- Start the full stack:

```bash
docker compose up --build
```

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run generate:types
npm run generate:importmap
```

## Workflow Notes

- `main` is the stable branch
- feature work is developed on short-lived task branches
- commits should stay small and single-purpose
- preferred prefixes: `feat`, `fix`, `chore`, `docs`

## Next Development Focus

- make the private dashboard more task-oriented around `Plan`
- add richer article detail presentation and page rendering
- improve the custom private workspace beyond admin-entry shortcuts
- polish visual identity and mobile behavior across public routes

## Reference

- Planning document: `AgentDev.md`
