# Ekklesphere Creator Console & Platform Security Overhaul

Transform Ekklesphere's browser-only licensing prototype into an enterprise-grade, server-enforced, multi-tenant Creator Console (`/console`) backed exclusively by Supabase Postgres and Supabase Auth—beginning with an uncompromising Phase 0 security remediation before introducing commercial licensing, aggregate usage telemetry, and platform governance.

---

## User Review & Critical Decisions

### Confirmed Architectural Decisions (from User Specifications)

1. **Identity & Creator Authorization**: Consolidate web and mobile sign-in onto Supabase Auth (Google OAuth + email/password) alongside the Android geofence client. Platform owner authorization relies strictly on `app_metadata.creator === true`, provisioned only via a server-side bootstrap utility or an existing creator—never via user-editable profile metadata or hardcoded email lists.
2. **Fail-Closed Licensing Policy**: Newly onboarded organisations automatically receive a 14-day Trial license (`grace_starter` defaults unless overridden). Paid or trial licenses entering expiration transition into a 7-day Grace Period (`grace_period` status with warning banners in the admin UI), after which tenant operational writes and premium endpoints fail closed (HTTP 402/403) with structured machine-readable error codes. Missing or revoked licenses block access immediately—no synthetic active license is ever fabricated on error.
3. **Nightly Rollup & Alert Execution**: Implement an idempotent Postgres rollup routine invoked by both a scheduled Supabase `pg_cron` job and an authenticated Vercel Cron webhook (`Authorization: Bearer <CRON_SECRET>`) so daily usage aggregates and proactive alerts stay current across all hosting topologies.
4. **Tenant Schema Unification & Legacy Lockdown**: Retire the duplicate `tenants` model into `organizations` via a safe, re-runnable SQL migration equipped with an explicit dry-run verification mode, point `licenses.organization_id` at `organizations`, and lock down legacy client-side Firestore rules while removing all hardcoded personal email addresses.

### Confirmed Key Engineering Assumptions

- **Existing Automated Test Suite Compatibility**: Production requests require verified Supabase Auth JWTs and database-resolved membership; under `VITEST` / `NODE_ENV=test`, a deterministic test-only verification adapter and repository harness preserve existing RBAC and Haversine geofence tests while adding dedicated Vitest suites for every Phase 0 fix, license gate, and `/api/console/*` endpoint.
- **Dual-Currency Billing Ledger**: Plan catalog list prices remain anchored in USD (`annual_cost_usd` for normalized ARR calculations), while manual payment records (`license_payments`) natively store the original transaction currency (GHS or USD), payment channel (MTN MoMo, Telecel Cash, Bank Transfer, Cash), reference number, and optional exchange-rate snapshot.
- **Audited Support Access ("View as Organisation Admin")**: Rather than silently impersonating church admins, entering "View as Organisation Admin" creates a time-limited (default 30 minutes, revocable immediately), reason-required `support_grants` record, writes an immutable `audit_log` entry, displays a persistent read-only amber banner, and blocks all mutations while active.
- **Zero-Downtime Premise & Check-In Persistence**: All volatile in-memory and `/tmp` state (check-ins, congregation members, worship services, geofence sites, premise coordinates, and push subscriptions) moves into organization-scoped Supabase tables so serverless cold starts on Vercel never lose operational records.
- **Zero SchoolSphere Remnants**: Verified that zero files or references to SchoolSphere exist in the project; Ekklesphere remains 100% focused on church and ministry management.

---

## 1. Overview & Core Concept

### What It Does
Provides the platform owner with a secure command center at `/console` to onboard churches and organisations, issue and lifecycle-manage tiered licenses (Grace Starter, Ministry Pro, Cathedral Enterprise), record Mobile Money / bank / cash payments, monitor privacy-preserving daily usage and anti-spoofing health, triage automated platform alerts, manage feature flags and announcements, track data export/deletion requests, and publish Landing Page CMS updates directly to Supabase.

### Target Audience & Personas
- **Primary: The Ekklesphere Platform Creator / Vendor Owner**: Managing commercial licensing, renewals, support diagnostics, and platform health across regions (Ghana and international ministries).
- **Secondary: Organisation Administrators & Senior Pastors**: Viewing their own organisation's active license tier, seat/site utilization, renewal countdown, and platform announcements (strictly read-only, scoped to their own organisation).

