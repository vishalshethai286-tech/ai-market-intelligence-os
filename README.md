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
- **ProductService** — AI-discovered product/service catalog entries built from a `WebsiteAnalysis` (see [Product/Service Discovery](#productservice-discovery-ai-extraction)).
- **BusinessBrain**, **BrainFact**, **BrainSource**, **BrainEntity**, **BrainRelationship**, **BrainUpdateRun**, **BrainFeedback** — a per-workspace knowledge base, built from the company profile/product catalog after onboarding (see [AI Business Brain](#ai-business-brain)).
- **SearchQuery** — AI-generated candidate search queries grounded in a workspace's Business Brain (see [AI Search Query Generator](#ai-search-query-generator)).
- **TargetCompany** — discovered lead candidates for a workspace to pursue (see [Target Companies](#target-companies)).

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
5. `/onboarding/start` — review + **Start analysis**, which runs the [Website Analyzer](#website-analyzer) against the company website (best-effort — a failed fetch doesn't block onboarding), generates a [Company Profile](#company-profile-ai-extraction) and runs [Product/Service Discovery](#productservice-discovery-ai-extraction) from it, then advances to step 6 instead of finishing
6. `/onboarding/review-profile` — the AI-generated company profile, fully editable, with **Approve** and **Regenerate** — reuses the same `CompanyProfileForm` as the dashboard. **Continue** advances to step 7 regardless of whether the profile was approved (review can be finished later from the dashboard).
7. `/onboarding/review-products` — the AI-discovered product/service catalog, one card per record with edit/**Approve**/**Reject**/**Delete** — reuses the same `ProductServiceCard` as the dashboard. **Finish and go to dashboard** marks onboarding `COMPLETED` and redirects to `/dashboard`.

- **Best-effort generation, required review step**: if analysis, profile extraction, or discovery fails (caught in `startAnalysis()`), onboarding still advances to step 6 — the review pages show a "couldn't generate" message with a **Try again** button rather than blocking the wizard.
- **Shared components, two routes**: `CompanyProfileForm`/`ApproveButton`/`RegenerateButton` (`src/components/company-profile/`) and `ProductServiceCard`/`RegenerateButton` (`src/components/product-discovery/`) are used unmodified by both the onboarding review steps and the dashboard review screens (`/dashboard/company-profile`, `/dashboard/products`). Their server actions revalidate all three surfaces (`/dashboard`, the dashboard review screen, the onboarding review step) so an edit made in either place shows up immediately in the other.
- **Progress persistence**: `WorkspaceOnboarding.currentStep` tracks the furthest step reached (now 1-7), so a user who drops off resumes exactly where they left off (`/onboarding` redirects there), and can't skip ahead by guessing a URL — `requireOnboardingStep()` in `src/lib/onboarding.ts` bounces them back to their actual step.
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
- **Review screen** (`src/components/company-profile/company-profile-form.tsx`, rendered at both `/dashboard/company-profile` and `/onboarding/review-profile`): every field is editable (array fields as comma-separated text inputs); **Save changes** persists edits without touching approval status; **Approve profile** sets `status: APPROVED` + `approvedAt`/`approvedByUserId`; **Regenerate** re-runs extraction from scratch. Editing/approving is gated by `canEditCompanyProfile()` (`OWNER`/`ADMIN`/`SALES_USER` — `VIEWER` is read-only).
- **Wiring**: `startAnalysis()` (onboarding) calls `generateCompanyProfile()` best-effort right after the website analysis, then advances onboarding to the review-profile step instead of finishing (see [Onboarding](#onboarding)). The dashboard overview only shows a name/industry/confidence summary once the profile is `APPROVED` — an unapproved draft shows a "finish review" prompt instead.
- Requires `ANTHROPIC_API_KEY` in `.env` (and in Vercel's env vars for production) — see [Local setup](#local-setup).

## Product/Service Discovery (AI extraction)

`src/lib/product-discovery/` discovers distinct products/services from a workspace's website content and stores them as a `ProductService` catalog — unlike Company Profile, this is a **list**: many rows per workspace, not one.

- **Beyond the homepage**: the Website Analyzer deliberately never crawls, so discovery does its own small, bounded fetch — `fetchAdditionalPages()` (`fetch-pages.ts`) pulls up to 6 pages classified as `product`/`service`/`catalog` by the analyzer's `identifiedPages`, reusing the same SSRF guard, robots.txt check, and safe fetch as the analyzer (single request per page, no recursion, a failed page is skipped rather than failing the run). The homepage's already-stored content is included alongside these.
- **Extracted fields**: name, category, subcategory, description, applications, target industries, buyer types, keywords, and a 0-1 confidence score, per product/service. `sourceUrls` is **schema-constrained** to an enum of the URLs actually fetched for that run (`schema.ts` builds the JSON Schema per-call from that list) — the model can cite a page it was given, never invent one.
- **`extractProductServices(pages)`** (`extract.ts`) calls Claude (`claude-opus-4-8`, structured outputs, adaptive thinking, `effort: "high"`) with all fetched pages in one prompt, asking it to merge duplicates that appear on multiple pages into a single record (citing every page it appears on) and cap the result at 20 items. Throws `DiscoveryError` on refusal, truncation, or malformed JSON.
- **`generateProductServices(workspaceId)`** (`service.ts`): finds the latest `COMPLETED` analysis, fetches the extra pages, runs extraction, then in one transaction deletes every **non-`APPROVED`** row for the workspace and inserts the fresh batch. `APPROVED` rows are never touched by a regenerate — approval is treated as a finalized human decision, not a draft.
- **Review screen** (`src/components/product-discovery/product-service-card.tsx`, rendered at both `/dashboard/products` and `/onboarding/review-products`): one card per record, each independently editable (**Save changes**) and independently **Approve** / **Reject** / **Delete** — ownership-checked server-side (`requireOwnedProductService`) so an id from one workspace can't be used to touch another's rows. Gated by `canEditProductCatalog()` (same roles as Company Profile).
- **Wiring**: `startAnalysis()` (onboarding) calls `generateProductServices()` best-effort after company profile generation, then onboarding advances through the review-profile and review-products steps before completing (see [Onboarding](#onboarding)). The dashboard overview shows the **approved** count as the headline number, with a separate badge for how many are still pending review.
- Uses the same `ANTHROPIC_API_KEY` as Company Profile.

## AI Business Brain

A per-workspace knowledge base that aggregates everything this app learns about a company — company profile, product catalog, target countries, and (best-effort) competitors — into queryable facts and a lightweight entity graph.

### Schema

- **BusinessBrain** — the aggregate root, one per workspace (`status`: `INITIALIZING` / `ACTIVE` / `STALE`). Every other model below hangs off a `brainId`, and also carries `workspaceId` directly so it's queryable without a join.
- **BrainFact** — an atomic piece of knowledge: `workspaceId`, `factType` (a bounded enum — company name, industry, headquarters, certification, competitor, financial, etc., with an `OTHER` escape hatch), `factValue`, `sourceUrl`, `confidenceScore`, `lastVerifiedAt`, and `freshnessScore` (0-1, decays the longer a fact goes unverified — distinct from `confidenceScore`, which is about extraction accuracy at capture time, not recency). Optionally links to the `BrainSource` and `BrainEntity` it came from/is about. `verificationStatus` (`UNVERIFIED` / `CORRECT` / `INCORRECT` / `NEEDS_REVIEW`) plus `verifiedByUserId` records a human's judgment — the one dimension only a person can set, distinct from both scores above.
- **BrainSource** — where a piece of knowledge came from (`sourceType`: website page / document / manual entry / third-party API), optionally traceable back to the `WebsiteAnalysis` run that produced it.
- **BrainEntity** — a named "node" the brain has identified (organization, person, product, location, certification, industry). `BrainFact` can attach to the entity it's about.
- **BrainRelationship** — a directed edge between two `BrainEntity` rows (`fromEntityId` → `toEntityId`), e.g. "Acme Corp" —`CERTIFIED_BY`→ "ISO 9001". `relationshipType` is free text (open-ended vocabulary), unlike the closed `factType`/`entityType`/`sourceType` enums.
- **BrainUpdateRun** — history of refresh operations (status, trigger, facts created/updated/expired/**flagged**, optional `triggeredByUserId`), the same run-history pattern as `WebsiteAnalysis`.
- **BrainFact.pendingFactValue** — set only when a refresh finds a different value for a fact a human already verified `CORRECT`; holds the newly proposed value while `factValue` stays untouched and `verificationStatus` flips to `NEEDS_REVIEW`, so the conflict is visible instead of silently overwritten or silently dropped.
- **Cascade rules** (verified against a live DB): deleting a `BrainSource` or `BrainEntity` that a fact/relationship merely *references* sets that reference to `null` rather than deleting the fact/relationship; deleting an entity that's the `fromEntity`/`toEntity` of a relationship cascades and removes that relationship; deleting the workspace cascades through the entire graph.

### Initial brain builder

`src/lib/business-brain/service.ts` — **`buildInitialBrain(workspaceId)`** synthesizes the initial brain once, right after onboarding completes:

- **Company profile** → one `BrainFact` per populated field (company name, description, industry, business model, headquarters, operation type — using the same friendly labels as the review screen), plus one `BrainEntity`(`CERTIFICATION`) + `CERTIFIED_BY` relationship per certification.
- **Products/services** (every non-`REJECTED` row — approval isn't required, since a user may finish onboarding without approving everything) → one `BrainEntity`(`PRODUCT`) + `OFFERS` relationship and one `PRODUCT_OR_SERVICE` fact per item.
- **Industries, buyer types, search keywords** → deduped (case-insensitively) across all included products into `TARGET_INDUSTRY` / `BUYER_TYPE` / `KEYWORD` facts.
- **Target countries** → deduped union of the company profile's `countriesServed` and the onboarding wizard's selected target countries (mapped from ISO codes to names), as `COUNTRY_SERVED` facts.
- **Competitors, if known** (`src/lib/business-brain/competitors.ts`) — one Claude call (`claude-opus-4-8`, structured outputs) given the aggregated profile, asking it to name only competitors it has genuine knowledge of. Returns an empty list rather than guessing, and **fails open** (catches its own errors, including a missing/invalid `ANTHROPIC_API_KEY`) so a competitor-lookup failure never blocks the rest of the brain from being built. Each identified competitor becomes a `BrainEntity`(`ORGANIZATION`) + `COMPETES_WITH` relationship + a `COMPETITOR` `BrainFact` (so competitors are reviewable in the UI exactly like every other fact).
- Every fact/entity/relationship from this run shares one `BrainSource` pointing at the workspace's latest completed `WebsiteAnalysis`, so everything traces back to where it came from.
- **Idempotent**: if the workspace's brain is already populated (`status` ≠ `INITIALIZING`), calling this again is a no-op — it builds the *initial* brain once. If a previous attempt failed partway, the brain stays `INITIALIZING` so the next call retries instead of returning permanently empty. Population happens in a single transaction, so a failure can't leave a half-built graph.
- **Wiring**: `completeOnboarding()` calls this best-effort right before marking onboarding `COMPLETED`, same non-blocking convention as the rest of onboarding's enrichment steps.

### Review page

`/dashboard/business-brain` (`src/app/dashboard/business-brain/page.tsx`) groups every `BrainFact` into six sections — **Company summary, Products & services, Target industries, Buyer personas, Keywords, Competitors** — driven purely by `factType`, so a section simply doesn't render if it has no facts. Each fact row (`src/components/business-brain/fact-row.tsx`) shows the fact value, confidence score, source URL, and last-verified date, plus **Correct** / **Incorrect** / **Needs review** buttons that call `markFactVerificationAction()` — ownership-checked server-side, gated by `canReviewBrainFacts()` (same roles as Company Profile/Products). Marking a fact **Correct** also bumps its `lastVerifiedAt`/`freshnessScore`, since a human confirming a fact is itself an act of verification.

### Feedback learning

**BrainFeedback** is an append-only log distinct from `BrainFact.verificationStatus` — a fact/entity can accumulate many feedback events over time (a learning signal for future scoring/discovery), rather than one mutable "is this still true" judgment. It stores `feedbackType` (`GOOD_LEAD` / `BAD_LEAD` / `CORRECT_PRODUCT` / `INCORRECT_PRODUCT` / `GOOD_INDUSTRY` / `BAD_INDUSTRY`), optional `factId`/`entityId` (`SetNull` on delete, so removing the underlying fact/entity preserves the feedback history instead of destroying the signal), an optional freeform `subjectLabel` for subjects with no brain row yet, and the `userId` who gave it.

`src/lib/business-brain/service.ts` — **`recordFeedback()`** validates the target fact/entity belongs to the workspace before writing, and **`getFeedbackCountsByFact()`** tallies positive vs. negative feedback per fact for display. The Business Brain page wires **Correct product** / **Incorrect product** buttons onto `PRODUCT_OR_SERVICE` facts and **Good industry** / **Bad industry** buttons onto `TARGET_INDUSTRY` facts, each showing a live tally next to the buttons, gated by the same `canReviewBrainFacts()` role check as fact verification. `GOOD_LEAD`/`BAD_LEAD` exist in the schema/service today for forward-compatibility but have no UI yet — the app has no lead-discovery feature or lead data model to attach them to.

### Refresh

`src/lib/business-brain/service.ts` — **`refreshBrain(workspaceId, userId, trigger)`** re-checks an already-built brain against the live website, rather than rebuilding it from scratch:

1. **Recheck website content** — re-runs `runAndStoreWebsiteAnalysis()` against the workspace's website, producing a fresh `WebsiteAnalysis` row.
2. **Detect changed pages** — compares the new analysis's `visibleText`/`identifiedPages` against the previous one. If neither changed, the refresh stops here (`BrainUpdateRun` completes with all-zero counts) — **this is a real cost gate**, not just a label: it skips both Claude calls below entirely when the site is unchanged.
3. **Detect new products/services** — if the site did change, re-runs `generateProductServices()` (the same regenerate used by the Products & Services page — new items land as `PENDING_REVIEW`, `APPROVED` rows are never touched), then re-runs competitor identification.
4. **Update facts / preserve approved facts / flag conflicts** — reconciles every fact category (company-summary scalars, countries/industries/buyer-types/keywords, certifications/products/competitors) against the now-current `CompanyProfile`/`ProductService` state:
   - a brand-new value → a new `BrainFact` (+ entity/relationship where applicable)
   - an existing value that's unchanged → just re-confirmed (`lastVerifiedAt`/`freshnessScore` refreshed)
   - an existing value that changed, not yet verified `CORRECT` → updated in place, `verificationStatus` reset to `UNVERIFIED` (a changed value needs re-review regardless of the old judgment)
   - an existing value that changed, but a human already verified it `CORRECT` → **preserved untouched**, flagged `NEEDS_REVIEW`, with the new proposal kept in `pendingFactValue` (shown inline on the Business Brain page as "Suggested update from the latest refresh: …")
   - a list item (country/industry/buyer type/keyword/product/competitor) no longer found → "expired" (`freshnessScore` reset to `0`, never deleted) unless verified `CORRECT`, which is preserved regardless

A cooldown (`canStartNewAnalysis()`, the same one the website analyzer itself uses) prevents back-to-back refreshes from hammering the target site. A site-fetch failure mid-refresh is recorded on the `BrainUpdateRun` (`FAILED`, with `error` set) and returned as a soft error rather than thrown, matching `buildInitialBrain`'s best-effort posture; calling before the initial brain exists, or with no website to check, throws immediately instead.

**Manual refresh button**: `refreshBrainAction()` (`src/lib/actions/business-brain.ts`) wraps this, gated by `canReviewBrainFacts()`, and the Business Brain page renders a **Refresh brain** button (`src/components/business-brain/refresh-brain-button.tsx`) next to the status badge, showing a one-line summary ("Refreshed: 3 new, 1 updated, 2 expired, 1 flagged for review.") or an error inline.

## Search Service

`src/lib/search/` — a provider-agnostic search abstraction: `search(query, options)` returns a uniform `SearchResult[]` (`title`, `snippet`, `url`, `domain`, `provider`) no matter which backend answered.

- **Providers** (`src/lib/search/providers/`): `TAVILY`, `EXA`, `BING`, `GOOGLE_CSE` are **placeholders** — real request/response wiring against each provider's documented REST API, gated behind their own API key env var(s) (`TAVILY_API_KEY`, `EXA_API_KEY`, `BING_SEARCH_API_KEY`, `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX`), throwing a typed `SearchProviderNotConfiguredError` when the key is missing rather than silently failing. None have been exercised against a live key in this codebase — verify each against current provider docs before depending on it in production. `MOCK` is fully functional: no network call, no API key, deterministic query-aware canned results, meant for local development and tests.
- **Selection**: `search()` uses the `provider` option if given, otherwise the `SEARCH_PROVIDER` env var, otherwise falls back to `MOCK` — so the app never breaks in an environment with no search API keys configured. An empty/whitespace query short-circuits to `[]` without calling any provider.
- **`maxResults`** is honored by every provider and capped at `MAX_MAX_RESULTS` (`src/lib/search/constants.ts`); Google CSE additionally caps at its own hard limit of 10 per request.
- Not wired into any feature yet — this is the abstraction layer only, ready for a caller (e.g. a future lead/market-signal discovery feature) to import from `@/lib/search`.

## AI Search Query Generator

`src/lib/search-queries/` — generates candidate search-engine queries for lead/market discovery, grounded in a workspace's [Business Brain](#ai-business-brain), and stores them as **SearchQuery** rows. This only generates and stores query strings; it doesn't execute them — that's what [Search Service](#search-service) is for, once something wires the two together.

- **Categories** (`SearchQueryCategory`): `TARGET_CUSTOMER` (general prospecting), `BUYER_TYPE` (one per buyer type), `INDUSTRY_COMPANY` (one per target industry), `PRODUCT_SERVICE_BUYER` (one per product/service), `COUNTRY_SPECIFIC` (one per country served), `VENDOR_REGISTRATION` (supplier/procurement portals), `PROJECT` (tenders/RFPs relevant to the company's products or industries).
- **`generateAndStoreSearchQueries(workspaceId)`** (`src/lib/search-queries/service.ts`) aggregates the workspace's current `BrainFact`s (company name, industry, description, products, target industries, buyer types, countries served, keywords, competitors) into one Claude call (`claude-opus-4-8`, structured JSON output across all 7 categories at once) — mirroring the `product-discovery`/`company-profile` module layout (`constants.ts`/`schema.ts`/`prompt.ts`/`generate.ts`). Claude is instructed to ground every query in the given facts and return an empty array for a category rather than inventing filler when there's nothing to ground it in.
- Unlike `identifyCompetitors` (best-effort enrichment that fails open), a generation failure **throws** — this is the feature's main deliverable, not a secondary enrichment, so a refusal/truncation/malformed response surfaces as a typed `QueryGenerationError` rather than silently returning nothing. Requires an already-built Business Brain (`BrainNotReadyError` if missing/still `INITIALIZING`) and at least a company name, product, or target industry to ground queries in (`InsufficientBrainContextError` otherwise).
- **SearchQuery** rows are immutable once created (`workspaceId`+`query` is unique, so `createMany({ skipDuplicates: true })` silently dedupes exact repeats across regenerations rather than erroring or double-storing) and record `category`, `query`, and an optional `basedOn` note (which fact(s) grounded it, e.g. `"Industry: Manufacturing"`).
- Not wired into any UI yet — call `generateAndStoreSearchQueries()`/`listSearchQueries()` directly from `@/lib/search-queries/service` until a page/action is built.

## Target Companies

**TargetCompany** (`prisma/schema.prisma`) — a workspace's discovered lead candidates. Mirrors `CompanyProfile`/`ProductService`'s review-gated lifecycle (`TargetCompanyStatus`: `PENDING_REVIEW` / `APPROVED` / `REJECTED`) rather than `BrainFact`'s verification-status lifecycle, since a target company is a proposed record to accept or reject wholesale, not an existing fact to confirm/correct.

- **Descriptive fields** (`companyName`, `website`, `country`, `cityState`, `industry`, `companyDescription`, `buyerType`, `matchedProduct`) are free text, matching how the rest of this schema stores AI-extracted descriptive values (`BrainFact.factValue`, `ProductService.buyerTypes`) rather than foreign keys — not every target will map cleanly onto an existing internal product or brain fact.
- **Provenance**: `sourceUrl` (where it was found) and `relevanceExplanation` (the AI's stated reasoning for why this company is a relevant target).
- **Scoring**: `confidenceScore` (0-1, extraction confidence) and `priorityScore` (a separate computed ranking score for sorting/prioritizing targets) are distinct, same split as `BrainFact.confidenceScore` vs. `freshnessScore` — one is about extraction accuracy, the other about fit/ranking. `priorityGrade` (`A`/`B`/`C`/`D`) is a bucketed grade derived from `priorityScore`, nullable until a scoring pass assigns one — not populated by the extraction pipeline below, which only sets `confidenceScore`.
- **`duplicateStatus`** (`UNIQUE` / `DUPLICATE` / `POSSIBLE_DUPLICATE`) is a plain enum column, not a self-referential link to whichever record it duplicates — that level of dedup-linking isn't built yet.
- `lastVerifiedAt` mirrors `BrainFact.lastVerifiedAt` — when a human last confirmed this target is still accurate/relevant.

### AI extraction from search results

`src/lib/target-companies/` — turns raw `SearchResult`s (from the [Search Service](#search-service)) into `TargetCompany` rows, mirroring the `product-discovery`/`search-queries` module layout (`constants.ts`/`schema.ts`/`prompt.ts`/`extract.ts`/`service.ts`).

- **`extractTargetCompanies(results, context, productChoices)`** (`extract.ts`) — one Claude call assesses a whole batch of search results at once against our own company profile (from Business Brain facts), returning exactly one assessment per result, in order, so each can be zipped back onto its source URL. For each result the model decides `isRelevantTarget` (excluding directories, news, marketplaces, social profiles, our own site, and known competitors' sites — a competitor isn't a lead), extracts `companyName`/`website`/`industry`/`country` only where actually inferable (empty string rather than a guess), explains its relevance judgment, and picks `matchedProduct` — constrained to an enum of our actual product/service names (plus empty), so it can't invent a product we don't offer. Throws `TargetExtractionError` on refusal/truncation/malformed output, same "main deliverable, don't fail open" posture as `generateSearchQueries`.
- **`discoverAndExtractTargetCompanies(workspaceId, options)`** (`service.ts`) is the end-to-end pipeline: loads every stored `SearchQuery` for the workspace, runs each through `search()`, feeds the results through `extractTargetCompanies`, and **saves only the companies judged relevant** as `PENDING_REVIEW` `TargetCompany` rows. A company matching an existing row (by website domain, or company name if there's no website) is still saved but flagged `DUPLICATE` rather than dropped, so a human reviewing the queue sees repeat discoveries instead of losing a second source silently. A single bad query or failed extraction batch is skipped, not fatal to the whole run — requires an already-built Business Brain (`BrainNotReadyError`) and at least one stored `SearchQuery` (`NoSearchQueriesError`).
- `listTargetCompanies(workspaceId)` — plain read helper, same convention as every other module's list function.
- Not wired into any UI yet.

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

## Environment Setup

All configuration lives in environment variables, documented with placeholders and comments in [`.env.example`](.env.example) — the canonical template for every variable this app knows about. `.env.example` is tracked in git; every real `.env*` file is gitignored (see `.gitignore`) so secrets never get committed.

1. Copy the template:

   ```bash
   cp .env.example .env
   ```

2. Fill in the **required** variables — the app refuses to start without them:

   | Variable | Used for |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL connection string (Prisma) |
   | `AUTH_SECRET` | Auth.js session/JWT signing secret — generate with `openssl rand -base64 32` |
   | `NEXT_PUBLIC_APP_URL` | Base URL of the app, used for links/redirects |

3. Fill in whichever **optional** variables the features you're working on need. Everything else in `.env.example` gates one specific feature and is safe to leave as a placeholder — the feature degrades gracefully (or isn't wired into any code path yet) until a real value is set:

   | Category | Variables | Feature it gates |
   | --- | --- | --- |
   | AI providers | `ANTHROPIC_API_KEY` | Website-analysis extraction, product discovery, [AI Business Brain](#ai-business-brain) synthesis, competitor identification — get a key at [platform.claude.com](https://platform.claude.com) |
   | Search providers | `SEARCH_PROVIDER`, `TAVILY_API_KEY`, `EXA_API_KEY`, `BING_SEARCH_API_KEY`, `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX` | [Search Service](#search-service) — defaults to the no-key `MOCK` provider if unset |
   | Stripe | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing — reserved for a future feature, not wired into any code path yet |
   | Email | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email (password reset, invitations) — reserved, not wired yet |
   | Storage | `BLOB_READ_WRITE_TOKEN` | File uploads — reserved, not wired yet |
   | Queue/Cron | `CRON_SECRET` | Scheduled/background jobs — reserved, not wired yet |
   | Logging | `LOG_LEVEL` | Structured logging — reserved, no logging library wired in yet |
   | Feature flags | `FEATURE_FLAGS_PROVIDER`, `GROWTHBOOK_CLIENT_KEY` | Feature-flag rollout — reserved, not wired yet |

### Startup validation

`src/instrumentation.ts` calls `validateEnv()` (`src/lib/env.ts`) once when the server starts — both `next dev` and `next start`/production — before it accepts any requests. If a required variable is missing or invalid, the server refuses to start and prints exactly which one(s), instead of that surfacing later as a confusing crash deep inside the first request that needed it:

```
Error: An error occurred while loading instrumentation hook: Missing or invalid required environment variable(s):
  - AUTH_SECRET: AUTH_SECRET is required — see .env.example.

Copy .env.example to .env and fill in real values, then restart the server.
```

Only the three **required** variables above are checked at startup — optional/feature-gated variables aren't, since the app is designed to run without them.

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
      company-profile/   /dashboard/company-profile — page.tsx only, form lives in components/
      products/          /dashboard/products — page.tsx only, cards live in components/
      business-brain/    /dashboard/business-brain — company summary, catalog, industries, buyer personas, keywords, competitors
    onboarding/
      layout.tsx         Onboarding shell (logo, logout, centered content)
      page.tsx           Redirects to the workspace's current step
      website/, email/, countries/, customer-types/, start/   One folder per step
      review-profile/    Step 6 — company profile review (edit, approve, regenerate, continue)
      review-products/   Step 7 — product/service review (edit, approve, reject, delete, finish)
  components/
    landing/             Landing page sections
    dashboard/            Sidebar, topbar, workspace switcher, user menu, mobile nav context
    onboarding/           Step progress indicator
    company-profile/      CompanyProfileForm/ApproveButton/RegenerateButton — shared by dashboard + onboarding
    product-discovery/    ProductServiceCard/RegenerateButton — shared by dashboard + onboarding
    business-brain/       FactRow — value, confidence, source URL, last verified date, verification buttons
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
    product-discovery/     Bounded multi-page fetch + AI extraction (Claude, structured outputs) + DB-integrated service
    business-brain/        buildInitialBrain() — synthesizes profile/products/countries into facts + entities + relationships; getBusinessBrain/listBrainFacts/markFactVerification
    actions/auth.ts        Server actions: signup, login, logout, requestPasswordReset
    actions/workspace.ts   Server actions: createWorkspace, switchWorkspace, renameWorkspace, inviteMember
    actions/onboarding.ts  Server actions: one save action per step, startAnalysis
    actions/company-profile.ts  Server actions: regenerate, update, approve
    actions/product-discovery.ts  Server actions: regenerate, update, approve, reject, delete
    actions/business-brain.ts  Server action: markFactVerificationAction
    validations/auth.ts    Zod schemas for signup/login forms
    validations/workspace.ts  Zod schemas for workspace name / invite forms
    validations/onboarding.ts Zod schemas for each onboarding step
    validations/shared.ts  Shared `toList()` comma-separated-input helper
    validations/company-profile.ts Zod schema for the profile edit form
    validations/product-service.ts Zod schema for the product/service edit form
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

2. **Set up PostgreSQL and configure environment variables**

   Use a local Postgres instance or a hosted one, then set `DATABASE_URL` (and everything else you need) as described in [Environment Setup](#environment-setup). At minimum you need `DATABASE_URL`, `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL` — the app won't start without them.

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
- Same caveat for product/service discovery (`src/lib/product-discovery/extract.ts`) — the create/update/approve/reject/delete/regenerate-preserves-approved logic was verified against the local DB, and the bounded multi-page fetch (`fetch-pages.ts`) is a thin, already-typechecked composition of the website analyzer's live-verified SSRF guard/robots-check/safe-fetch, but the actual Claude call is untested without `ANTHROPIC_API_KEY`.
- `buildInitialBrain()` (`src/lib/business-brain/service.ts`) was verified end-to-end through the real running app (seeded an approved profile + mixed-status products, ran onboarding's Finish step, confirmed the fact/entity/relationship counts and dedup by querying the DB directly) — but without `ANTHROPIC_API_KEY`, `identifyCompetitors()` fails open and every brain built so far has zero competitors. That's by design (fail-open, not a required step) but means the competitor path itself hasn't been exercised against a real response.
- The `/dashboard/business-brain` review page was verified live in the browser (seeded a full fact set including a competitor, marked facts Correct/Incorrect and confirmed the badge/button state updates and persists on reload) at mobile, tablet-width, and desktop viewports — the fact-row layout deliberately stacks unconditionally (value, then metadata, then status/buttons) rather than switching to a side-by-side row at a breakpoint, since the sidebar's width means the usable content column is narrower than the raw viewport width would suggest.
