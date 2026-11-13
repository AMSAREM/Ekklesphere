import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken } from '../lib/auth';
import { platformStore, DEFAULT_MEMBER_ONBOARDING_PASSWORD } from '../src/server/platformStore';

describe('Automatic Member Onboarding Credentials & Password Change Flow', () => {
  const adminToken = signToken({
    id: 'user-onboarding-admin',
    email: 'onboarding-admin@ekklesphere.church',
    role: 'admin',
    name: 'Onboarding Admin',
  });

  it('auto-assigns Member Portal credentials (email + phone + generic password) when adding a member via POST /api/members', async () => {
    const createRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Akosua',
        lastName: 'Boateng',
        email: 'akosua.boateng@example.org',
        phoneE164: '0247001122',
        homeCellGroup: 'Cantonments Cell',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.onboardingCredentials).toEqual({
      provisioned: true,
      status: 'created',
      identifiers: ['akosua.boateng@example.org', '+233247001122'],
      temporaryPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      mustChangePassword: true,
    });

    // Directory listing must never expose password hashes or temporary passwords
    const listRes = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const savedRow = listRes.body.find((m: any) => m.email === 'akosua.boateng@example.org');
    expect(savedRow).toBeDefined();
    expect(savedRow.passwordHash).toBeUndefined();
    expect(savedRow.passwordSalt).toBeUndefined();
    expect(savedRow.onboardingCredentials).toBeUndefined();

    // Member can log in with email + generic password
    const emailLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.1.1')
      .send({
        identifier: 'akosua.boateng@example.org',
        password: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      });
    expect(emailLogin.status).toBe(200);
    expect(emailLogin.body.role).toBe('member');
    expect(emailLogin.body.mustChangePassword).toBe(true);
    expect(emailLogin.body.user.mustChangePassword).toBe(true);

    // Member can also log in with normalized E.164 phone OR local Ghana phone
    const e164Login = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.1.2')
      .send({
        identifier: '+233247001122',
        password: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      });
    expect(e164Login.status).toBe(200);
    expect(e164Login.body.user.id).toBe(createRes.body.id);

    const localPhoneLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.1.3')
      .send({
        identifier: '0247001122',
        password: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      });
    expect(localPhoneLogin.status).toBe(200);
    expect(localPhoneLogin.body.role).toBe('member');
  });

  it('auto-provisions credentials for bulk-imported members without overwriting existing accounts', async () => {
    // Pre-register a member with custom password so bulk update/existing contact preserves it
    const existingRes = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', '10.10.2.1')
      .send({
        firstName: 'Yaw',
        lastName: 'Mensah',
        email: 'yaw.existing@example.org',
        phone: '+233247009900',
        password: 'CustomYawPassword!99',
      });
    expect(existingRes.status).toBe(201);
    expect(existingRes.body.user.mustChangePassword).toBe(false);

    const importRes = await request(app)
      .post('/api/members/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        duplicateMode: 'update',
        members: [
          {
            'FIRST NAME': 'Esi',
            LASTNAME: 'Appiah',
            'PHONE NUMBER': '0247003344',
            EMAIL: 'esi.appiah@example.org',
            'HOME CELL GROUP': 'Youth Fellowship',
          },
          {
            'FIRST NAME': 'Kofi',
            LASTNAME: 'Tetteh',
            'PHONE NUMBER': '0247005566',
          },
          {
            'FIRST NAME': 'Yaw',
            LASTNAME: 'Mensah',
            'PHONE NUMBER': '+233247009900',
            EMAIL: 'yaw.existing@example.org',
            'HOME CELL GROUP': 'Men Ministry',
          },
        ],
      });

    expect(importRes.status).toBe(200);
    expect(importRes.body.importedCount).toBe(2);
    expect(importRes.body.updatedCount).toBe(1);
    expect(importRes.body.credentialsProvisionedCount).toBe(2);
    expect(importRes.body.credentialsExistingCount).toBe(1);
    expect(importRes.body.temporaryPassword).toBe(DEFAULT_MEMBER_ONBOARDING_PASSWORD);

    // Phone-only imported member can sign in using phone + generic password
    const phoneOnlyLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.2.2')
      .send({
        identifier: '0247005566',
        password: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      });
    expect(phoneOnlyLogin.status).toBe(200);
    expect(phoneOnlyLogin.body.role).toBe('member');
    expect(phoneOnlyLogin.body.mustChangePassword).toBe(true);

    // Existing member's custom password was NOT overwritten
    const yawGenericAttempt = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.2.3')
      .send({
        identifier: 'yaw.existing@example.org',
        password: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      });
    expect(yawGenericAttempt.status).toBe(401);

    const yawCustomLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.2.4')
      .send({
        identifier: 'yaw.existing@example.org',
        password: 'CustomYawPassword!99',
      });
    expect(yawCustomLogin.status).toBe(200);
    expect(yawCustomLogin.body.mustChangePassword).toBe(false);
  });

  it('skips credential creation gracefully when member lacks email/phone and provisions when contact is added later', async () => {
    const noContactRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Abena',
        lastName: 'Osei',
        homeCellGroup: 'General Congregation',
      });

    expect(noContactRes.status).toBe(201);
    expect(noContactRes.body.onboardingCredentials).toEqual({
      provisioned: false,
      status: 'skipped_no_contact',
      identifiers: [],
      mustChangePassword: false,
    });

    // Adding contact info via PUT /api/members/:id provisions login automatically
    const updateRes = await request(app)
      .put(`/api/members/${noContactRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        phoneE164: '0208887766',
        email: 'abena.osei@example.org',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.onboardingCredentials).toEqual({
      provisioned: true,
      status: 'created',
      identifiers: ['abena.osei@example.org', '+233208887766'],
      temporaryPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      mustChangePassword: true,
    });
  });

  it('allows onboarded member to change their generic password via POST /api/auth/change-password and clears mustChangePassword', async () => {
    // 1. Onboard member
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Daniel',
        lastName: 'Asare',
        email: 'daniel.asare@example.org',
        phoneE164: '0248112233',
      });

    // 2. Sign in with temporary generic password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.3.1')
      .send({
        identifier: '0248112233',
        password: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      });
    expect(loginRes.status).toBe(200);
    const memberToken = loginRes.body.token;
    expect(loginRes.body.mustChangePassword).toBe(true);

    // 3. Unauthenticated request rejected
    const unauth = await request(app)
      .post('/api/auth/change-password')
      .send({
        currentPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
        newPassword: 'MyPersonalPass!2026',
      });
    expect(unauth.status).toBe(401);

    // 4. Wrong current password rejected
    const wrongCurrent = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Forwarded-For', '10.10.3.2')
      .send({
        currentPassword: 'WrongTempPassword',
        newPassword: 'MyPersonalPass!2026',
      });
    expect(wrongCurrent.status).toBe(401);

    // 5. Same password rejected
    const unchanged = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Forwarded-For', '10.10.3.3')
      .send({
        currentPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
        newPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      });
    expect(unchanged.status).toBe(400);

    // 6. Confirm mismatch rejected
    const mismatch = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Forwarded-For', '10.10.3.4')
      .send({
        currentPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
        newPassword: 'MyPersonalPass!2026',
        confirmPassword: 'DifferentPass!2026',
      });
    expect(mismatch.status).toBe(400);

    // 7. Valid password change succeeds
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Forwarded-For', '10.10.3.5')
      .send({
        currentPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
        newPassword: 'MyPersonalPass!2026',
        confirmPassword: 'MyPersonalPass!2026',
      });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);
    expect(changeRes.body.mustChangePassword).toBe(false);

    // 8. /api/auth/me reflects mustChangePassword: false
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.mustChangePassword).toBe(false);
    expect(meRes.body.user.mustChangePassword).toBe(false);

    // 9. Old generic password no longer works; new personal password succeeds
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.3.6')
      .send({
        identifier: 'daniel.asare@example.org',
        password: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
      });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.10.3.7')
      .send({
        identifier: 'daniel.asare@example.org',
        password: 'MyPersonalPass!2026',
      });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.mustChangePassword).toBe(false);
  });

  it('respects MEMBER_DEFAULT_ONBOARDING_PASSWORD override when configured', () => {
    const prev = process.env.MEMBER_DEFAULT_ONBOARDING_PASSWORD;
    try {
      process.env.MEMBER_DEFAULT_ONBOARDING_PASSWORD = 'SanctuaryTemp!88';
      expect(platformStore.getGenericOnboardingPassword()).toBe('SanctuaryTemp!88');
    } finally {
      if (prev === undefined) {
        delete process.env.MEMBER_DEFAULT_ONBOARDING_PASSWORD;
      } else {
        process.env.MEMBER_DEFAULT_ONBOARDING_PASSWORD = prev;
      }
    }
  });

  it('falls back cleanly when Supabase PostgREST reports must_change_password missing from schema cache', async () => {
    const storeAny = platformStore as any;
    const prevSupabase = storeAny.supabase;
    const calls: Array<{ table: string; op: string; payload: any }> = [];
    let persistedRow: Record<string, any> | null = null;
    const authCalls: string[] = [];

    storeAny.supabase = {
      auth: {
        admin: {
          createUser: async () => {
            authCalls.push('createUser');
            return { data: { user: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } }, error: null };
          },
          updateUserById: async () => {
            authCalls.push('updateUserById');
            return { data: { user: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } }, error: null };
          },
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
      from: (table: string) => {
        if (table === 'auth_audit_events' || table === 'auth_rate_limits') {
          return {
            insert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        expect(table).toBe('account_credentials');
        return {
          upsert: async (payload: any) => {
            calls.push({ table, op: 'upsert', payload });
            if ('must_change_password' in payload || 'auth_user_id' in payload) {
              if ('must_change_password' in payload) {
                return {
                  error: {
                    message:
                      "Could not find the 'must_change_password' column of 'account_credentials' in the schema cache",
                  },
                };
              }
            }
            persistedRow = { ...(persistedRow || {}), ...payload };
            return { error: null };
          },
          update: (payload: any) => ({
            eq: async () => {
              calls.push({ table, op: 'update', payload });
              if ('must_change_password' in payload) {
                return {
                  error: {
                    message:
                      "Could not find the 'must_change_password' column of 'account_credentials' in the schema cache",
                  },
                };
              }
              persistedRow = { ...(persistedRow || {}), ...payload };
              return { error: null };
            },
          }),
          select: () => ({
            eq: (col: string, val: any) => ({
              maybeSingle: async () => ({
                data: persistedRow && persistedRow[col] === val ? persistedRow : null,
                error: null,
              }),
            }),
            or: (filterStr: string) => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data:
                    persistedRow &&
                    (filterStr.includes(String(persistedRow.id)) ||
                      (persistedRow.email && filterStr.includes(String(persistedRow.email))))
                      ? persistedRow
                      : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    };

    try {
      const saved = await platformStore.provisionCredentialRecord({
        id: '11111111-1111-4111-8111-111111111119',
        organizationId: '00000000-0000-0000-0000-000000000001',
        email: 'cache-fallback@example.org',
        name: 'Schema Fallback User',
        role: 'member',
        password: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
        mustChangePassword: true,
      });

      expect(saved.email).toBe('cache-fallback@example.org');
      expect(saved.mustChangePassword).toBe(true);
      expect(authCalls).toContain('createUser');
      expect(calls.filter((c) => c.op === 'upsert')).toHaveLength(2);
      expect('must_change_password' in calls[0].payload).toBe(true);
      expect('must_change_password' in calls[1].payload).toBe(false);

      const pwdRes = await platformStore.changePasswordForUser({
        userId: saved.id,
        currentPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
        newPassword: 'UpdatedPassword!2026',
      });
      expect(pwdRes.success).toBe(true);
      expect(authCalls).toContain('updateUserById');
      expect(calls.filter((c) => c.op === 'update')).toHaveLength(2);
      expect('must_change_password' in calls[2].payload).toBe(true);
      expect('must_change_password' in calls[3].payload).toBe(false);
    } finally {
      storeAny.supabase = prevSupabase;
    }
  });
});