### Key Value & Privacy Guarantee
Eliminates client-side `localStorage` illusions and auth spoofing vectors while enforcing strict congregation privacy: the Creator Console surfaces **aggregates only** (counts, seat utilization, spoofing/rejection rates, check-in trends), never individual member GPS trails, member names in usage analytics, or per-person giving records.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Creator Authentication & Route Guard (`/console`)**:
   - Navigating to `/console` verifies an active Supabase Auth session containing `app_metadata.creator === true`.
   - Non-creators receive a clean access-denied boundary in the UI and strict 401/403 rejections from every `/api/console/*` endpoint.
2. **Executive Platform Dashboard**:
   - Opens with high-signal KPI cards (Organisations by status, Active & Trial Licenses by tier, Expiring in 7 / 30 days, Normalized Annual Run-Rate, and Supabase Health).
   - Followed by a 30-day platform check-ins trend chart, Top Active vs. Inactive Organisations tables, and a "Near or Over Seat/Site Limits" watchlist.
3. **Organisation Provisioning & 6-Tab Workspace**:
   - Creators filter organisations by type (`church` | `organisation`), status (`active` | `trial` | `suspended` | `archived`), tier, or country, or provision a new organisation (atomically creating the `organizations` row, primary site stub, and 14-day trial license).
   - Clicking an organisation opens a structured detail workspace with six tabs: **Overview**, **License**, **Usage**, **Users** (role counts & active staff seats without exposing congregation PII), **Sites** (configured geofence radii & status), and **Audit**, plus the **View as Organisation Admin** read-only support trigger.
4. **License Lifecycle & Manual Payment Recording**:
   - From either the Licenses ledger or an Organisation's License tab, the creator can Issue, Renew, Upgrade/Downgrade Tier, Start/Extend Trial, Suspend, Reactivate, Revoke, configure per-org seat/site Overrides, and Record Payment (GHS or USD via MoMo, Bank Transfer, or Cash with receipt reference), immediately appending to the immutable audit trail.
5. **Operations, Governance & Landing CMS**:
   - Dedicated navigation views for **Plans** (tier limits & default flags), **Usage** (cross-org aggregate check-in & mock-location analytics), **Alerts** (expiring licenses, limit breaches, >50% usage drops, high GPS spoofing rates, unconfigured geofence/SMS/push), **Announcements**, **Feature Flags**, **Data Requests** (export/deletion SLA tracker), **Audit Log** (filterable with one-click CSV export), and **Landing Page CMS** persisted in Supabase.

### Visual Identity & Theme
- **Aesthetic Direction**: Crisp SaaS design language with clean single-elevation surfaces, calm architectural spacing, zero decorative telemetry clutter, and high-density operational tables.
- **Color Palette & Tokens**:
  - Semantic variables: `--page: #E6E7F0` (dark `#0D0D22`), `--card: #FFFFFF` (dark `#1D1D3D`), `--ink: #1D1B3A` (dark `#F2F2FA`), `--muted: #666A86` (dark `#A9ACC8`), `--brand: #6D5CF2` royal violet primary accent.
  - Semantic status indicators pairing color with icon and text:
    - Active / Healthy: Emerald (`#16A34A` / `--green`)
    - Trial / Grace Period / Approaching Limit: Amber (`#D97706`)
    - Suspended / Revoked / Spoofing Alert: Rose/Crimson (`#DC2626` / `--red`)
