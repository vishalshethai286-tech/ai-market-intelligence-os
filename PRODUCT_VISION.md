# Product Vision

**Global Business Discovery AI** helps a company understand its own products and services, then runs continuous global discovery from public online sources to surface target customers, projects, tenders, and vendor-registration opportunities worth pursuing.

This document describes the intended end-state product. For what's actually built today, see [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

**Positioning note:** the product performs continuous global discovery from public online sources. It does not claim to guarantee finding every company in the world, or to find them instantly — coverage grows over time as discovery runs accumulate, and is bounded by what's publicly discoverable online. This distinction should hold everywhere the product is described: marketing copy, onboarding, in-app messaging, and the coverage dashboard itself.

## 1. Website-first onboarding

The user's only required inputs are their company website and work email — target countries and preferred customer types are optional (a "Worldwide" toggle covers the common case of not wanting to restrict by country). Onboarding walks them through: fetching and analyzing the site, optionally narrowing target countries/customer types, reviewing the AI-extracted company profile, and reviewing the AI-discovered product/service catalog (with the option to add entries manually) — before anything is "finished." The goal is a working Business Brain with minimal manual data entry, with the user reviewing and correcting AI output rather than filling out forms from scratch.

*Status: built* — `src/app/onboarding/*`, `src/lib/website-analyzer/*`. AI extraction runs through `src/lib/ai-extraction`, which falls back to deterministic mock extraction when no `ANTHROPIC_API_KEY` is configured, so onboarding always completes end-to-end even without a real AI key.

## 2. Product and service intelligence

The AI reads the company's website (and, over time, other public sources) to identify what the company actually sells: products, services, industries served, business model, operating regions, certifications. Each catalog entry also carries synonyms, related items, and search-oriented keyword lists for finding projects, tenders, and vendor-registration programs — the raw material every downstream discovery feature (§5-8 below) reasons about. A company can't be matched to the right customers, tenders, or vendor programs until the system knows what it's selling and what to search for.

*Status: built* — `src/lib/company-profile/*`, `src/lib/product-discovery/*`, `src/lib/ai-extraction/*`. The project/tender/vendor-registration keyword lists are extracted and stored but not yet consumed by anything — that's §5-8 below.

## 3. AI Business Brain

A structured, per-workspace knowledge base synthesized from the company profile and product catalog: facts (with confidence scores and source attribution), entities, and relationships. The Brain is not a one-time snapshot — it accepts user feedback (confirm/correct a fact) and can be refreshed as new information is discovered, so it improves the longer a workspace uses the product.

*Status: built* — `src/lib/business-brain/*`, `/dashboard/business-brain`.

## 4. AI Discovery Brain

Given the Business Brain, the system generates candidate search queries designed to surface real-world opportunities matching what the company sells and where it operates — the bridge between "what we know about this company" and "what to go search for."

*Status: built (query generation only)* — `src/lib/search-queries/*`. The queries are generated; running them on a schedule and processing results into new opportunities continuously is not yet built (see §5–8, `PROJECT_STATUS.md` recommended build order).

## 5. Global customer discovery

Searching public online sources for companies and buyers who plausibly need what this workspace sells — filtered by target countries and customer types set during onboarding — and extracting them into a reviewable list of target companies with enough context (industry, likely buyer type, matched product) to judge fit at a glance.

*Status: built, including the continuous part* — `src/lib/target-companies/*` extracts target companies from search results and stores them (`TargetCompany` model) with AI lead scoring (`src/lib/lead-scoring/*`). `src/lib/discovery/service.ts` orchestrates the full pipeline (Business Brain → search queries → search → target companies → scoring) and runs it automatically via `GET /api/cron/discovery` on a schedule (`vercel.json`, every 6h) as well as on-demand from `/dashboard/customers`'s **Run discovery now** button — this is the "continuous global discovery from public online sources" promise for the customer-discovery pillar specifically. §6-8 (projects/tenders/vendor registrations) still need their own pipelines.

## 6. Global project discovery

Beyond company-level leads: identifying specific active or upcoming projects (construction, infrastructure, industrial, etc.) from public sources where the workspace's products/services would plausibly be needed, so sales teams can engage a live opportunity rather than cold-approach a company in the abstract.

