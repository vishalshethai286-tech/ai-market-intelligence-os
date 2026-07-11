# Product Vision

**Global Business Discovery AI** helps a company understand its own products and services, then runs continuous global discovery from public online sources to surface target customers, projects, tenders, and vendor-registration opportunities worth pursuing.

This document describes the intended end-state product. For what's actually built today, see [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

**Positioning note:** the product performs continuous global discovery from public online sources. It does not claim to guarantee finding every company in the world, or to find them instantly — coverage grows over time as discovery runs accumulate, and is bounded by what's publicly discoverable online. This distinction should hold everywhere the product is described: marketing copy, onboarding, in-app messaging, and the coverage dashboard itself.

## 1. Website-first onboarding

The user's only required input to get started is their company website URL. Onboarding walks them through: fetching and analyzing the site, confirming target countries and customer types, reviewing the AI-extracted company profile, and reviewing the AI-discovered product/service catalog — before anything is "finished." The goal is a working Business Brain with minimal manual data entry, with the user reviewing and correcting AI output rather than filling out forms from scratch.

*Status: built* — `src/app/onboarding/*`, `src/lib/website-analyzer/*`.

## 2. Product and service intelligence

The AI reads the company's website (and, over time, other public sources) to identify what the company actually sells: products, services, industries served, business model, operating regions, certifications. This is the raw material every downstream discovery feature reasons about — a company can't be matched to the right customers, tenders, or vendor programs until the system knows what it's selling.

*Status: built* — `src/lib/company-profile/*`, `src/lib/product-discovery/*`.

## 3. AI Business Brain

A structured, per-workspace knowledge base synthesized from the company profile and product catalog: facts (with confidence scores and source attribution), entities, and relationships. The Brain is not a one-time snapshot — it accepts user feedback (confirm/correct a fact) and can be refreshed as new information is discovered, so it improves the longer a workspace uses the product.

*Status: built* — `src/lib/business-brain/*`, `/dashboard/business-brain`.

## 4. AI Discovery Brain

Given the Business Brain, the system generates candidate search queries designed to surface real-world opportunities matching what the company sells and where it operates — the bridge between "what we know about this company" and "what to go search for."

*Status: built (query generation only)* — `src/lib/search-queries/*`. The queries are generated; running them on a schedule and processing results into new opportunities continuously is not yet built (see §5–8, `PROJECT_STATUS.md` recommended build order).

## 5. Global customer discovery

Searching public online sources for companies and buyers who plausibly need what this workspace sells — filtered by target countries and customer types set during onboarding — and extracting them into a reviewable list of target companies with enough context (industry, likely buyer type, matched product) to judge fit at a glance.

*Status: partially built* — `src/lib/target-companies/*` extracts target companies from search results and stores them (`TargetCompany` model) with AI lead scoring (`src/lib/lead-scoring/*`, in progress/uncommitted). This runs on-demand today; the "continuous" part (§9) is not yet built.

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

*Status: not built.* This underpins "continuous" discovery — without it, repeated discovery runs produce noise instead of a growing, trustworthy opportunity list.

## 10. Coverage dashboard

A view answering "what has the system actually searched, and what has it found, so far?" — broken down by country, sector, and opportunity type (customers/projects/tenders/vendor programs). This is the mechanism for honoring the product's positioning: the system doesn't claim complete global coverage, so it needs to show users what has been covered to date and what's still pending, rather than leaving coverage as an implicit, unverifiable claim.

*Status: not built.*

## 11. Reports and exports

Turning discovered opportunities into shareable outputs — PDF/CSV exports, and periodic summary reports (e.g. "this week's new opportunities") — for users who need to hand results to a sales team or report upward, not just browse them in-app.

*Status: not built.* No storage integration exists yet (`BLOB_READ_WRITE_TOKEN` reserved, unused).

## 12. SaaS subscription model

Multi-tenant workspaces with role-based access (already built — six roles: Owner, Admin, Manager, User, Viewer, plus an internal Platform Admin override), gated by subscription plans (schema already models `Plan`/`Subscription`/`UsageLog` for metering feature usage against plan limits — e.g. discovery runs per month, seats per workspace). Billing itself (checkout, webhooks, plan enforcement at the point of use) is not yet wired to a payment provider.

*Status: schema + read-only UI built, checkout not built* — `Plan` (6 plans, including Growth), `Subscription`, `UsageLog`, `ApiCostLog` models exist; `/dashboard/billing` shows the plan catalog and current subscription read-only; no Stripe SDK dependency or webhook handler yet despite `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` being reserved in `.env.example`.

---

## How these fit together

Onboarding (§1) produces product intelligence (§2), which is synthesized into the Business Brain (§3). The Discovery Brain (§4) turns that into search queries, which continuous discovery (§5–8) executes against public sources. Deduplication (§9) keeps the resulting opportunity list clean as discovery repeats over time, the coverage dashboard (§10) makes the boundaries of that coverage legible to the user, and reports (§11) get the results out of the app and into the hands of whoever needs to act on them. Subscription plans (§12) meter and gate access to all of the above.
