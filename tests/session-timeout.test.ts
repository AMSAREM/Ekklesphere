import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../server';
import {
  DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
  MAX_IDLE_SESSION_TIMEOUT_MINUTES,
  TEST_ANCHOR_ORGANIZATION_ID,
  expireServerSessionForTests,
  normalizeIdleTimeoutMinutes,
  signSessionToken,
  signToken,
  verifyToken,
} from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('User Idle Session Timeout & Keepalive Enforcement', () => {
  const adminToken = signToken({
    id: 'admin-timeout-test',
    email: 'admin-timeout@ekklesphere.church',
    role: 'admin',
    name: 'Church Admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('defines idempotent session_timeout_minutes column migration in Supabase schema', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261127000000_user_session_timeout.sql'
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();
    expect(sql).toContain('session_timeout_minutes');
    expect(sql).toContain('default 30');
  });

  it('normalizes and clamps idle session timeout bounds properly', () => {
    expect(normalizeIdleTimeoutMinutes(undefined)).toBe(DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES);
    expect(normalizeIdleTimeoutMinutes('abc')).toBe(DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES);
    expect(normalizeIdleTimeoutMinutes(0)).toBe(0);
    expect(normalizeIdleTimeoutMinutes(-10)).toBe(0);
    expect(normalizeIdleTimeoutMinutes(15)).toBe(15);
    expect(normalizeIdleTimeoutMinutes(9999)).toBe(MAX_IDLE_SESSION_TIMEOUT_MINUTES);
  });

  it('signs session tokens with sid, idle_timeout_minutes, and matching JWT exp', () => {
    const signed = signSessionToken(
      {
        id: 'member-1',
        email: 'member1@church.org',
        role: 'member',
        organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      },
      15
    );
    expect(signed.sid).toBeTruthy();
    expect(signed.idleTimeoutMinutes).toBe(15);
    const decoded = verifyToken(signed.token);
    expect(decoded).toBeTruthy();
    expect(decoded?.sid).toBe(signed.sid);
    expect(decoded?.idle_timeout_minutes).toBe(15);
    if (decoded?.iat && decoded?.exp) {
      const lifetimeMinutes = Math.round((decoded.exp - decoded.iat) / 60);
      expect(lifetimeMinutes).toBe(15);
    }
  });

  it('enforces idle session timeout on /api/auth/me with structured SESSION_TIMEOUT 401', async () => {
    const signupRes = await request(app).post('/api/auth/register-organisation').send({
      organizationName: 'Grace Session Chapel',
      city: 'Accra',
      country: 'Ghana',
      adminFirstName: 'Kwame',
      adminLastName: 'Mensah',
      email: 'kwame.session@gracechapel.org',
      password: 'StrongPassword#2026',
    });
    expect(signupRes.status).toBe(201);
    expect(signupRes.body.token).toBeTruthy();
    expect(signupRes.body.idleTimeoutMinutes).toBe(30);

    const decoded = verifyToken(signupRes.body.token);
    expect(decoded?.sid).toBeTruthy();

    // Active session succeeds cleanly
    const activeMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signupRes.body.token}`);
    expect(activeMe.status).toBe(200);
    expect(activeMe.body.idleTimeoutMinutes).toBe(30);

    // Simulate inactivity past organization timeout
    expireServerSessionForTests(decoded!.sid!);

    const expiredMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signupRes.body.token}`);
    expect(expiredMe.status).toBe(401);
    expect(expiredMe.body.error).toBe('session_timed_out');
    expect(expiredMe.body.code).toBe('SESSION_TIMEOUT');
  });

  it('extends active sessions cleanly on /api/auth/session/keepalive and revokes on /api/auth/logout', async () => {
    const signed = signSessionToken(
      {
        id: 'admin-keepalive-1',
        email: 'admin@ekklesphere.church',
        role: 'admin',
        name: 'Keepalive Admin',
        organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      },
      30
    );

    const keepaliveRes = await request(app)
      .post('/api/auth/session/keepalive')
      .set('Authorization', `Bearer ${signed.token}`);
    expect(keepaliveRes.status).toBe(200);
    expect(keepaliveRes.body.ok).toBe(true);
    expect(keepaliveRes.body.token).toBeTruthy();
    expect(keepaliveRes.body.idleTimeoutMinutes).toBe(30);
    expect(keepaliveRes.body.sessionExpiresAt).toBeTruthy();

    // Logout immediately revokes the active session ID
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${keepaliveRes.body.token}`);
    expect(logoutRes.status).toBe(200);

    const postLogoutMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${keepaliveRes.body.token}`);
    expect(postLogoutMe.status).toBe(401);
  });

  it('persists sessionTimeoutMinutes via /api/system-settings and propagates it on keepalive', async () => {
    const updateRes = await request(app)
      .put('/api/system-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sessionTimeoutMinutes: 60,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.settings.sessionTimeoutMinutes).toBe(60);

    const fetchRes = await request(app)
      .get('/api/system-settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(fetchRes.status).toBe(200);
    expect(fetchRes.body.settings.sessionTimeoutMinutes).toBe(60);

    const signed = signSessionToken(
      {
        id: 'user-org-timeout',
        email: 'usher@ekklesphere.church',
        role: 'usher',
        organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      },
      30
    );

    const keepaliveRes = await request(app)
      .post('/api/auth/session/keepalive')
      .set('Authorization', `Bearer ${signed.token}`);
    expect(keepaliveRes.status).toBe(200);
    expect(keepaliveRes.body.idleTimeoutMinutes).toBe(60);
  });
});
