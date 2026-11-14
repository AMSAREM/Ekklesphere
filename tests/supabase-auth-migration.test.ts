// tests/supabase-auth-migration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../server';
import { TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { hashPassword, platformStore } from '../src/server/platformStore';

function createMockSupabaseClient(options: {
  credRows?: Record<string, any>[];
  memberRows?: Record<string, any>[];
  usersRows?: Record<string, any>[];
  userRolesRows?: Record<string, any>[];
  authUsersByToken?: Record<string, any>;
  onCredUpdate?: (patch: Record<string, any>, filterValue: unknown) => void;
  onCredUpsert?: (payload: Record<string, any>) => void;
  onCreateAuthUser?: (payload: Record<string, any>) => { id: string };
}) {
  const credRows = options.credRows || [];
  const memberRows = options.memberRows || [];
  const usersRows = options.usersRows || [];
  const userRolesRows = options.userRolesRows || [];

  const makeQuery = (table: string) => {
    const state: {
      eq: Array<[string, unknown]>;
      ilike: Array<[string, string]>;
      orExpr?: string;
    } = { eq: [], ilike: [] };

    const getSourceRows = () => {
      if (table === 'account_credentials') return credRows;
      if (table === 'members') return memberRows;
      if (table === 'users') return usersRows;
      if (table === 'user_roles') return userRolesRows;
      return [];
    };

    const matchesFilters = (row: Record<string, any>) => {
      for (const [col, val] of state.eq) {
        if (String(row[col] ?? '').toLowerCase() !== String(val ?? '').toLowerCase()) {
          return false;
        }
      }
      for (const [col, val] of state.ilike) {
        if (String(row[col] ?? '').toLowerCase() !== String(val ?? '').toLowerCase()) {
          return false;
        }
      }
      if (state.orExpr) {
        const parts = state.orExpr.split(',').map((p) => p.trim()).filter(Boolean);
        const anyMatched = parts.some((part) => {
          const [col, op, ...rest] = part.split('.');
          const target = rest.join('.');
          const actual = String(row[col] ?? '').toLowerCase();
          if (op === 'eq' || op === 'ilike') {
            return actual === target.toLowerCase();
          }
          return false;
        });
        if (!anyMatched) return false;
      }
      return true;
    };

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        state.eq.push([col, val]);
        return builder;
      },
      ilike: (col: string, val: string) => {
        state.ilike.push([col, val]);
        return builder;
      },
      or: (expr: string) => {
        state.orExpr = expr;
        return builder;
      },
      limit: () => builder,
      maybeSingle: async () => {
        const found = getSourceRows().find(matchesFilters) || null;
        return { data: found, error: null };
      },
      then: (resolve: (val: { data: any[]; error: null }) => void) => {
        const matched = getSourceRows().filter(matchesFilters);
        resolve({ data: matched, error: null });
      },
      update: (patch: Record<string, any>) => ({
        eq: async (col: string, val: unknown) => {
          if (table === 'account_credentials') {
            options.onCredUpdate?.(patch, val);
            for (const row of credRows) {
              if (String(row[col] ?? '') === String(val ?? '')) {
                Object.assign(row, patch);
              }
            }
          }
          return { data: null, error: null };
        },
      }),
      upsert: async (payload: Record<string, any>) => {
        if (table === 'account_credentials') {
          options.onCredUpsert?.(payload);
          const idx = credRows.findIndex((r) => r.id === payload.id);
          if (idx >= 0) {
            credRows[idx] = { ...credRows[idx], ...payload };
          } else {
            credRows.push({ ...payload });
          }
        }
        return { data: [payload], error: null };
      },
      insert: async () => ({ data: [], error: null }),
    };

    return builder;
  };

  return {
    from: (table: string) => makeQuery(table),
    rpc: async () => ({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }),
    auth: {
      getUser: async (token: string) => {
        const user = options.authUsersByToken?.[token] || null;
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'Invalid JWT' } };
      },
      admin: {
        getUserById: async (uid: string) => {
          const match = Object.values(options.authUsersByToken || {}).find((u: any) => u.id === uid);
          return match
            ? { data: { user: match }, error: null }
            : { data: { user: null }, error: { message: 'Not found' } };
        },
        createUser: async (payload: Record<string, any>) => {
          const created = options.onCreateAuthUser
            ? options.onCreateAuthUser(payload)
            : { id: '22222222-2222-4222-8222-222222222222' };
          return { data: { user: { id: created.id, email: payload.email } }, error: null };
        },
        updateUserById: async (id: string, payload: Record<string, any>) => ({
          data: { user: { id, email: payload.email } },
          error: null,
        }),
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  } as any;
}