*Status: not built.*

## 7. Global tender discovery

Surfacing public tenders and RFPs — government and private-sector procurement notices worldwide — that match the workspace's products/services and target countries, with enough detail (issuing body, deadline, scope, source link) for a user to decide whether to pursue it.

*Status: not built.*

## 8. Vendor registration discovery

Identifying vendor/supplier registration portals and pre-qualification programs (government procurement portals, large-buyer vendor programs, industry marketplaces) relevant to the workspace's countries and industries, so the company can get itself listed as an eligible vendor ahead of future tenders — a proactive complement to reactive tender discovery.

*Status: not built.*

## 9. Continuous deduplication

As discovery runs repeatedly across customers, projects, tenders, and vendor programs, the same opportunity will surface multiple times (same company from different searches, same tender from different source sites). The system deduplicates across runs and sources so users see one entry per real-world opportunity, with source provenance preserved rather than discarded, and merges/updates existing entries with new information instead of creating duplicates.

*Status: partially built* — `discoverAndExtractTargetCompanies()` flags a repeat company as `DUPLICATE` (by website domain, or name if no website) rather than dropping it, so repeated discovery runs don't silently multiply the same lead. This is exact-match only, no fuzzy matching across sources yet, and there's no dedicated review UI for duplicates (`/dashboard/duplicates` is still a placeholder) — the flag exists on `TargetCompany` today but isn't surfaced for action.

## 10. Coverage dashboard

A view answering "what has the system actually searched, and what has it found, so far?" — broken down by country, sector, and opportunity type (customers/projects/tenders/vendor programs). This is the mechanism for honoring the product's positioning: the system doesn't claim complete global coverage, so it needs to show users what has been covered to date and what's still pending, rather than leaving coverage as an implicit, unverifiable claim.

*Status: not built.*

## 11. Reports and exports

Turning discovered opportunities into shareable outputs — PDF/CSV exports, and periodic summary reports (e.g. "this week's new opportunities") — for users who need to hand results to a sales team or report upward, not just browse them in-app.

*Status: not built.* No storage integration exists yet (`BLOB_READ_WRITE_TOKEN` reserved, unused).

## 12. SaaS subscription model

Multi-tenant workspaces with role-based access (built — six roles: Owner, Admin, Manager, User, Viewer, plus an internal Platform Admin override — plus a global `PLATFORM_ADMIN_EMAILS`-gated `/platform-admin` area, independent of any workspace, for cross-workspace oversight), gated by subscription plans (`Plan`/`Subscription`/`UsageLog` model metering — e.g. discovery runs per month via the new `discovery_run` usage metric, seats per workspace). Billing checkout and webhook sync are wired to Stripe.

*Status: built* — `Plan` (6 plans, including Growth) now carries `stripePriceId`; `/dashboard/billing` shows the plan catalog, current subscription, and real **Upgrade**/**Switch to X** buttons that start a Stripe Checkout session (`src/lib/billing/checkout.ts`); `POST /api/webhooks/stripe` (`src/lib/billing/webhook-handlers.ts`) verifies the webhook signature and syncs `Subscription` status/period from Stripe. Not yet live-verified against a real Stripe account in this environment (no `STRIPE_SECRET_KEY` here, and seeded plans have no real Stripe Price id) — the integration code is complete and tested (signature verification genuinely tested via Stripe's local HMAC test helper; DB sync logic tested against constructed events), but needs a real account to confirm end-to-end. Plan enforcement at the point of use (blocking a feature once a usage limit is hit) still isn't built.

---

## How these fit together

Onboarding (§1) produces product intelligence (§2), which is synthesized into the Business Brain (§3). The Discovery Brain (§4) turns that into search queries, which continuous discovery (§5–8) executes against public sources. Deduplication (§9) keeps the resulting opportunity list clean as discovery repeats over time, the coverage dashboard (§10) makes the boundaries of that coverage legible to the user, and reports (§11) get the results out of the app and into the hands of whoever needs to act on them. Subscription plans (§12) meter and gate access to all of the above.
