// scripts/migrate-tenants.ts
// Safe CLI runner for retiring/migrating legacy public.tenants -> public.organizations.
// Defaults to DRY-RUN mode unless `--apply` is explicitly passed.
//
// Usage:
//   npx tsx scripts/migrate-tenants.ts             # Dry-run preview (no writes)
//   npx tsx scripts/migrate-tenants.ts --apply     # Execute idempotent migration

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

  const applyChanges = process.argv.includes('--apply');
  const dryRun = !applyChanges;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[Ekklesphere Migration] Running migrate_tenants_to_organizations (dry_run=${dryRun})...`);

  const { data, error } = await adminClient.rpc('migrate_tenants_to_organizations', {
    p_dry_run: dryRun,
  });

  if (error) {
    console.error('[Ekklesphere Migration] RPC error:', error.message);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));

  if (dryRun) {
    console.log('\nDry-run complete. Re-run with `--apply` to commit the migration.');
  } else {
    console.log('\nMigration committed successfully.');
  }
}

main().catch((err) => {
  console.error('Unexpected migration script error:', err);
  process.exit(1);
});
