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
- **WebsiteAnalysis** — raw result of analyzing a workspace's homepage (see [Website Analyzer](#website-analyzer)).
- **CompanyProfile** — AI-extracted company profile built from a `WebsiteAnalysis` (see [Company Profile](#company-profile-ai-extraction)).

Soft delete (`deletedAt`) is used on entities users can remove (User, Workspace, WorkspaceMember, Subscription). `Plan` and `Role` are reference/config data — retire with `isActive`/`isSystem` flags instead of deleting, since Subscriptions and memberships reference them. The three log tables (`UsageLog`, `ApiCostLog`, `AuditLog`) are append-only: no `updatedAt` or `deletedAt`, since rows are written once and never mutated.

## Authentication

Email/password auth via [Auth.js (NextAuth v5)](https://authjs.dev), configured in [`src/auth.ts`](src/auth.ts):

- **Credentials provider** — email/password checked against `User.passwordHash` (hashed with `bcryptjs`), JWT session strategy (required for the Credentials provider).
- **Signup** ([`src/lib/actions/auth.ts`](src/lib/actions/auth.ts)) creates the `User` and a new `Workspace` owned by them (via `createWorkspaceWithOwner`, see below) in one transaction, then signs the user in.
- **Session** — the JWT/session only carries identity (`id`, `email`, `name`). Workspace + role are resolved per-request (see Workspace management below), not embedded in the token, so switching workspaces takes effect immediately without a token refresh.
- **Route protection** — authoritative check in `src/app/dashboard/layout.tsx` and every dashboard page (redirects to `/login` server-side), plus an optimistic `src/proxy.ts` that redirects logged-out users away from `/dashboard/*` and logged-in users away from `/login` and `/signup`.
- **Pages**: `/login`, `/signup`, `/forgot-password` (placeholder — validates input and shows a generic confirmation message, but does not send an email or touch the database yet).
- Requires `AUTH_SECRET` in `.env` (generate with `openssl rand -base64 32`).

## Workspace management

- **Multiple workspaces per user** — a signup creates one workspace (owned by that user), but a user can create or belong to more. `src/lib/workspace.ts` is the single source of truth for "which workspace is this request in the context of":
  - `getWorkspaceContext()` reads the session, the user's memberships, and the `active_workspace` cookie, and resolves the active one (falling back to the oldest membership if the cookie is missing/stale).
  - `requireActiveWorkspace()` — same, but redirects to `/dashboard/workspaces/new` if the user has no workspace at all.
  - `createWorkspaceWithOwner(name, userId, client?)` — creates a Workspace + an OWNER `WorkspaceMember`; accepts an optional transaction client so it can be composed into a larger transaction (used by both signup and "create workspace").
- **Create workspace**: `/dashboard/workspaces/new` — any signed-in user can create an additional workspace and becomes its owner.
- **Switch workspace**: the sidebar's `WorkspaceSwitcher` calls the `switchWorkspace` server action directly (not a form submit), which sets the `active_workspace` cookie after verifying the user is actually a member, then revalidates the dashboard.
- **Workspace settings** (`/dashboard/settings`): rename the workspace, view members, and an invite-member **placeholder** (validates email/role, shows a confirmation message, but doesn't send an email or persist an invite yet) — both gated by role.
- **Roles**: `OWNER`, `ADMIN`, `SALES_USER`, `VIEWER` (seeded in `prisma/seed.ts` — `WorkspaceMember.roleId` requires one of these to exist, so run the seed before testing signup).
- **Access control** (`src/lib/access-control.ts`): pure role-check helpers — `canManageWorkspace`, `canInviteMembers`, `canManageBilling`, `canRemoveMember`, `isOwner` — plus a `requireRole()` guard that throws `AccessDeniedError` for use in actions/route handlers. Only `OWNER`/`ADMIN` can rename the workspace or invite members; only `OWNER` can manage billing or remove another `OWNER`.

## Onboarding

Website-first onboarding wizard, one `WorkspaceOnboarding` row per Workspace (`prisma/schema.prisma`), gating access to the dashboard until finished:

1. `/onboarding/website` — company website (bare domains like `acme.com` are normalized to `https://acme.com`)
2. `/onboarding/email` — work email (prefilled from the session user's email)
3. `/onboarding/countries` — target countries (multi-select checkboxes, see `src/config/onboarding.ts` for the list)
4. `/onboarding/customer-types` — customer types (B2B, B2C, Enterprise, SMB, Startups, Government)
5. `/onboarding/start` — review + **Start analysis**, which runs the [Website Analyzer](#website-analyzer) against the company website (best-effort — a failed fetch doesn't block onboarding), then marks onboarding `COMPLETED` and sends the user to `/dashboard`

- **Progress persistence**: `WorkspaceOnboarding.currentStep` tracks the furthest step reached, so a user who drops off resumes exactly where they left off (`/onboarding` redirects there), and can't skip ahead by guessing a URL — `requireOnboardingStep()` in `src/lib/onboarding.ts` bounces them back to their actual step.
- **Gating**: signup and "create workspace" redirect to `/onboarding` instead of `/dashboard`; `dashboard/layout.tsx` redirects back to `/onboarding` if the active workspace's onboarding isn't `COMPLETED`. Each workspace's onboarding is independent — switching to an already-onboarded workspace goes straight to the dashboard.

## Website Analyzer

`src/lib/website-analyzer/` fetches and parses a company homepage — one request, no crawling. `src/lib/website-analysis.ts` wires it to the database (`WebsiteAnalysis`, one row per run, kept as history) and is called from `startAnalysis()` in onboarding.

- **`analyzeWebsite(url)`** (`analyze.ts`) orchestrates the pipeline below and never throws — every failure mode comes back as `{ ok: false, reason, error }`:
  1. **SSRF guard** (`ssrf-guard.ts`) — rejects non-http(s) protocols, non-standard ports, `localhost`/`.internal`/`.local` hostnames, and (via a DNS lookup) hostnames that resolve to a private/reserved IP, including the cloud metadata address `169.254.169.254`. Verified live against `169.254.169.254`, `127.0.0.1`, `10.x`, `192.168.x`, and non-standard ports — all correctly rejected without crashing; `https://example.com` correctly allowed.
     **Known limitation** (documented in the source): DNS is checked *before* fetching, not pinned for the actual request, so it doesn't fully close a DNS-rebinding gap. Fine for analyzing a company's own website; would need a pinned-IP fetch dispatcher before pointing this at less-trusted input.
  2. **robots.txt** (`robots.ts`) — fetches and parses `/robots.txt`, checks our user-agent (falling back to `*`) against Disallow/Allow rules for the homepage path. Fails open (allowed) if robots.txt is missing/unreachable, same convention real crawlers use.
  3. **Safe fetch** (`safe-fetch.ts`) — identifies itself with a descriptive `User-Agent`, hard timeout, manual redirect following (each hop re-validated by the SSRF guard), and a byte cap on the response body (default 2MB) so a huge response can't exhaust memory.
  4. **Parse** (`parse.ts`, via `cheerio`) — title, meta description, `h1`/`h2`/`h3` headings, visible body text (script/style stripped, truncated), and same-origin links (deduped, capped, external/`mailto:`/`tel:`/anchor links excluded).
  5. **Classify** (`classify.ts`) — keyword heuristics sort the found links into `product`, `service`, `about`, `industries`, `catalog`, `contact` (a link can land in more than one category).
- **Rate limiting**: `canStartNewAnalysis()` refuses a new run within 60s of the last one for the same workspace, or while one is still `RUNNING` — "do not scrape aggressively" in practice.
- **Dashboard**: the Market Signals card shows the latest analysis's status (Analyzed/Failed/Analyzing), title, and identified-page-type count.

## Company Profile (AI extraction)

`src/lib/company-profile/` extracts a structured company profile from the workspace's latest **completed** `WebsiteAnalysis`, using Claude (`claude-opus-4-8` via `@anthropic-ai/sdk`) with [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (`output_config.format: json_schema`) so the response is guaranteed to parse against a fixed schema — no free-text parsing.

- **Extracted fields**: company name, business description, industry, business model, countries served, headquarters, operation type (`MANUFACTURER` / `TRADER` / `SERVICE_PROVIDER` / `OTHER` / `UNKNOWN`), certifications, key products/services, and a 0-1 confidence score. `sourceUrls` is set programmatically to the analyzed homepage URL (the model doesn't get to invent sources).
- **`extractCompanyProfile(analysis)`** (`extract.ts`) builds the prompt from the analysis's title/meta description/headings/visible text/classified links (`prompt.ts`), calls Claude with adaptive thinking + `effort: "medium"`, and validates the response shape defensively even though structured outputs already guarantees it. Throws `ExtractionError` on a safety refusal, truncated (`max_tokens`) response, or malformed JSON.
- **`generateCompanyProfile(workspaceId)`** (`service.ts`) is the DB-integrated entry point: finds the latest `COMPLETED` analysis (throws `NoAnalysisError` if there isn't one), runs extraction, and **upserts** — one `CompanyProfile` row per workspace, not history. Regenerating always resets `status` to `PENDING_REVIEW`, even if the previous draft was approved. The model's raw output for that run is kept in `aiRawExtraction` as an audit trail, untouched by later user edits.
- **Review screen** (`/dashboard/company-profile`): every field is editable (array fields as comma-separated text inputs); **Save changes** persists edits without touching approval status; **Approve profile** sets `status: APPROVED` + `approvedAt`/`approvedByUserId`; **Regenerate** re-runs extraction from scratch. Editing/approving is gated by `canEditCompanyProfile()` (`OWNER`/`ADMIN`/`SALES_USER` — `VIEWER` is read-only).
- **Wiring**: `startAnalysis()` (onboarding) calls `generateCompanyProfile()` best-effort right after the website analysis, same non-blocking convention as the analysis itself. The dashboard overview shows a Company Profile card with status + confidence.
- Requires `ANTHROPIC_API_KEY` in `.env` (and in Vercel's env vars for production) — see [Local setup](#local-setup).

## Dashboard layout & UI components

- **Shell** (`src/app/dashboard/layout.tsx`): sidebar + topbar, wrapped in a `MobileNavProvider` (`src/components/dashboard/mobile-nav-context.tsx`) so the sidebar can act as a slide-in drawer on mobile (`sm:` breakpoint and below) — a hamburger button in the topbar toggles it, a backdrop and nav-link clicks close it.
- **Workspace switcher** and **user menu** (avatar → name/email/workspace/role, settings link, logout) live in `src/components/dashboard/`. The user menu closes on outside click or Escape.
- **Dashboard home**: empty-state cards (Team, Market Signals, Reports, Getting Started) using the `Card` primitive — no business data yet, but `Team` shows a real member count since it's a free query.
- **Reusable primitives** (`src/components/ui/`): `Button`, `Input`, `Textarea`, `Label`, `Select`, `Badge`, `Card`, `Table` (+ `FieldError` for form errors) — built on `class-variance-authority` for variants and a `cn()` helper (`clsx` + `tailwind-merge`) in `src/lib/cn.ts`. Every form and table in the app (login, signup, forgot-password, create/rename workspace, invite member, members table, company profile) uses these instead of ad-hoc styling.
  - `Table`'s wrapper uses `overflow-x-auto` (not `overflow-hidden`) so extra columns scroll horizontally on narrow screens instead of being clipped.

### Convention: every model belongs to a workspace

New Prisma models should carry a `workspaceId` (with a relation to `Workspace`) unless they're genuinely global (an account, or a shared catalog like `Role`/`Plan`). This is enforced by:

```bash
npm run check:schema
```

which fails if a non-exempt model in `prisma/schema.prisma` is missing `workspaceId` (see `scripts/check-workspace-scoping.mjs` for the exempt list).

## Project structure

```
prisma/
  schema.prisma        Prisma schema — multi-tenant data model
  seed.ts              Seeds system roles + the 5 plans
  migrations/          Migration history (committed)
prisma.config.ts        Prisma CLI config (migrations, seed command, DB connection for CLI)
src/
  auth.ts               Auth.js config (Credentials provider, JWT/session callbacks)
  proxy.ts              Optimistic auth redirect (Next.js 16 proxy, was middleware.ts)
  app/
    page.tsx            Landing page
    layout.tsx           Root layout
    (auth)/
      layout.tsx         Shared centered layout for auth pages
      login/             /login
      signup/            /signup
      forgot-password/   /forgot-password (placeholder)
    api/auth/[...nextauth]/route.ts   Auth.js route handler
    dashboard/
      layout.tsx         Dashboard shell (sidebar + topbar) — session + workspace + onboarding gate
      page.tsx           Dashboard home
      settings/          Workspace settings: rename, members, invite placeholder
      workspaces/new/    Create-workspace page
      company-profile/   Company profile review screen (edit, approve, regenerate)
    onboarding/
      layout.tsx         Onboarding shell (logo, logout, centered content)
      page.tsx           Redirects to the workspace's current step
      website/, email/, countries/, customer-types/, start/   One folder per step
  components/
    landing/             Landing page sections
    dashboard/            Sidebar, topbar, workspace switcher, user menu, mobile nav context
    onboarding/           Step progress indicator
    ui/                   Reusable primitives: Button, Input, Textarea, Label, Select, Checkbox, Badge, Card, Table, FieldError
  config/
    site.ts              Site name, nav links, dashboard nav
    onboarding.ts         Target country / customer type options, step order
  lib/
    cn.ts                clsx + tailwind-merge helper
    prisma.ts            Prisma client singleton (uses driver adapter)
    slug.ts              Workspace slug generation/uniqueness
    access-control.ts     Role constants + permission predicates + requireRole guard
    workspace.ts          Active-workspace resolution, workspace creation
    onboarding.ts          Onboarding step guard, get-or-create, completion check
    website-analysis.ts    DB-integrated analysis service (create/update WebsiteAnalysis, rate limit)
    website-analyzer/      SSRF guard, robots.txt check, safe fetch, HTML parse, page classifier
    company-profile/       AI extraction (Claude, structured outputs) + DB-integrated service
    actions/auth.ts        Server actions: signup, login, logout, requestPasswordReset
    actions/workspace.ts   Server actions: createWorkspace, switchWorkspace, renameWorkspace, inviteMember
    actions/onboarding.ts  Server actions: one save action per step, startAnalysis
    actions/company-profile.ts  Server actions: regenerate, update, approve
    validations/auth.ts    Zod schemas for signup/login forms
    validations/workspace.ts  Zod schemas for workspace name / invite forms
    validations/onboarding.ts Zod schemas for each onboarding step
    validations/company-profile.ts Zod schema for the profile edit form
  types/next-auth.d.ts   Session/JWT type augmentation (id)
  generated/
    prisma/               Generated Prisma client (gitignored, not committed)
scripts/
  check-workspace-scoping.mjs   Fails if a model is missing workspaceId
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

   Edit `.env` and set `DATABASE_URL` to your connection string, and generate an `AUTH_SECRET`:

   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/ai_market_intelligence_os?schema=public"
   AUTH_SECRET="$(openssl rand -base64 32)"
   ANTHROPIC_API_KEY="sk-ant-..."
   ```

   `ANTHROPIC_API_KEY` powers the [Company Profile](#company-profile-ai-extraction) AI extraction feature — get one at [platform.claude.com](https://platform.claude.com). Everything else works without it; profile generation will fail (caught and surfaced as an error on the review screen) until it's set.

3. **Apply migrations and generate the Prisma client**

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

   Use `npx prisma migrate dev` instead of `deploy` if you plan to keep evolving the schema locally — it also applies migrations, but will prompt to create new ones when `schema.prisma` has changed.

4. **Seed reference data**

   ```bash
   npx prisma db seed
   ```

   This upserts the system roles (`OWNER`, `ADMIN`, `SALES_USER`, `VIEWER`) and the 5 plans (Free Trial, Starter, Professional, Business, Enterprise) — safe to re-run. The `OWNER` role must exist before anyone can sign up.

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
| `npm run check:schema` | Fail if a model is missing `workspaceId` |
| `npx prisma generate` | Regenerate the Prisma client   |
| `npx prisma migrate dev` | Create/apply a migration (dev) |
| `npx prisma migrate deploy` | Apply existing migrations (CI/prod) |
| `npx prisma db seed` | Seed the plan catalog          |

## Notes

- Prisma 7 no longer reads `datasource.url` from `schema.prisma` — the connection is configured via the `@prisma/adapter-pg` driver adapter in [`src/lib/prisma.ts`](src/lib/prisma.ts), and via `prisma.config.ts` for the CLI (migrations, `prisma studio`, etc).
- `src/generated/prisma` is generated output and is gitignored — run `npx prisma generate` after cloning or whenever `schema.prisma` changes.
- `import "server-only"` (used throughout `src/lib/`) needs the `server-only` package installed as a real dependency — Next.js's bundler special-cases it at build time, but plain Node/`tsx` won't resolve it otherwise.
- The company-profile extraction call (`src/lib/company-profile/extract.ts`) was verified against the local DB (upsert/update/approve/regenerate logic, cascade deletes) but not against a live Claude API call — no `ANTHROPIC_API_KEY` was available in this environment. Set one in `.env` locally and in Vercel's env vars before relying on it in production.