describe('Supabase Auth Password Verification, Legacy Hash Scrubbing & users/user_roles Resolution', () => {
  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('includes nullable password_hash/password_salt migration with strict RLS isolation', () => {
    const sqlPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261119000000_supabase_auth_password_migration.sql'
    );
    const sql = fs.readFileSync(sqlPath, 'utf8');

    expect(sql).toContain('alter column password_hash drop not null');
    expect(sql).toContain('alter column password_salt drop not null');
    expect(sql).toContain('idx_users_auth_user_id');
    expect(sql).toContain('revoke all on table public.account_credentials from public, anon, authenticated');
    expect(sql).toContain('using (false)');
  });

  it('stores null password hashes on new Supabase-Auth provisions and authenticates via Supabase Auth + lockout', async () => {
    const upsertedPayloads: Record<string, any>[] = [];
    const authUid = '11111111-1111-4111-8111-111111111111';

    const mockClient = createMockSupabaseClient({
      onCredUpsert: (payload) => upsertedPayloads.push(payload),
      onCreateAuthUser: () => ({ id: authUid }),
      authUsersByToken: {
        'sb-token': { id: authUid, email: 'migrated-admin@church.org' },
      },
    });

    platformStore.setSupabaseTestHooks({
      client: mockClient,
      authVerifier: async (email, password) => ({
        matched: email === 'migrated-admin@church.org' && password === 'SupabaseAuthPass#2026',
        authUserId: authUid,
      }),
    });

    await platformStore.provisionCredentialRecord({
      organizationId: TEST_ANCHOR_ORGANIZATION_ID,
      email: 'migrated-admin@church.org',
      username: 'migratedadmin',
      name: 'Migrated Admin',
      role: 'admin',
      password: 'SupabaseAuthPass#2026',
    });

    expect(upsertedPayloads.length).toBe(1);
    expect(upsertedPayloads[0].auth_user_id).toBe(authUid);
    expect(upsertedPayloads[0].password_hash).toBeNull();
    expect(upsertedPayloads[0].password_salt).toBeNull();

    // Authenticates via username using Supabase Auth password verification
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.201')
      .send({
        identifier: 'migratedadmin',
        password: 'SupabaseAuthPass#2026',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.role).toBe('admin');
    expect(loginRes.body.organizationId).toBe(TEST_ANCHOR_ORGANIZATION_ID);

    // 5 failed attempts lock out the account with 429 (4x 401, 5th returns 429)
    for (let i = 0; i < 4; i++) {
      const badRes = await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', '198.51.100.201')
        .send({
          identifier: 'migrated-admin@church.org',
          password: `WrongPass#${i}`,
        });
      expect(badRes.status).toBe(401);
    }
    const fifthBadRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.201')
      .send({
        identifier: 'migrated-admin@church.org',
        password: 'WrongPass#4',
      });
    expect(fifthBadRes.status).toBe(429);
    expect(fifthBadRes.body.code).toBe('ACCOUNT_LOCKED');

    const lockedRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.201')
      .send({
        identifier: 'migrated-admin@church.org',
        password: 'SupabaseAuthPass#2026',
      });
    expect(lockedRes.status).toBe(429);
    expect(lockedRes.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('transparently migrates a legacy password_hash account into Supabase Auth and scrubs hashes on login', async () => {
    const legacyPass = 'LegacyAccountPass#2026';
    const { hash, salt } = hashPassword(legacyPass);
    const credId = '33333333-3333-4333-8333-333333333333';
    const createdAuthUid = '44444444-4444-4444-8444-444444444444';
    const updatedPatches: Record<string, any>[] = [];

    const mockClient = createMockSupabaseClient({
      credRows: [
        {
          id: credId,
          organization_id: TEST_ANCHOR_ORGANIZATION_ID,
          email: 'legacy-pastor@church.org',
          full_name: 'Legacy Pastor',
          role: 'pastor',
          is_creator: false,
          password_hash: hash,
          password_salt: salt,
          auth_user_id: null,
          status: 'active',
          failed_attempts: 0,
          locked_until: null,
        },
      ],
      onCredUpdate: (patch) => updatedPatches.push(patch),
      onCreateAuthUser: () => ({ id: createdAuthUid }),
    });

    platformStore.setSupabaseTestHooks({
      client: mockClient,
      authVerifier: async () => ({ matched: false }), // Not yet in auth.users
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.202')
      .send({
        identifier: 'legacy-pastor@church.org',
        password: legacyPass,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.role).toBe('pastor');

    const scrubPatch = updatedPatches.find((p) => p.password_hash === null && p.password_salt === null);
    expect(scrubPatch).toBeDefined();
    expect(scrubPatch?.auth_user_id).toBe(createdAuthUid);
  });

  it('resolves Supabase Auth JWT tenant and highest-priority role via public.users + public.user_roles', async () => {
    const sbAuthUid = '55555555-5555-4555-8555-555555555555';
    const appUserId = '66666666-6666-4666-8666-666666666666';

    const mockClient = createMockSupabaseClient({
      authUsersByToken: {
        'valid-supabase-jwt': {
          id: sbAuthUid,
          email: 'roles-user@church.org',
          user_metadata: {
            full_name: 'Role Escalation Test',
            role: 'creator', // Must be ignored
          },
          app_metadata: {},
        },
      },
      usersRows: [
        {
          id: appUserId,
          tenant_id: TEST_ANCHOR_ORGANIZATION_ID,
          auth_user_id: sbAuthUid,
          status: 'active',
        },
      ],
      userRolesRows: [
        { user_id: appUserId, role: 'member' },
        { user_id: appUserId, role: 'pastor' },
      ],
    });

    platformStore.setSupabaseTestHooks({ client: mockClient });

    const exchangeRes = await request(app)
      .post('/api/auth/token')
      .set('Authorization', 'Bearer valid-supabase-jwt')
      .send({ role: 'creator', is_creator: true });

    expect(exchangeRes.status).toBe(200);
    expect(exchangeRes.body.role).toBe('pastor');
    expect(exchangeRes.body.isCreator).toBe(false);
    expect(exchangeRes.body.organizationId).toBe(TEST_ANCHOR_ORGANIZATION_ID);
  });
});
