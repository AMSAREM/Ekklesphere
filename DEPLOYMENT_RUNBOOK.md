# Ekklesphere Creator Console & Platform Security Deployment Runbook

**Document Version:** 1.0  
**Effective Date:** 31 October 2026  
**Scope:** Supabase Postgres, Supabase Auth, Next.js / Express Serverless API, and Platform Creator Operations  
**Compliance Standard:** Ghana Data Protection Act, 2012 (Act 843), OWASP ASVS Level 2, MASVS

---

## 1. Architecture Overview

Ekklesphere has transformed from a browser-only client-side prototype into a server-enforced, multi-tenant platform backed by Supabase Postgres and Supabase Auth.

- **Platform Creator Console (`/console`):** Single-pane-of-glass administrative interface reserved strictly for platform owners (`app_metadata.creator === true`).
- **Fail-Closed Licensing:** Missing, expired, or revoked licenses fail closed with HTTP 402/403. New organisations receive an automatic 14-day trial; expiring licenses transition into a 7-day grace period before operational write lock.
- **Audited Support Access:** Creators inspecting church tenant accounts must create a time-limited (max 30 min) `support_grants` session. A persistent read-only banner is displayed and mutations are strictly blocked.
- **Privacy by Design (Act 843):** Telemetry aggregates are rolled up into `usage_daily`. Raw member GPS trails and personal giving records are never exposed to platform creators.

---

## 2. Environment Variables & Secret Configuration

Configure these environment variables in your deployment environment (e.g., Vercel, Railway, or Google Cloud Run).

```bash
# ==============================================================================
# Supabase Database & Auth Configuration
# ==============================================================================
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." # Keep secret! Never leak to client.
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."        # Safe for client bundling

# Database Direct Connection (for migrations)
DATABASE_URL="postgres://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres"

# ==============================================================================
# Platform & Security Tokens
# ==============================================================================
# Shared secret for cron triggers (/api/console/cron/rollup)
CRON_SECRET="sec_cron_7f8a92b3c4d5e6f7a8b9c0d1e2f3a4b5"

# Token signing secret (must match Supabase JWT secret or custom signing key)
JWT_SECRET="supa_jwt_98482f7a941d4b6d9976ca3b9e053881"

# Client Vite Environment
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
NODE_ENV="production"
PORT=3000
```

> **Note on `.env.example`:** Ensure `.env.example` in the project root includes all the keys above without actual secret values.

---

## 3. Database Migration Execution

The canonical schema is located in `migrations/20261031_canonical_schema.sql`. It defines:
- Catalog tables (`plans`, `organizations`, `licenses`, `license_payments`)
- Telemetry & Ops tables (`usage_daily`, `audit_log`, `alerts`, `announcements`, `feature_flags`, `data_requests`, `support_grants`, `landing_cms_config`)
- Stored procedures: `migrate_legacy_tenants(boolean)` and `rollup_usage_daily(date)`
- Row-Level Security (RLS) policies enforcing creator isolation.

### Step 3.1: Apply Canonical Migration

Using the Supabase SQL Editor or psql CLI:

```bash
psql "$DATABASE_URL" -f migrations/20261031_canonical_schema.sql
```

Verify that the tables and functions were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('organizations', 'licenses', 'usage_daily', 'audit_log');
```

### Step 3.2: Execute Legacy Tenant Migration (Dry Run First)

The stored procedure `migrate_legacy_tenants(p_dry_run boolean)` safely inspects the legacy `tenants` table, maps records to `organizations`, attaches a default 14-day trial license, and verifies foreign keys without modifying data when `p_dry_run = true`.

```sql
-- Step A: Execute dry-run to inspect projected changes
SELECT * FROM migrate_legacy_tenants(true);

-- Step B: Review the output summary json (migrated_count, skipped_count, errors)
-- If all checks pass, commit the migration:
SELECT * FROM migrate_legacy_tenants(false);
```

---

## 4. Platform Creator Provisioning (Bootstrap)

Platform creators **cannot** be provisioned through client registration or user-editable profile metadata. Platform creator privileges are granted strictly via `auth.users.raw_app_meta_data->>'creator' = 'true'`.

### Step 4.1: Designate Initial Creator via Supabase SQL

Replace `creator@example.com` with the designated platform owner's registered email address (e.g. `elenamends@gmail.com`):

```sql
-- Set app_metadata.creator = true in Supabase Auth
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"creator": true}'::jsonb
WHERE email = 'elenamends@gmail.com';

