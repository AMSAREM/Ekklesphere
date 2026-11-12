// scripts/seed-creator.ts
// Platform Creator Credential Provisioning & Rotation Script (Database + Secrets)
// Reads CREATOR_* environment variables or CLI flags, hashes password using scrypt,
// and upserts directly into Supabase `public.account_credentials` (plus Auth app_metadata if present).
//
// Usage:
//   npm run seed:creator
//   npx tsx scripts/seed-creator.ts --email you@domain.com --password "YourStrongPassword!" --username creator --phone "+233240000000" --name "Platform Creator"
//   npx tsx scripts/seed-creator.ts --email you@domain.com --password "YourStrongPassword!" --sql-only

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  hashPassword,
  normalizePhone,
  toDeterministicUuid,
} from '../src/server/platformStore.ts';

dotenv.config();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readFlag(args: string[], flag: string): string {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return (args[idx + 1] || '').trim();
  }
  return '';
}

function escapeSqlLiteral(val: string | null): string {
  if (val === null) return 'null';
  return `'${val.replace(/'/g, "''")}'`;
}

async function main() {
  const args = process.argv.slice(2);
  const sqlOnly = args.includes('--sql-only');

  const email = (readFlag(args, '--email') || process.env.CREATOR_EMAIL || '').trim().toLowerCase();
  const password = (readFlag(args, '--password') || process.env.CREATOR_PASSWORD || '').trim();
  const username =
    (readFlag(args, '--username') || process.env.CREATOR_USERNAME || '').trim().toLowerCase() || null;
  const rawPhone = (readFlag(args, '--phone') || process.env.CREATOR_PHONE || '').trim();
  const phoneE164 = rawPhone ? normalizePhone(rawPhone) || null : null;
  const fullName =
    (readFlag(args, '--name') || process.env.CREATOR_NAME || '').trim() || 'Platform Creator';
  const rawOrgId = (readFlag(args, '--org-id') || process.env.CREATOR_ORGANIZATION_ID || '').trim();
  const organizationId = UUID_REGEX.test(rawOrgId) ? rawOrgId.toLowerCase() : null;

  if (!email) {
    console.error('Error: Creator email is required via --email or CREATOR_EMAIL.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('Error: Creator password (min 8 chars) is required via --password or CREATOR_PASSWORD.');
    process.exit(1);
  }

  const creatorId = toDeterministicUuid(`creator:${email}`);
  const { hash, salt } = hashPassword(password);

  if (sqlOnly) {
    const sql = [
      '-- Run in Supabase SQL Editor (public.account_credentials):',
      'insert into public.account_credentials (',
      '  id, organization_id, email, username, phone_e164, full_name,',
      '  role, is_creator, password_hash, password_salt, status',
      ') values (',
      `  ${escapeSqlLiteral(creatorId)},`,
      `  ${escapeSqlLiteral(organizationId)},`,
      `  ${escapeSqlLiteral(email)},`,
      `  ${escapeSqlLiteral(username)},`,
      `  ${escapeSqlLiteral(phoneE164)},`,
      `  ${escapeSqlLiteral(fullName)},`,
      "  'creator',",
      '  true,',
      `  ${escapeSqlLiteral(hash)},`,
      `  ${escapeSqlLiteral(salt)},`,
      "  'active'",
      ')',
      'on conflict (id) do update set',
      '  organization_id = excluded.organization_id,',
      '  email = excluded.email,',
      '  username = excluded.username,',
      '  phone_e164 = excluded.phone_e164,',
      '  full_name = excluded.full_name,',
      "  role = 'creator',",
      '  is_creator = true,',
      '  password_hash = excluded.password_hash,',
      '  password_salt = excluded.password_salt,',
      "  status = 'active',",
      '  failed_attempts = 0,',
      '  locked_until = null;',
    ].join('\n');
    console.log(sql);
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set, or pass --sql-only to generate hashed SQL.'
    );
    process.exit(1);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: upsertError } = await adminClient.from('account_credentials').upsert(
    {
      id: creatorId,
      organization_id: organizationId,
      email,
      username,
      phone_e164: phoneE164,
      full_name: fullName,
      role: 'creator',
      is_creator: true,
      password_hash: hash,
      password_salt: salt,
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
    },
    { onConflict: 'id' }
  );

  if (upsertError) {
    console.error('Failed to upsert public.account_credentials:', upsertError.message);
    process.exit(1);
  }

  // If a matching Supabase Auth user exists (e.g. for Google OAuth), also stamp app_metadata.creator
  let authMetadataSynced = false;
  try {
    const { data: usersData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const matched = usersData?.users?.find((u) => (u.email || '').toLowerCase() === email);
    if (matched) {
      await adminClient.auth.admin.updateUserById(matched.id, {
        app_metadata: {
          ...(matched.app_metadata || {}),
          creator: true,
          is_super_admin: true,
          creator_updated_at: new Date().toISOString(),
        },
      });
      authMetadataSynced = true;
    }
  } catch {
    // Non-fatal: credential sign-in works directly via public.account_credentials
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        creatorId,
        email,
        username,
        phoneE164,
        organizationId,
        authMetadataSynced,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Unexpected failure in seed-creator:', err);
  process.exit(1);
});
