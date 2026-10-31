# Ekklesphere Creator Console & Platform Security Overhaul

Transform Ekklesphere's browser-only licensing prototype into a real, server-enforced, multi-tenant **Creator Console** (`/console`) backed exclusively by Supabase Postgres and Supabase Auth—starting with a comprehensive Phase 0 security remediation before introducing licensing, aggregate usage telemetry, and platform governance.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Architectural Decisions (from Phase 1 Clarification)**
> All four core architectural choices have been confirmed and govern the implementation sequence below:
> - **Identity & Creator Authorization**: Consolidate web sign-in onto **Supabase Auth** (Google OAuth + email/password) alongside the Android geofence client. Platform owner authorization relies strictly on `app_metadata.creator === true`, provisioned only via a server-side bootstrap utility or an existing creator—never via user-editable profile metadata or hardcoded email lists.
> - **Fail-Closed Licensing Policy**: Newly onboarded organisations automatically receive a **14-day Trial** license (`grace_starter` defaults unless overridden). Paid or trial licenses entering expiration transition into a **7-day Grace Period** (`grace_period` status with warning banners in the admin UI), after which tenant operational writes and premium endpoints fail closed (`HTTP 402/403`) with structured error codes. Missing or revoked licenses block access immediately—no synthetic active license is ever fabricated on error.
> - **Nightly Rollup & Alert Execution**: Implement an idempotent Postgres rollup routine invoked by **both** a scheduled Supabase `pg_cron` job and an authenticated Vercel Cron webhook (`Authorization: Bearer <CRON_SECRET>`) so daily usage aggregates and proactive alerts stay current across all hosting topologies.
> - **Tenant Schema Unification & Legacy Lockdown**: Retire the duplicate `tenants` model into `organizations` via a safe, re-runnable SQL migration equipped with an explicit **dry-run verification mode**, point `licenses.organization_id` at `organizations`, and lock down legacy client-side Firestore rules while removing all hardcoded personal email addresses.

> [!NOTE]
> **Key Engineering Assumptions (Please flag if you want any adjusted before Proceed)**
> 1. **Existing Automated Test Suite Compatibility**: Production requests require verified Supabase Auth JWTs and database-resolved membership; under `VITEST` / `NODE_ENV=test`, a deterministic test-only verification adapter and repository harness preserve existing RBAC and Haversine geofence tests while adding dedicated Vitest suites for every Phase 0 fix, license gate, and `/api/console/*` endpoint.
> 2. **Dual-Currency Billing Ledger**: Plan catalog list prices remain anchored in USD (`annual_cost_usd` for normalized ARR calculations), while manual payment records (`license_payments`) natively store the original transaction currency (`GHS` or `USD`), payment channel (`momo`, `bank`, `cash`), reference number, and optional exchange-rate snapshot.
> 3. **Audited Support Access ("View as Organisation Admin")**: Rather than silently impersonating church admins, entering "View as Organisation Admin" creates a time-limited (default 30 minutes, revocable immediately), reason-required `support_grants` record, writes an immutable `audit_log` entry, displays a persistent read-only amber banner, and blocks all mutations while active.
> 4. **Zero-Downtime Premise & Check-In Persistence**: All volatile in-memory and `/tmp` state (check-ins, congregation members, worship services, geofence sites, premise coordinates, and push subscriptions) moves into organization-scoped Supabase tables so serverless cold starts on Vercel never lose operational records.

---

## 1. Overview & Core Concept

- **What It Does**: Provides the platform owner with a secure command center at `/console` to onboard churches and organisations, issue and lifecycle-manage tiered licenses (`Grace Starter`, `Ministry Pro`, `Cathedral Enterprise`), record Mobile Money / bank / cash payments, monitor privacy-preserving daily usage and anti-spoofing health, triage automated platform alerts, manage feature flags and announcements, track data export/deletion requests, and publish Landing Page CMS updates directly to Supabase.
- **Target Audience / Persona**:
  - **Primary**: The Ekklesphere Platform Creator / Vendor Owner managing commercial licensing, renewals, support diagnostics, and platform health across regions (Ghana and international ministries).
  - **Secondary**: Organisation Administrators & Senior Pastors who view their own organisation's active license tier, seat/site utilization, renewal countdown, and platform announcements (strictly read-only, scoped to their own organisation).
