import type { Request, Response, NextFunction } from 'express';

// Standard 8-4-4-4-12 UUID validator
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrganizationContext {
  organizationId: string | null;
  userId: string | null;
  userRole: string | null;
  source: 'header' | 'query' | 'cookie' | 'jwt_claim' | 'default' | 'none';
  isValid: boolean;
}

/**
 * Validates whether a given string is a valid UUID format
 */
export function validateOrganizationId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Express Middleware companion for Node.js / Express servers (e.g. server.ts).
 * Captures and enforces x-organization-id context across all Express routes.
 */
export function expressOrganizationMiddleware(
  req: Request & { organizationId?: string; user?: unknown; cookies?: Record<string, string> },
  res: Response,
  next: NextFunction
) {
  // 1. Extract from headers, query, or cookies
  const headerOrg =
    (req.headers['x-organization-id'] as string) ||
    (req.headers['x-tenant-id'] as string) ||
    (req.query.organization_id as string) ||
    (req.query.org_id as string) ||
    (req.cookies?.organization_id as string) ||
    (req.user as { app_metadata?: { organization_id?: string } })?.app_metadata?.organization_id;

  let validOrgId: string | null = null;
  if (headerOrg && validateOrganizationId(headerOrg)) {
    validOrgId = headerOrg.trim();
  } else {
    // Default to Accra Central Church for dev/pilot
    validOrgId = 'e0000000-0000-0000-0000-000000000001';
  }

  req.organizationId = validOrgId;
  res.setHeader('x-organization-id', validOrgId);

  next();
}