- **Typography & Tabular Precision**: Retains `Plus Jakarta Sans` for display headings and navigation, paired with `JetBrains Mono` (`font-mono tabular-nums`) for all license keys, ARR/currency figures, seat ratios, coordinates, timestamps, and audit IDs.
- **Workspace Layout**: Left collapsible console rail (248px desktop, compact drawer on mobile) + clean 3-zone top bar (Breadcrumb context, global search, primary contextual CTA + app switcher) + `max-w-7xl` content canvas with compact 40px–44px table rows.
- **Interactive Feedback & Motion**: `< 200ms` button press/hover transitions, slide-over drawers for license mutations and payment entry, explicit `Saving -> Saved -> Error` server confirmation states (no fake optimistic saves), skeleton table loaders, and confirmation modals requiring typed reason inputs for destructive actions.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Unified Supabase Auth + Server-Only app_metadata.creator Claim
- **Chosen Approach**: Replace Firebase client sign-in with Supabase Auth (Google OAuth + email/password) so web, Android, Express middleware, and Postgres RLS evaluate the exact same JWT (`auth.uid()` and `auth.jwt() -> 'app_metadata'`).
- **Why**: Eliminates the split-brain gap where Firebase tokens could not satisfy Supabase RLS, and removes the dangerous pattern of trusting client-supplied role headers or hardcoded personal Gmail addresses.
- **Trade-Off**: Existing web admins sign in once via Supabase Google OAuth / email; matching email records automatically link to their existing members organization membership.

### Decision 2: Fail-Closed Licensing with 14-Day Auto-Trial & 7-Day Expiry Grace
- **Chosen Approach**: Tenant routes pass through a server-side license gate that queries `licenses` by `organization_id`, permits active, valid 14-day trial, and 7-day post-expiry `grace_period` states (attaching warning metadata so the church dashboard can alert pastors to renew), and blocks revoked, expired (past grace), or missing licenses, as well as member/site creations that exceed plan + override limits.
- **Why**: Guarantees real commercial enforcement while preventing abrupt Sunday-morning lockouts on the exact day a church's annual subscription lapses.

### Decision 3: Canonical organizations Model with Dry-Run Migration
- **Chosen Approach**: Extend `public.organizations` with commercial and ministry metadata, migrate any existing rows from `public.tenants` and `public.campuses` into `public.organizations` and `public.sites` inside an idempotent SQL function (`migrate_legacy_tenants(p_dry_run boolean default true)`), and archive/retire legacy tenant policies.
- **Why**: Inspect exact row counts and key mappings via dry-run before committing a single structural merge, eliminating dual-tenant confusion permanently.

### Decision 4: Aggregate-Only Read Path + Audited Support Grants
- **Chosen Approach**: Power `/api/console/*` exclusively from `usage_daily`, `organizations`, `licenses`, `license_payments`, and aggregate `COUNT(*)` views; require an explicit, reason-logged, auto-expiring `support_grants` session for read-only "View as Organisation Admin" diagnostics.
- **Why**: Protects congregation trust and data minimization by ensuring platform operations never casually expose member names, phone numbers, individual check-in coordinates, or giving amounts.

---

## 4. Technical Architecture & Component Structure

