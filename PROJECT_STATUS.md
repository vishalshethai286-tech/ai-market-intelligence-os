# Project Status

Snapshot of what exists in this repo today, for planning purposes. Update this file at the start of each new phase rather than trusting it to stay accurate on its own — treat it as a snapshot, not a live doc. See [`PRODUCT_VISION.md`](PRODUCT_VISION.md) for where the product is headed.

Last updated: 2026-07-10 (Phase 2).

## Tech stack

- **Framework:** Next.js 16.2.10 (App Router, Turbopack), React 19, TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** PostgreSQL via Prisma ORM v7, using the `@prisma/adapter-pg` driver adapter (Prisma 7 no longer reads `datasource.url` from `schema.prisma`; the connection is configured in `src/lib/prisma.ts` and `prisma.config.ts`)
- **Auth:** Auth.js v5 (`next-auth@5.0.0-beta.31`), Credentials provider (email/password, bcrypt-hashed), JWT sessions
- **AI:** Anthropic Claude (`@anthropic-ai/sdk`) — structured JSON-schema outputs, used for website-analysis extraction, product/service discovery, Business Brain synthesis, competitor identification, and search-query generation. **Not OpenAI** — any future env/doc work should not introduce `OPENAI_API_KEY`/`OPENAI_MODEL` without either wiring in an actual OpenAI code path or treating it as a deliberate provider swap.
- **Search:** Pluggable provider abstraction (`src/lib/search`) — Tavily, Exa, Bing, Google CSE, or a no-key Mock provider (default when unset)
- **Package manager:** npm (`package-lock.json` present; no yarn/pnpm lockfile)
- **Deployment target:** Vercel (`.vercel/` present, Vercel Blob/Cron env vars reserved)
- **Test framework:** [Vitest](https://vitest.dev) (added Phase 2) — `vitest.config.ts`/`vitest.setup.ts`, node environment, real Postgres for integration tests (no mocked Prisma)

## Folder structure

```
prisma/
  schema.prisma        Multi-tenant Prisma schema (22 models)
  seed.ts               Seeds system roles + 6 plans
  migrations/           Committed migration history
src/
  app/                  Next.js App Router pages (see Routes below)
  components/           UI, by feature area (business-brain, company-profile,
                         dashboard, landing, onboarding, product-discovery, ui/)
  config/               site.ts (nav/site name), onboarding.ts (step config)
  lib/                  Business logic — one folder per feature/service, plus
                         actions/ (server actions) and validations/ (Zod schemas)
  generated/prisma/     Generated Prisma client (gitignored, regenerate after
                         schema changes with `npx prisma generate`)
  instrumentation.ts     Runs validateEnv() on server start
  auth.ts                Auth.js config
  proxy.ts               Optimistic-auth redirect (Next.js 16 proxy, replaces middleware.ts)
scripts/
  check-workspace-scoping.mjs   Fails if a model is missing workspaceId
```

Full annotated tree lives in [`README.md`](README.md#project-structure) — kept there since it's also onboarding material, not duplicated here.

## Routes / pages

| Path | Purpose |
| --- | --- |
| `/` | Landing page |
| `/login`, `/signup`, `/forgot-password` | Auth pages (forgot-password is a placeholder — no email sent) |
| `/onboarding` → `/onboarding/website\|email\|countries\|customer-types\|start\|review-profile\|review-products` | Website-first onboarding wizard, one step per route |
| `/dashboard` | Dashboard home |
| `/dashboard/company-profile` | View/edit the AI-extracted company profile |
| `/dashboard/products` | View/edit the AI-discovered product/service catalog |
| `/dashboard/business-brain` | Business Brain review: facts, entities, competitors, feedback |
| `/dashboard/billing` | Read-only Plan/Subscription view (no Stripe checkout) |
| `/dashboard/discovery-brain`, `/customers`, `/projects`, `/tender-buyers`, `/live-tenders`, `/vendor-registrations`, `/duplicates`, `/coverage`, `/reports` | Sidebar sections for the not-yet-built discovery features — each a `ComingSoonPage` placeholder (Phase 2) |
| `/dashboard/settings` | Workspace rename, members, invite (placeholder — no email sent) |
| `/dashboard/workspaces/new` | Create an additional workspace |

All business-logic routes are server-rendered pages backed by server actions, not client-side API calls. The sidebar nav (`dashboardNav` in `src/config/site.ts`) now covers all 14 sections from `PRODUCT_VISION.md`; Company Profile and Products & Services remain real pages but are linked from the dashboard home cards rather than the sidebar (not part of the new nav spec).

## API endpoints

Only one HTTP route handler exists:

| Route | Purpose |
| --- | --- |
| `POST/GET /api/auth/[...nextauth]` | Auth.js catch-all (session, sign-in, sign-out) |

Everything else — onboarding steps, company-profile edits, product approval, workspace management, Business Brain feedback — goes through Next.js **server actions** in `src/lib/actions/*.ts`, not REST/API routes. There is currently no public API surface for external integrations (e.g. no `/api/discovery/*`, no webhook receivers, no Stripe webhook handler despite `STRIPE_WEBHOOK_SECRET` being reserved in `.env.example`).

## Database models

Defined in `prisma/schema.prisma` (22 models), multi-tenant via `workspaceId` on every tenant-scoped model (enforced by `npm run check:schema`):

- **Identity/tenancy:** `User`, `Workspace`, `WorkspaceMember`, `Role` (roles: `OWNER`, `ADMIN`, `MANAGER`, `USER`, `VIEWER`, `PLATFORM_ADMIN` — the last is an internal platform-team override, not invitable)
- **Billing (schema only, not wired to Stripe):** `Plan` (6 plans: Free Trial, Starter, Professional, Business, Growth, Enterprise), `Subscription`, `UsageLog`, `ApiCostLog`
- **Governance:** `AuditLog` (append-only)
- **Onboarding:** `WorkspaceOnboarding`
- **Website/company intelligence:** `WebsiteAnalysis`, `CompanyProfile`, `ProductService`
- **AI Business Brain:** `BusinessBrain`, `BrainSource`, `BrainEntity`, `BrainRelationship`, `BrainFact`, `BrainUpdateRun`, `BrainFeedback`
- **Discovery:** `SearchQuery` (AI-generated candidate queries), `TargetCompany` (discovered leads, with `priorityScore`/`priorityGrade` from the new lead-scoring module)

Conventions: soft delete (`deletedAt`) on user-removable entities; `Plan`/`Role` retire via `isActive`/`isSystem` flags instead of deletion; log tables are append-only (no `updatedAt`/`deletedAt`).

## Tests

**28 Vitest tests across 2 files** (added Phase 2), plus the pre-existing non-test checks:

- `src/lib/access-control.test.ts` — pure role-helper unit tests, no DB (19 tests): every `can*`/`is*` check across all six roles, including the `PLATFORM_ADMIN` bypass.
- `src/lib/workspace.test.ts` — integration tests against the real dev database, self-cleaning (9 tests): `createWorkspaceWithOwner` (workspace + OWNER membership, unique slugs), user/workspace isolation, and the protected-route primitives `getWorkspaceContext`/`requireActiveWorkspace` (with `@/auth`/`next/headers`/`next/navigation` mocked).
- `npm run check:schema` — custom script asserting every non-exempt Prisma model has `workspaceId`
- `npm run lint` — ESLint
- `npx tsc --noEmit` — TypeScript
- `npm run build` — production build (also type-checks and prerenders static routes)

All pass cleanly as of this snapshot (see Phase 2 results below). Coverage is still narrow — no component/UI tests, no end-to-end tests, and no tests yet for the AI extraction modules (company-profile, product-discovery, business-brain, search-queries, target-companies, lead-scoring) or server actions beyond workspace creation.

## Missing modules (relative to the product vision)

Everything below `Product/Service Discovery` and `Target Companies` (basic AI extraction from search results) in the vision is **not yet built**:

- Continuous/scheduled discovery job (no cron routes, `CRON_SECRET` is reserved but unused)
- Global project discovery, tender discovery, vendor-registration discovery (only generic "target company" discovery exists)
- Continuous deduplication across discovery runs
- Coverage dashboard (countries/sectors searched vs. found)
- Reports and exports (PDF/CSV, no storage wiring — `BLOB_READ_WRITE_TOKEN` is reserved but unused)
- Stripe billing (schema exists — `Plan`, `Subscription` — but the Stripe SDK isn't a dependency and no checkout/webhook code exists)
- Transactional email (`RESEND_API_KEY`/`EMAIL_FROM` reserved; forgot-password and invite flows are UI placeholders that don't send anything)
- Platform admin area (the `PLATFORM_ADMIN` role and `isPlatformAdmin()` permission bypass exist in `access-control.ts` as of Phase 2, and `PLATFORM_ADMIN_EMAILS` is reserved in `.env.example`, but no admin routes/UI exist and nothing currently assigns the role to a member)
- Public API surface for external integrations

Lead scoring (`src/lib/lead-scoring/`) is present but **uncommitted** — it's mid-development, not part of any merged commit.

## Current risks

- **Test coverage is narrow.** Vitest now covers role helpers and the workspace/protected-route primitives, but server actions (auth, onboarding, company-profile, product-discovery, business-brain), the AI extraction modules, and every page/component are still verified only by lint/typecheck/build/manual QA. Expand coverage incrementally as each area gets touched rather than as a separate big-bang effort.
- **AI extraction has no true mock mode.** If `ANTHROPIC_API_KEY` is unset, extraction calls fail (caught, so the app doesn't crash — see `src/lib/actions/onboarding.ts`) but there's no way to develop/demo the AI-dependent flows without a real key. `ENABLE_MOCK_AI` is now reserved in `.env.example` for this, but not implemented.
- **Uncommitted work in progress:** `src/lib/lead-scoring/` (3 files) and diffs to `README.md`/`prisma/schema.prisma` are on the working tree but not committed. Not touched by this Phase 1 pass — flagging so it isn't lost or mistaken for stale/abandoned code.
- **Single API route.** The whole app currently depends on Next.js server actions rather than a stable HTTP API. This is fine for the current UI-only surface but will need rethinking once external integrations (webhooks, a public API, mobile) are in scope.
- **No rate limiting or cost guardrails visible** beyond a per-workspace analysis rate limit mentioned in `src/lib/website-analysis.ts` — worth auditing before enabling real AI keys in a shared/production environment, since Claude calls are metered per token.
- **Vercel instrumentation caveat (already documented in code):** `src/instrumentation.ts`'s `validateEnv()` is not a reliable production gate on Vercel for static/prerendered routes; the actual enforced-per-request check lives in `src/lib/prisma.ts`. Worth keeping in mind if new required env vars are added later — they need the same per-request enforcement, not just the instrumentation hook.

## Recommended build order (Phase 3+)

1. **Commit or formally scope the in-flight lead-scoring work** so it isn't ambiguous state — decide with the user whether to finish and merge it now or shelve it explicitly.
2. **Continuous discovery job** — the core differentiator (per `PRODUCT_VISION.md`): scheduled search-query execution against the Search Service, candidate extraction, dedup, and scoring, running on a cron trigger (`CRON_SECRET` is already reserved for this). This is what turns `/dashboard/customers`, `/projects`, `/tender-buyers`, `/live-tenders`, and `/vendor-registrations` from placeholders into real pages.
3. **Coverage dashboard** — surfaces what's been searched/found per country/sector, since the product's positioning promise ("continuous global discovery from public online sources," not instant guaranteed coverage) depends on being able to show users what has and hasn't been covered yet.
4. **Deduplication layer** — needed before discovery runs at any real scale, and easier to build once real discovery output exists to dedupe against. Feeds `/dashboard/duplicates`.
5. **Reports/exports** — depends on discovery + dedup being stable enough to export. Feeds `/dashboard/reports`.
6. **Billing (Stripe)** — schema already exists, `/dashboard/billing` already shows the read-only plan catalog; wire up checkout + webhook once there's a paid feature worth gating.
7. **Transactional email** — needed for the existing UI placeholders (password reset, invites) regardless of discovery progress; low effort, could be pulled earlier if those flows are user-facing soon.
8. **Platform admin area** — once there's real usage to administer; `PLATFORM_ADMIN` role and `isPlatformAdmin()` bypass already exist in `access-control.ts`, no admin routes yet.
9. **Expand test coverage** as each area above is built — server actions, AI extraction modules, and page-level tests, not just the role-helper/workspace coverage added in Phase 2.

## Phase 1 completion (env/docs plumbing) — results

- `npm run lint` — pass, no errors/warnings
- `npx tsc --noEmit` — pass, no errors
- `npm run check:schema` — pass, all models workspace-scoped
- `npm run build` — pass, all 21 routes compiled/prerendered successfully
- No blocking issues found — nothing required fixing.

## Phase 2 completion (SaaS foundation) — results

- `npm run lint` — pass, no errors/warnings (after fixing one `react-hooks/set-state-in-effect` violation introduced by the new `Dialog` component)
- `npx tsc --noEmit` — pass, no errors
- `npm run check:schema` — pass, all models workspace-scoped
- `npm test` (Vitest, new) — pass, 28/28 tests across 2 files
- `npm run build` — pass, all 31 routes compiled/prerendered successfully (up from 21 — 10 new placeholder/billing dashboard routes)
- Manual end-to-end smoke test: signed up a fresh user, verified all 14 sidebar sections return 200 once onboarding is marked complete, confirmed the billing page renders all 6 seeded plans (including the new Growth plan) and the invite-member role dropdown offers Admin/Manager/User/Viewer — then cleaned up the test user/workspace.
- No blocking issues found — nothing required fixing beyond the lint violation above, fixed inline.
