import { getAccessToken } from './supabase';

/**
 * fetch() wrapper for the Ekklesphere Express API.
 * Attaches the Supabase access token (if signed in) and an optional
 * organization hint. The server still decides the organization from the
 * caller's memberships; the header only disambiguates multi-org users.
 */
export async function apiFetch(
  path: string,
  init: RequestInit & { organizationId?: string | null } = {}
): Promise<Response> {
  const { organizationId, headers, ...rest } = init;
  const token = await getAccessToken();
  const merged = new Headers(headers);
  if (token) merged.set('Authorization', `Bearer ${token}`);
  if (organizationId) merged.set('x-organization-id', organizationId);
  if (rest.body && !merged.has('Content-Type')) merged.set('Content-Type', 'application/json');
  return fetch(path, { ...rest, headers: merged });
}
