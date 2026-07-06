# AI Market Intelligence OS

Foundation for the AI Market Intelligence OS — a SaaS app built with Next.js (App Router), TypeScript, Tailwind CSS, and Prisma/PostgreSQL. This is scaffolding only; no business features are implemented yet.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com) v4
- [Prisma ORM](https://www.prisma.io) v7 with the PostgreSQL driver adapter (`@prisma/adapter-pg`)
- PostgreSQL

## Data model

Multi-tenant schema defined in [`prisma/schema.prisma`](prisma/schema.prisma):

- **User** — a person who can sign in; belongs to multiple Workspaces.
- **Workspace** — a tenant. All tenant-scoped data hangs off this.
- **WorkspaceMember** — join table between User and Workspace, carrying a Role and membership status.
- **Role** — catalog of roles a member can hold (permissions as JSON, not an enum, so they can evolve without a migration).
- **Plan** — sellable plan catalog (Free Trial, Starter, Professional, Business, Enterprise).
- **Subscription** — a Workspace's current subscription to a Plan (1:1).
- **UsageLog** — product usage events for metering against a Plan's limits.
- **ApiCostLog** — per-call cost/token tracking for external AI/API providers.
- **AuditLog** — immutable trail of actions taken by users.

Soft delete (`deletedAt`) is used on entities users can remove (User, Workspace, WorkspaceMember, Subscription). `Plan` and `Role` are reference/config data — retire with `isActive`/`isSystem` flags instead of deleting, since Subscriptions and memberships reference them. The three log tables (`UsageLog`, `ApiCostLog`, `AuditLog`) are append-only: no `updatedAt` or `deletedAt`, since rows are written once and never mutated.

## Project structure

```
prisma/
  schema.prisma        Prisma schema — multi-tenant data model
  seed.ts              Seeds the 5 plans
  migrations/          Migration history (committed)
prisma.config.ts        Prisma CLI config (migrations, seed command, DB connection for CLI)
src/
  app/
    page.tsx            Landing page
    layout.tsx           Root layout
    dashboard/
      layout.tsx         Dashboard shell (sidebar + topbar)
      page.tsx           Dashboard home
  components/
    landing/             Landing page sections
    dashboard/            Dashboard shell components
  config/
    site.ts              Site name, nav links, dashboard nav
  lib/
    prisma.ts            Prisma client singleton (uses driver adapter)
  generated/
    prisma/               Generated Prisma client (gitignored, not committed)
```

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up PostgreSQL**

   Use a local Postgres instance or a hosted one. Then copy the env template:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set `DATABASE_URL` to your connection string:

   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/ai_market_intelligence_os?schema=public"
   ```

3. **Apply migrations and generate the Prisma client**

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

   Use `npx prisma migrate dev` instead of `deploy` if you plan to keep evolving the schema locally — it also applies migrations, but will prompt to create new ones when `schema.prisma` has changed.

4. **Seed the plan catalog**

   ```bash
   npx prisma db seed
   ```

   This upserts the 5 plans (Free Trial, Starter, Professional, Business, Enterprise) — safe to re-run.

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) for the landing page and [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the dashboard shell.

## Scripts

| Command           | Description                     |
| ------------------ | -------------------------------- |
| `npm run dev`       | Start the dev server             |
| `npm run build`     | Production build                 |
| `npm run start`     | Run the production build         |
| `npm run lint`      | Lint the codebase                |
| `npx prisma generate` | Regenerate the Prisma client   |
| `npx prisma migrate dev` | Create/apply a migration (dev) |
| `npx prisma migrate deploy` | Apply existing migrations (CI/prod) |
| `npx prisma db seed` | Seed the plan catalog          |

## Notes

- Prisma 7 no longer reads `datasource.url` from `schema.prisma` — the connection is configured via the `@prisma/adapter-pg` driver adapter in [`src/lib/prisma.ts`](src/lib/prisma.ts), and via `prisma.config.ts` for the CLI (migrations, `prisma studio`, etc).
- `src/generated/prisma` is generated output and is gitignored — run `npx prisma generate` after cloning or whenever `schema.prisma` changes.
