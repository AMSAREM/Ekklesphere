// src/lib/supabase.ts - Browser Supabase Auth Client (Google OAuth + Email/Password)
// Uses ONLY public VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
// SUPABASE_SERVICE_ROLE_KEY is NEVER imported or exposed in frontend code.

import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseBrowserConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseBrowserClient: SupabaseClient | null = isSupabaseBrowserConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'ekklesphere_supabase_auth',
      },
    })
  : null;

export async function signInWithSupabaseGoogle(): Promise<void> {
  if (!supabaseBrowserClient) {
    throw new Error(
      'Supabase Auth is not configured in this browser environment (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    );
  }

  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;

  const { error } = await supabaseBrowserClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error) {
    throw error;
  }
}

export async function signInWithSupabasePassword(
  email: string,
  password: string
): Promise<{ session: Session | null; user: User | null }> {
  if (!supabaseBrowserClient) {
    throw new Error('Supabase Auth is not configured.');
  }

  const { data, error } = await supabaseBrowserClient.auth.signInWithPassword({
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
  if (!supabaseBrowserClient) {
    throw new Error('Supabase Auth is not configured.');
  }

  const { data, error } = await supabaseBrowserClient.auth.signUp({
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
  if (!supabaseBrowserClient) return;
  await supabaseBrowserClient.auth.signOut().catch(() => {});
}

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  if (!supabaseBrowserClient) return null;
  const { data } = await supabaseBrowserClient.auth.getSession();
  return data.session || null;
}
