// src/lib/supabase.ts - Browser Supabase Auth Client (Google OAuth + Email/Password)
// Uses ONLY public VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or public /api/auth/public-config anon key).
// SUPABASE_SERVICE_ROLE_KEY is NEVER imported or exposed in frontend code.

import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

const buildSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const buildSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

function createConfiguredClient(url: string, anonKey: string): SupabaseClient | null {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();
  if (!cleanUrl || !cleanKey) return null;
  if (!/^https?:\/\//i.test(cleanUrl)) return null;

  return createClient(cleanUrl, cleanKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      storageKey: 'ekklesphere_supabase_auth',
    },
  });
}

let cachedSupabaseClient: SupabaseClient | null = createConfiguredClient(
  buildSupabaseUrl,
  buildSupabaseAnonKey
);
let pendingClientInit: Promise<SupabaseClient | null> | null = null;

export const isSupabaseBrowserConfigured = Boolean(cachedSupabaseClient);
export const supabaseBrowserClient: SupabaseClient | null = cachedSupabaseClient;

export interface ParsedOAuthCallbackPayload {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorDescription: string | null;
  hasOAuthParams: boolean;
}

export function parseOAuthCallbackParams(search: string, hash: string): ParsedOAuthCallbackPayload {
  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const hashClean = hash.startsWith('#') ? hash.slice(1) : hash;
  const hashParams = new URLSearchParams(hashClean);

  const code = searchParams.get('code')?.trim() || null;
  const accessToken = hashParams.get('access_token')?.trim() || null;
  const refreshToken = hashParams.get('refresh_token')?.trim() || null;
  const error =
    searchParams.get('error')?.trim() || hashParams.get('error')?.trim() || null;
  const errorDescription =
    searchParams.get('error_description')?.trim() ||
    hashParams.get('error_description')?.trim() ||
    null;

  return {
    code,
    accessToken,
    refreshToken,
    error,
    errorDescription,
    hasOAuthParams: Boolean(code || accessToken || error || errorDescription),
  };
}

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function getGoogleOAuthRedirectTo(originOverride?: string, inIframeOverride?: boolean): string | undefined {
  const origin =
    originOverride ||
    (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (!origin) return undefined;
  const inIframe =
    typeof inIframeOverride === 'boolean' ? inIframeOverride : isRunningInIframe();
  return inIframe ? `${origin}/api/auth/google-callback` : `${origin}/app`;
}

export async function ensureSupabaseBrowserClient(): Promise<SupabaseClient | null> {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient;
  }
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return null;
  }
  if (!pendingClientInit) {
    pendingClientInit = fetch('/api/auth/public-config', {
      method: 'GET',
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        const url = typeof data?.supabaseUrl === 'string' ? data.supabaseUrl.trim() : '';
        const anonKey =
          typeof data?.supabaseAnonKey === 'string' ? data.supabaseAnonKey.trim() : '';
        const client = createConfiguredClient(url, anonKey);
        if (client) {
          cachedSupabaseClient = client;
        }
        return client;
      })
      .catch(() => null)
      .finally(() => {
        if (!cachedSupabaseClient) {
          pendingClientInit = null;
        }
      });
  }
  return pendingClientInit;
}

export interface GoogleOAuthStartResult {
  mode: 'popup' | 'popup_blocked' | 'redirect';
  authUrl: string;
  popup: Window | null;
}

export async function signInWithSupabaseGoogle(): Promise<GoogleOAuthStartResult> {
  const client = await ensureSupabaseBrowserClient();
  if (!client) {
    throw new Error(
      'Google Sign-In via Supabase Auth is not configured in this environment. Verify SUPABASE_URL and SUPABASE_ANON_KEY are set, or sign in with your church email/phone below.'
    );
  }

  const inIframe = isRunningInIframe();
  const redirectTo = getGoogleOAuthRedirectTo(undefined, inIframe);

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error || !data?.url) {
    throw error || new Error('Could not generate the Google OAuth sign-in URL.');
  }

  if (inIframe && typeof window !== 'undefined') {
    const width = 520;
    const height = 660;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const features = `width=${width},height=${height},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`;
    const popup = window.open(data.url, 'ekklesphere_google_oauth', features);
    if (!popup || popup.closed) {
      return {
        mode: 'popup_blocked',
        authUrl: data.url,
        popup: null,
      };
    }
    try {
      popup.focus();
    } catch {
      // ignore focus restrictions
    }
    return {
      mode: 'popup',
      authUrl: data.url,
      popup,
    };
  }

  if (typeof window !== 'undefined') {
    window.location.assign(data.url);
  }
  return {
    mode: 'redirect',
    authUrl: data.url,
    popup: null,
  };
}

export async function completeSupabaseOAuthCallback(payload: {
  code?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  error?: string | null;
  errorDescription?: string | null;
}): Promise<string | null> {
  if (payload.error || payload.errorDescription) {
    throw new Error(payload.errorDescription || payload.error || 'Google sign-in was cancelled.');
  }

  const client = await ensureSupabaseBrowserClient();
  if (payload.code) {
    if (!client) {
      throw new Error('Supabase browser client could not be initialized to complete Google sign-in.');
    }
    const { data, error } = await client.auth.exchangeCodeForSession(payload.code);
    if (error) {
      throw error;
    }
    return data.session?.access_token || null;
  }

  if (payload.accessToken) {
    if (client && payload.refreshToken) {
      await client.auth
        .setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        })
        .catch(() => null);
    }
    return payload.accessToken;
  }

  if (client) {
    const { data } = await client.auth.getSession();
    return data.session?.access_token || null;
  }

  return null;
}

export async function signInWithSupabasePassword(
  email: string,
  password: string
): Promise<{ session: Session | null; user: User | null }> {
  const client = await ensureSupabaseBrowserClient();
  if (!client) {
    throw new Error('Supabase Auth is not configured.');
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throw error;
  }

  return { session: data.session, user: data.user };
}

export async function signUpWithSupabasePassword(params: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}): Promise<{ session: Session | null; user: User | null }> {
  const client = await ensureSupabaseBrowserClient();
  if (!client) {
    throw new Error('Supabase Auth is not configured.');
  }

  const { data, error } = await client.auth.signUp({
    email: params.email.trim().toLowerCase(),
    password: params.password,
    options: {
      data: {
        full_name: params.fullName.trim(),
        phone: params.phone || '',
      },
    },
  });

  if (error) {
    throw error;
  }

  return { session: data.session, user: data.user };
}

export async function signOutSupabaseBrowser(): Promise<void> {
  const client = cachedSupabaseClient || (await ensureSupabaseBrowserClient());
  if (!client) return;
  await client.auth.signOut().catch(() => {});
}

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  const client = cachedSupabaseClient || (await ensureSupabaseBrowserClient());
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session || null;
}

