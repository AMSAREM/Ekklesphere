import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../server';
import { TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import { getGoogleOAuthRedirectTo, parseOAuthCallbackParams } from '../src/lib/supabase';

function createGoogleSupabaseMock(authUsersByToken: Record<string, any>) {
  return {
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        ilike: () => builder,
        or: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (val: { data: any[]; error: null }) => void) =>
          resolve({ data: [], error: null }),
      };
      return builder;
    },
    rpc: async () => ({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }),
    auth: {
      getUser: async (token: string) => {
        const user = authUsersByToken[token] || null;
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'Invalid JWT' } };
      },
    },
  } as any;
}

describe('Google OAuth Sign-In Flow & Auth Screen Guards', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    platformStore.resetForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('serves non-secret public Supabase config without ever exposing service role keys', async () => {
    process.env.SUPABASE_URL = 'https://example-church.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-public-key-123';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'super-secret-service-role-key-do-not-leak';

    const res = await request(app).get('/api/auth/public-config');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body.supabaseUrl).toBe('https://example-church.supabase.co');
    expect(res.body.supabaseAnonKey).toBe('anon-public-key-123');
    expect(res.body.googleOAuthConfigured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-service-role-key-do-not-leak');
  });

  it('serves the lightweight Google OAuth popup relay callback HTML on both slash variants', async () => {
    for (const route of ['/api/auth/google-callback', '/api/auth/google-callback/']) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.text).toContain('EKKLESPHERE_GOOGLE_OAUTH_CALLBACK');
      expect(res.text).toContain('BroadcastChannel');
      expect(res.text).toContain('window.opener.postMessage');
    }
  });

  it('exchanges a verified Google Supabase token for a tracked session JWT with avatar metadata', async () => {
    const sbUid = '77777777-7777-4777-8777-777777777777';
    platformStore.setSupabaseTestHooks({
      client: createGoogleSupabaseMock({
        'google-oauth-jwt': {
          id: sbUid,
          email: 'member.google@ekklesphere.church',
          user_metadata: {
            full_name: 'Grace Mensah',
            avatar_url: 'https://lh3.googleusercontent.com/a/avatar-sample',
          },
          app_metadata: { provider: 'google' },
        },
      }),
    });

    const exchangeRes = await request(app)
      .post('/api/auth/token')
      .set('Authorization', 'Bearer google-oauth-jwt')
      .send({ role: 'admin', is_creator: true });

    expect(exchangeRes.status).toBe(200);
    expect(exchangeRes.body.token).toBeTruthy();
    expect(exchangeRes.body.organizationId).toBe(TEST_ANCHOR_ORGANIZATION_ID);
    expect(exchangeRes.body.role).toBe('member');
    expect(exchangeRes.body.isCreator).toBe(false);
    expect(exchangeRes.body.user.avatar).toBe('https://lh3.googleusercontent.com/a/avatar-sample');
  });

  it('parses PKCE code, hash tokens, and OAuth cancellation errors accurately', () => {
    const pkce = parseOAuthCallbackParams('?code=pkce_code_987&state=xyz', '');
    expect(pkce).toEqual({
      code: 'pkce_code_987',
      accessToken: null,
      refreshToken: null,
      error: null,
      errorDescription: null,
      hasOAuthParams: true,
    });

    const implicit = parseOAuthCallbackParams('', '#access_token=tok_abc&refresh_token=ref_123');
    expect(implicit).toEqual({
      code: null,
      accessToken: 'tok_abc',
      refreshToken: 'ref_123',
      error: null,
      errorDescription: null,
      hasOAuthParams: true,
    });

    const cancelled = parseOAuthCallbackParams(
      '?error=access_denied&error_description=User+denied+access',
      ''
    );
    expect(cancelled.error).toBe('access_denied');
    expect(cancelled.errorDescription).toBe('User denied access');
    expect(cancelled.hasOAuthParams).toBe(true);
  });

  it('routes iframe OAuth callbacks to /api/auth/google-callback and top-level navigations to /app', () => {
    expect(getGoogleOAuthRedirectTo('https://ekklesphere.vercel.app', true)).toBe(
      'https://ekklesphere.vercel.app/api/auth/google-callback'
    );
    expect(getGoogleOAuthRedirectTo('https://ekklesphere.vercel.app', false)).toBe(
      'https://ekklesphere.vercel.app/app'
    );
  });

  it('keeps UnifiedAuthScreen Google Sign-In ergonomic with popup-blocker fallback and no window.alert', () => {
    const screenSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auth/UnifiedAuthScreen.tsx'),
      'utf8'
    );
    expect(screenSrc).toContain('Continue with Google');
    expect(screenSrc).toContain('Open Google Sign-In Window');
    expect(screenSrc).toContain('googleAuthPopupUrl');
    expect(screenSrc).not.toContain('window.alert');
    expect(screenSrc).not.toContain('animate-pulse');
  });
});