-- Verify the update
SELECT id, email, raw_app_meta_data->>'creator' AS is_creator
FROM auth.users
WHERE email = 'elenamends@gmail.com';
```

Once updated, the creator can sign in at `/` and navigate to `/console`.

---

## 5. Daily Usage Rollup & Alert Automation (Dual Cron Setup)

Daily telemetry aggregation (`rollup_usage_daily`) runs idempotently every night at **01:00 UTC** to aggregate check-ins, spoofing rates, and trigger proactive threshold alerts.

### Topology A: Supabase `pg_cron` (Native Postgres)

Enable the `pg_cron` extension in the Supabase Dashboard (`Database` -> `Extensions`), then schedule the daily rollup job:

```sql
SELECT cron.schedule(
  'ekklesphere-daily-rollup',
  '0 1 * * *', -- At 01:00 UTC daily
  $$SELECT rollup_usage_daily((CURRENT_DATE - INTERVAL '1 day')::date);$$
);
```

### Topology B: Vercel Cron or External Webhook

If running on Vercel or calling externally, configure `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/console/cron/rollup",
      "schedule": "0 1 * * *"
    }
  ]
}
```

The server route `/api/console/cron/rollup` verifies the incoming `Authorization: Bearer <CRON_SECRET>` header. To trigger it manually:

```bash
curl -X POST https://your-domain.com/api/console/cron/rollup \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"target_date": "2026-10-30"}'
```

---

## 6. Verification & Health Checklist

Run this operational checklist after deployment:

| Check | Action / Endpoint | Expected Response |
|---|---|---|
| **API Health** | `GET /api/health` | HTTP 200 `{ "status": "ok", "timestamp": ... }` |
| **Creator Route Guard** | `GET /api/console/dashboard` with unauthenticated request | HTTP 401 `{ "error": "unauthorized" }` |
| **Non-Creator Rejection** | `GET /api/console/dashboard` with regular member token | HTTP 403 `{ "error": "creator_required" }` |
| **Creator Console Access** | `GET /api/console/dashboard` with creator token | HTTP 200 with summary KPIs and org listings |
| **Cross-Tenant Boundary** | Member from Org A requests Org B data | HTTP 403 `{ "error": "cross_organization_forbidden" }` |
| **Licensing Gate** | Operational write with expired/revoked license | HTTP 402 `{ "error": "license_required", "code": "LICENSE_SUSPENDED" }` |
| **Audited Support Access** | Creator triggers "View as Organisation Admin" | `support_grants` created, amber banner visible, mutations blocked |

---

## 7. Rollback & Emergency Procedures

### 7.1 Immediate Rollback of Creator Access
To immediately revoke creator status from an account without restarting services:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'creator'
WHERE email = 'compromised-account@example.com';
```

### 7.2 Database Schema Reversion
If an unrecoverable issue occurs during initial deployment of `20261031_canonical_schema.sql`:

1. All new tables are isolated in `public` without altering existing non-conflicting operational tables.
2. The legacy `tenants` table is preserved intact by `migrate_legacy_tenants`.
3. To drop new console tables and restore prototype state:

```sql
DROP TABLE IF EXISTS support_grants CASCADE;
DROP TABLE IF EXISTS data_requests CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS feature_flags CASCADE;
DROP TABLE IF EXISTS usage_daily CASCADE;
DROP TABLE IF EXISTS license_payments CASCADE;
DROP TABLE IF EXISTS licenses CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS landing_cms_config CASCADE;
```

---

## 8. Incident Response & Support

- **Audit Logs:** Every creator action (license upgrade, manual payment recording, support grant session) is written to `audit_log`. Run `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50;` or export CSV directly from `/console`.
- **Contact:** Platform Engineering Team / Data Protection Supervisor (Ghana Act 843 Compliance Officer).