- **Key Value & Privacy Guarantee**: Eliminates client-side `localStorage` illusions and auth spoofing vectors while enforcing strict congregation privacy—the Creator Console surfaces **aggregates only** (counts, seat utilization, spoofing/rejection rates, check-in trends), never individual member GPS trails, member names in usage analytics, or per-person giving records.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Creator Authentication & Route Guard (`/console`)**:
   - Navigating to `/console` verifies an active Supabase Auth session containing `app_metadata.creator === true`. Non-creators receive a clean access-denied boundary in the UI and strict `401/403` rejections from every `/api/console/*` endpoint.
2. **Executive Platform Dashboard**:
   - Opens with high-signal KPI cards (Organisations by status, Active & Trial Licenses by tier, Expiring in 7 / 30 days, Normalized Annual Run-Rate, and Supabase Health), followed by a 30-day platform check-ins trend chart, Top Active vs. Inactive Organisations tables, and a "Near or Over Seat/Site Limits" watchlist.
3. **Organisation Provisioning & 6-Tab Workspace**:
   - Creators filter organisations by type (`church` | `organisation`), status (`active` | `trial` | `suspended` | `archived`), tier, or country, or provision a new organisation (which atomically creates the `organizations` row, primary site stub, and 14-day `trial` license).
   - Clicking an organisation opens a structured detail workspace with six tabs: **Overview**, **License**, **Usage**, **Users** (role counts & active staff seats without exposing congregation PII), **Sites** (configured geofence radii & status), and **Audit**, plus the **View as Organisation Admin** read-only support trigger.
4. **License Lifecycle & Manual Payment Recording**:
   - From either the Licenses ledger or an Organisation's License tab, the creator can **Issue**, **Renew**, **Upgrade/Downgrade Tier**, **Start/Extend Trial**, **Suspend**, **Reactivate**, **Revoke**, configure per-org seat/site **Overrides**, and **Record Payment** (`GHS` or `USD` via `MoMo`, `Bank Transfer`, or `Cash` with receipt reference), immediately appending to the immutable audit trail.
5. **Operations, Governance & Landing CMS**:
   - Dedicated navigation views for **Plans** (tier limits & default flags), **Usage** (cross-org aggregate check-in & mock-location analytics), **Alerts** (expiring licenses, limit breaches, >50% usage drops, high GPS spoofing rates, unconfigured geofence/SMS/push), **Announcements**, **Feature Flags**, **Data Requests** (export/deletion SLA tracker), **Audit Log** (filterable with one-click CSV export), and **Landing Page CMS** persisted in Supabase.

### Visual Identity & Theme
- **Aesthetic Direction**: Reuse and elevate Ekklesphere's established crisp SaaS design language—clean single-elevation surfaces, calm architectural spacing, zero decorative telemetry clutter (removing the legacy hardcoded "Firestore Cloud Connected" pulse), and high-density operational tables.
- **Color Palette & Tokens**: Preserves Ekklesphere's dual light/dark semantic CSS variables (`--page: #E6E7F0` / dark `#0D0D22`, `--card: #FFFFFF` / dark `#1D1D3D`, `--ink: #1D1B3A` / dark `#F2F2FA`, `--muted: #666A86` / dark `#A9ACC8`, `--brand: #6D5CF2` royal violet primary accent). Semantic status indicators always pair color with an icon and explicit text label:
  - **Active / Healthy**: Emerald (`#16A34A` / `--green`)
  - **Trial / Grace Period / Approaching Limit**: Amber (`#D97706`)
  - **Suspended / Revoked / Spoofing Alert**: Rose/Crimson (`#DC2626` / `--red`)
