// scripts/grant-creator.ts
// One-time server-side bootstrap utility to set or revoke `app_metadata.creator`
// on a Supabase Auth user. Never sets creator status via user-editable fields.
//
// Usage:
//   npx tsx scripts/grant-creator.ts --email owner@ekklesphere.org
//   npx tsx scripts/grant-creator.ts --user-id <uuid>
//   npx tsx scripts/grant-creator.ts --email owner@ekklesphere.org --revoke

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const emailIdx = args.indexOf('--email');
  const idIdx = args.indexOf('--user-id');
  const revoke = args.includes('--revoke');

  const targetEmail = emailIdx >= 0 ? args[emailIdx + 1]?.trim().toLowerCase() : '';
  const targetUserId = idIdx >= 0 ? args[idIdx + 1]?.trim() : '';

  if (!targetEmail && !targetUserId) {
    console.error('Usage: npx tsx scripts/grant-creator.ts --email <email> | --user-id <uuid> [--revoke]');
    process.exit(1);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let resolvedUserId = targetUserId;
  let existingAppMetadata: Record<string, unknown> = {};

  if (resolvedUserId) {
    const { data, error } = await adminClient.auth.admin.getUserById(resolvedUserId);
    if (error || !data?.user) {
      console.error('Failed to look up user by ID:', error?.message || 'Not found');
      process.exit(1);
    }
    existingAppMetadata = data.user.app_metadata || {};
  } else {
    const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      console.error('Failed to list Supabase Auth users:', error.message);
      process.exit(1);
    }
    const matched = data.users.find((u) => (u.email || '').toLowerCase() === targetEmail);
    if (!matched) {
      console.error(`No Supabase Auth user found with email "${targetEmail}". Sign in once first, then re-run.`);
      process.exit(1);
    }
    resolvedUserId = matched.id;
    existingAppMetadata = matched.app_metadata || {};
  }

  const updatedMetadata = {
    ...existingAppMetadata,
    creator: !revoke,
    is_super_admin: !revoke,
    creator_updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(resolvedUserId, {
    app_metadata: updatedMetadata,
  });

  if (updateError || !updated.user) {
    console.error('Failed to update app_metadata:', updateError?.message);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        userId: updated.user.id,
        email: updated.user.email,
        creator: Boolean(updated.user.app_metadata?.creator),
        updatedAt: updated.user.app_metadata?.creator_updated_at,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Unexpected failure in grant-creator:', err);
  process.exit(1);
});
