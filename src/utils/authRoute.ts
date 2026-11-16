export type AuthTabMode = 'login' | 'register' | 'org_signup';

/**
 * Resolves the intended UnifiedAuthScreen tab from a URL pathname and query string.
 * Supports:
 * - /app?auth=login, /login, /signin -> 'login'
 * - /app?auth=signup, /app?auth=register, /signup, /register -> 'register'
 * - /app?auth=org_signup, /app?auth=org, /app?auth=trial -> 'org_signup'
 */
export function resolveAuthTabFromLocation(
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/app',
  search: string = typeof window !== 'undefined' ? window.location.search : ''
): AuthTabMode {
  const normalizedPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const authParam = (params.get('auth') || params.get('tab') || '').trim().toLowerCase();

  if (
    authParam === 'org_signup' ||
    authParam === 'org-signup' ||
    authParam === 'org' ||
    authParam === 'trial' ||
    authParam === 'organisation' ||
    authParam === 'organization'
  ) {
    return 'org_signup';
  }

  if (
    authParam === 'signup' ||
    authParam === 'sign-up' ||
    authParam === 'register' ||
    authParam === 'member' ||
    normalizedPath === '/signup' ||
    normalizedPath === '/register'
  ) {
    return 'register';
  }

  if (
    authParam === 'login' ||
    authParam === 'signin' ||
    authParam === 'sign-in' ||
    normalizedPath === '/login' ||
    normalizedPath === '/signin'
  ) {
    return 'login';
  }

  return 'login';
}

/**
 * Returns true when the current URL should display the public marketing landing page at '/'.
 */
export function isPublicLandingLocation(
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/',
  search: string = typeof window !== 'undefined' ? window.location.search : ''
): boolean {
  const normalizedPath = pathname.toLowerCase();
  if (normalizedPath !== '/' && normalizedPath !== '') return false;
  const params = new URLSearchParams(search);
  if (params.has('view') || params.has('church') || params.has('auth') || params.has('checkin')) return false;
  return true;
}

/**
 * Validates that an incoming navigation target from the landing iframe is a safe same-origin app route.
 */
export function isSafeAppRouteTarget(target: unknown): target is string {
  if (typeof target !== 'string') return false;
  const trimmed = target.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  const pathOnly = trimmed.split(/[?#]/)[0].toLowerCase();
  return (
    pathOnly === '/' ||
    pathOnly === '/app' ||
    pathOnly === '/login' ||
    pathOnly === '/signin' ||
    pathOnly === '/signup' ||
    pathOnly === '/register' ||
    pathOnly === '/home' ||
    pathOnly === '/creator' ||
    pathOnly === '/console' ||
    pathOnly === '/portal'
  );
}