- **Typography & Tabular Precision**: Retains `Plus Jakarta Sans` for display headings, navigation, and dense 12px–14px table legibility, paired with `JetBrains Mono` (`tabular-nums`) for all license keys, ARR/currency figures, seat ratios, coordinates, timestamps, and audit IDs.
- **Workspace Layout**: Left collapsible console rail (`248px` desktop, compact drawer on mobile) + clean 3-zone top bar (Breadcrumb context on left, global search in center, primary contextual CTA + app switcher on right) + `max-w-7xl` content canvas with compact `40px–44px` table rows.
- **Interactive Feedback & Motion**: `< 200ms` button press/hover transitions, slide-over drawers for license mutations and payment entry, explicit `Saving -> Saved -> Error` server confirmation states (never optimistic fake saves), skeleton table loaders, and confirmation modals requiring typed or explicit reason inputs for destructive actions (`Suspend`, `Revoke`, `Support Grant`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Unified Supabase Auth + Server-Only `app_metadata.creator` Claim**
  - *Chosen Approach*: Replace Firebase client sign-in with Supabase Auth (Google OAuth + email/password) so web, Android, Express middleware, and Postgres RLS evaluate the exact same JWT (`auth.uid()` and `auth.jwt() -> 'app_metadata'`).
  - *Why*: Eliminates the split-brain gap where Firebase tokens could not satisfy Supabase RLS, and removes the dangerous pattern of trusting client-supplied role headers or hardcoded personal Gmail addresses.
  - *Trade-Off*: Existing web admins sign in once via Supabase Google OAuth / email; matching email records automatically link to their existing `members` organization membership.

- **Decision 2: Fail-Closed Licensing with 14-Day Auto-Trial & 7-Day Expiry Grace**
  - *Chosen Approach*: Tenant routes pass through a server-side license gate that queries `licenses` by `organization_id`, permits `active`, valid 14-day `trial`, and 7-day post-expiry `grace_period` states (attaching warning metadata so the church dashboard can alert pastors to renew), and blocks `revoked`, `expired` (past grace), or missing licenses, as well as member/site creations that exceed plan + override limits.
  - *Why*: Guarantees real commercial enforcement while preventing abrupt Sunday-morning lockouts on the exact day a church's annual subscription lapses.

- **Decision 3: Canonical `organizations` Model with Dry-Run Migration**
  - *Chosen Approach*: Extend `public.organizations` with commercial and ministry metadata, migrate any existing rows from `public.tenants` and `public.campuses` into `public.organizations` and `public.sites` inside an idempotent SQL function (`migrate_legacy_tenants(p_dry_run boolean default true)`), and archive/retire the legacy `tenants` policies.
  - *Why*: Lets you inspect exact row counts and key mappings via dry-run before committing a single structural merge, eliminating dual-tenant confusion permanently.

- **Decision 4: Aggregate-Only Read Path + Audited Support Grants**
  - *Chosen Approach*: Power `/api/console/*` exclusively from `usage_daily`, `organizations`, `licenses`, `license_payments`, and aggregate `COUNT(*)` views; require an explicit, reason-logged, auto-expiring `support_grants` session for read-only "View as Organisation Admin" diagnostics.
  - *Why*: Protects congregation trust and data minimization by ensuring platform operations never casually expose member names, phone numbers, individual check-in coordinates, or giving amounts.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                        CLIENT TIER (React 19 + Tailwind 4)                           │
│                                                                                      │
│  ┌─────────────────────────┐   ┌─────────────────────────┐   ┌────────────────────┐  │
│  │ Public & Landing View   │   │ Tenant Church App       │   │ Creator Console    │  │
│  │ • Supabase CMS Config   │   │ • Admin / Pastor / Door │   │ Route: /console    │  │
│  │ • Supabase Auth Sign-In │   │ • License Grace Banner  │   │ • Dashboard & ARR  │  │
│  └───────────┬─────────────┘   └────────────┬────────────┘   │ • Orgs (6 Tabs)    │  │
│              │                              │                │ • Licenses & Pay   │  │
│              │  Bearer <Supabase JWT>       │                │ • Plans & Usage    │  │
│              └──────────────────────────────┼────────────────┤ • Alerts & Flags   │  │
│                                             │                │ • Audit & Requests │  │
│                                             ▼                └─────────┬──────────┘  │
└─────────────────────────────────────────────┼──────────────────────────┼─────────────┘
                                              │                          │
┌─────────────────────────────────────────────▼──────────────────────────▼─────────────┐
│                         EXPRESS API GATEWAY & CRON TIER                              │
│                                                                                      │
│  ┌────────────────────────────────────┐    ┌──────────────────────────────────────┐  │
│  │ Tenant Middleware Pipeline         │    │ Console Middleware Pipeline          │  │
│  │ 1. verifySupabaseJwt (no headers)  │    │ 1. verifySupabaseJwt                 │  │
│  │ 2. organizationScope (DB member)   │    │ 2. requireCreator (app_metadata)     │  │
│  │ 3. requireActiveLicense (fail-shut)│    │ 3. rateLimiter + Zod Schema Check    │  │
│  │    + Seat / Site Limit Enforcer    │    │ 4. appendAuditLog (every mutation)   │  │
│  └─────────────────┬──────────────────┘    └───────────────────┬──────────────────┘  │
│                    │                                           │                     │
│                    │        ┌──────────────────────────────────┤                     │
│                    │        │ Cron Webhook (/api/console/cron) │◄── Vercel Cron      │
│                    │        │ Verified via CRON_SECRET         │    (Nightly)        │
│                    ▼        ▼                                  ▼                     │
└────────────────────┼────────┼──────────────────────────────────┼─────────────────────┘
                     │        │                                  │
┌────────────────────▼────────▼──────────────────────────────────▼─────────────────────┐
│                  SUPABASE POSTGRES + POSTGIS + PG_CRON (RLS ENABLED)                 │
│                                                                                      │
│  ┌──────────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐  │
│  │ Tenant Operational Tables    │  │ Commercial & Licensing  │  │ Governance & Ops│  │
│  │ • organizations (canonical)  │  │ • plans (3 tiers)       │  │ • usage_daily   │  │
│  │ • sites (PostGIS geofences)  │  │ • licenses (+overrides) │  │ • alerts        │  │
│  │ • members (roles & seats)    │  │ • license_payments      │  │ • announcements │  │
│  │ • events (worship services)  │  │   (GHS/USD, MoMo/Bank)  │  │ • feature_flags │  │
│  │ • attendance & raw_events    │  │ • landing_cms_config    │  │ • data_requests │  │
│  │ • push_subscriptions         │  │                         │  │ • support_grants│  │
│  └──────────────────────────────┘  └─────────────────────────┘  │ • audit_log     │  │
│                                                                 │   (append-only) │  │
│  RLS Helpers: is_platform_creator() + has_organization_access() └─────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Phase 0 Security Remediation Matrix (Executed First with Dedicated Tests)

| # | Vulnerability Eliminated | Hardened Enforcement & Test Assertion |
|---|---|---|
| 1 | Unauthenticated `POST /api/auth/token` minting arbitrary roles | Lock down endpoint: require a verified Supabase token; resolve role and `organization_id` exclusively from database membership + `app_metadata`. Reject body-supplied role/tenant escalation with `401/403`. |
| 2 | Header spoofing (`x-user-role`, `x-user-id`, `x-tenant-id`) in `requireAuthRole` | Delete raw header fallback in production; unauthenticated requests without a valid cryptographic Bearer token always return `401`. |
| 3 | Hardcoded `JWT_SECRET` fallback string | Remove fallback literal; fail fast on server boot when `NODE_ENV=production` and required secrets (`JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are unset. |
| 4 | Untrusted client tenant IDs in `organizationMiddleware` | Ignore client `x-tenant-id`, query, and body tenant fields for authorization; derive active `organizationId` from verified membership (or active audited support grant). |
| 5 | Unauthenticated PII & coordinate endpoints (`/live-checkins`, `/attendance/raw-events`, `/attendance/sites`, `/campus-premise`) | Gate with authentication + `organizationId` filtering so callers only ever receive records belonging to their verified organisation. |
| 6 | Open `/api/license/status` synthesizing a fake active `ministry_pro` license | Require authentication and fail **CLOSED**: evaluate real `licenses` row (`active`, 14-day `trial`, or 7-day `grace_period`); return `unlicensed` / `expired` / `revoked` when absent or lapsed. |
| 7 | Hardcoded personal Gmail super-admins in Firestore rules | Purge all personal email literals from security rules and deny legacy client writes now superseded by Supabase. |
| 8 | Ephemeral in-memory & `/tmp` persistence for check-ins, members, events, and sites | Persist all operational reads/writes through organization-scoped Supabase tables so serverless instances remain stateless and durable. |
| 9 | Broken `auth.jwt()->>'role'` checks in Supabase RLS | Replace top-level JWT role checks across all policies with `public.is_platform_creator()` (`app_metadata.creator` / `app_metadata.is_super_admin`) and `public.has_organization_access(organization_id, ...)`. |

### Phase 1 Canonical Data Model & RLS Strategy

- **`organizations`** *(extended canonical tenant)*: `id`, `name`, `slug`, `org_type` (`church` | `organisation`), `country`, `city`, `campus_code`, `senior_pastor`, `contact_name`, `contact_email`, `contact_phone`, `status` (`active` | `trial` | `suspended` | `archived`), `custom_domain`, `sms_configured`, `push_configured`, `created_at`, `updated_at`.
- **`plans`**: `id` (`grace_starter`, `ministry_pro`, `cathedral_enterprise`), `name`, `annual_cost_usd`, `monthly_cost_usd`, `seats_limit`, `sites_limit`, `monthly_checkins_limit`, `features` (JSONB: BLE radar, SMS gateway, multi-campus, custom domain, giving analytics), `is_active`.
- **`licenses`**: `id`, `organization_id` (FK → `organizations`), `license_key` (unique), `plan_id` (FK → `plans`), `status` (`active` | `trial` | `grace_period` | `expired` | `revoked` | `suspended`), `issued_at`, `expires_at`, `grace_ends_at`, `billing_cycle` (`monthly` | `annual` | `lifetime`), `annual_cost_usd`, `overrides` (JSONB for custom `seats_limit`, `sites_limit`, `monthly_checkins_limit`, feature overrides), `notes`, `created_by`.
- **`license_payments`**: `id`, `license_id`, `organization_id`, `amount`, `currency` (`GHS` | `USD`), `method` (`momo` | `bank` | `cash`), `reference`, `paid_at`, `notes`, `recorded_by`, `created_at`.
- **`usage_daily`**: Composite PK (`organization_id`, `usage_date`) storing aggregate counters only: `active_users`, `checkins_count`, `flagged_count`, `rejected_count`, `mock_location_attempts`, `sites_count`, `push_subscribers`, `last_activity_at`.
- **`audit_log`** *(append-only)*: `id`, `actor_user_id`, `actor_email`, `action`, `target_type`, `target_id`, `organization_id`, `reason`, `before_state` (JSONB), `after_state` (JSONB), `ip_address`, `user_agent`, `created_at` — protected by a `BEFORE UPDATE OR DELETE` Postgres trigger that raises an exception on any mutation attempt.
- **`alerts`**: `id`, `organization_id`, `alert_type` (`license_expiring`, `limit_exceeded`, `usage_drop`, `high_spoofing_rate`, `geofence_unconfigured`, `messaging_unconfigured`), `severity` (`info` | `warning` | `critical`), `status` (`open` | `acknowledged` | `resolved`), `title`, `summary`, `metadata` (JSONB), `detected_at`, `resolved_at`.
- **`announcements`, `feature_flags`, `data_requests`, `support_grants`, `landing_cms_config`**: All RLS-enabled; `creator`-only write access; organisation `owner`/`admin` members receive `SELECT` access strictly to their own `licenses`, their own `usage_daily` rows, global/targeted `announcements`, and effective `feature_flags`.

### Interactive Component & State Mapping

- **Server-Backed Console Store (`useCreatorConsole` hooks)**: Replaces all `localStorage` reads/writes (`ekklesphere_tenants`, `ekklesphere_licenses`, `ekklesphere_landing_config`) with authenticated `/api/console/*` fetchers, explicit loading skeletons, inline error recovery banners, and mutation handlers that refresh server state only after HTTP `200/201` confirmation.
- **License Gate UX in Tenant App**: When an organisation is in `grace_period`, church admins see a dismissible renewal notice with days remaining; when `revoked`, `expired` past 7 days, or over `SEAT_LIMIT_REACHED` / `SITE_LIMIT_REACHED`, the API returns structured machine-readable codes rendered as clear upgrade/renewal guidance in the UI without crashing member read views.
- **Audited Support Mode**: Activating "View as Organisation Admin" POSTs a reason and duration (`15m` / `30m` / `60m`) to `/api/console/support-grants`, switches the active read context to that organisation, renders a sticky top banner with a live countdown and "Exit Support View" button, and blocks any write endpoints at the middleware layer.

### Phased Execution & Deliverable Sequence

1. **Deliverable 1 — Architecture Plan & Alignment** *(Current Turn — awaiting approval)*
2. **Deliverable 2 — Phase 0 Security Fixes & Vitest Suite**: Lock down token minting, remove header/JWT fallbacks, enforce org scoping and auth on check-in/site/premise routes, make `/api/license/status` fail closed, purge personal emails from Firestore rules, move server state to Supabase, migrate web sign-in to Supabase Auth + bootstrap utility, and pass all existing + new Phase 0 Vitest tests.
3. **Deliverable 3 — Phase 1 SQL Migrations & RLS**: Add canonical schema extensions, `plans`, `licenses`, `license_payments`, `usage_daily`, append-only `audit_log`, `alerts`, `announcements`, `feature_flags`, `data_requests`, `support_grants`, `landing_cms_config`, dry-run/live `tenants -> organizations` migration function, and hardened `app_metadata` RLS policies.
4. **Deliverable 4 — Phase 2 Server Routes, License Middleware & Dual Cron**: Build `/api/console/*` with `requireCreator`, Zod validation, rate limiting, and automatic `audit_log` writes; wire `requireActiveLicense` + seat/site limit enforcement + 14-day auto-trial onboarding; add `rollup_usage_daily` for `pg_cron` and Vercel Cron (`/api/console/cron/rollup`).
5. **Deliverable 5 — Phase 3 Console UI (Core Commercial Views)**: Build `/console` shell, Executive Dashboard, Organisations directory + 6-tab detail workspace + audited "View as Organisation Admin", Licenses lifecycle actions + manual GHS/USD payment ledger, Plans manager, and Supabase-backed Landing Page CMS.
6. **Deliverable 6 — Phase 3 Console UI (Telemetry & Governance Views)**: Complete aggregate Usage views, Alerts triage center, Announcements broadcaster, Feature Flags matrix, Data Export/Deletion Request tracker, and filterable Audit Log with CSV export, backed by end-to-end Vitest coverage.
7. **Deliverable 7 — Deployment & Operations Runbook**: Document required environment variables, Supabase `pg_cron` + `vercel.json` cron setup, one-time `creator` claim bootstrap command, dry-run migration verification steps, and safe rollback procedures.
