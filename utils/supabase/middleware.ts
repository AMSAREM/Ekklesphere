import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import {
  validateOrganizationId,
  expressOrganizationMiddleware,
  type OrganizationContext,
} from "../../src/middleware/organizationMiddleware.ts";

export { validateOrganizationId, expressOrganizationMiddleware, type OrganizationContext };

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://sdijgiznzxvlklorvcvi.supabase.co";

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_IOTky2JHZSEzrvWHrOP5mw_ZD2nMpfC";

/**
 * Polyfilled NextResponse implementation matching Next.js specifications.
 * Works seamlessly in both Next.js and pure Node/Vite environments without runtime errors.
 */
export class NextResponse extends Response {
  cookies: {
    get(name: string): { name: string; value: string } | undefined;
    getAll(): { name: string; value: string }[];
    set(name: string, value: string, options?: Record<string, unknown>): void;
    delete(name: string): void;
  };

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    const cookieStore = new Map<string, string>();
    this.cookies = {
      get(name: string) {
        const val = cookieStore.get(name);
        return val !== undefined ? { name, value: val } : undefined;
      },
      getAll() {
        return Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value }));
      },
      set(name: string, value: string) {
        cookieStore.set(name, value);
      },
      delete(name: string) {
        cookieStore.delete(name);
      },
    };
  }

  static next(init?: { request?: { headers?: Headers } }): NextResponse {
    const res = new NextResponse(null, { status: 200 });
    if (init?.request?.headers) {
      init.request.headers.forEach((val, key) => {
        res.headers.set(key, val);
      });
    }
    return res;
  }

  static override json(data: unknown, init?: ResponseInit): NextResponse {
    const body = JSON.stringify(data);
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return new NextResponse(body, { ...init, headers });
  }
}

/**
 * Extracts candidate organization_id from request headers, query string, or cookies
 */
export function extractOrganizationIdFromHeadersAndCookies(request: NextRequest): {
  id: string | null;
  source: 'header' | 'query' | 'cookie' | 'none';
} {
  // 1. Custom HTTP Headers (preferred for API/Mobile clients)
  const headerOrg =
    request.headers.get("x-organization-id") ||
    request.headers.get("x-tenant-id") ||
    request.headers.get("organization-id");

  if (headerOrg && validateOrganizationId(headerOrg)) {
    return { id: headerOrg.trim(), source: "header" };
  }

  // 2. Query Parameters (e.g. ?orgId=... or ?organization_id=...)
  try {
    const url = new URL(request.url);
    const queryOrg =
      url.searchParams.get("organization_id") ||
      url.searchParams.get("org_id") ||
      url.searchParams.get("tenant_id");

    if (queryOrg && validateOrganizationId(queryOrg)) {
      return { id: queryOrg.trim(), source: "query" };
    }
  } catch {
    // URL parsing fallback
  }

  // 3. Cookies (persisted browser session)
  const cookieOrg =
    request.cookies.get("organization_id")?.value ||
    request.cookies.get("org_id")?.value ||
    request.cookies.get("current_organization_id")?.value;

  if (cookieOrg && validateOrganizationId(cookieOrg)) {
    return { id: cookieOrg.trim(), source: "cookie" };
  }

  return { id: null, source: "none" };
}

/**
 * Next.js Supabase middleware that refreshes sessions and captures/enforces organization_id context.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Clone incoming request headers so we can append tenant context downstream
  const requestHeaders = new Headers(request.headers);

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    },
  );

  // 1. Authenticate user session
  let userId: string | null = null;
  let userClaimOrgId: string | null = null;
  let userRole: string | null = null;
  let isSuperAdmin = false;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userClaimOrgId =
        (user.app_metadata?.organization_id as string) ||
        (user.app_metadata?.org_id as string) ||
        (user.user_metadata?.organization_id as string) ||
        null;
      userRole =
        (user.app_metadata?.role as string) ||
        (user.user_metadata?.role as string) ||
        'member';
      isSuperAdmin = Boolean(user.app_metadata?.is_super_admin);
    }
  } catch (err) {
    console.warn("[Supabase Middleware] Session verification error:", err);
  }

  // 2. Resolve organization_id from request
  const extracted = extractOrganizationIdFromHeadersAndCookies(request);
  let resolvedOrgId: string | null = extracted.id;
  let orgSource: OrganizationContext['source'] = extracted.source;

  // Fallback to user's JWT claim if not explicitly provided in request
  if (!resolvedOrgId && userClaimOrgId && validateOrganizationId(userClaimOrgId)) {
    resolvedOrgId = userClaimOrgId;
    orgSource = 'jwt_claim';
  }

  // Fallback for development / pilot if none set
  if (!resolvedOrgId) {
    // Default Pilot: Accra Central Church UUID
    const defaultOrgId = "e0000000-0000-0000-0000-000000000001";
    resolvedOrgId = defaultOrgId;
    orgSource = 'default';
  }

  // 3. Security Claim Verification
  // If user has a locked organization claim in app_metadata and is NOT a super admin,
  // ensure they cannot tamper with x-organization-id headers to access another organization.
  if (userClaimOrgId && !isSuperAdmin && resolvedOrgId !== userClaimOrgId) {
    // Check if route is an API route
    if (request.nextUrl.pathname.startsWith('/api/') || request.nextUrl.pathname.startsWith('/attendance/')) {
      return NextResponse.json(
        {
          error: "forbidden_organization_access",
          message: "You are not authorized to access data for the specified organization.",
        },
        { status: 403 }
      );
    }
    // Override requested org with the user's permitted org claim
    resolvedOrgId = userClaimOrgId;
    orgSource = 'jwt_claim';
  }

  // 4. Propagate organization context to downstream Server Components and API Route Handlers
  if (resolvedOrgId) {
    requestHeaders.set("x-organization-id", resolvedOrgId);
    supabaseResponse.headers.set("x-organization-id", resolvedOrgId);

    // Persist active organization in a cookie for browser navigation
    supabaseResponse.cookies.set("organization_id", resolvedOrgId, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      secure: process.env.NODE_ENV === "production",
      httpOnly: false, // Accessible to client-side scripts to read active org
    });
  }

  if (userId) {
    requestHeaders.set("x-user-id", userId);
    if (userRole) {
      requestHeaders.set("x-user-role", userRole);
    }
  }

  // 5. Strict Organization Context Enforcement for Protected Endpoints
  const requiresOrgContext =
    request.nextUrl.pathname.startsWith("/api/v1/attendance") ||
    request.nextUrl.pathname.startsWith("/api/v1/events") ||
    request.nextUrl.pathname.startsWith("/api/v1/members") ||
    request.nextUrl.pathname.startsWith("/attendance/events");

  if (requiresOrgContext && !resolvedOrgId) {
    return NextResponse.json(
      {
        error: "organization_context_required",
        message: "An active organization_id context is required via x-organization-id header, cookie, or user claim.",
      },
      { status: 400 }
    );
  }

  return supabaseResponse;
}

/**
 * Standard createClient wrapper for backwards compatibility
 */
export const createClient = (request: NextRequest) => {
  return updateSession(request);
};
