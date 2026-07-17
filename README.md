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
- **Plan** — sellable plan catalog (Free Trial, Starter, Professional, Business, Growth, Enterprise).
- **Subscription** — a Workspace's current subscription to a Plan (1:1).
- **UsageLog** — product usage events for metering against a Plan's limits.
- **ApiCostLog** — per-call cost/token tracking for external AI/API providers.
- **AuditLog** — immutable trail of actions taken by users.
- **WebsiteAnalysis** — raw result of analyzing a workspace's homepage; one row per analysis run — this is the "website analysis run" record (see [Website Analyzer](#website-analyzer)).
- **WebsitePageSnapshot** — one row per page fetched for a `WebsiteAnalysis` run (homepage plus a bounded set of identified product/service/etc. pages), persisted once so product/service discovery doesn't re-fetch the target site on every regenerate (see [Website Analyzer](#website-analyzer)).
- **CompanyProfile** — AI-extracted company profile built from a `WebsiteAnalysis`, denormalized with the onboarding wizard's website/work email/target countries/preferred customer types (see [Company Profile](#company-profile-ai-extraction)).
- **ProductService** — AI-discovered (or manually-added) product/service catalog entries built from a `WebsiteAnalysis`, including discovery-oriented keyword lists (synonyms, related items, project/tender/vendor-registration keywords) (see [Product/Service Discovery](#productservice-discovery-ai-extraction)).
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
- **Roles**: `OWNER`, `ADMIN`, `MANAGER`, `USER`, `VIEWER`, `PLATFORM_ADMIN` (seeded in `prisma/seed.ts` — `WorkspaceMember.roleId` requires one of these to exist, so run the seed before testing signup). `PLATFORM_ADMIN` is an internal platform-team override, not a role a normal member is invited with (excluded from `InviteMemberSchema`) — every `can*` check in `access-control.ts` treats it as always-allowed.
- **Access control** (`src/lib/access-control.ts`): pure role-check helpers — `canManageWorkspace`, `canInviteMembers`, `canManageBilling`, `canRemoveMember`, `isOwner`, `isPlatformAdmin` — plus a `requireRole()` guard that throws `AccessDeniedError` for use in actions/route handlers. Only `OWNER`/`ADMIN` can rename the workspace or invite members; only `OWNER` can manage billing or remove another `OWNER`; `OWNER`/`ADMIN`/`MANAGER`/`USER` can edit content (company profile, product catalog, Business Brain facts) — `VIEWER` is read-only everywhere. `PLATFORM_ADMIN` bypasses all of the above.

## Onboarding

Website-first onboarding wizard, one `WorkspaceOnboarding` row per Workspace (`prisma/schema.prisma`), gating access to the dashboard until finished:

1. `/onboarding/website` — company website (bare domains like `acme.com` are normalized to `https://acme.com`)
2. `/onboarding/email` — work email (prefilled from the session user's email)
3. `/onboarding/countries` — target countries, **optional** (multi-select checkboxes plus a **Worldwide** toggle that's mutually exclusive with a specific selection — stored as the `WORLDWIDE` sentinel in the same array, see `src/config/onboarding.ts`)
4. `/onboarding/customer-types` — preferred customer types, **optional** (Manufacturers, Exporters, Importers, Distributors, EPC contractors, End users, Government buyers, Service companies, OEMs, Consultants, Others)
5. `/onboarding/start` — review + **Start analysis** (shows a progress state — spinner, disabled button, "this can take up to ~30 seconds"), which runs the [Website Analyzer](#website-analyzer) against the company website (best-effort — a failed fetch doesn't block onboarding), generates a [Company Profile](#company-profile-ai-extraction) and runs [Product/Service Discovery](#productservice-discovery-ai-extraction) from it, then advances to step 6 instead of finishing
6. `/onboarding/review-profile` — the AI-generated company profile, fully editable, with **Approve** and **Regenerate** — reuses the same `CompanyProfileForm` as the dashboard. **Continue** advances to step 7 regardless of whether the profile was approved (review can be finished later from the dashboard).
7. `/onboarding/review-products` — the AI-discovered product/service catalog, one card per record with edit/**Approve**/**Reject**/**Delete**, plus **Add manually** (`AddProductServiceDialog`) for anything the website didn't surface — reuses the same `ProductServiceCard` as the dashboard. **Finish and go to dashboard** marks onboarding `COMPLETED` and redirects to `/dashboard`.

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
  5. **Classify** (`classify.ts`) — keyword heuristics sort the found links into `product`, `service`, `about`, `industries`, `applications`, `catalog`, `contact`, `downloads`, `blog`, `news` (a link can land in more than one category).
- **Page snapshots** (`page-snapshots.ts`) — `fetchAndStorePageSnapshots()` is called once per analysis run, right after the homepage completes: it persists the homepage's already-fetched content as a `WebsitePageSnapshot` (no extra request), then fetches a bounded set (max 6) of the identified `product`/`service`/`catalog`/`applications`/`downloads` pages — same SSRF guard, robots.txt check, and safe fetch as the homepage, one request per page — and persists each. Best-effort: wrapped in try/catch so a snapshot failure never fails the analysis itself. [Product/Service Discovery](#productservice-discovery-ai-extraction) reads these back instead of re-fetching the target site on every regenerate.
- **Rate limiting**: `canStartNewAnalysis()` refuses a new run within 60s of the last one for the same workspace, or while one is still `RUNNING` — "do not scrape aggressively" in practice.
- **Dashboard**: the Market Signals card shows the latest analysis's status (Analyzed/Failed/Analyzing), title, and identified-page-type count.

## Company Profile (AI extraction)

`src/lib/company-profile/` extracts a structured company profile from the workspace's latest **completed** `WebsiteAnalysis`, using Claude (`claude-opus-4-8` via `@anthropic-ai/sdk`) with [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (`output_config.format: json_schema`) so the response is guaranteed to parse against a fixed schema — no free-text parsing. Called through [AI Extraction Service](#ai-extraction-service), not directly, so it transparently gets mock-mode/Zod-validation coverage.

- **Extracted fields**: company name, business description, industry, business model, countries served, headquarters, operation type (`MANUFACTURER` / `TRADER` / `SERVICE_PROVIDER` / `OTHER` / `UNKNOWN` — this is the "manufacturing/trading/service type" field), certifications, key products/services, and a 0-1 confidence score. `sourceUrls` is set programmatically to the analyzed homepage URL (the model doesn't get to invent sources).
- **Onboarding fields, not AI-extracted**: `website`, `workEmail`, `targetCountries`, `preferredCustomerTypes` are copied from the workspace's `WorkspaceOnboarding` row at generation time (`generateCompanyProfile()`), not inferred by the model — the durable `CompanyProfile` carries the full "initial business understanding" on its own, without downstream features needing to join through the wizard-progress-only onboarding row. All four are user-editable afterward on the review screen.
- **`extractCompanyProfile(analysis)`** (`extract.ts`) builds the prompt from the analysis's title/meta description/headings/visible text/classified links (`prompt.ts`), calls Claude with adaptive thinking + `effort: "medium"`, and validates the response shape defensively even though structured outputs already guarantees it. Throws `ExtractionError` on a safety refusal, truncated (`max_tokens`) response, or malformed JSON.
- **`generateCompanyProfile(workspaceId)`** (`service.ts`) is the DB-integrated entry point: finds the latest `COMPLETED` analysis (throws `NoAnalysisError` if there isn't one), runs extraction, and **upserts** — one `CompanyProfile` row per workspace, not history. Regenerating always resets `status` to `PENDING_REVIEW`, even if the previous draft was approved. The model's raw output for that run is kept in `aiRawExtraction` as an audit trail, untouched by later user edits.
- **Review screen** (`src/components/company-profile/company-profile-form.tsx`, rendered at both `/dashboard/company-profile` and `/onboarding/review-profile`): every field is editable (array fields as comma-separated text inputs); **Save changes** persists edits without touching approval status; **Approve profile** sets `status: APPROVED` + `approvedAt`/`approvedByUserId`; **Regenerate** re-runs extraction from scratch. Editing/approving is gated by `canEditCompanyProfile()` (`OWNER`/`ADMIN`/`MANAGER`/`USER` — `VIEWER` is read-only).
- **Wiring**: `startAnalysis()` (onboarding) calls `generateCompanyProfile()` best-effort right after the website analysis, then advances onboarding to the review-profile step instead of finishing (see [Onboarding](#onboarding)). The dashboard shows a name/industry/confidence summary plus an **Onboarding complete/incomplete** badge (`getOnboardingStatus()`); an unapproved draft shows a "finish review" prompt instead of the summary.

## AI Extraction Service

`src/lib/ai-extraction/` — the single entry point both AI extraction tasks above go through (`extractCompanyProfileAI()`, `extractProductServicesAI()`), instead of pages/actions calling the Claude-backed extractors directly:

- **Mock-first**: `isMockAIEnabled()` (`env.ts`) returns true if `ENABLE_MOCK_AI=true`, or implicitly whenever `ANTHROPIC_API_KEY` isn't set — so onboarding always works end-to-end (deterministically, no network, no cost) in local dev/CI/tests without a real key. **Not OpenAI** — this project's configured AI provider is Anthropic Claude, already wired into `company-profile`/`product-discovery`; see `PROJECT_STATUS.md` for why `OPENAI_API_KEY` wasn't introduced as a second, unused provider.
- **Deterministic mock extractors** (`mock-company-profile.ts`, `mock-product-discovery.ts`) derive what they reasonably can from already-fetched page content — company name from `<title>` (stripping a trailing "| Site Name"), description from the meta description, key products from `<h2>` headings, one product/service placeholder per non-homepage page (type guessed from service-y keywords in the name) — and leave the rest empty rather than guessing, with a low `confidenceScore` (0.2) signaling the result is a placeholder.
- **Zod validation**: every result — mock or real — is validated against `zod-schemas.ts` before reaching the database, throwing `AIExtractionValidationError` on a shape mismatch. Structured outputs already guarantee Claude's response matches its JSON Schema, but this catches drift between that schema and the TypeScript type, and gives the mock path the same guarantee.
- The real (non-mock) branch delegates to the existing `extractCompanyProfile()`/`extractProductServices()` (Claude, structured outputs) rather than duplicating their prompts/schemas.

## Product/Service Discovery (AI extraction)

`src/lib/product-discovery/` discovers distinct products/services from a workspace's website content and stores them as a `ProductService` catalog — unlike Company Profile, this is a **list**: many rows per workspace, not one. Called through [AI Extraction Service](#ai-extraction-service), not directly.

- **Beyond the homepage**: discovery reads the `WebsitePageSnapshot` rows already persisted for the workspace's latest analysis (see [Website Analyzer](#website-analyzer)) instead of fetching anything itself — homepage plus up to 6 pages classified `product`/`service`/`catalog`/`applications`/`downloads`. Falls back to the `WebsiteAnalysis` row's own homepage content if no snapshots exist yet (e.g. an analysis that predates this).
- **Extracted fields**: name, **type** (`PRODUCT` / `SERVICE`), category, subcategory, description, applications, target industries, buyer types, keywords, **synonyms** (alternate names a buyer might search for), **related products/services**, and three discovery-oriented keyword lists — **project keywords**, **tender keywords**, **vendor registration keywords** — for the future project/tender/vendor-registration discovery features (see `PRODUCT_VISION.md` §6-8), plus a 0-1 confidence score. `sourceUrls` is **schema-constrained** to an enum of the snapshot URLs actually used for that run (`schema.ts` builds the JSON Schema per-call from that list) — the model can cite a page it was given, never invent one.
- **`extractProductServices(pages)`** (`extract.ts`) calls Claude (`claude-opus-4-8`, structured outputs, adaptive thinking, `effort: "high"`) with all fetched pages in one prompt, asking it to merge duplicates that appear on multiple pages into a single record (citing every page it appears on) and cap the result at 20 items. Throws `DiscoveryError` on refusal, truncation, or malformed JSON.
- **`generateProductServices(workspaceId)`** (`service.ts`): finds the latest `COMPLETED` analysis, reads its page snapshots, runs extraction, then in one transaction deletes every **non-`APPROVED`** row for the workspace and inserts the fresh batch. `APPROVED` rows are never touched by a regenerate — approval is treated as a finalized human decision, not a draft.
- **`createProductService(workspaceId, fields)`** — adds a manually-created entry (a human asserting a product/service exists, not an AI extraction): `confidenceScore: 1`, no `sourceUrls`/`aiRawExtraction`, starts `PENDING_REVIEW` like everything else so it still goes through the same approve/reject step.
- **Review screen** (`src/components/product-discovery/product-service-card.tsx`, rendered at both `/dashboard/products` and `/onboarding/review-products`): one card per record, each independently editable (**Save changes**, including type and the discovery keyword lists behind a collapsible `<details>`) and independently **Approve** / **Reject** / **Delete** — ownership-checked server-side (`requireOwnedProductService`) so an id from one workspace can't be used to touch another's rows. **Add manually** (`AddProductServiceDialog`, `src/components/ui/dialog.tsx`) opens a quick-add form for the core fields; the rest are editable afterward on the card. Gated by `canEditProductCatalog()` (same roles as Company Profile).
- **Wiring**: `startAnalysis()` (onboarding) calls `generateProductServices()` best-effort after company profile generation, then onboarding advances through the review-profile and review-products steps before completing (see [Onboarding](#onboarding)). The dashboard overview shows the **approved** count as the headline number, with a separate badge for how many are still pending review.

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

`src/lib/search-queries/` — generates candidate search-engine queries for lead/market discovery, grounded in a workspace's [Business Brain](#ai-business-brain), and stores them as **SearchQuery** rows. This only generates and stores query strings; it doesn't execute them — that's [Search Service](#search-service), wired together by the [Continuous Discovery Job](#continuous-discovery-job).

- **Categories** (`SearchQueryCategory`): `TARGET_CUSTOMER` (general prospecting), `BUYER_TYPE` (one per buyer type), `INDUSTRY_COMPANY` (one per target industry), `PRODUCT_SERVICE_BUYER` (one per product/service), `COUNTRY_SPECIFIC` (one per country served), `VENDOR_REGISTRATION` (supplier/procurement portals), `PROJECT` (tenders/RFPs relevant to the company's products or industries).
- **`generateAndStoreSearchQueries(workspaceId)`** (`src/lib/search-queries/service.ts`) aggregates the workspace's current `BrainFact`s (company name, industry, description, products, target industries, buyer types, countries served, keywords, competitors) and calls through [AI Extraction Service](#ai-extraction-service)'s `generateSearchQueriesAI()` — mock-or-real, structured JSON output across all 7 categories at once (real path: `generate.ts`, `claude-opus-4-8`). Every query is grounded in the given facts; an empty array for a category means there wasn't enough to ground one, not filler.
- Unlike `identifyCompetitors` (best-effort enrichment that fails open), a generation failure **throws** — this is the feature's main deliverable, not a secondary enrichment, so a refusal/truncation/malformed response surfaces as a typed `QueryGenerationError` rather than silently returning nothing. Requires an already-built Business Brain (`BrainNotReadyError` if missing/still `INITIALIZING`) and at least a company name, product, or target industry to ground queries in (`InsufficientBrainContextError` otherwise).
- **SearchQuery** rows are immutable once created (`workspaceId`+`query` is unique, so `createMany({ skipDuplicates: true })` silently dedupes exact repeats across regenerations rather than erroring or double-storing) and record `category`, `query`, and an optional `basedOn` note (which fact(s) grounded it, e.g. `"Industry: Manufacturing"`).
- Wired into the [Continuous Discovery Job](#continuous-discovery-job), which generates queries automatically on a workspace's first discovery run.

## Target Companies

**TargetCompany** (`prisma/schema.prisma`) — a workspace's discovered lead candidates. Mirrors `CompanyProfile`/`ProductService`'s review-gated lifecycle (`TargetCompanyStatus`: `PENDING_REVIEW` / `APPROVED` / `REJECTED`) rather than `BrainFact`'s verification-status lifecycle, since a target company is a proposed record to accept or reject wholesale, not an existing fact to confirm/correct.

- **Descriptive fields** (`companyName`, `website`, `country`, `cityState`, `industry`, `companyDescription`, `buyerType`, `matchedProduct`) are free text, matching how the rest of this schema stores AI-extracted descriptive values (`BrainFact.factValue`, `ProductService.buyerTypes`) rather than foreign keys — not every target will map cleanly onto an existing internal product or brain fact.
- **Provenance**: `sourceUrl` (where it was found) and `relevanceExplanation` (the AI's stated reasoning for why this company is a relevant target).
- **Scoring**: `confidenceScore` (0-1, extraction confidence) and `priorityScore` (a separate computed 0-100 ranking score for sorting/prioritizing targets) are distinct, same split as `BrainFact.confidenceScore` vs. `freshnessScore` — one is about extraction accuracy, the other about fit/ranking. `priorityGrade` (`A+` / `A` / `B` / `C`; the enum member is `A_PLUS`, mapped to the DB value `"A+"` since Prisma enum identifiers can't contain `+`) is a bucketed grade derived from `priorityScore` by the [lead-scoring engine](#lead-scoring), nullable until a scoring pass assigns one — not populated by the extraction pipeline below, which only sets `confidenceScore`.
- **`duplicateStatus`** (`UNIQUE` / `DUPLICATE` / `POSSIBLE_DUPLICATE`) is a plain enum column, not a self-referential link to whichever record it duplicates — exact domain/name matching only, no fuzzy cross-source dedup yet.
- `lastVerifiedAt` mirrors `BrainFact.lastVerifiedAt` — when a human last confirmed this target is still accurate/relevant; also bumped by `approveTargetCompany()`.

### AI extraction from search results

`src/lib/target-companies/` — turns raw `SearchResult`s (from the [Search Service](#search-service)) into `TargetCompany` rows, mirroring the `product-discovery`/`search-queries` module layout (`constants.ts`/`schema.ts`/`prompt.ts`/`extract.ts`/`service.ts`).

- **`extractTargetCompanies(results, context, productChoices)`** (`extract.ts`) — one Claude call assesses a whole batch of search results at once against our own company profile (from Business Brain facts), returning exactly one assessment per result, in order, so each can be zipped back onto its source URL. For each result the model decides `isRelevantTarget` (excluding directories, news, marketplaces, social profiles, our own site, and known competitors' sites — a competitor isn't a lead), extracts `companyName`/`website`/`industry`/`country` only where actually inferable (empty string rather than a guess), explains its relevance judgment, and picks `matchedProduct` — constrained to an enum of our actual product/service names (plus empty), so it can't invent a product we don't offer. Called through [AI Extraction Service](#ai-extraction-service)'s `extractTargetCompaniesAI()` (mock-or-real). Throws `TargetExtractionError` on refusal/truncation/malformed output, same "main deliverable, don't fail open" posture as `generateSearchQueries`.
- **`discoverAndExtractTargetCompanies(workspaceId, options)`** (`service.ts`) is the end-to-end pipeline: loads every stored `SearchQuery` for the workspace, runs each through `search()`, feeds the results through `extractTargetCompaniesAI`, and **saves only the companies judged relevant** as `PENDING_REVIEW` `TargetCompany` rows. A company matching an existing row (by website domain, or company name if there's no website) is still saved but flagged `DUPLICATE` rather than dropped, so a human reviewing the queue sees repeat discoveries instead of losing a second source silently. A single bad query or failed extraction batch is skipped, not fatal to the whole run — requires an already-built Business Brain (`BrainNotReadyError`) and at least one stored `SearchQuery` (`NoSearchQueriesError`).
- **`approveTargetCompany`/`rejectTargetCompany`/`deleteTargetCompany`** — ownership-checked mutations (`TargetCompanyNotFoundError` if the id isn't in that workspace), same pattern as `product-discovery`.
- `listTargetCompanies(workspaceId)` — plain read helper, same convention as every other module's list function.
- Wired into `/dashboard/customers` and the [Continuous Discovery Job](#continuous-discovery-job).

## Lead Scoring

`src/lib/lead-scoring/` — computes each `TargetCompany`'s `priorityScore` (0-100) and `priorityGrade`, split into a pure compute layer (`scoring.ts`, no DB/network access, directly unit-testable) and a DB-integrated layer (`service.ts`) that assembles context and persists results.

- **8 weighted factors** (`SCORING_WEIGHTS`, summing to 1): product match (20%), industry match (15%), buyer type match (10%), country match (10%), source quality (10%), contact availability (10%), similarity to existing good leads (15%), Business Brain feedback (10%).
  - **Match factors** (product/industry/buyer type/country) compare the target's own field against the workspace's current Business Brain facts: **100** for an exact case-insensitive match, **40** if the target has a value that just doesn't match anything we currently track (still real, specific information — not nothing), **0** if the field is empty.
  - **Source quality** reuses the extraction's own `confidenceScore` (0-1) scaled to 0-100 — a proxy for how clear the source was, since nothing else in this schema captures "quality" separately.
  - **Contact availability** is binary: 100 if `website` is set, 0 if not — the only contact channel this schema currently captures.
  - **Similarity to existing good leads** compares a target against every *other* `TargetCompany` in the workspace already marked `APPROVED` (25 points each for matching industry/buyerType/matchedProduct/country, capped at 100), taking the best match across all references and always excluding the target from its own reference pool. 0 if there are no approved leads yet — nothing to be similar to, not evidence of a bad fit.
  - **Business Brain feedback** looks up `BrainFeedback` rows with `feedbackType` `GOOD_LEAD`/`BAD_LEAD` tied to this target by name (`subjectLabel` — the field added specifically for lead feedback before `TargetCompany` existed). No feedback at all scores a **neutral 50** (genuinely unknown, unlike the 0 given to an objectively-missing match field above); each net positive/negative feedback event shifts the score by 25, clamped to 0-100.
- **Grade thresholds** (`scoreToGrade`): `A+` 85-100, `A` 70-84, `B` 50-69, `C` below 50.
- **`scoreTargetCompany(workspaceId, targetCompanyId)`** scores and persists one target; **`scoreAllTargetCompanies(workspaceId)`** scores every target in a workspace, loading Brain facts/approved-lead references/feedback tallies once and reusing them across the whole batch rather than per row. Requires an existing Business Brain (`BrainNotReadyError`).
- Wired into the continuous discovery job below — every discovery run scores all of a workspace's target companies as its last step, so a newly-discovered company gets a grade immediately.

## Continuous Discovery Job

`src/lib/discovery/` — orchestrates the four discovery modules above into one pipeline, and is what actually makes discovery "continuous" rather than a set of disconnected manual steps.

- **`runDiscoveryForWorkspace(workspaceId, options?)`**: ensures search queries exist (generates them via [AI Search Query Generator](#ai-search-query-generator) if none are stored yet), runs [Target Companies](#target-companies)' `discoverAndExtractTargetCompanies()` against every query (capped at `DISCOVERY_BATCH_SIZE`, default 25), then runs [Lead Scoring](#lead-scoring)'s `scoreAllTargetCompanies()`. Records the run as a `UsageLog` row (`metric: "discovery_run"`) rather than a new model. Never throws for a workspace that isn't ready (no/`INITIALIZING` Business Brain) — comes back `{ skipped: true, reason }` instead, so a scheduled run across many workspaces doesn't abort on the first one that isn't onboarded.
- **`runDiscoveryForAllWorkspaces(options?)`**: runs the above for every workspace with an `ACTIVE`/`STALE` Business Brain, isolating one workspace's failure from the rest.
- **`GET /api/cron/discovery`** — the scheduled trigger, configured in [`vercel.json`](vercel.json) (every 6 hours). Vercel Cron sends a GET request with `CRON_SECRET` as a Bearer token (see [Securing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)); in production a missing/wrong secret is rejected, outside production an unset `CRON_SECRET` allows the route to run unauthenticated so it's exercisable locally without extra setup.
- **`/dashboard/customers`** — the review UI: a `RunDiscoveryButton` (`src/components/discovery/`) for on-demand runs, a table of discovered `TargetCompany` rows (grade, status, duplicate flag), and **Approve**/**Reject**/**Delete** per row (`src/lib/actions/discovery.ts`, gated by `canManageDiscovery()`).

## Billing (Stripe)

`src/lib/billing/` — hosted Stripe Checkout + webhook sync, degrading gracefully without a Stripe account configured (same convention as every other external integration in this app).

- **`getStripeClient()`** (`stripe.ts`) lazily constructs the Stripe SDK client on first use, not at module load, so importing this module (e.g. transitively via the billing page) never crashes the app just because `STRIPE_SECRET_KEY` is unset. `isStripeConfigured()` is the check the UI uses to show a clear "not configured" state instead of a broken button.
- **`createCheckoutSession(workspaceId, planKey, userEmail)`** (`checkout.ts`) creates a Stripe Checkout Session for a plan's `stripePriceId` (a new `Plan` column — null until you set a real Stripe Price id per plan, e.g. via `npx prisma studio`), reusing the workspace's existing Stripe customer if it already has one. Throws `PlanNotCheckoutableError` if the plan has no `stripePriceId` (the UI shows "Contact sales" for these instead of an Upgrade button). Returns the hosted checkout URL; `createCheckoutSessionAction` (`src/lib/actions/billing.ts`) redirects the browser there.
- **`POST /api/webhooks/stripe`** verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET` (Stripe's own local HMAC scheme — no network call, so fully testable without a live account, see `src/app/api/webhooks/stripe/route.test.ts`) before dispatching to `handleStripeEvent()` (`webhook-handlers.ts`): `checkout.session.completed` links the workspace to its Stripe customer/subscription; `customer.subscription.updated`/`.deleted` sync status and billing period.
- **`/dashboard/billing`**: read-only plan catalog + current subscription, plus a real **Upgrade**/**Switch to X** button per plan (`UpgradeButton`, `src/components/billing/`) that starts checkout — shows a clear error if Stripe isn't configured rather than failing silently.
- Not yet verified against a real Stripe account in this environment — see `PROJECT_STATUS.md`.

## Transactional Email

`src/lib/email/` — provider-agnostic email sending, same mock-or-real pattern as [Search Service](#search-service) and [AI Extraction Service](#ai-extraction-service).

- **`sendEmail(input)`** (`service.ts`) dispatches to the Resend provider when `RESEND_API_KEY` is set, otherwise a no-network mock provider that logs the email and records it in an in-memory array (`sentEmails`, read by tests) — so password reset and workspace invites work end-to-end locally without a real key.
- **`resendEmailProvider`** (`providers/resend.ts`) calls Resend's REST API directly via `fetch` (no SDK dependency, since it's one JSON POST) using `RESEND_API_KEY`/`EMAIL_FROM`; throws `EmailSendError` on a non-2xx response or network failure.
- **Password reset** (`requestPasswordReset`/`resetPassword`, `src/lib/actions/auth.ts`): creates a single-use `PasswordResetToken` (1-hour expiry) and emails a `/reset-password?token=` link. Always returns the same generic message regardless of whether the email is registered, to avoid leaking which emails have accounts.
- **Workspace invites** (`inviteMember`/`acceptWorkspaceInvite`, `src/lib/actions/workspace.ts`): creates a `WorkspaceInvite` (7-day expiry, revokes any prior pending invite to the same email first) and emails a `/invite/[token]` accept link. Accepting requires being signed in with the exact invited email; `WorkspaceInvite` is a separate model from `WorkspaceMember` specifically so someone without an account yet can still be invited.

## Platform Admin

`src/lib/platform-admin.ts` + `/platform-admin*` — a read-only, cross-workspace admin area, gated independently of any workspace membership.

- **`isPlatformAdminEmail(email)`** checks the signed-in session's email against the comma-separated `PLATFORM_ADMIN_EMAILS` env var — a **global** check, distinct from the per-workspace `PLATFORM_ADMIN` role in `access-control.ts` (a member can hold that role in one workspace without their email being here, and vice versa). `requirePlatformAdmin()` is the page guard: redirects to `/login` if signed out, `/dashboard` if signed in but not a platform admin.
- **`/platform-admin`** — overview stat cards (workspace/user/subscription/target-company/discovery-run counts). **`/platform-admin/workspaces`** and **`/platform-admin/users`** — the 200 most recent rows of each, read-only.

## Dashboard layout & UI components

- **Shell** (`src/app/dashboard/layout.tsx`): sidebar + topbar, wrapped in a `MobileNavProvider` (`src/components/dashboard/mobile-nav-context.tsx`) so the sidebar can act as a slide-in drawer on mobile (`sm:` breakpoint and below) — a hamburger button in the topbar toggles it, a backdrop and nav-link clicks close it. Route-level `loading.tsx`/`error.tsx` (`src/app/dashboard/`) render `LoadingState`/`ErrorState` for the whole segment.
- **Sidebar nav** (`dashboardNav` in `src/config/site.ts`): Dashboard, Onboarding, Business Brain, Discovery Brain, Customers, Projects, Tender Buyers, Live Tenders, Vendor Registrations, Duplicates, Coverage, Reports, Settings, Billing — the current link highlights via `usePathname()`. **Customers** and **Billing** are real (Phase 4 — see [Continuous Discovery Job](#continuous-discovery-job) and [Billing](#billing-stripe)); Discovery Brain/Projects/Tender Buyers/Live Tenders/Vendor Registrations/Duplicates/Coverage/Reports remain `ComingSoonPage` placeholders (each needs its own data model + extraction pipeline, see `PRODUCT_VISION.md`). Company Profile and Products & Services still exist as full pages, just linked from the dashboard home cards instead of the sidebar.
- **Workspace switcher** and **user menu** (avatar → name/email/workspace/role, settings link, logout) live in `src/components/dashboard/`. The user menu closes on outside click or Escape.
- **Dashboard home**: empty-state cards (Team, Market Signals, Reports, Getting Started) using the `Card` primitive — no business data yet, but `Team` shows a real member count since it's a free query.
- **Reusable primitives** (`src/components/ui/`): `Button`, `Input`, `Textarea`, `Label`, `Select`, `Badge`, `Card`, `Table` (+ `FieldError` for form errors), plus `Dialog`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` (controlled modal, portal-rendered, closes on Escape/backdrop click — no Radix/shadcn dependency, see below), `LoadingState`/`Spinner`, `EmptyState`, `ErrorState`, `PageHeader`, and `StatCard` — built on `class-variance-authority` for variants and a `cn()` helper (`clsx` + `tailwind-merge`) in `src/lib/cn.ts`. Every form and table in the app (login, signup, forgot-password, create/rename workspace, invite member, members table, company profile) uses these instead of ad-hoc styling.
  - `Table`'s wrapper uses `overflow-x-auto` (not `overflow-hidden`) so extra columns scroll horizontally on narrow screens instead of being clipped.
  - No component library (shadcn/ui, Radix, etc.) is installed — `src/components/ui/` is hand-rolled but follows shadcn-like conventions (`cva` variants, `cn()` merge, `forwardRef`). Install shadcn/ui explicitly before assuming its CLI/primitives are available.

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
   | AI providers | `ANTHROPIC_API_KEY`, `ENABLE_MOCK_AI` | Website-analysis extraction, product discovery, [AI Business Brain](#ai-business-brain) synthesis, competitor identification — get a key at [platform.claude.com](https://platform.claude.com). `ENABLE_MOCK_AI` forces [AI Extraction Service](#ai-extraction-service)'s deterministic mock path (also engages automatically without a key) |
   | Search providers | `SEARCH_PROVIDER`, `TAVILY_API_KEY`, `EXA_API_KEY`, `BING_SEARCH_API_KEY`, `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`, `ENABLE_MOCK_SEARCH` | [Search Service](#search-service) — defaults to the no-key `MOCK` provider if unset. `ENABLE_MOCK_SEARCH` is reserved, not wired in yet |
   | Stripe | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (unused — see [Billing](#billing-stripe)), `STRIPE_WEBHOOK_SECRET` | [Billing](#billing-stripe) checkout + webhook sync — billing page/webhook route degrade gracefully without these set |
   | Email | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | [Transactional email](#transactional-email) (password reset, invitations) — falls back to a mock provider (logs instead of sending) without `RESEND_API_KEY` |
   | Storage | `BLOB_READ_WRITE_TOKEN` | File uploads — reserved, not wired yet |
   | Queue/Cron | `CRON_SECRET` | Authenticates `GET /api/cron/discovery` ([Continuous Discovery Job](#continuous-discovery-job)) in production; unauthenticated access is allowed outside production so it's exercisable locally |
   | Global discovery | `DISCOVERY_BATCH_SIZE` | Max search queries the [Continuous Discovery Job](#continuous-discovery-job) runs per workspace per pass (default 25) |
   | Platform admin | `PLATFORM_ADMIN_EMAILS` | Grants access to [`/platform-admin`](#platform-admin) — comma-separated emails, checked against the session |
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
  seed.ts              Seeds system roles + the 6 plans
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
      billing/            /dashboard/billing — read-only Plan/Subscription view, no Stripe checkout
      discovery-brain/, customers/, projects/, tender-buyers/, live-tenders/,
      vendor-registrations/, duplicates/, coverage/, reports/   Sidebar sections
                          not built yet — each is a one-line ComingSoonPage
      loading.tsx, error.tsx   Route-segment loading/error states for the whole dashboard
    onboarding/
      layout.tsx         Onboarding shell (logo, logout, centered content)
      page.tsx           Redirects to the workspace's current step
      website/, email/, countries/, customer-types/, start/   One folder per step
      review-profile/    Step 6 — company profile review (edit, approve, regenerate, continue)
      review-products/   Step 7 — product/service review (edit, approve, reject, delete, finish)
  components/
    landing/             Landing page sections
    dashboard/            Sidebar (active-route highlighting), topbar, workspace switcher, user
                          menu, mobile nav context, ComingSoonPage (shared placeholder-page shell)
    onboarding/           Step progress indicator
    company-profile/      CompanyProfileForm/ApproveButton/RegenerateButton — shared by dashboard + onboarding
    product-discovery/    ProductServiceCard/RegenerateButton/AddProductServiceDialog — shared by dashboard + onboarding
    business-brain/       FactRow — value, confidence, source URL, last verified date, verification buttons
    ui/                   Reusable primitives: Button, Input, Textarea, Label, Select, Checkbox, Badge,
                          Card, Table, FieldError, Dialog, LoadingState/Spinner, EmptyState, ErrorState,
                          PageHeader, StatCard
  config/
    site.ts              Site name, nav links, dashboard nav
    onboarding.ts         Target country / customer type options, step order
  lib/
    cn.ts                clsx + tailwind-merge helper
    prisma.ts            Prisma client singleton (uses driver adapter)
    slug.ts              Workspace slug generation/uniqueness
    access-control.ts     Role constants + permission predicates (PLATFORM_ADMIN bypass) + requireRole guard
    access-control.test.ts  Vitest — role-helper unit tests
    workspace.ts          Active-workspace resolution, workspace creation
    workspace.test.ts      Vitest — workspace creation, user isolation, protected-route primitives (integration, real DB)
    onboarding.ts          Onboarding step guard, get-or-create, completion + status check (getOnboardingStatus)
    website-analysis.ts    DB-integrated analysis service (create/update WebsiteAnalysis, rate limit, triggers page-snapshot storage)
    website-analyzer/      SSRF guard, robots.txt check, safe fetch, HTML parse, page classifier, page-snapshot storage
      analyze.test.ts        Vitest — analyzer fallback behavior + classifyLinks (no network)
    ai-extraction/         Mock-or-real AI extraction dispatcher (isMockAIEnabled), deterministic mock extractors, Zod validation
      mock.test.ts           Vitest — isMockAIEnabled branches + mock extractor determinism/shape
    company-profile/       AI extraction (Claude, structured outputs) + DB-integrated service — called via ai-extraction/
    product-discovery/     Reads stored page snapshots + AI extraction (Claude, structured outputs) + DB-integrated service — called via ai-extraction/
      service.test.ts        Vitest — product/service approval flow (integration, real DB)
    business-brain/        buildInitialBrain() — synthesizes profile/products/countries into facts + entities + relationships; getBusinessBrain/listBrainFacts/markFactVerification
    actions/auth.ts        Server actions: signup, login, logout, requestPasswordReset
    actions/workspace.ts   Server actions: createWorkspace, switchWorkspace, renameWorkspace, inviteMember
    actions/onboarding.ts  Server actions: one save action per step, startAnalysis, completeOnboarding
    actions/onboarding.test.ts  Vitest — onboarding save flow (integration, real DB)
    actions/company-profile.ts  Server actions: regenerate, update, approve
    actions/product-discovery.ts  Server actions: regenerate, update, approve, reject, delete, create (manual add)
    actions/business-brain.ts  Server action: markFactVerificationAction
    validations/auth.ts    Zod schemas for signup/login forms
    validations/workspace.ts  Zod schemas for workspace name / invite forms
    validations/onboarding.ts Zod schemas for each onboarding step (URL normalization, optional countries/customer types)
    validations/onboarding.test.ts  Vitest — URL normalization + optional-field acceptance
    validations/shared.ts  Shared `toList()` comma-separated-input helper
    validations/company-profile.ts Zod schema for the profile edit form
    validations/product-service.ts Zod schema for the product/service edit form
  types/next-auth.d.ts   Session/JWT type augmentation (id)
  generated/
    prisma/               Generated Prisma client (gitignored, not committed)
scripts/
  check-workspace-scoping.mjs   Fails if a model is missing workspaceId
vitest.config.ts          Vitest config — @ alias, node environment, server-only stub
vitest.setup.ts            Loads .env via dotenv/config before tests run
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

   This upserts the system roles (`OWNER`, `ADMIN`, `MANAGER`, `USER`, `VIEWER`, `PLATFORM_ADMIN`) and the 6 plans (Free Trial, Starter, Professional, Business, Growth, Enterprise) — safe to re-run. The `OWNER` role must exist before anyone can sign up.

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
| `npm test`           | Run the Vitest suite once        |
| `npm run test:watch` | Run Vitest in watch mode          |
| `npx prisma generate` | Regenerate the Prisma client   |
| `npx prisma migrate dev` | Create/apply a migration (dev) |
| `npx prisma migrate deploy` | Apply existing migrations (CI/prod) |
| `npx prisma db seed` | Seed the role and plan catalogs |

## Testing

[Vitest](https://vitest.dev), two suites (`npm test` runs both):

- **Lib/integration** (`vitest.config.ts`, `vitest.setup.ts`, node environment, real Postgres, `src/**/*.test.ts`) — pure logic and DB-integrated library code, 22 files / 146 tests + 1 skipped. Notable files: `access-control.test.ts` (role helpers), `workspace.test.ts`/`actions/onboarding.test.ts` (protected routes, onboarding save flow), `validations/onboarding.test.ts` (URL normalization, optional fields), `website-analyzer/analyze.test.ts` (SSRF-rejection fallback), `ai-extraction/mock.test.ts` (mock extractor determinism/validity), `product-discovery/service.test.ts`, `business-brain/service.test.ts`, `search-queries/service.test.ts`, `target-companies/service.test.ts`, `lead-scoring/{scoring,service}.test.ts`, `discovery/service.test.ts` (the full continuous-discovery pipeline end-to-end), `email/service.test.ts` (mock provider + Resend provider with `fetch` mocked), `billing/webhook-handlers.test.ts` + `api/webhooks/stripe/route.test.ts` (real Stripe signature verification via `Stripe.webhooks.generateTestHeaderString` — genuine HMAC, no live account needed), `platform-admin.test.ts`. Runs test **files** sequentially (`fileParallelism: false`) since some (`discovery/service.test.ts`) scan across all workspaces, not just their own fixtures.
  - `ai-extraction/live-anthropic.test.ts` is the one exception: gated behind `describe.skipIf(!process.env.ANTHROPIC_API_KEY)`, it's the only test that makes a real external network call. Skipped here (no key); set `ANTHROPIC_API_KEY` and re-run to verify the real Claude integration — see `PROJECT_STATUS.md`.
- **Component** (`vitest.component.config.ts`, `vitest.component.setup.ts`, jsdom + [React Testing Library](https://testing-library.com/react), `src/**/*.test.tsx`) — 4 files / 17 tests: `Dialog` (open/close/Escape/backdrop), `EmptyState`, `ProductServiceCard` (rendering + approve/reject wired to mocked server actions), `RunDiscoveryButton` (success/error states).

Lib/integration tests require a real `DATABASE_URL` (loaded via `dotenv/config` in `vitest.setup.ts`, same `.env` as `npm run dev`) — they talk to Postgres directly, no mocked Prisma.

```bash
npm test               # Vitest — both suites (163 tests, 1 skipped)
npm run test:lib        # Lib/integration suite only
npm run test:components # Component suite only
npm run lint          # ESLint
npx tsc --noEmit       # Type-check
npm run check:schema   # Every model has workspaceId
npm run build          # Production build (also type-checks)
```

## Notes

- Prisma 7 no longer reads `datasource.url` from `schema.prisma` — the connection is configured via the `@prisma/adapter-pg` driver adapter in [`src/lib/prisma.ts`](src/lib/prisma.ts), and via `prisma.config.ts` for the CLI (migrations, `prisma studio`, etc).
- `src/generated/prisma` is generated output and is gitignored — run `npx prisma generate` after cloning or whenever `schema.prisma` changes.
- `import "server-only"` (used throughout `src/lib/`) needs the `server-only` package installed as a real dependency — Next.js's bundler special-cases it at build time, but plain Node/`tsx` won't resolve it otherwise.
- No `ANTHROPIC_API_KEY` is configured in this environment, so [AI Extraction Service](#ai-extraction-service) runs its mock path by default — verified end-to-end live (signup → website/email/countries/customer-types steps → real website analysis against `https://example.com` → page snapshot storage → mock company-profile generation with onboarding fields correctly denormalized → dashboard rendering the onboarding-complete badge and profile summary) plus the DB-level create/update/approve/reject/delete/regenerate-preserves-approved logic for both `company-profile` and `product-discovery`. The real (non-mock) Claude call paths in `extract.ts` for both modules are unchanged from before and still untested against a live API call — set a real key in `.env` locally and in Vercel's env vars before relying on them in production.
- `buildInitialBrain()` (`src/lib/business-brain/service.ts`) was verified end-to-end through the real running app (seeded an approved profile + mixed-status products, ran onboarding's Finish step, confirmed the fact/entity/relationship counts and dedup by querying the DB directly) — but without `ANTHROPIC_API_KEY`, `identifyCompetitors()` fails open and every brain built so far has zero competitors. That's by design (fail-open, not a required step) but means the competitor path itself hasn't been exercised against a real response.
- The `/dashboard/business-brain` review page was verified live in the browser (seeded a full fact set including a competitor, marked facts Correct/Incorrect and confirmed the badge/button state updates and persists on reload) at mobile, tablet-width, and desktop viewports — the fact-row layout deliberately stacks unconditionally (value, then metadata, then status/buttons) rather than switching to a side-by-side row at a breakpoint, since the sidebar's width means the usable content column is narrower than the raw viewport width would suggest.

> **Note on this README:** everything above this point (Prisma/PostgreSQL setup, `prisma/schema.prisma`, `npx prisma migrate/generate/db seed`) describes an earlier version of this app. The project has since migrated to **MongoDB/Mongoose** and grown substantially (Discovery Brain, Contacts CRM, Public Contact Discovery, deduplication engine, and the SaaS billing/admin/security layer below) — the sections above are stale and kept for historical context rather than rewritten wholesale. The section below is current and is the one to follow for local setup, deployment, and the production checklist.

## SaaS Launch Setup (current)

### Local setup (MongoDB)

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up MongoDB and configure environment variables**

   Copy `.env.example` to `.env` and fill in real values (see [Environment Setup](#environment-setup) above for the full variable reference — the Stripe/rate-limiting/platform-admin variables described below were added in Phase 12). At minimum you need `MONGODB_URI`, `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL` — the app won't start without them (`src/lib/env.ts`).

   - **Local dev**: install MongoDB Community Server and use `MONGODB_URI="mongodb://localhost:27017/ai_market_intelligence_os"` as-is.
   - **Production**: use a MongoDB Atlas connection string instead.

   No migration step is needed — Mongoose schemas apply themselves on first write; there's no schema file to `generate`/`deploy` the way Prisma required.

3. **Seed reference data (roles + subscription plans)**

   ```bash
   npm run seed
   ```

   Upserts the system roles (`OWNER`, `ADMIN`, `MANAGER`, `USER`, `VIEWER`, `PLATFORM_ADMIN`) and the 6 subscription plans (Free Trial, Starter, Professional, Business, Growth, Enterprise) with their `usageLimits` — safe to re-run. The `OWNER` role and `FREE_TRIAL` plan must exist before anyone can sign up: `createWorkspaceWithOwner()` (`src/lib/workspace.ts`) throws if the `OWNER` role is missing, and silently skips auto-creating a trial `Subscription` if the `FREE_TRIAL` plan isn't seeded yet (fails open, not a hard error — see [Billing & Usage Limits](#billing--usage-limits-phase-12) below).

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) for the landing page and [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the dashboard shell.

### Running tests

```bash
npm test               # Vitest — full suite, real MongoDB, no live external API calls
npm run lint            # ESLint
npx tsc --noEmit        # Type-check
npm run check:schema    # Every model has workspaceId + advisory query-scoping scan
npm run build            # Production build (also type-checks)
```

The test suite never calls a real AI provider, search provider, or Stripe by default — see [Mock mode](#mock-mode) below. A handful of tests are explicitly gated behind live-API opt-in env vars (`RUN_LIVE_AI_TESTS`, `RUN_LIVE_STRIPE_TESTS`) and are skipped unless you set them.

### Mock mode

Every external integration in this app degrades gracefully without a real key configured — this is a deliberate, consistent convention, not a Phase 12 addition:

| Integration | Mock trigger | Real trigger |
| --- | --- | --- |
| AI extraction (Anthropic) | `ENABLE_MOCK_AI=true`, or automatically whenever `ANTHROPIC_API_KEY` is unset | `ANTHROPIC_API_KEY` set, `ENABLE_MOCK_AI` unset/false |
| Search | `ENABLE_MOCK_SEARCH=true`, or automatically whenever `SEARCH_PROVIDER`'s key is missing (outside production) | `SEARCH_PROVIDER` set to a configured provider with its key present |
| Billing (Stripe) | No `STRIPE_SECRET_KEY` — every new workspace gets a `billingProvider: "MOCK"` trial `Subscription`; usage limits are still enforced against the seeded Plan, but no payment is collected and Upgrade/Portal/Cancel show a clear "not configured" message | `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET` for webhook sync) set |
| Email (Resend) | No `RESEND_API_KEY` — `sendEmail()` logs instead of sending | `RESEND_API_KEY` set |
| Rate limiting | Always bypassed outside `NODE_ENV=production` unless `RATE_LIMIT_ENABLED=true` | `NODE_ENV=production`, or `RATE_LIMIT_ENABLED=true` explicitly |

Nothing above ever blocks local development or the test suite from working end-to-end.

### Vercel deployment

1. Import the repo into Vercel and set every **required** env var (`MONGODB_URI` pointing at an Atlas cluster, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` set to the real deployment URL) plus whichever optional integrations you want live (Stripe, Anthropic, a real search provider, Resend).
2. Run `npm run seed` once against the production database (e.g. via a one-off local run pointed at the Atlas `MONGODB_URI`, or a Vercel deploy hook) before onboarding any real users — sign-up fails without the seeded `OWNER` role.
3. `src/instrumentation.ts` validates required env vars on server start; Vercel's per-request import path is additionally gated in `src/lib/mongodb.ts` (see `PROJECT_STATUS.md` for why both checks exist).

#### Stripe webhook setup

1. In the Stripe dashboard, add an endpoint pointing at `https://<your-domain>/api/webhooks/stripe`, subscribed to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
2. Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`. Without it, `POST /api/webhooks/stripe` returns 500 rather than accepting unverified events (`src/app/api/webhooks/stripe/route.ts`).
3. Set each `Plan.stripePriceId`/`stripeYearlyPriceId` you want self-serve checkout for to a real Stripe Price id — plans without one show "Contact sales" instead of an Upgrade button (`src/lib/billing/checkout.ts`).
4. Test locally with the Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

#### Cron setup

Two cron-ready routes exist but aren't wired into `vercel.json`'s `crons` yet: `GET /api/cron/discovery` (older continuous target-company discovery) and `GET /api/cron/discovery-run` (the Discovery Brain's daily Search Execution Engine batch). Add them to `vercel.json` when you're ready to automate discovery, and set `CRON_SECRET` — in production a missing/wrong `Authorization: Bearer <CRON_SECRET>` header is rejected; outside production the routes run unauthenticated so they're exercisable locally.

### Production checklist

- [ ] `MONGODB_URI` points at a production Atlas cluster (not the local/dev instance)
- [ ] `AUTH_SECRET` is a real random value, not the placeholder
- [ ] `NEXT_PUBLIC_APP_URL` matches the real deployment domain (used in checkout/portal/webhook-invite links)
- [ ] `npm run seed` has been run against the production database at least once
- [ ] `PLATFORM_ADMIN_EMAILS` is set to the real platform team's emails, not left empty
- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are set (or intentionally left unset for a mock-billing soft launch)
- [ ] Each `Plan` you want self-serve checkout for has a real `stripePriceId` (and `stripeYearlyPriceId` if offering annual billing)
- [ ] `ANTHROPIC_API_KEY` is set if AI extraction should run for real, not mock
- [ ] `SEARCH_PROVIDER` + its API key are set if discovery should hit a real search API, not mock
- [ ] `RESEND_API_KEY` + `EMAIL_FROM` are set so password reset/invite emails actually send
- [ ] `RATE_LIMIT_ENABLED` — leave unset (defaults on in production) unless you have a specific reason to disable it
- [ ] `RUN_LIVE_AI_TESTS`/`RUN_LIVE_STRIPE_TESTS` are **not** set in CI/normal test runs — they're opt-in only, for manually verifying live integrations
- [ ] `npm run check:schema` passes (workspace-scoping schema check, plus review the advisory query-scoping output)
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass

## Billing & Usage Limits (Phase 12)

`src/lib/billing/usage.ts` — plan-limit enforcement on top of the `Plan`/`Subscription` models described above, added to prepare the app for commercial launch.

- **Two kinds of limit**: "record count" limits (customers/projects/tender buyers/live tenders/vendor registrations/contacts/products-services) are checked by counting the live collection directly — no separate counter to keep in sync. "Monthly flow" limits (discovery credits, exports, email drafts, AI extraction calls, contact discovery searches, raw search results) are metered via `UsageLog` rows summed within the current billing/trial period, logged via `incrementUsage()`.
- **Fails open**: every check treats a missing `Subscription`/`Plan`, or a `-1`/unset limit, as unlimited — this is what "safe mock billing mode" means in practice; a workspace is never blocked unless a real Plan with a real numeric limit is seeded and linked.
- **Enforced at**: discovery run batch sizing (`src/lib/discovery-brain/executor.ts` — discovery credits cap how many queued searches a batch runs, not whether it runs at all), the 4 raw-result processors (customers/projects/tenders/vendor-registrations — batch-level, checked once per call rather than per record), `createContact`, all 20 CSV export routes (`src/lib/export/guard.ts`), member invites (seat limit, `src/lib/actions/workspace.ts`), and generated email drafts.
- **`/dashboard/billing`** shows the current plan, subscription status, trial/billing-cycle dates, a mock-billing-mode notice, usage meters per metric, and (when Stripe is configured) Upgrade/Billing-Portal/Cancel-subscription actions. **`/dashboard/usage`** shows the same usage data broken out by category with the monthly reset date and recent activity.
- **`src/lib/rate-limit.ts`** — a separate, simpler in-memory limiter (not plan-based) applied to the same handful of expensive actions plus billing checkout creation, to blunt runaway/scripted abuse independent of plan limits.
- **`src/lib/auth/permissions.ts`** — a named-permission facade (`view_dashboard`/`run_discovery`/`process_extraction`/`manage_records`/`export_data`/`manage_contacts`/`manage_billing`/`manage_workspace`/`view_admin`) over the existing role checks in `access-control.ts`, for call sites that prefer asking "can this role do X" by name.
- **`/platform-admin`** was extended with read-only Subscriptions, Usage, Discovery Runs, Search Errors, API Cost Logs, Duplicate Statistics, Export Logs, and System Health sections (all still under the existing `/platform-admin` route rather than a new `/dashboard/admin` — see `PROJECT_STATUS.md` for why).