```
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

---

## 5. Phase-by-Phase Deliverable Execution Plan

### Deliverable 1 — Architecture Plan & Alignment (Current Turn — Under Review)
- Formalize technical boundaries, confirmed decisions, security remediation matrix, and execution plan.
- Submit for approval via `implementation_plan.md` artifact.

### Deliverable 2 — Phase 0 Security Remediation & Vitest Suite
- **#1**: Lock down `/api/auth/token` so roles and organization scopes resolve exclusively from verified Supabase Auth JWTs + database membership; reject arbitrary body roles.
- **#2**: Remove header fallback (`x-user-role`, `x-user-id`, `x-tenant-id`) from all authentication middleware in production.
- **#3**: Remove hardcoded `JWT_SECRET` fallbacks; fail fast on server boot in production when required secrets are missing.
- **#4**: Enforce verified database-resolved `organizationId` across all tenant operations.
- **#5**: Authenticate and scope all telemetry, site, and coordinate endpoints (`/live-checkins`, `/attendance/events`, `/attendance/sites`, `/api/campus-premise`).
- **#6**: Make `/api/license/status` fail closed: evaluate real license rows, transition expiring licenses into 7-day grace period, and reject expired or missing licenses.
- **#7**: Purge hardcoded personal emails from security rules and lock down legacy client-side Firestore writes.
- **#8**: Ensure all operational state persists durably in Supabase database tables.
- **#9**: Update Supabase RLS policies with `is_platform_creator()` (`app_metadata.creator`) and `has_organization_access()`.
- Add dedicated Vitest test suite (`tests/security-phase0.test.ts`) verifying all 9 remediations.

### Deliverable 3 — Phase 1 SQL Migrations & RLS Policies
- `migrations/20261031_canonical_schema.sql`:
  - `plans` table (3 tiers: `grace_starter`, `ministry_pro`, `cathedral_enterprise` with seat/site/check-in limits and features JSONB).
  - `organizations` table extension (commercial metadata, status, pastor, contact, SMS/push config).
  - `licenses` table (FK to `organizations` and `plans`, status, trial/grace dates, overrides JSONB).
  - `license_payments` table (GHS/USD, payment channel, receipt reference, recorder).
  - `usage_daily` table (composite PK: `organization_id`, `usage_date`, aggregate metrics only).
  - `audit_log` table (append-only with Postgres `BEFORE UPDATE OR DELETE` exception trigger).
  - `alerts`, `announcements`, `feature_flags`, `data_requests`, `support_grants`, `landing_cms_config`.
  - Idempotent migration function: `migrate_legacy_tenants(p_dry_run boolean default true)`.
  - RLS functions: `public.is_platform_creator()` and `public.has_organization_access()`.

### Deliverable 4 — Phase 2 Server Routes, License Middleware & Dual Cron
- `src/server/platformStore.ts`: Production Supabase repository with test harness fallback.
- `src/server/licenseMiddleware.ts`: Fail-closed tenant gate enforcing active/trial/grace states and seat/site limits.
- `src/server/consoleRouter.ts`: Protected `/api/console/*` endpoints for organizations, licenses, payments, plans, usage aggregates, alerts, announcements, feature flags, data requests, audit log export, and landing CMS.
- Nightly rollup engine: `rollup_usage_daily` callable by Postgres `pg_cron` and Vercel Cron webhook (`/api/console/cron/rollup`).

### Deliverable 5 — Phase 3 Console UI: Core Commercial Views
- Mount `/console` route with creator route guard.
- Collapsible console sidebar rail (248px) + 3-zone top bar.
- Executive Dashboard with KPI cards, ARR calculation, 30-day check-in charts, and limit watchlist.
- Organizations Directory + 6-tab workspace (**Overview**, **License**, **Usage**, **Users**, **Sites**, **Audit**) + audited "View as Organisation Admin".
- Licenses ledger & modal workflows (Issue, Renew, Upgrade/Downgrade, Start/Extend Trial, Suspend, Overrides).
- Payment recording drawer (MTN MoMo, Telecel Cash, Bank, Cash in GHS/USD with receipt references).
- Plans manager & Supabase-backed Landing Page CMS.

### Deliverable 6 — Phase 3 Console UI: Telemetry & Governance Views
- Usage Analytics view: Cross-org aggregate check-in trends and mock-location/spoofing analytics (zero individual PII).
- Alerts Triage Center: Automated alerts for expiring licenses, quota breaches, and sudden drops in attendance.
- Announcements Broadcaster: Global and tier-targeted platform notifications.
- Feature Flags Matrix: Dynamic cross-org capability toggling.
- Data Requests Tracker: GDPR / Act 843 data export and deletion SLA monitoring.
- Filterable Audit Log with 1-click CSV export.

### Deliverable 7 — Deployment & Operations Runbook
- Documentation of environment variables (`JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`).
- One-time creator bootstrap CLI command (`node scripts/bootstrap-creator.js <email>`).
- Dry-run verification instructions for `migrate_legacy_tenants(true)` and execution of live migration.
- Rollback and disaster recovery procedures.

---

## 6. Verification & Acceptance Criteria

| Area | Acceptance Target |
|---|---|
| **Phase 0 Security** | All 9 vulnerabilities sealed; 100% pass on dedicated security Vitest suite |
| **Authentication** | Supabase Auth JWTs only; creator access granted solely by `app_metadata.creator === true` |
| **Licensing** | Fail-closed enforcement: 14-day auto-trial on onboarding, 7-day grace warning, HTTP 402/403 past grace |
| **Privacy Guarantee** | Zero raw member GPS trails, personal identities, or individual giving rows surfaced in `/console` |
| **Telemetry & Cron** | Nightly rollup generates daily usage aggregates via `pg_cron` and authenticated Vercel Cron |
| **Build & Lint** | `npm run lint` and `compile_applet` pass with 0 errors; all existing test suites preserved |
